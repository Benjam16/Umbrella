# Umbrella roadmap — Hermes-tier parity

This document turns the [Hermes Agent](https://hermes-agent.nousresearch.com/docs/) comparison into **milestones → slices → tasks** aligned with this repo’s layout. It is a planning artifact, not a commitment order; pick slices by impact and maintainer bandwidth.

**Baseline today (what we build on):** `modules/agent-runtime/` (planner, executor, memory, LLM, chaos, Telegram, dashboard), `modules/orchestrate/` (chaos specialist, workflow skills), `runtime/index.ts`, plus slash-command modules under `modules/{memory,lean,coding,tools,flow,observe,secure}/`.

---

## Milestone 1 — Extension plane (MCP + tool registry)

**Slice 1.1 — MCP client**

| Task | Action | Verify |
|------|--------|--------|
| Design manifest | Document env keys, server discovery, and tool name prefixing in `modules/agent-runtime/tools/README.md`. | Doc lists failure modes (auth, timeout) and one example server. |
| Wire registry | Extend `modules/agent-runtime/core/tools.ts` to merge MCP tool descriptors into the executor’s allowed set (with caps). | Dry-run: list tools with MCP disabled vs enabled; no duplicate names. |
| Call path | Route MCP invocations through the same audit/budget hooks as `callLLM` (`modules/agent-runtime/core/llm.ts`, `token-budget.ts`, `llm-audit.ts`). | Single test or manual run: MCP call appears in audit log when enabled. |

**Slice 1.2 — Built-in tool breadth (optional, after MCP)**

| Task | Action | Verify |
|------|--------|--------|
| Prioritize | Rank 5–10 high-value tools vs delegating to MCP; implement only what MCP cannot cover cleanly. | Written rationale in `modules/agent-runtime/tools/README.md`. |

---

## Milestone 2 — Learning loop (skills from experience)

**Slice 2.1 — Promote `skill_candidate` → real skills**

| Task | Action | Verify |
|------|--------|--------|
| Drain queue | After successful verification, read `skill_candidate` rows from memory and propose a skill file diff (path under `modules/*/skills/` or user override dir). | `learnFromVerification` in `modules/agent-runtime/core/learner.ts` triggers proposal path; failures do not crash executor. |
| Human gate | Reuse chaos-approval patterns (`modules/agent-runtime/core/chaos-approval.ts`, dashboard API in `modules/agent-runtime/gateway/api.ts`) or a simpler `~/.umbrella/skill-pending/` + approve file. | Pending skill JSON + one documented approve command. |
| Install path | Run `bin/install.js` (or document copy) after approve so Cursor/Claude pick up new commands. | Fresh install shows new slash command. |

**Slice 2.2 — Nudges and summarization**

| Task | Action | Verify |
|------|--------|--------|
| Periodic digest | Scheduler hook in `runtime/index.ts` or heartbeat (`modules/agent-runtime/core/heartbeat.ts`): optional “memory compact” LLM pass with strict token budget (`orchestrator-context.ts`). | With flag off, zero extra LLM calls; with on, one bounded call per interval. |

---

## Milestone 3 — Where it runs (containers + remote backends)

**Slice 3.1 — Docker as the default serious deployment**

| Task | Action | Verify |
|------|--------|--------|
| Dockerfile | Multi-stage Node 18+ image, `npm ci`, `npm run build`, documented env for keys and `UMBRELLA_DASHBOARD_PORT`. | `docker build` succeeds in clean clone. |
| Compose | Optional `docker-compose.yml`: volume for `~/.umbrella`, port for dashboard. | `docker compose up` + `umbrella doctor` (or health endpoint) passes. |

**Slice 3.2 — Remote execution (stretch)**

| Task | Action | Verify |
|------|--------|--------|
| SSH or worker contract | Formalize `UMBRELLA_WORKER_WRAPPER` + JSON job schema (`modules/agent-runtime/worker/subagent-worker-cli.ts`, `subagent-process.ts`) as the extension point for Daytona/Modal-style workers. | Doc example: wrapper script echoes job path and exits 0. |

---

## Milestone 4 — Messaging and scheduling

**Slice 4.1 — Second gateway**

| Task | Action | Verify |
|------|--------|--------|
| Choose one | Add Discord *or* Slack alongside `modules/agent-runtime/gateway/telegram.ts` (shared “inbound message → goal” interface). | One end-to-end message creates a plan row / executor kick (documented). |

**Slice 4.2 — Cron / scheduled goals**

| Task | Action | Verify |
|------|--------|--------|
| Scheduler | Persist schedules in SQLite (extend `modules/agent-runtime/core/memory.ts` or adjacent module); tick from `runtime/index.ts`. | One cron expression fires once in test mode. |
| Delivery | Post summary back to the same gateway used for chat. | Scheduled run produces one outbound message. |

---

## Milestone 5 — Security and trust (product-visible)

**Slice 5.1 — Policy engine**

| Task | Action | Verify |
|------|--------|--------|
| Shell policy | Centralize allow/deny roots and command patterns used by chaos + executor (`modules/agent-runtime/core/chaos-monitor.ts`, `executor.ts`). | Denied command never executes; reason logged. |
| Network policy | Optional proxy or OFF switch for MCP/browser tools when added. | Integration test or manual checklist in `modules/secure/commands/umb-secure/checklist.md`. |

**Slice 5.2 — Isolation defaults**

| Task | Action | Verify |
|------|--------|--------|
| Document | Recommend `UMBRELLA_SUBAGENT_USE_PROCESS=1` + Docker for untrusted goals; link from `modules/agent-runtime/skills/umb-agent-runtime/SKILL.md`. | Install doc mentions threat model in one paragraph. |

---

## Milestone 6 — Interop and credibility

**Slice 6.1 — agentskills.io alignment**

| Task | Action | Verify |
|------|--------|--------|
| Map format | Document field mapping between Umbrella `SKILL.md` + commands and [agentskills.io](https://agentskills.io) expectations; add adapter script if needed under `bin/`. | One imported community skill installs and shows in `~/.umbrella`. |

**Slice 6.2 — Replay and scorecard (stretch)**

| Task | Action | Verify |
|------|--------|--------|
| Run artifact | Append-only JSONL per run: plan XML, task outcomes, verify results (`verifier.ts`). | Same inputs replay planner-agnostic slice expansion in test. |
| Dashboard | Extend `modules/agent-runtime/gateway/dashboard-html.ts` with per-run pass/fail counts. | UI shows last run summary. |

---

## Milestone 7 — Voice and web (optional, demo weight)

**Slice 7.1 — Voice**

| Task | Action | Verify |
|------|--------|--------|
| Bridge | CLI or gateway hook to STT/TTS provider; keep behind feature flag. | One voice round-trip documented. |

**Slice 7.2 — Web tools**

| Task | Action | Verify |
|------|--------|--------|
| Reuse hints | Extend `modules/agent-runtime/core/browser-hint.ts` or MCP-only browsing first. | Fetch + extract returns bounded text for planner. |

---

## Suggested order (impact vs effort)

1. **Milestone 1** (MCP) — largest tool surface per line of code.  
2. **Milestone 5** (policy + docs) — matches Hermes-style “security as product.”  
3. **Milestone 2** (learning loop) — you already have `learner.ts` + `skill_candidate`; close the loop.  
4. **Milestone 3** (Docker) — answers “where do I run it?”  
5. **Milestones 4, 6, 7** — pick by whether you optimize for **always-on** (4), **ecosystem** (6), or **demos** (7).

---

## Next steps (execution checklist)

Use this as the default sequence after the roadmap is agreed. Check items off in PRs or local notes; adjust order only if you are prioritizing **security** (start Phase B earlier) or **shipping Docker** (pull Phase C forward).

### Phase A — MCP foundation (Milestone 1, Slice 1.1)

1. **Spec** — Expand `modules/agent-runtime/tools/README.md` with: env vars (e.g. server list, timeouts), tool name prefix convention, failure modes, and one copy-paste MCP server example (filesystem or fetch).
2. **Dependency** — Add an MCP client dependency (or minimal stdio JSON-RPC client) in `package.json`; document why that library vs hand-rolled.
3. **Lifecycle** — New module under `modules/agent-runtime/` (e.g. `mcp/client.ts`): connect on agent start, disconnect on stop, surface errors to `llm-audit` / logs.
4. **Registry** — In `modules/agent-runtime/core/tools.ts`, merge MCP tool list into the executor allowlist; cap count; de-duplicate names with a stable prefix.
5. **Executor path** — One code path from plan/executor → MCP `call_tool` with timeout; record in `modules/agent-runtime/core/llm-audit.ts` (or parallel `mcp-audit.log` if cleaner).
6. **Smoke test** — Manual: enable MCP, run one tool, confirm audit line and token budget behavior (`token-budget.ts`).

**Done when:** Slice 1.1 verify rows in the table above are satisfied.

### Phase B — Trust story (Milestone 5, partial)

1. **Inventory** — List every place shell runs (`chaos-monitor.ts`, `executor.ts`, `verifier.ts` if applicable); note which bypass chaos.
2. **Central policy** — New small module (e.g. `modules/agent-runtime/core/shell-policy.ts`) with allow/deny lists and workspace root; call it before `exec`.
3. **Docs** — Update `modules/agent-runtime/skills/umb-agent-runtime/SKILL.md` and root `README.md` with recommended flags (`UMBRELLA_SUBAGENT_USE_PROCESS`, Docker) in one short “Threat model” subsection.
4. **Secure module** — Extend `modules/secure/commands/umb-secure/checklist.md` with MCP/network OFF switches once MCP exists.

**Done when:** A denied command is logged and never executed; README links the recommendation.

### Phase C — Learning loop v1 (Milestone 2, Slice 2.1)

1. **Read candidates** — Query memory for recent `skill_candidate` entries (`modules/agent-runtime/core/memory.ts`, `learner.ts`).
2. **Propose file** — Write proposed `SKILL.md` (or command stub) under `~/.umbrella/skill-pending/<id>/` with metadata JSON.
3. **Approve** — Minimal gate: `touch ~/.umbrella/skill-approved/<id>` or reuse dashboard pattern from `chaos-approval.ts`.
4. **Promote** — On approve, copy into `modules/*/skills/` or user’s chosen skills dir and run `node bin/install.js` (document exact flags).

**Done when:** One successful run produces a pending skill; after approve, a new slash command appears under `~/.umbrella`.

### Phase D — Ship how we run (Milestone 3, Slice 3.1)

1. **Dockerfile** — Node 18+, non-root user, `npm ci` + `npm run build`, `CMD` for `umbrella agent start` (or documented `node dist/...`).
2. **docker-compose.yml** — Volume `~/.umbrella`, expose dashboard port, env-file example.
3. **README** — Short “Run in Docker” section with copy-paste.

**Done when:** `docker build` and `docker compose up` steps are verified on a clean machine.

### Phase E — After core parity (pick one track)

| Track | Next action | Milestone |
|--------|-------------|-----------|
| **Always-on** | Spike Discord *or* Slack adapter next to `telegram.ts`; shared interface type for “message in → goal string”. | 4 |
| **Ecosystem** | Draft `agentskills.io` field map + optional `bin/import-skill.js`. | 6 |
| **Credibility** | JSONL run log + dashboard last-run widget. | 6 |
| **Demos** | MCP-only browsing or voice flag behind env. | 7 |

### Ongoing

- Keep **Hermes** and **MCP** docs links in onboarding so contributors know the target bar: [Hermes Agent](https://hermes-agent.nousresearch.com/docs/), [MCP](https://modelcontextprotocol.io/) (adjust URL if your canonical docs differ).

---

## Implementation status (Phases A–E + roadmap follow-through)

Shipped in-tree:

| Phase / milestone | What landed |
|-------|----------------|
| **A (M1)** | Stdio + **Streamable HTTP** MCP (`url` + `headers`), `mcp:` executor actions, `mcp-audit.log`, token usage `mcp_tool`, `GET /api/mcp-tools`, **`tools/README.md`** built-in vs MCP rationale (slice 1.2). |
| **B (M5)** | `shell-policy.ts`; secure checklist (MCP kill switch, **web fetch** allowlist); browser hint disable. |
| **C (M2)** | `skill-promotion.ts`, `POST /api/skill-approve`, `umb-learned`; optional **`UMBRELLA_MEMORY_LLM_COMPACT`**. |
| **D (M3)** | **Multi-stage** `Dockerfile` (build → prod `npm ci --omit=dev`), `docker-compose.yml` + **healthcheck**, `.env.umbrella.example`; **`examples/worker-wrapper.example.sh`** documents **`UMBRELLA_WORKER_WRAPPER`**. |
| **E + M4** | HTTP goals + dashboard; **`GET /api/version`**, **`/api/health`** (uptime), **`/api/run-log`**, run **scorecard** UI; **Discord** `!umb` + **Slack** Socket Mode `!umb` + Telegram; **schedules** from `schedule.json` **synced to SQLite** `umbrella_schedules` on start, **cron** + interval, **`GET /api/schedules`**, opt-in **`UMBRELLA_SCHEDULE_NOTIFY=1`** → chat after scheduled heartbeats (Telegram + Discord + Slack). |
| **M6** | **`docs/AGENTSKILLS.md`**, `bin/adapt-agentskill.js`; **run log artifacts** (`planPreview`, `taskCount`, `executionPreview`) in JSONL. |
| **M7 (partial)** | **`fetchUrlTextPreview`** behind **`UMBRELLA_WEB_FETCH`** (Chaos Specialist); **`docs/VOICE.md`**; external STT hook **`UMBRELLA_VOICE_STT`** + **`POST /api/voice-transcribe`** (Bearer, ≤6 MiB). |
| **Goals** | SQLite `agent_state`: core / foreground / pause; **`slack_last_channel_id`**; digest **`UMBRELLA_DIGEST_HEARTBEATS`** to Telegram + Discord + Slack. |
| **Planner / tools** | **`tool-registry.ts`**: orchestrator prompt includes built-in + MCP tool names; **`GET /api/tools`** (unified list). Executor still invokes MCP via **`mcp:{...}`** by server index. |
| **Tests** | **`npm test`**: deterministic **`expandPlanXmlToActions`** replay (`plan-xml-parse.ts`, `tests/plan-replay.test.cjs`). |

Not shipped (optional / heavier work): **bundled** in-process STT/TTS; merging MCP descriptors into **`tools.ts`** as first-class static entries (beyond planner hints + **`GET /api/tools`**); full JSONL **replay** of executor outcomes (only XML expansion is covered in test today).

---

*Reference competitor positioning:* [Hermes Agent documentation](https://hermes-agent.nousresearch.com/docs/) (Nous Research, 2026).
