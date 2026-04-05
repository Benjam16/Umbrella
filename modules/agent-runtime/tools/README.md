# Umbrella tools & MCP

Built-in tools live in `modules/agent-runtime/core/tools.ts` (`shell`, `read_file`, `write_file`, `git_status`). Shell commands also pass through `modules/agent-runtime/core/shell-policy.ts`.

### Built-in vs MCP (Milestone 1.2)

| Prefer built-in | Prefer MCP server |
|-----------------|-------------------|
| Tiny, always-on actions (read a file, `git status`, policy-gated shell) | Vendor SDKs, browsers, DBs, multi-step proprietary APIs |
| No extra process / no JSON manifest | When the tool surface is large or updated upstream often |
| Same code path on air-gapped hosts with MCP disabled | When isolation (separate OS process) matters |

Umbrella keeps the **executor** surface small on purpose: anything domain-heavy (filesystem trees, Slack, Postgres, …) should usually be an **MCP** `command` or **`url`** server. Built-ins stay for bootstrap, repo inspection, and chaos recovery.

## Model Context Protocol (MCP)

Umbrella connects to **stdio** and **Streamable HTTP** (remote SSE) MCP servers at daemon startup and exposes tools to the executor.

### Environment

| Variable | Meaning |
|----------|---------|
| `UMBRELLA_MCP_ENABLED` | Set to `1` or `true` to start MCP. |
| `UMBRELLA_MCP_SERVERS` | JSON **array** of stdio `{ "command": "...", "args": [...], "env"?: {}, "cwd"?: string }` and/or HTTP `{ "url": "https://host/mcp", "headers"?: { "Authorization": "Bearer ${TOKEN}" } }`. |
| `UMBRELLA_MCP_SERVERS_FILE` | Absolute path to a JSON **array** of the same shapes; merged **before** inline `UMBRELLA_MCP_SERVERS` (lower server indices = file entries first). |
| `UMBRELLA_MCP_MAX_TOOLS` | Max tools registered across all servers (default `128`; raise for many crypto MCPs, e.g. `512`). |
| `UMBRELLA_MCP_TIMEOUT_MS` | Per `callTool` timeout (default `60000`). |
| `UMBRELLA_MCP_AUDIT` | Set to `0` to disable `~/.umbrella/mcp-audit.log`. |
| `UMBRELLA_MCP_NETWORK_DISABLED` | If `1`, MCP does not start (kill switch for hosted environments). |

### Executor action format

Single-line JSON after the `mcp:` prefix:

```text
mcp:{"server":0,"name":"read_file","arguments":{"path":"/tmp/example.txt"}}
```

- `server` — index into the **merged** server list (`UMBRELLA_MCP_SERVERS_FILE` then `UMBRELLA_MCP_SERVERS`; first server is `0`).
- `name` — tool name from that server’s `tools/list` (must be in the allowlist built at connect time).
- `arguments` — object; omit or `{}` if none.

### Failure modes

- **Invalid JSON** — action is skipped or LLM router returns unhandled line.
- **Server exit** — connection fails at startup; Umbrella logs and continues without that server.
- **Timeout** — `UMBRELLA_MCP_TIMEOUT_MS`; result logged to MCP audit as error.
- **Auth / env** — pass secrets only via `env` in the JSON config for that server entry (never commit).

### `${VAR}` in `env` values

Values may use `${ENV_NAME}`; Umbrella replaces them from **its own** process environment at startup so API keys are not hard-coded in JSON.

### Crypto / multi-chain MCP

See **[CRYPTO_MCP.md](./CRYPTO_MCP.md)** and **`examples/mcp-crypto.servers.json`** (copy to a private path, delete servers you do not want, set `UMBRELLA_MCP_SERVERS_FILE`).

### Example server (filesystem)

```bash
export UMBRELLA_MCP_ENABLED=1
export UMBRELLA_MCP_SERVERS='[{"command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/tmp"]}]'
```

Then open `GET http://127.0.0.1:<DASHBOARD_PORT>/api/mcp-tools` to see flattened tool hints.

### Docs

- [Model Context Protocol](https://modelcontextprotocol.io)

## agentskills.io alignment

Portable skills often ship as a folder with `SKILL.md` plus optional scripts. Umbrella’s installer copies `modules/*/skills/` into `~/.umbrella/skills/umb-<module>/`. To import an external folder, run:

```bash
node bin/import-skill.js /path/to/skill-folder my-alias
```

That installs under `~/.umbrella/skills/umb-imported/<my-alias>/`. Match upstream naming and frontmatter to stay compatible with community hubs that follow [agentskills.io](https://agentskills.io).
