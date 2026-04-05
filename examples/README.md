# Examples

After **`umbrella install`** (or `node bin/install.js`), this folder is copied to **`<umbrella-home>/examples/`** (e.g. `~/.umbrella/examples/`).

## Run at boot (standalone host)

- **Linux (systemd):** `examples/systemd/umbrella-agent.service.example` — adjust paths, install unit, `systemctl enable --now umbrella-agent`.
- **macOS (launchd):** `examples/launchd/com.umbrella.agent.plist.example` — copy to `~/Library/LaunchAgents/`, edit paths/keys, `launchctl load`.

See **[FEATURES.md](../FEATURES.md)** for the full capability list and automation ideas.

## Environment files (`.env`)

1. **`UMBRELLA_DOTENV`** — if set, this file is loaded first (if it exists).
2. **`<UMBRELLA_HOME>/.env`** — default `~/.umbrella/.env`.

Uses the `dotenv` package; **does not override** variables already set in the process environment.

Copy **`examples/.env.example`** to **`~/.umbrella/.env`** and fill in values.

## Scheduled goals (`schedule.json`)

- **Legacy:** `{ "intervalMs": 3600000, "goal": "..." }` (minimum interval 10s).
- **Mixed:** see **`schedule.cron.example.json`** — `schedules` array with **`intervalMs`** entries and/or **`cron`** (5-field cron string) + optional **`timezone`**.
- **SQLite:** On each **agent start**, the file is **re-read** and rows are stored in **`umbrella_schedules`** inside `~/.umbrella/memory.db` (source of truth for the running daemon). Deleting `schedule.json` clears the table on next start. Inspect with **`GET /api/schedules`** when the dashboard is enabled. Set **`UMBRELLA_SCHEDULE_NOTIFY=1`** for a Telegram/Discord summary after each scheduled heartbeat.

## Worker wrapper (subagent process)

See **`worker-wrapper.example.sh`** — extension point for **`UMBRELLA_WORKER_WRAPPER`** + **`UMBRELLA_SUBAGENT_USE_PROCESS=1`** (Milestone 3.2).

## Daemon config (`config.json.example`)

Copy to **`~/.umbrella/config.json`** (or set **`UMBRELLA_CONFIG`** to an absolute path, or **`UMBRELLA_HOME`** for the umbrella data directory so config is `$UMBRELLA_HOME/config.json`).

**Load order at daemon start:** `.env` file(s) → then **`config.json`** `env` block. **Existing non-empty environment variables always win** (shell beats everything).

- Preview: `umbrella up --dry-run`
- Resolved path: `umbrella config-path`

## Remote MCP (`mcp-remote.example.json`)

Streamable **HTTP** MCP entries use **`url`** (+ optional **`headers`** with **`${VAR}`** expansion). Merge with stdio servers in the same JSON array. See `modules/agent-runtime/tools/README.md`.

## Crypto / on-chain MCP (`mcp-crypto.servers.json`)

Template list of **stdio** MCP servers you can point Umbrella at. It is **not** exhaustive (new chains appear weekly).

1. Export API keys in your shell (never commit real values).
2. Point Umbrella at the file:

```bash
export UMBRELLA_MCP_ENABLED=1
export UMBRELLA_MCP_SERVERS_FILE="/absolute/path/to/Umbrella/examples/mcp-crypto.servers.json"
# Optional: raise cap if you add many servers
export UMBRELLA_MCP_MAX_TOOLS=512
npm run agent
```

Placeholders like `"${ETHERSCAN_API_KEY}"` are expanded from the **parent process environment** when the daemon starts (see `modules/agent-runtime/mcp/client-manager.ts`).

Remove or comment out JSON objects for servers you do not want (JSON does not support comments — delete unused array entries or maintain a private copy).

Full notes, risks, and discovery commands: `modules/agent-runtime/tools/CRYPTO_MCP.md`.

## Shipping CLIs (scaffold + npm OIDC)

- **Guide:** **[SHIPPING.md](./SHIPPING.md)** — constrained workspace (`UMBRELLA_SHIPPING_ROOT`), Trusted Publishing, tag-based release.
- **Template:** `shipping-cli-template/` — TypeScript CLI + Vitest + `.github/workflows/publish.yml`.
- **CLI:** `umbrella scaffold cli <destDir> <packageName> [--bin name]`
- **Agent:** plan tasks may use `scaffold-cli:{"packageName":"@scope/x","subdir":"x"}` when **`UMBRELLA_SHIPPING_ROOT`** is set (disable with **`UMBRELLA_AGENT_SCAFFOLD=0`**).
- **Sample goals:** `schedule.shipping.example.json`, `core-goal.shipping.example.txt`
