Before executing: confirm no secrets in logs, block `rm -rf /`, and prefer read-only tools first.

- **Shell policy:** `UMBRELLA_SHELL_POLICY=strict` + `UMBRELLA_SHELL_ALLOW_PREFIXES` (comma-separated) — central checks in `shell-policy.ts` apply to `Toolset.shell` and chaos recovery steps.
- **MCP kill switch:** `UMBRELLA_MCP_NETWORK_DISABLED=1` prevents MCP stdio servers from starting even if `UMBRELLA_MCP_ENABLED=1`.
- **Inbound HTTP goals:** mutating routes require `Authorization: Bearer $UMBRELLA_INBOUND_SECRET`. **`GET /api/agent-state` is unauthenticated** (shows core/foreground text) — bind the dashboard to localhost or protect with a reverse proxy.
- **Browser hints:** Chaos Specialist DuckDuckGo fetch can be disabled with `UMBRELLA_BROWSER_HINT_DISABLED=1`.
- **Direct URL fetch (Chaos):** `UMBRELLA_WEB_FETCH=1` lets the specialist pull a bounded text excerpt from the first `http(s)` URL in the error (optional `UMBRELLA_WEB_FETCH_ALLOWLIST=host1,host2`, `UMBRELLA_WEB_FETCH_HTTP=1` for non-TLS dev). Prefer allowlists on shared hosts.

Context: {{context}}
