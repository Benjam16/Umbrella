# Umbrella Agent Runtime

**Bundled on every install** — product overview at **`FEATURES.md`** in your umbrella home (`~/.umbrella` or `./.umbrella`). Same folder as this file:

- **`MCP_TOOLS.md`** — MCP env vars, `${VAR}` expansion, `UMBRELLA_MCP_SERVERS_FILE`, executor `mcp:{...}` format.
- **`CRYPTO_MCP.md`** — curated on-chain / market-data MCP servers, discovery commands, safety.
- Templates also land at **`<install>/examples/`** (e.g. **`mcp-crypto.servers.json`**) — global default `~/.umbrella/examples/`, or `./.umbrella/examples/` with `install --local`. Point `UMBRELLA_MCP_SERVERS_FILE` at your edited copy.

Daemon entry: `umbrella agent start` or `node dist/runtime/index.js`. From a clone, the CLI can **auto-run `npm run build`** if `dist/runtime` is missing (disable with **`--no-build`** or **`UMBRELLA_NO_AUTO_BUILD=1`**).

Process control:

- `umbrella agent start` — one instance; fails if `~/.umbrella/agent.pid` points at a live process.
- `umbrella agent stop` — `SIGTERM` the daemon; pid file cleared on exit.
- `umbrella agent status` — running or stale pid.
- `umbrella doctor` — Node version, pid, SQLite, LLM env, optional verify hook.

Environment:

- LLM (optional; pick one key — fallback XML plan if none):
  - `ANTHROPIC_API_KEY` — Claude
  - `OPENAI_API_KEY` — OpenAI / Codex-style models
  - **`UMBRELLA_OPENAI_BASE_URL`** — OpenAI-compatible API (e.g. Ollama **`http://127.0.0.1:11434/v1`**); use **`UMBRELLA_OLLAMA_MODEL`** (or `UMBRELLA_MODEL`) for the model id; API key optional (defaults to `ollama` bearer; omit with empty / `none` if your server rejects auth)
  - `GEMINI_API_KEY` or `GOOGLE_API_KEY` — Gemini or Gemma (set `UMBRELLA_MODEL` to the exact model id, e.g. Gemma 4 when available on your endpoint)
