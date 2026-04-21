/**
 * End-to-end smoke test for the RelayerService, wired against an in-memory
 * WebClient stub so we don't need a running Next dev server.
 *
 * What this covers:
 *   1. buildProofOfSuccess consumes a realistic event log and produces a
 *      score in the expected ballpark + correct node count.
 *   2. signer produces an EIP-712 typed-data signature bound to a specific
 *      (tokenAddress, chainId) — swapping either invalidates the digest.
 *   3. chain.writeRecordSuccess returns a deterministic simulated tx hash
 *      when no RPC is configured.
 *   4. RelayerService.tick anchors the run and reports it as "anchored".
 *   5. Replaying the same run is a no-op (duplicate).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { recoverTypedDataAddress } from "viem";
import type {
  OnchainAnchor,
  RunEvent,
  RunRecord,
} from "@umbrella/runner/types";
import { buildProofOfSuccess } from "../services/relayer/proof.js";
import {
  MISSION_PROOF_TYPES,
  signProof,
  toMissionProofStruct,
  domainFor,
} from "../services/relayer/signer.js";
import { writeRecordSuccess } from "../services/relayer/chain.js";
import { createRelayerService } from "../services/relayer/index.js";
import type { WebClient } from "../services/relayer/client.js";

const TEST_TOKEN: `0x${string}` = "0x00000000000000000000000000000000000c0ffe";
const TEST_CHAIN = 84_532;

const SAMPLE_RUN: RunRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  blueprintId: "competitor-scrape",
  goal: "brief the CEO on acme.com",
  mode: "cloud",
  status: "succeeded",
  riskThreshold: 5,
  inputs: { url: "https://acme.com" },
  ownerFingerprint: "owner-abc",
  createdAt: "2026-04-18T14:00:00.000Z",
  startedAt: "2026-04-18T14:00:01.000Z",
  finishedAt: "2026-04-18T14:00:05.500Z",
  summary: "done",
  error: null,
};

const SAMPLE_EVENTS: RunEvent[] = [
  {
    seq: 1,
    kind: "plan",
    payload: { nodes: [{ id: "t1" }, { id: "t2" }, { id: "t3" }] },
    createdAt: SAMPLE_RUN.startedAt!,
  },
  { seq: 2, kind: "node.start", payload: { id: "t1" }, createdAt: SAMPLE_RUN.startedAt! },
  { seq: 3, kind: "node.finish", payload: { id: "t1", ok: true }, createdAt: SAMPLE_RUN.startedAt! },
  { seq: 4, kind: "node.start", payload: { id: "t2" }, createdAt: SAMPLE_RUN.startedAt! },
  { seq: 5, kind: "node.finish", payload: { id: "t2", ok: true }, createdAt: SAMPLE_RUN.startedAt! },
  {
    seq: 6,
    kind: "node.log",
    payload: { id: "t3", line: "quality score: 82/100" },
    createdAt: SAMPLE_RUN.startedAt!,
  },
  { seq: 7, kind: "node.finish", payload: { id: "t3", ok: true }, createdAt: SAMPLE_RUN.startedAt! },
  {
    seq: 8,
    kind: "run.finish",
    payload: { summary: "done", revenueCents: 425 },
    createdAt: SAMPLE_RUN.finishedAt!,
  },
];

test("buildProofOfSuccess scores an all-green run near 90%", () => {
  const proof = buildProofOfSuccess(SAMPLE_RUN, SAMPLE_EVENTS);
  assert.equal(proof.version, 1);
  assert.equal(proof.runId, SAMPLE_RUN.id);
  assert.equal(proof.blueprintId, SAMPLE_RUN.blueprintId);
  assert.equal(proof.status, "succeeded");
  assert.equal(proof.nodesExecuted, 3);
  assert.equal(proof.revenueCents, 425);
  assert.ok(
    proof.successScore > 8_000 && proof.successScore <= 9_500,
    `expected successScore in (8000, 9500], got ${proof.successScore}`,
  );
  assert.equal(proof.durationMs, 4_500);
});

test("buildProofOfSuccess caps failed runs at 20%", () => {
  const failed: RunRecord = { ...SAMPLE_RUN, status: "failed" };
  const failEvents: RunEvent[] = [
    ...SAMPLE_EVENTS.slice(0, 5),
    {
      seq: 6,
      kind: "run.error",
      payload: { error: "boom" },
      createdAt: failed.finishedAt!,
    },
  ];
  const proof = buildProofOfSuccess(failed, failEvents);
  assert.equal(proof.status, "failed");
  assert.ok(
    proof.successScore <= 2_000,
    `expected failure cap ≤ 2000, got ${proof.successScore}`,
  );
});

test("signProof yields a 65-byte EIP-712 signature that recovers to the attester", async () => {
  const proof = buildProofOfSuccess(SAMPLE_RUN, SAMPLE_EVENTS);
  const { digest, signature, attester, struct } = await signProof(
    proof,
    TEST_TOKEN,
    TEST_CHAIN,
  );
  assert.match(digest, /^0x[0-9a-f]{64}$/);
  assert.match(signature, /^0x[0-9a-f]+$/i);
  assert.equal(signature.length, 2 + 130, "expected 65-byte signature");
  assert.match(attester, /^0x[0-9a-fA-F]{40}$/);

  const recovered = await recoverTypedDataAddress({
    domain: domainFor(TEST_TOKEN, TEST_CHAIN),
    types: MISSION_PROOF_TYPES,
    primaryType: "MissionProof",
    message: struct,
    signature,
  });
  assert.equal(recovered.toLowerCase(), attester.toLowerCase());
});

test("signProof digests change when token address or chainId change", async () => {
  const proof = buildProofOfSuccess(SAMPLE_RUN, SAMPLE_EVENTS);
  const base = await signProof(proof, TEST_TOKEN, TEST_CHAIN);
  const alt = await signProof(proof, TEST_TOKEN, 8_453);
  const otherAddr: `0x${string}` = "0x00000000000000000000000000000000deadbeef";
  const addrAlt = await signProof(proof, otherAddr, TEST_CHAIN);
  assert.notEqual(base.digest, alt.digest, "chainId binds the digest");
  assert.notEqual(base.digest, addrAlt.digest, "verifyingContract binds the digest");
});

test("toMissionProofStruct maps ProofOfSuccess fields 1:1", () => {
  const proof = buildProofOfSuccess(SAMPLE_RUN, SAMPLE_EVENTS);
  const struct = toMissionProofStruct(proof);
  assert.equal(struct.version, 1);
  assert.equal(struct.status, 1, "succeeded → 1");
  assert.equal(struct.nodesExecuted, 3);
  assert.equal(struct.revenueCents, 425n);
  assert.equal(struct.durationSeconds, 4);
  assert.match(struct.runIdHash, /^0x[0-9a-f]{64}$/);
});

test("writeRecordSuccess returns a deterministic simulated tx hash in dry-run", async () => {
  const proof = buildProofOfSuccess(SAMPLE_RUN, SAMPLE_EVENTS);
  const { digest, signature, struct } = await signProof(proof, TEST_TOKEN, TEST_CHAIN);
  const r1 = await writeRecordSuccess(TEST_TOKEN, TEST_CHAIN, proof, struct, digest, signature);
  const r2 = await writeRecordSuccess(TEST_TOKEN, TEST_CHAIN, proof, struct, digest, signature);
  assert.equal(r1.simulated, true);
  assert.equal(r1.txHash, r2.txHash, "simulated hashes must be deterministic");
  assert.match(r1.txHash, /^0x[0-9a-f]{64}$/);
});

test("RelayerService.tick anchors a run and is idempotent", async () => {
  const anchors = new Map<string, OnchainAnchor>();

  const stub: WebClient = {
    async listPending() {
      return anchors.has(SAMPLE_RUN.id) ? [] : [SAMPLE_RUN];
    },
    async loadRunWithEvents(runId) {
      if (runId !== SAMPLE_RUN.id) return null;
      return { run: SAMPLE_RUN, events: SAMPLE_EVENTS };
    },
    async postAnchor(runId, input) {
      const existing = anchors.get(runId);
      if (existing) return { anchor: existing, duplicate: true };
      const anchor: OnchainAnchor = {
        ...input,
        runId,
        anchoredAt: new Date().toISOString(),
      };
      anchors.set(runId, anchor);
      return { anchor, duplicate: false };
    },
  };

  const service = createRelayerService({ client: stub });

  const first = await service.tick();
  assert.equal(first.scanned, 1);
  assert.equal(first.anchored, 1);
  assert.equal(first.failed, 0);
  assert.equal(first.items[0].status, "anchored");
  assert.equal(first.items[0].simulated, true);

  const stored = anchors.get(SAMPLE_RUN.id);
  assert.ok(stored, "anchor was persisted via postAnchor stub");
  assert.equal(stored!.proof.runId, SAMPLE_RUN.id);
  assert.equal(stored!.proof.nodesExecuted, 3);

  const second = await service.tick();
  assert.equal(second.scanned, 0);
  assert.equal(second.anchored, 0);
  assert.equal(second.failed, 0);
});

test("RelayerService skips runs with no registered AgentToken", async () => {
  const unknownRun: RunRecord = { ...SAMPLE_RUN, blueprintId: "not-a-blueprint" };
  const stub: WebClient = {
    async listPending() {
      return [unknownRun];
    },
    async loadRunWithEvents() {
      throw new Error("should not load events for unregistered blueprint");
    },
    async postAnchor() {
      throw new Error("should not anchor for unregistered blueprint");
    },
  };
  const service = createRelayerService({ client: stub });
  const r = await service.tick();
  assert.equal(r.scanned, 1);
  assert.equal(r.skipped, 1);
  assert.equal(r.anchored, 0);
  assert.equal(r.items[0].status, "skipped");
});
