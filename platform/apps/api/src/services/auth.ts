import type { Context } from "hono";
import { store, type User } from "../store.js";

export function bearerToken(c: Context): string | null {
  const h = c.req.header("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7).trim() || null;
}

export function authUser(c: Context): User | null {
  const token = bearerToken(c);
  if (!token) return null;
  return store.findUserByToken(token) ?? null;
}

export function setAuthUserOnContext(c: Context, user: User): void {
  c.set("authUser", user);
}

export function authUserFromContext(c: Context): User | null {
  const cached = c.get("authUser");
  if (cached && typeof cached === "object" && "id" in cached) {
    return cached as User;
  }
  return authUser(c);
}

export function requireUser(c: Context): User | Response {
  const user = authUserFromContext(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  return user;
}

export function requireRole(
  c: Context,
  allowed: Array<User["role"]>,
): User | Response {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  if (!allowed.includes(user.role)) return c.json({ error: "forbidden" }, 403);
  return user;
}

const RBAC_RULES: Array<{
  method: string;
  path: RegExp;
  roles: Array<User["role"]>;
}> = [
  { method: "POST", path: /^\/v1\/policy\/profile$/, roles: ["owner", "admin"] },
  { method: "POST", path: /^\/v1\/backups\/snapshot$/, roles: ["owner", "admin"] },
  { method: "POST", path: /^\/v1\/backups\/restore-preview$/, roles: ["owner", "admin"] },
  { method: "POST", path: /^\/v1\/backups\/restore$/, roles: ["owner", "admin"] },
  { method: "POST", path: /^\/v1\/backups\/verify$/, roles: ["owner", "admin", "analyst"] },
  { method: "GET", path: /^\/v1\/audit\/events$/, roles: ["owner", "admin", "analyst"] },
  { method: "GET", path: /^\/v1\/backups\/$/, roles: ["owner", "admin", "analyst"] },
  { method: "GET", path: /^\/v1\/backups\/integrity$/, roles: ["owner", "admin", "analyst"] },
  { method: "GET", path: /^\/v1\/health\/dr$/, roles: ["owner", "admin", "analyst"] },
  { method: "GET", path: /^\/v1\/runs\/[^/]+\/rollback-preview$/, roles: ["owner", "admin", "operator"] },
  { method: "POST", path: /^\/v1\/runs\/[^/]+\/rollback$/, roles: ["owner", "admin", "operator"] },
];

export function routeRoleAllowed(
  method: string,
  path: string,
  role: User["role"],
): boolean {
  const rule = RBAC_RULES.find((r) => r.method === method.toUpperCase() && r.path.test(path));
  if (!rule) return true;
  return rule.roles.includes(role);
}
