import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import {
  extractVariableKeysFromMission,
  heuristicGeneralizeMission,
} from "../services/blueprint-generalize.js";

function jsonHeaders(token?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function signUp(
  app: ReturnType<typeof createApp>,
  role: "owner" | "admin" | "operator" | "analyst",
  tag: string,
): Promise<string> {
  const res = await app.request("/v1/auth/dev-signup", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email: `${tag}-${Date.now()}@example.com`, role }),
  });
  assert.equal(res.status, 200);
  const json = (await res.json()) as { token: string };
  return json.token;
}

test("rollback-preview RBAC blocks analyst, allows owner/operator", async () => {
  const app = createApp();
  const analystToken = await signUp(app, "analyst", "rb-analyst");
  const analystRes = await app.request("/v1/runs/nonexistent-run-id/rollback-preview", {
    headers: jsonHeaders(analystToken),
  });
  assert.equal(analystRes.status, 403);

  const ownerToken = await signUp(app, "owner", "rb-owner");
  const ownerRes = await app.request("/v1/runs/nonexistent-run-id/rollback-preview", {
    headers: jsonHeaders(ownerToken),
  });
  assert.equal(ownerRes.status, 404);

  const operatorToken = await signUp(app, "operator", "rb-op");
  const operatorRes = await app.request("/v1/runs/nonexistent-run-id/rollback-preview", {
    headers: jsonHeaders(operatorToken),
  });
  assert.equal(operatorRes.status, 404);
});

test("mint endpoint returns 404 for unknown run", async () => {
  const app = createApp();
  const ownerToken = await signUp(app, "owner", "mint-owner");
  const res = await app.request("/v1/blueprints/mint", {
    method: "POST",
    headers: jsonHeaders(ownerToken),
    body: JSON.stringify({
      runId: "does-not-exist-run",
      name: "My Blueprint",
      description: "A reusable blueprint for automation.",
      category: "growth",
    }),
  });
  assert.equal(res.status, 404);
});

test("blueprint-generalize heuristic replaces common patterns", () => {
  const input =
    "Scrape https://example.com/pricing and DM @founder_handle. Ping me at alice@example.com. Wallet: 0x" +
    "a".repeat(40) +
    ". Invite via discord.gg/xyz.";
  const { mission, variableKeys } = heuristicGeneralizeMission(input);
  assert.match(mission, /\{\{TARGET_URL\}\}/);
  assert.match(mission, /\{\{CONTACT_EMAIL\}\}/);
  assert.match(mission, /\{\{WALLET_ADDRESS\}\}/);
  assert.match(mission, /\{\{DISCORD_INVITE\}\}/);
  assert.match(mission, /\{\{SOCIAL_HANDLE\}\}/);
  assert.ok(variableKeys.includes("TARGET_URL"));
  assert.ok(variableKeys.includes("CONTACT_EMAIL"));
  assert.ok(variableKeys.includes("WALLET_ADDRESS"));
  assert.ok(variableKeys.includes("DISCORD_INVITE"));
  assert.ok(variableKeys.includes("SOCIAL_HANDLE"));
});

test("extractVariableKeysFromMission preserves order and uniqueness", () => {
  const mission =
    "First contact {{CONTACT_EMAIL}} at {{TARGET_URL}}, then re-check {{CONTACT_EMAIL}} for updates.";
  const keys = extractVariableKeysFromMission(mission);
  assert.deepEqual(keys, ["CONTACT_EMAIL", "TARGET_URL"]);
});