- `UMBRELLA_LLM_PROVIDER` — `anthropic` \| `openai` \| `google` \| `gemini` \| `gemma` when several keys are set (chooses which API to call)
- `UMBRELLA_MODEL` — override model id for the active provider
- `TELEGRAM_BOT_TOKEN` — Telegram bridge (optional); commands **`/umb …`**
- **`DISCORD_BOT_TOKEN`** — Discord gateway (optional); commands **`!umb …`** in servers/DMs (needs **Message Content Intent** + privileged intents in the Discord app)
- **Slack (Socket Mode)** — **`SLACK_BOT_TOKEN`**, **`SLACK_APP_TOKEN`**, **`SLACK_SIGNING_SECRET`** (all three required); same **`!umb …`** surface as Discord; digest + schedule notify post to the last channel that used **`!umb`**
- **Voice STT hook** — **`UMBRELLA_VOICE_STT`** (executable; argv[1]=audio file, stdout=transcript); dashboard **`POST /api/voice-transcribe`** (Bearer **`UMBRELLA_INBOUND_SECRET`**); see **`docs/VOICE.md`**
- **Unified tools API** — **`GET /api/tools`** (built-in prefixes + MCP `{server,name}` list); orchestrator prompt includes a capped hint block (**`UMBRELLA_PLANNER_TOOL_HINTS_MAX_CHARS`**)
- `UMBRELLA_HEARTBEAT_MS` — heartbeat interval (default 60000)
- `UMBRELLA_VERIFY_COMMAND` — if set, verifier also runs this shell command; pass requires exit 0 **and** the usual text heuristic.
- `UMBRELLA_STUCK_THRESHOLD` — consecutive similar failures before an auto **escalation goal** (default `3`).
- `UMBRELLA_LLM_AUDIT` — set `0` to disable append-only `~/.umbrella/llm-audit.log` (timings / ok / errors per LLM call).
- Orchestrator budget (optional `~/.umbrella/orchestrator-context.json` or env): `UMBRELLA_MAX_TASK_TOKENS`, `UMBRELLA_MAX_TASKS_PER_SLICE`, `UMBRELLA_MAX_SLICES_PER_MILESTONE`.
- **Subagents:** `UMBRELLA_SUBAGENT_PER_SLICE=1` + LLM — isolated expand of each slice to action lines (`memoryRows: 0` in that call). Optional `UMBRELLA_SUBAGENT_SLICE_CHARS` (default 14000).
- **Token budget:** `UMBRELLA_TOKEN_BUDGET_DAILY` (approximate tokens, UTC day); usage in `~/.umbrella/token-usage.json`.
- **Session:** `~/.umbrella/session.json` (`umbrella session reset`, optional `UMBRELLA_SESSION_ID`).
- **Chaos approval:** `UMBRELLA_CHAOS_APPROVE=1`, `UMBRELLA_CHAOS_APPROVE_TIMEOUT_MS`; `POST /api/chaos-approve` with `{"nonce":"..."}` when `UMBRELLA_DASHBOARD_PORT` is set.
- **`UMBRELLA_SECRETS_HELPER`** — absolute path to an executable that prints **JSON** `{ "ENV_KEY": "value" }` on stdout; merged after `.env`, only for keys still empty (vault/agent pattern).
- **Secrets / config load order (daemon):** **`UMBRELLA_DOTENV`** (if set) and **`~/.umbrella/.env`**, then **secrets helper**, then **`config.json`** (`~/.umbrella/config.json`, or `UMBRELLA_CONFIG`, or `UMBRELLA_HOME/config.json`) with `{ "env": { "KEY": "value" } }`. Dotenv uses **`override: false`** — variables already set in the shell are kept. For `config.json`, non-empty shell env wins; empty string values in JSON are skipped. CLI: `umbrella up` (= `agent start`), `umbrella up --dry-run` (loads `.env` then previews config), `umbrella config-path`. Template: **`examples/.env.example`**.
- **MCP:** `UMBRELLA_MCP_ENABLED=1`, `UMBRELLA_MCP_SERVERS` and/or `UMBRELLA_MCP_SERVERS_FILE` (merged JSON arrays of **stdio** `command` entries and/or **`url`** Streamable HTTP servers). Env / header strings support `${VAR}` from the daemon environment. Optional: `UMBRELLA_MCP_MAX_TOOLS` (default `128`), `UMBRELLA_MCP_TIMEOUT_MS`, `UMBRELLA_MCP_AUDIT=0`, `UMBRELLA_MCP_NETWORK_DISABLED=1`. Crypto starter: `modules/agent-runtime/tools/CRYPTO_MCP.md`, `examples/mcp-crypto.servers.json`.
- **Shell policy:** `UMBRELLA_SHELL_POLICY=strict`, `UMBRELLA_SHELL_ALLOW_PREFIXES` (comma list), optional `UMBRELLA_SHELL_DENY_REGEX` (pipe-separated patterns).
- **Skill promotion:** proposals land in `~/.umbrella/skill-pending/mem-<id>/`. Set `UMBRELLA_SKILL_APPROVE=1` and approve with `POST /api/skill-approve` + `Authorization: Bearer $UMBRELLA_INBOUND_SECRET` body `{"id":"mem-42"}` or `touch ~/.umbrella/skill-approved/mem-42`. Otherwise pending skills auto-promote to `~/.umbrella/skills/umb-learned/` on the next heartbeat.
- **Core vs foreground goals:** SQLite `agent_state` keys `core_goal`, `foreground_goal`, `background_paused`. Heartbeat picks **scheduled → escalation → foreground → legacy pending_memory → (if paused) idle → core → default**. `POST /api/goal` sets **foreground**; `POST /api/core-goal` sets **core**; dashboard **Goals** panel + Telegram **`/umb`** + Discord **`!umb`** (`core|task|done|pause|resume|brief`…).
- **Foreground auto-clear:** default on — after `verifier` passes, foreground clears (`UMBRELLA_FOREGROUND_CLEAR_ON_VERIFY=0` to disable).
- **Inbound HTTP:** `UMBRELLA_INBOUND_SECRET` + Bearer on `POST /api/goal`, `/api/core-goal`, `/api/agent-state`, `/api/foreground/clear`, etc.
- **Digest (Telegram + Discord):** **`UMBRELLA_DIGEST_HEARTBEATS`** (or legacy **`UMBRELLA_TELEGRAM_DIGEST_HEARTBEATS`**) — notify last `/umb` chat and last `!umb` channel every N heartbeats.
- **Schedule file:** `~/.umbrella/schedule.json` — legacy `{ "intervalMs", "goal" }` or **`schedules`** array mixing **interval** and **`cron`** (+ optional **`timezone`**); see `examples/schedule.cron.example.json`. On **agent start**, entries sync into SQLite table **`umbrella_schedules`** (`GET /api/schedules`). **`UMBRELLA_SCHEDULE_NOTIFY=1`** — after each **scheduled** heartbeat, ping last Telegram/Discord chat with a short summary (opt-in).
- **Memory LLM compact:** `UMBRELLA_MEMORY_LLM_COMPACT=1`, optional `UMBRELLA_MEMORY_LLM_COMPACT_EVERY` (heartbeats, default 12) — bounded summary ingested as `memory_llm_compact`.
- **Dashboard API:** `GET /api/health` (includes **uptimeSec**), **`GET /api/version`**, **`GET /api/run-log?limit=`** (recent runs + scorecard), **`GET /api/schedules`**. **`docs/AGENTSKILLS.md`** — agentskills.io mapping; **`node bin/adapt-agentskill.js`** for optional frontmatter hints.
- **Isolation:** Prefer `UMBRELLA_SUBAGENT_USE_PROCESS=1` and/or Docker for untrusted workloads; Telegram/HTTP gateways should not be exposed without TLS in production. **`UMBRELLA_WORKER_WRAPPER`** — see `examples/worker-wrapper.example.sh` for a subagent job wrapper contract (Milestone 3.2).
- **Chaos web fetch:** `UMBRELLA_WEB_FETCH=1` — optional bounded fetch of the first URL in a shell error for the Chaos Specialist; use **`UMBRELLA_WEB_FETCH_ALLOWLIST`** on shared hosts.
- **Voice (roadmap):** no in-tree STT/TTS — see **`docs/VOICE.md`** (use external STT + `POST /api/goal` or chat commands).
- **Shipping CLIs:** `umbrella scaffold cli <dir> <npm-package> [--bin name]` copies `examples/shipping-cli-template` (Vitest + tag-triggered **`npm publish --provenance`** via GitHub OIDC). **Agent:** one-line action `scaffold-cli:{"packageName":"@scope/pkg","subdir":"folder"}` (optional `"bin"`) runs the same template **only under `UMBRELLA_SHIPPING_ROOT`**; set **`UMBRELLA_AGENT_SCAFFOLD=0`** to disable. Prefer strict **`UMBRELLA_SHELL_ALLOW_PREFIXES`** for other writes. **`examples/SHIPPING.md`** — never **`npm publish`** from Umbrella; child repos use tags + Trusted Publisher.

Planner mode (GSD-inspired): milestones → slices → tasks in XML; executor walks slices (subagent or raw XML tasks).

Memory database: `~/.umbrella/memory.db`

Chaos / recovery:

- Failed shell runs invoke the Chaos Specialist (requires LLM key); events are stored as `chaos_event` in memory.
- Optional dashboard: `UMBRELLA_DASHBOARD_PORT=<port>` when starting the agent.
- Optional paywall hook: `UMB_X402_ENABLED=1` (implement real settlement in runtime `x402.ts`).
