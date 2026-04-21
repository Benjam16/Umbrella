import { z } from "zod";
import { runBus } from "@umbrella/runner/bus";
import { appendEventFromNode, loadEvents, loadRun } from "@umbrella/runner/supervisor";
import type { RunEvent, RunEventKind } from "@umbrella/runner/types";
import { verifyBearerNode } from "@/lib/node-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE event stream for a single run. Supports resume via `?lastEventSeq=N`
 * (or the standard `Last-Event-ID` header) so a reconnecting client catches
 * up without losing any events.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = await loadRun(id);
  if (!run) {
    return new Response("run not found", { status: 404 });
  }

  const url = new URL(req.url);
  const afterSeq = Number(
    url.searchParams.get("lastEventSeq") ?? req.headers.get("last-event-id") ?? -1,
  );

  const encoder = new TextEncoder();
  const replay = await loadEvents(id, Number.isFinite(afterSeq) ? afterSeq : -1);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: RunEvent) => {
        const data = `id: ${event.seq}\nevent: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // Controller already closed — ignore.
        }
      };

      controller.enqueue(encoder.encode(`: umbrella stream open\n\n`));
      for (const event of replay) send(event);

      if (run.status === "succeeded" || run.status === "failed" || run.status === "ejected") {
        controller.enqueue(encoder.encode(`event: done\ndata: {"status":"${run.status}"}\n\n`));
        controller.close();
        return;
      }

      const unsubscribe = runBus.subscribe(id, (event) => {
        send(event);
        if (event.kind === "run.finish" || event.kind === "run.error") {
          controller.enqueue(encoder.encode(`event: done\ndata: {"status":"closed"}\n\n`));
          unsubscribe();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      });

      // Heartbeat every 15s to keep proxies from dropping the connection.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15_000);

      const abort = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };
      req.signal.addEventListener("abort", abort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/v1/runs/:id/events
//
// Inverse of the GET stream: the paired CLI pushes events up *into* the run
// as it executes a dispatched blueprint locally. Each accepted event is
// published to the same `runBus` the SSE handler reads from, so the web UI
// updates in real time without any special casing.
// ---------------------------------------------------------------------------

const EVENT_KINDS: RunEventKind[] = [
  "plan",
  "node.start",
  "node.log",
  "node.finish",
  "artifact",
  "eject.requested",
  "signature.requested",
  "run.note",
  "run.finish",
  "run.error",
];

const eventSchema = z.object({
  kind: z.enum(EVENT_KINDS as [RunEventKind, ...RunEventKind[]]),
  payload: z.record(z.string(), z.unknown()).default({}),
});

const postSchema = z.union([
  eventSchema,
  z.object({ events: z.array(eventSchema).min(1).max(64) }),
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const node = await verifyBearerNode(req.headers);
  if (!node) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json body" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid event", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const events =
    "events" in parsed.data ? parsed.data.events : [parsed.data];

  const accepted: RunEvent[] = [];
  for (const ev of events) {
    const result = await appendEventFromNode(id, node.nodeId, ev);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    accepted.push(result.event);
  }

  return Response.json({ accepted: accepted.length, events: accepted });
}
