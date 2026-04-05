# Umbrella — features & positioning

**One CLI. One agent.** Slash-command skills for your IDE **plus** a headless **24/7 daemon** (planner → executor → memory) that keeps working while your laptop is closed—especially when you pair it with **Docker**, **Telegram**, and **HTTP goals**.

For install and env variables, see **[README.md](./README.md)**. For phased engineering work, see **[ROADMAP.md](./ROADMAP.md)**.

---

## What you get today

### IDE workflows (after `install`)

- Copied **skills** and **commands** under `~/.umbrella` (or `./.umbrella`) for **Claude Code**, **Cursor**, **Gemini CLI**, **OpenAI / Codex-style** flows.
- Bundled references: **`MCP_TOOLS.md`**, **`CRYPTO_MCP.md`**, **`examples/`** (crypto MCP template, systemd/launchd samples).

### Autonomous agent daemon

- **Heartbeat loop**: plan → execute → verify on an interval.
- **GSD-style XML plans**: milestones → slices → tasks; optional orchestrator budgets.
- **Multi-provider LLM**: Anthropic, OpenAI, Google/Gemini; **OpenAI-compatible** base URL (**`UMBRELLA_OPENAI_BASE_URL`**, e.g. Ollama); **fallback XML** if no key.
- **Secrets helper**: **`UMBRELLA_SECRETS_HELPER`** executable → JSON stdout merged into env (empty keys only).
- **Memory LLM compact** (optional): periodic bounded summary — **`UMBRELLA_MEMORY_LLM_COMPACT=1`**.
- **Built-in tools**: shell (policy-gated), read/write file, git status; LLM can route to `shell:` / `read:` / `write:` / `mcp:`.
- **Chaos mode**: failed shell → recovery plan (LLM + optional browser hint) → retry; optional **human approval** before recovery commands.
- **Subagents**: optional per-slice expansion; optional **worker process** for isolation.
- **SQLite memory**, **session** checkpoint, **stuck detector** → escalation goals.
- **Token budget** (daily approx), **LLM audit log**, optional **verify command**.

### MCP (stdio + Streamable HTTP)

- Load **multiple MCP servers** from env JSON and/or a **file** — **stdio** (`command`) and **remote** (`url` + optional `headers`); **`${VAR}`** expansion for secrets.
- **Crypto / on-chain** starter catalog and template JSON; tool list exposed on the dashboard API.
- **Network kill switch** for locked-down hosts.

### Goals & operator UX

- **Core goal** (long-running background) vs **foreground task** (interrupt); **pause** background while idle.
- **Telegram**: core/task/done/pause/resume/brief + ingest/recall; optional **digest** every N heartbeats.
- **Discord** (optional): same command set with **`!umb`** prefix; enable **Message Content Intent** on the bot; digest via **`UMBRELLA_DIGEST_HEARTBEATS`** (or legacy Telegram-only var).
- **Slack** (optional, Socket Mode): same **`!umb`** surface; set **`SLACK_BOT_TOKEN`**, **`SLACK_APP_TOKEN`**, **`SLACK_SIGNING_SECRET`**; digest + schedule notify use the last channel that sent **`!umb`**.
- **HTTP** (Bearer secret): set goals, read agent state, approve chaos/skills.
- **Dashboard**: chaos feed, last run, **run scorecard** (`/api/run-log`), goals controls, MCP tool hints (**`GET /api/mcp-tools`**), unified built-in + MCP list (**`GET /api/tools`**), optional **`POST /api/voice-transcribe`** (Bearer + **`UMBRELLA_VOICE_STT`**), **`GET /api/health`** (uptime), **`GET /api/version`** (package meta).
- **Schedule file** for recurring injected goals — **interval** and/or **cron** (`examples/schedule.cron.example.json`); **synced to SQLite** on daemon start (`umbrella_schedules`, **`GET /api/schedules`**); optional **Telegram/Discord/Slack ping** after scheduled runs (`UMBRELLA_SCHEDULE_NOTIFY=1`).

