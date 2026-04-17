import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";

function jsonHeaders(token?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

test("public routes stay public", async () => {
  const app = createApp();
  const health = await app.request("/health");
  assert.equal(health.status, 200);

  const models = await app.request("/v1/models");
  assert.equal(models.status, 200);
});

test("protected routes reject missing auth", async () => {
  const app = createApp();
  const protectedPaths = [
    "/v1/me",
    "/v1/runs",
    "/v1/blueprints",
    "/v1/workers/status",
    "/v1/wallet/status",
    "/v1/memory/retrieve",
    "/v1/policy/profile",
    "/v1/outreach/campaigns",
    "/v1/audit/events",
    "/v1/backups",
    "/v1/backups/integrity",
    "/v1/health/dr",
  ];
  for (const path of protectedPaths) {
    const res = await app.request(path);
    assert.equal(res.status, 401, `expected 401 for ${path}`);
  }
});

test("protected routes accept valid auth", async () => {
  const app = createApp();
  const signup = await app.request("/v1/auth/dev-signup", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email: `auth-test-${Date.now()}@example.com`, role: "owner" }),
  });
  assert.equal(signup.status, 200);
  const signupJson = (await signup.json()) as { token: string };
  assert.ok(signupJson.token);

  const me = await app.request("/v1/me", { headers: jsonHeaders(signupJson.token) });
  assert.equal(me.status, 200);

  const runs = await app.request("/v1/runs", { headers: jsonHeaders(signupJson.token) });
  assert.equal(runs.status, 200);

  const memory = await app.request("/v1/memory/retrieve", {
    method: "POST",
    headers: jsonHeaders(signupJson.token),
    body: JSON.stringify({ query: "pricing strategy", limit: 2 }),
  });
  assert.equal(memory.status, 200);

  const policy = await app.request("/v1/policy/profile", {
    headers: jsonHeaders(signupJson.token),
  });
  assert.equal(policy.status, 200);

  const outreach = await app.request("/v1/outreach/campaigns", {
    headers: jsonHeaders(signupJson.token),
  });
  assert.equal(outreach.status, 200);

  const audit = await app.request("/v1/audit/events", {
    headers: jsonHeaders(signupJson.token),
  });
  assert.equal(audit.status, 200);

  const backups = await app.request("/v1/backups", {
    headers: jsonHeaders(signupJson.token),
  });
  assert.equal(backups.status, 200);

  const integrity = await app.request("/v1/health/dr", {
    headers: jsonHeaders(signupJson.token),
  });
  assert.equal(integrity.status, 200);
  const integrityJson = (await integrity.json()) as {
    sweepEnabled: boolean;
    lastSweep: unknown;
  };
  assert.equal(typeof integrityJson.sweepEnabled, "boolean");
});

test("policy updates require admin or owner role", async () => {
  const app = createApp();
  const operatorSignup = await app.request("/v1/auth/dev-signup", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email: `op-test-${Date.now()}@example.com`, role: "operator" }),
  });
  assert.equal(operatorSignup.status, 200);
  const operatorJson = (await operatorSignup.json()) as { token: string };

  const forbidden = await app.request("/v1/policy/profile", {
    method: "POST",
    headers: jsonHeaders(operatorJson.token),
    body: JSON.stringify({ riskBlockThreshold: 5 }),
  });
  assert.equal(forbidden.status, 403);

  const ownerSignup = await app.request("/v1/auth/dev-signup", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email: `owner-test-${Date.now()}@example.com`, role: "owner" }),
  });
  assert.equal(ownerSignup.status, 200);
  const ownerJson = (await ownerSignup.json()) as { token: string };

  const allowed = await app.request("/v1/policy/profile", {
    method: "POST",
    headers: jsonHeaders(ownerJson.token),
    body: JSON.stringify({ riskBlockThreshold: 6 }),
  });
  assert.equal(allowed.status, 200);
});

test("audit events route blocks operator role", async () => {
  const app = createApp();
  const signup = await app.request("/v1/auth/dev-signup", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email: `audit-op-${Date.now()}@example.com`, role: "operator" }),
  });
  assert.equal(signup.status, 200);
  const signupJson = (await signup.json()) as { token: string };
  const res = await app.request("/v1/audit/events", {
    headers: jsonHeaders(signupJson.token),
  });
  assert.equal(res.status, 403);
});

test("backup integrity route blocks operator role", async () => {
  const app = createApp();
  const signup = await app.request("/v1/auth/dev-signup", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email: `integrity-op-${Date.now()}@example.com`, role: "operator" }),
  });
  assert.equal(signup.status, 200);
  const signupJson = (await signup.json()) as { token: string };
  const resBackups = await app.request("/v1/backups/integrity", {
    headers: jsonHeaders(signupJson.token),
  });
  assert.equal(resBackups.status, 403);
  const resHealth = await app.request("/v1/health/dr", {
    headers: jsonHeaders(signupJson.token),
  });
  assert.equal(resHealth.status, 403);
});

