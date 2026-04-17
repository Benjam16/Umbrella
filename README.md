# Umbrella ☂️

**Source:** [github.com/Benjam16/Umbrella](https://github.com/Benjam16/Umbrella)

> **Looking for the Sovereign Agentic Workstation (v1.0)?** See [`platform/`](./platform) for the Tauri desktop + Hono API monorepo (supervisor-worker DAG, self-healing runner, sandboxed patch promotion, backup/restore with DR health, MCP client, blueprint gallery + minting). A one-page capability map lives in [`CAPABILITIES.md`](./CAPABILITIES.md).
>
> The rest of this README describes the original **CLI / agent daemon** (`@benjam16/umbrella`), which is a separate product that also lives in this repo.

**One CLI. One agent. Everything done.**

Install once → get slash-command templates for **Claude Code**, **Cursor**, **Gemini CLI**, **OpenAI Codex**-style setups, and other runtimes, plus a 24/7 autonomous agent (planner → executor → memory) with an optional Telegram bridge.

**→ Full marketing / feature list, automation ideas, and standalone deployment notes: [FEATURES.md](./FEATURES.md)**

**→ Static marketing / user guide (`website/`):** deploy on [Vercel](https://vercel.com) with **Root Directory = `website`** — see [`website/deploy-vercel.txt`](./website/deploy-vercel.txt).

```bash
npx @benjam16/umbrella@latest
```

The published package name is **`@benjam16/umbrella`** (your npm username scope). Run `npm publish` while logged in as **benjam16**.

Or from a clone:

```bash
npm install
npm run build
node bin/install.js --claude --local
node dist/src/cli.js install   # same installer via the published entry shape
```

**Appliance-style (global CLI):** `npm install -g @benjam16/umbrella` → `umbrella install --claude` → `umbrella up` (starts the daemon; set keys in `~/.umbrella/.env` or `config.json`). Docker: `docker compose up --build` uses **`GET /api/health`** + **`GET /api/version`** for ops (see `docker-compose.yml` **healthcheck**).

Each install copies **all module skills/commands** plus **bundled references**: `skills/umb-agent-runtime/MCP_TOOLS.md`, `CRYPTO_MCP.md`, and **`examples/`** (including `mcp-crypto.servers.json`) under your Umbrella home (`~/.umbrella` or `./.umbrella`).

### Agent daemon

Requires Node 18+ (uses built-in `fetch` for the planner LLM). **Cursor** does not expose a headless HTTP API for this daemon: point Cursor at the installed `~/.umbrella` skills/commands; the daemon uses Anthropic, OpenAI, or Google cloud APIs above.

```bash
npm run build
# Optional: one LLM key for planner + executor routing (fallback XML plan if none set):
#   Claude → ANTHROPIC_API_KEY
#   OpenAI / Codex → OPENAI_API_KEY
#   Gemini or Gemma (e.g. Gemma 4 on Google AI) → GEMINI_API_KEY or GOOGLE_API_KEY
# Force provider when multiple keys exist: UMBRELLA_LLM_PROVIDER=anthropic|openai|google
# Model id: UMBRELLA_MODEL (defaults: claude-3-5-sonnet-20241022, gpt-4o, gemini-2.0-flash)
ANTHROPIC_API_KEY=sk-ant-... TELEGRAM_BOT_TOKEN=optional npm run agent
```

Or: `node dist/src/cli.js agent start` or **`node dist/src/cli.js up`** (same as `agent start`). **Load order at daemon start:** dotenv files (optional **`UMBRELLA_DOTENV`** path, then **`~/.umbrella/.env`** if present) with **`override: false`** — existing shell variables are not replaced — then optional **`~/.umbrella/config.json`** `{ "env": { … } }` (same merge rule: shell wins). Copy **`examples/.env.example`** and **`examples/config.json.example`**. **`umbrella up --dry-run`** loads `.env` like the daemon, then shows the config merge preview; **`umbrella config-path`** prints the resolved config path.

From a **git clone**, if **`dist/runtime/index.js`** is missing, `umbrella up` / **`umbrella agent start`** run **`npm run build`** once in the package root. Set **`UMBRELLA_NO_AUTO_BUILD=1`** or pass **`--no-build`** to fail fast instead.

**Agent lifecycle:** `umbrella agent stop` / `status` use `~/.umbrella/agent.pid`. Run `umbrella doctor` for a quick environment check.

**Orchestrator (GSD-inspired):** LLM plans use nested **milestones → slices → tasks**; optional budgets via env or `~/.umbrella/orchestrator-context.json`. Repeated failures trigger an **escalation** planning goal (`UMBRELLA_STUCK_THRESHOLD`). Optional `UMBRELLA_VERIFY_COMMAND` and `~/.umbrella/llm-audit.log` for verification and LLM call audit.

**v2 agent controls:** **`UMBRELLA_SUBAGENT_PER_SLICE=1`** — each slice gets a **fresh-context LLM pass** (no memory injection) that expands XML into shell/read/write lines. **`UMBRELLA_SUBAGENT_USE_PROCESS=1`** runs that pass in a **child process** (optional **`UMBRELLA_WORKER_WRAPPER`** executable receiving the job JSON path as its **first argument** (else the built-in `subagent-worker-cli.js` worker is used)); use **`UMBRELLA_WORKER_*`** API keys / **`UMBRELLA_WORKER_CWD`** for isolation; usage is still recorded in the parent as `subagent_slice_worker`. **`UMBRELLA_TOKEN_BUDGET_DAILY`** — approximate token cap per UTC day (`~/.umbrella/token-usage.json`). **`~/.umbrella/session.json`** — heartbeat + checkpoint (`umbrella session reset`). **`UMBRELLA_CHAOS_APPROVE=1`** — human gate before chaos recovery runs shell fixes (pending JSON under `~/.umbrella/chaos-pending/`, approve via **`POST /api/chaos-approve`** on the dashboard or `touch ~/.umbrella/chaos-approved/<nonce>`).

**Anti-fragile / Chaos mode:** shell actions (`shell:`, and raw `git`/`npm`/`node` lines) go through `ChaosMonitor`: on `❌ Shell Error`, the **Chaos Specialist** (LLM + optional DuckDuckGo hint) proposes fix commands, runs them, and retries (up to 3 rounds). Payment-quota style errors can trigger the **X402 stub** (`UMB_X402_ENABLED=1` — implement settlement in `x402.ts`). **Dashboard:** set `UMBRELLA_DASHBOARD_PORT=4578` (for example) and open `http://127.0.0.1:4578/` for a live **chaos feed** (`GET /api/chaos-logs`), **last heartbeat** (`GET /api/last-run`), and **MCP tool hints** (`GET /api/mcp-tools`).

**MCP (stdio servers):** set `UMBRELLA_MCP_ENABLED=1` and `UMBRELLA_MCP_SERVERS` and/or **`UMBRELLA_MCP_SERVERS_FILE`** (JSON array; merged). Env values support **`${VAR}`** expansion from the daemon’s environment. **Crypto / on-chain:** `modules/agent-runtime/tools/CRYPTO_MCP.md` + `examples/mcp-crypto.servers.json`. Executor: `mcp:{"server":0,"name":"tool","arguments":{}}`. See `modules/agent-runtime/tools/README.md`.

**Goals (core vs foreground):** the daemon stores a long-running **core goal** (background progress when idle) and an optional **foreground task** that **interrupts** the core until you clear it or verification succeeds. Telegram: `/umb core …`, `/umb task …`, `/umb done`, `/umb pause` / `/umb resume`, `/umb brief`. HTTP (same `UMBRELLA_INBOUND_SECRET`): `POST /api/core-goal` `{"goal":"…"}`, `POST /api/goal` sets **foreground** (one-off), `POST /api/foreground/clear`, `GET /api/agent-state`, `POST /api/agent-state` with `{"backgroundPaused":true}` etc. Set `UMBRELLA_FOREGROUND_CLEAR_ON_VERIFY=0` to keep foreground until manual clear. **`POST /api/skill-approve`** approves a skill proposal when `UMBRELLA_SKILL_APPROVE=1`.

**Telegram digests:** `UMBRELLA_TELEGRAM_DIGEST_HEARTBEATS=N` sends a short summary to the last chat that used `/umb`, every N heartbeats.

**Import skills:** `node bin/import-skill.js /path/to/skill-folder [alias]` → `~/.umbrella/skills/umb-imported/<alias>/`.

**Ship CLIs:** **`umbrella scaffold cli <dir> @scope/pkg [--bin name]`** copies **`examples/shipping-cli-template`** (TypeScript, Vitest, GitHub Action → **`npm publish --provenance`** on semver tags). Operator guide: **`examples/SHIPPING.md`** (recommended **`UMBRELLA_SHIPPING_ROOT`**, npm Trusted Publishers, no ad-hoc `npm publish` from the agent host).

**Threat model (short):** the daemon can run **shell** and **MCP** tools you enable. Use **`UMBRELLA_SHELL_POLICY=strict`** and **`UMBRELLA_SHELL_ALLOW_PREFIXES`** for write boundaries; **`UMBRELLA_SUBAGENT_USE_PROCESS=1`** (and optionally **`UMBRELLA_WORKER_WRAPPER`**, see **`examples/worker-wrapper.example.sh`**) for isolation; run in **Docker** on shared hosts; keep the dashboard on **localhost** or behind auth; disable **`UMBRELLA_WEB_FETCH`** / **`UMBRELLA_BROWSER_HINT_DISABLED=1`** if outbound hints are unwanted.

### Run in Docker

```bash
docker build -t umbrella .
docker run --rm \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e UMBRELLA_DASHBOARD_PORT=4578 \
  -p 4578:4578 \
  -v umbrella_data:/root/.umbrella \
  umbrella
```

Or: `docker compose up --build` (see `docker-compose.yml`). Copy `.env.umbrella.example` to `.env.umbrella` and pass variables with `-e` / compose `environment:` as you prefer.

### Layout

- `FEATURES.md` — product / capability overview + automation & standalone roadmap
- `examples/mcp-crypto.servers.json` — starter **stdio** crypto MCP list + `examples/README.md` (+ systemd / launchd samples)
- `ROADMAP.md` — milestones, slices, and phased **next steps** toward Hermes-tier parity (MCP, learning loop, gateways, Docker, policy)
- `Dockerfile` / `docker-compose.yml` — agent in a container with persisted `~/.umbrella`
- `bin/install.js` — copies `modules/*` skills/commands into `~/.umbrella` (or `./.umbrella` with `--local`)
- `bin/import-skill.js` — copy a `SKILL.md` folder into `~/.umbrella/skills/umb-imported/`
- `modules/agent-runtime/` — SQLite memory, planner, executor + tool sandbox, Telegram gateway
- `runtime/index.ts` — heartbeat loop

MIT License — see `LICENSE`.
