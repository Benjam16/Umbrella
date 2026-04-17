import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { devSignupRequestSchema } from "@umbrella/shared";
import { handleChat } from "./routes/chat.js";
import { backupsRoutes } from "./routes/backups.js";
import { healthRoutes } from "./routes/health.js";
import { blueprintsRoutes } from "./routes/blueprints.js";
import { auditRoutes } from "./routes/audit.js";
import { mcpRoutes } from "./routes/mcp.js";
import { memoryRoutes } from "./routes/memory.js";
import { observerRoutes } from "./routes/observer.js";
import { outreachRoutes } from "./routes/outreach.js";
import { policyRoutes } from "./routes/policy.js";
import { runsRoutes } from "./routes/runs.js";
import { walletRoutes } from "./routes/wallet.js";
import { workersRoutes } from "./routes/workers.js";
import { webhooksRoutes } from "./routes/webhooks.js";
import {
  authUser,
  requireUser,
  routeRoleAllowed,
  setAuthUserOnContext,
} from "./services/auth.js";
import {
  auditTrailMiddleware,
  rateLimitMiddleware,
  securityHeadersMiddleware,
} from "./services/hardening.js";
import { loadModelRegistry } from "./services/models.js";
import { store } from "./store.js";

const STARTING_CREDITS = Number(process.env.UMBRELLA_STARTING_CREDITS ?? 1000);
const ALLOW_DEV_SIGNUP = process.env.UMBRELLA_ALLOW_DEV_SIGNUP !== "false";

export function createApp(): Hono {
  const app = new Hono();

  app.use("*", logger());
  app.use("*", securityHeadersMiddleware);
  app.use("/v1/*", rateLimitMiddleware);
  app.use("*", auditTrailMiddleware);
  app.use(
    "*",
    cors({
      origin: [
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "tauri://localhost",
        "http://tauri.localhost",
      ],
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    }),
  );

  app.get("/health", (c) =>
    c.json((() => {
      const models = loadModelRegistry();
      const defaultModel = models.byId.get(models.defaultModelId);
      return {
        ok: true,
        service: "umbrella-api",
        version: "0.1.0",
        defaultModel: models.defaultModelId,
        provider: defaultModel?.provider ?? "unknown",
        modelCount: models.list.length,
      };
    })()),
  );

  app.post("/v1/auth/dev-signup", async (c) => {
    if (!ALLOW_DEV_SIGNUP) return c.json({ error: "dev_signup_disabled" }, 403);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const parsed = devSignupRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
    }
    const { user, token } = store.createUser(parsed.data.email, STARTING_CREDITS, parsed.data.role);
    return c.json({ token, user: { id: user.id, email: user.email, role: user.role, credits: user.credits } });
  });

  app.use("/v1/*", async (c, next) => {
    const path = c.req.path;
    if (
      path === "/v1/auth/dev-signup" ||
      path === "/v1/models" ||
      path === "/v1/webhooks/blockchain"
    ) {
      await next();
      return;
    }
    const user = authUser(c);
    if (!user) return c.json({ error: "unauthorized" }, 401);
    if (!routeRoleAllowed(c.req.method, c.req.path, user.role)) {
      return c.json({ error: "forbidden" }, 403);
    }
    setAuthUserOnContext(c, user);
    await next();
  });

  app.get("/v1/me", (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    return c.json({ id: user.id, email: user.email, role: user.role, credits: user.credits });
  });

  app.post("/v1/chat", (c) => handleChat(c));
  app.route("/v1/mcp", mcpRoutes);
  app.route("/v1/backups", backupsRoutes);
  app.route("/v1/health", healthRoutes);
  app.route("/v1/audit", auditRoutes);
  app.route("/v1/memory", memoryRoutes);
  app.route("/v1/observer", observerRoutes);
  app.route("/v1/outreach", outreachRoutes);
  app.route("/v1/policy", policyRoutes);
  app.route("/v1/runs", runsRoutes);
  app.route("/v1/wallet", walletRoutes);
  app.route("/v1/workers", workersRoutes);
  app.route("/v1/blueprints", blueprintsRoutes);
  app.route("/v1/webhooks", webhooksRoutes);
  app.get("/v1/models", (c) => {
    const models = loadModelRegistry();
    return c.json({
      defaultModel: models.defaultModelId,
      models: models.list.map((m) => ({
        id: m.id,
        label: m.label,
        provider: m.provider,
        model: m.model,
        costPer1k: m.costPer1k,
        enabled: m.enabled,
      })),
    });
  });

  return app;
}
