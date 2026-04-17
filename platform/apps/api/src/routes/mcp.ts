import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "../services/auth.js";
import { mcpClient } from "../services/mcp.js";

const connectSchema = z.object({
  id: z.string().min(1).max(64),
  command: z.string().min(1).max(500),
  args: z.array(z.string().min(1).max(300)).max(40).optional(),
  env: z.record(z.string().max(10_000)).optional(),
});

const byServerSchema = z.object({
  serverId: z.string().min(1).max(64),
});

const callToolSchema = z.object({
  serverId: z.string().min(1).max(64),
  toolName: z.string().min(1).max(200),
  arguments: z.record(z.unknown()).optional(),
});

const readResourceSchema = z.object({
  serverId: z.string().min(1).max(64),
  uri: z.string().min(1).max(2_000),
});

export const mcpRoutes = new Hono();

mcpRoutes.get("/servers", (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  return c.json({
    servers: mcpClient.listConnections(),
  });
});

mcpRoutes.post("/connect", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  try {
    const connection = await mcpClient.connect(parsed.data);
    return c.json({ server: connection }, 201);
  } catch (e) {
    return c.json(
      { error: "mcp_connect_failed", message: e instanceof Error ? e.message : String(e) },
      502,
    );
  }
});

mcpRoutes.post("/disconnect", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = byServerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  const removed = await mcpClient.disconnect(parsed.data.serverId);
  return c.json({ ok: removed });
});

mcpRoutes.post("/tools", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = byServerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  try {
    const tools = await mcpClient.listTools(parsed.data.serverId);
    return c.json({ tools });
  } catch (e) {
    return c.json(
      { error: "mcp_list_tools_failed", message: e instanceof Error ? e.message : String(e) },
      502,
    );
  }
});

mcpRoutes.post("/tools/call", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = callToolSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  try {
    const result = await mcpClient.callTool(
      parsed.data.serverId,
      parsed.data.toolName,
      parsed.data.arguments,
    );
    return c.json({ result });
  } catch (e) {
    return c.json(
      { error: "mcp_call_tool_failed", message: e instanceof Error ? e.message : String(e) },
      502,
    );
  }
});

mcpRoutes.post("/resources", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = byServerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  try {
    const resources = await mcpClient.listResources(parsed.data.serverId);
    return c.json({ resources });
  } catch (e) {
    return c.json(
      { error: "mcp_list_resources_failed", message: e instanceof Error ? e.message : String(e) },
      502,
    );
  }
});

mcpRoutes.post("/resources/read", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = readResourceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  try {
    const resource = await mcpClient.readResource(parsed.data.serverId, parsed.data.uri);
    return c.json({ resource });
  } catch (e) {
    return c.json(
      { error: "mcp_read_resource_failed", message: e instanceof Error ? e.message : String(e) },
      502,
    );
  }
});
