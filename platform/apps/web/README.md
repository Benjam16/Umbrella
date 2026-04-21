# Umbrella — Website + Cloud Sandbox

The public-facing Umbrella surface. Two audiences, one codebase:

- **Curious founder.** Lands on `/`, clicks "Try Now", and runs a blueprint in a
  restricted cloud sandbox without installing anything.
- **Hardcore dev.** Uses the same UI, but connects a local Umbrella CLI and
  dispatches high-stakes missions directly to their own node — the web UI stays
  a dashboard, the sovereignty stays at home.

## What's here

```
src/
  app/
    page.tsx                       marketing landing page
    playground/run/page.tsx        Agentic Playground (WebRunner)
    api/v1/
      blueprints/route.ts          GET — list blueprints
      runs/route.ts                POST — start a run (cloud or remote)
      runs/[id]/route.ts           GET — run snapshot + event log
      runs/[id]/events/route.ts    GET (SSE) — live event stream
  components/
    WebRunner.tsx                  blueprint picker → run → stream → eject
    LiveDag.tsx                    @xyflow/react DAG with live node status
    EjectButton.tsx                renders `umbrella pull <run_id>`
    LocalNodeStatus.tsx            LOCAL_UMBRELLA_URL setting + probe
  lib/runner/
    types.ts                       shared Run/Event/Blueprint contracts
    blueprints.ts                  blueprint registry
    supervisor.ts                  in-process DAG executor
    tools.ts                       allowlisted cloud tools (no fs, no shell)
    bus.ts                         in-process event bus for SSE fanout
    supabase.ts                    server-only Supabase client
supabase/schema.sql                runs / run_events / credits / nodes / workspaces
```

## Local dev

```bash
cp .env.example .env.local
# fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or leave blank for
# in-memory mode — runs are lost on restart)

npm install
npm run dev               # http://localhost:3040
open http://localhost:3040/playground/run
```

The first time you run against a real Supabase project, apply the schema:

```bash
# Option A — Supabase CLI
supabase db push

# Option B — paste supabase/schema.sql into the SQL editor in the dashboard
```

## The Cloud Sandbox, in one paragraph

`POST /api/v1/runs` validates the request, inserts a `runs` row, and hands the
mission to the **in-process supervisor** (`src/lib/runner/supervisor.ts`). The
supervisor walks the blueprint's DAG, invokes allowlisted tools, and emits
events to two sinks: Supabase (`run_events`, append-only) and an in-process
`EventEmitter` (`src/lib/runner/bus.ts`). The `/events` SSE route replays from
Supabase on connect and streams live via the bus afterwards. Connection drops
are safe — clients reconnect with `Last-Event-ID` and resume from the exact
sequence number.

### Tool allowlist

The sandbox exposes **only** these tools (see `src/lib/runner/tools.ts`):

| Tool          | What it does                                          |
| ------------- | ----------------------------------------------------- |
| `http.fetch`  | HTTPS GET to a domain-allowlisted host, 8s timeout    |
| `parse.html`  | Dependency-free title / heading / paragraph extract   |
| `parse.json`  | Strict JSON parse                                     |
| `summarize`   | Extractive, model-free bullet summary                 |
| `score`       | Heuristic quality score (used by auditor nodes)       |

No filesystem. No shell. No secrets. Blueprints that need any of those must
trip the **Eject** path, which surfaces `umbrella pull <run_id>` in the UI.

## The Eject path (Web → CLI)

Every planned node carries a `risk` and optional `requires` (e.g. `local_fs`,
`shell`, `secrets`). When the supervisor sees a blocking node on a **cloud**
run it:

1. Emits `eject.requested` with the blocking node ids + reason.
2. Marks the run `ejected` in the DB (not `failed` — it's a successful hand-off).
3. Closes the SSE stream so the UI knows to render the Eject affordance.

The UI renders `EjectButton.tsx` with the `umbrella pull <run_id>` command.
The CLI fetches the run's plan + inputs + intermediate state from
`GET /api/v1/runs/:id` and resumes the blocked nodes locally.

## The Remote Node path (Web → my machine)

`LocalNodeStatus.tsx` stores a `LOCAL_UMBRELLA_URL` in `localStorage`. When
set, `WebRunner` POSTs directly to the local node's `/v1/runs` instead of the
cloud API and opens SSE against the local node too. Phase 1 is "trust on first
use" — Phase 2 adds a JWT handshake keyed by the ed25519 pubkey the CLI
registers in the `nodes` table.

## Deploying (dedicated Node container)

You selected a dedicated Node container (Fly.io / Railway) over Vercel so SSE
streams don't hit serverless timeouts. The build is stock `next build` + `next
start` — no edge-only code, all API routes use `runtime = "nodejs"`.

### Fly.io

```bash
fly launch --no-deploy
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
fly deploy
```

Add `[[services]].concurrency.type = "connections"` and a high
`soft_limit`/`hard_limit` so one machine can hold many open SSE streams.

### Railway

- Service type: Node
- Start command: `npm run start`
- Expose port `3040`
- Environment: copy everything from `.env.example`

### Vercel (fallback)

Still works for the marketing site; the `/api/v1/runs/[id]/events` SSE stream
will be capped by the function timeout. If you go this route, move the
supervisor to a separate always-on worker and use Supabase Realtime instead of
the in-process bus.

## What's next (not in this phase)

- Supabase Auth + user-scoped workspaces
- `POST /api/v1/nodes/register` handshake + WebSocket bridge
- "Global Swarm Pulse" via Supabase Realtime
- Read-only share link viewer at `/r/[share_token]`
- `scripts/run-eval.ts` for blueprint regression tests