test("backup routes enforce role boundaries", async () => {
  const app = createApp();
  const analystSignup = await app.request("/v1/auth/dev-signup", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email: `backup-analyst-${Date.now()}@example.com`, role: "analyst" }),
  });
  assert.equal(analystSignup.status, 200);
  const analystJson = (await analystSignup.json()) as { token: string };

  const analystList = await app.request("/v1/backups", {
    headers: jsonHeaders(analystJson.token),
  });
  assert.equal(analystList.status, 200);

  const analystIntegrity = await app.request("/v1/backups/integrity", {
    headers: jsonHeaders(analystJson.token),
  });
  assert.equal(analystIntegrity.status, 200);

  const analystCreate = await app.request("/v1/backups/snapshot", {
    method: "POST",
    headers: jsonHeaders(analystJson.token),
    body: JSON.stringify({ reason: "test" }),
  });
  assert.equal(analystCreate.status, 403);

  const ownerSignup = await app.request("/v1/auth/dev-signup", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email: `backup-owner-${Date.now()}@example.com`, role: "owner" }),
  });
  assert.equal(ownerSignup.status, 200);
  const ownerJson = (await ownerSignup.json()) as { token: string };

  const ownerCreate = await app.request("/v1/backups/snapshot", {
    method: "POST",
    headers: jsonHeaders(ownerJson.token),
    body: JSON.stringify({ reason: "manual_test_snapshot" }),
  });
  assert.equal(ownerCreate.status, 201);
  const ownerCreateJson = (await ownerCreate.json()) as { snapshotId?: string };
  assert.ok(ownerCreateJson.snapshotId);

  const analystPreview = await app.request("/v1/backups/restore-preview", {
    method: "POST",
    headers: jsonHeaders(analystJson.token),
    body: JSON.stringify({ snapshotId: ownerCreateJson.snapshotId }),
  });
  assert.equal(analystPreview.status, 403);

  const ownerPreview = await app.request("/v1/backups/restore-preview", {
    method: "POST",
    headers: jsonHeaders(ownerJson.token),
    body: JSON.stringify({ snapshotId: ownerCreateJson.snapshotId }),
  });
  assert.equal(ownerPreview.status, 200);
  const ownerPreviewJson = (await ownerPreview.json()) as { previewToken?: string };
  assert.ok(ownerPreviewJson.previewToken);

  const analystVerify = await app.request("/v1/backups/verify", {
    method: "POST",
    headers: jsonHeaders(analystJson.token),
    body: JSON.stringify({ snapshotId: ownerCreateJson.snapshotId }),
  });
  assert.equal(analystVerify.status, 200);
  const analystVerifyJson = (await analystVerify.json()) as {
    ok: boolean;
    checksumMatches: boolean;
  };
  assert.equal(analystVerifyJson.ok, true);
  assert.equal(analystVerifyJson.checksumMatches, true);

  const ownerRestore = await app.request("/v1/backups/restore", {
    method: "POST",
    headers: jsonHeaders(ownerJson.token),
    body: JSON.stringify({
      snapshotId: ownerCreateJson.snapshotId,
      previewToken: ownerPreviewJson.previewToken,
      confirm: "EXECUTE_RESTORE",
    }),
  });
  assert.equal(ownerRestore.status, 200);
});

test("blockchain webhook requires shared secret and accepts supported provider payload", async () => {
  const app = createApp();
  process.env.UMBRELLA_WEBHOOK_SECRET = "test-secret";
  const signup = await app.request("/v1/auth/dev-signup", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email: `webhook-test-${Date.now()}@example.com` }),
  });
  assert.equal(signup.status, 200);
  const signupJson = (await signup.json()) as { user: { id: string; email: string } };

  const unauthorized = await app.request("/v1/webhooks/blockchain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType: "wallet_activity", userId: signupJson.user.id }),
  });
  assert.equal(unauthorized.status, 401);

  const alchemyPayload = {
    type: "ADDRESS_ACTIVITY",
    event: {
      network: "base-mainnet",
      activity: [{ hash: "0xabc123", toAddress: "0xfeedbeef" }],
    },
    metadata: {
      userEmail: signupJson.user.email,
      objective: "Re-evaluate active mission after wallet activity",
    },
  };
  const accepted = await app.request("/v1/webhooks/blockchain", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-umbrella-webhook-secret": "test-secret",
    },
    body: JSON.stringify(alchemyPayload),
  });
  assert.equal(accepted.status, 200);
  const acceptedJson = (await accepted.json()) as { ok: boolean; provider: string };
  assert.equal(acceptedJson.ok, true);
  assert.equal(acceptedJson.provider, "alchemy");
});
