import type { Context, Next } from "hono";
import { authUser } from "./auth.js";
import { store } from "../store.js";

type Bucket = { count: number; resetAt: number };

const rateBuckets = new Map<string, Bucket>();

function redactSensitiveText(input: string): string {
  return input
    .replace(/(authorization=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(token=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(api[_-]?key=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(secret=)[^&\s]+/gi, "$1[REDACTED]");
}

function clientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function securityHeadersMiddleware(c: Context, next: Next): Promise<void> {
  await next();
  c.header("x-content-type-options", "nosniff");
  c.header("x-frame-options", "DENY");
  c.header("referrer-policy", "no-referrer");
  c.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
  c.header("x-umbrella-hardening", "enabled");
}

export async function rateLimitMiddleware(c: Context, next: Next): Promise<Response | void> {
  const max = Math.max(10, Number(process.env.UMBRELLA_RATE_LIMIT_PER_MINUTE ?? 240));
  const windowMs = 60_000;
  const now = Date.now();
  const user = authUser(c);
  const key = `${user?.id ?? "anon"}:${clientIp(c)}`;
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    await next();
    return;
  }
  if (bucket.count >= max) {
    return c.json(
      {
        error: "rate_limited",
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      },
      429,
    );
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  await next();
}

export async function auditTrailMiddleware(c: Context, next: Next): Promise<void> {
  const previewCaptureEnabled = process.env.UMBRELLA_AUDIT_CAPTURE_REQUEST_PREVIEW !== "false";
  let requestPreview: string | undefined;
  if (previewCaptureEnabled && ["POST", "PATCH", "PUT", "DELETE"].includes(c.req.method.toUpperCase())) {
    try {
      const ct = c.req.header("content-type")?.toLowerCase() ?? "";
      if (ct.includes("application/json") || ct.includes("text/plain")) {
        const bodyText = await c.req.raw.clone().text();
        if (bodyText.trim().length > 0) {
          requestPreview = redactSensitiveText(bodyText).slice(0, 800);
        }
      }
    } catch {
      requestPreview = undefined;
    }
  }
  const started = Date.now();
  await next();
  if (!c.req.path.startsWith("/v1/")) return;
  const user = authUser(c);
  store.createAuditEvent({
    userId: user?.id,
    userRole: user?.role,
    method: c.req.method,
    path: redactSensitiveText(c.req.path),
    requestPreview,
    status: c.res.status,
    ip: clientIp(c),
    latencyMs: Date.now() - started,
  });
}