### Learning & skills

- **Skill candidates** from successful verification → pending proposals → **`umb-learned`** (optional approval gate).
- **`import-skill.js`** for external `SKILL.md` folders.

### Shipping & isolation

- **Dockerfile** (multi-stage: build → slim runtime with `npm ci --omit=dev`) + **docker-compose** + **healthcheck** for a **standalone** runtime with a persistent volume for `~/.umbrella`.

### CLI convenience

- **`umbrella up`** — same as **`umbrella agent start`** (single child process). From source, **auto-`npm run build`** if `dist/runtime/index.js` is missing (skip with **`--no-build`** or **`UMBRELLA_NO_AUTO_BUILD=1`**).
- **`.env` + config** — daemon loads **`UMBRELLA_DOTENV`** (if set) and **`~/.umbrella/.env`** before **`config.json`**, without overriding variables already in the shell.
- **`~/.umbrella/config.json`** — `{ "env": { ... } }` merged when the **daemon** starts (not the CLI); **`umbrella up --dry-run`** loads `.env` then previews the config merge; **`umbrella config-path`** prints the resolved path.
- **`package.json` version** drives **`umbrella --version`**.
- **`umbrella scaffold cli`** — copies **`examples/shipping-cli-template`** (TypeScript CLI, Vitest, GitHub Action + npm **OIDC provenance** on tags). See **`examples/SHIPPING.md`**.
- **agentskills.io** notes: **`docs/AGENTSKILLS.md`**, **`node bin/adapt-agentskill.js <SKILL.md>`**.

---

## Automation & standalone — what we can do next

These are the highest-leverage moves to feel **less manual** and more **appliance-like**:

| Direction | Idea |
|-----------|------|
| **One command** | **`umbrella up`** shipped (same as `agent start`). **Auto-`npm run build`** when `dist/runtime` is missing from a clone; **`--no-build`** / **`UMBRELLA_NO_AUTO_BUILD`** to disable. |
| **OS service** | **systemd** / **launchd** examples in `examples/systemd/`, `examples/launchd/`. |
| **Config file** | **Shipped:** **`~/.umbrella/config.json`** `{ "env": { … } }` merged at **daemon start**; shell env wins; **`UMBRELLA_CONFIG`** / **`UMBRELLA_HOME`**; **`umbrella up --dry-run`**, **`umbrella config-path`**; template **`examples/config.json.example`**. |
| **Install → run** | Optional **`postinstall`** or documented **`npx @scope/umbrella install && umbrella agent start`** one-liner for servers. |
| **Health & ops** | Document **`GET /api/health`** for Kubernetes/docker-compose `healthcheck`; add **`/api/version`** (git tag / package version). |
| **MCP transport** | Optional **SSE/HTTP MCP client** for vendors that do not ship stdio (bigger change; unlocks more hosted tools). |
| **Ollama / local LLM** | Provider adapter for a fixed OpenAI-compatible base URL so the daemon can run **fully offline** except for optional MCP/network. |
| **Secrets** | Read-only mount or **exec helper** for vault/agent-injected env so `.env` is not the long-term story on shared hosts. |

Umbrella is already **standalone** in the sense of: **one Node process**, **local SQLite**, **no IDE required** for the daemon. The gaps are mostly **packaging** (config, service units, one entrypoint) and **optional transports** (HTTP MCP, local LLM).

---

## Comparison snapshot (honest)

- **vs IDE-only copilots:** Umbrella adds a **persistent loop**, **memory**, **gateways**, and **policy hooks** outside the editor.
- **vs “install fifty MCPs in Cursor”:** Umbrella centralizes **stdio MCP** for the **daemon**, with **budgets**, **audit**, and **executor** wiring—but Cursor MCP and Umbrella MCP are configured **separately** today.

---

## License

MIT — see [LICENSE](./LICENSE).
