# Crypto & on-chain MCP with Umbrella

Umbrella’s daemon only supports **stdio** MCP servers (subprocess + JSON-RPC). Remote-only MCP (HTTP/SSE URLs in Cursor) does **not** plug in here unless you run a local stdio bridge.

There is **no stable single registry of “every chain.”** Chains and npm packages churn constantly. Treat this file as a **starter map** plus **how to discover more**.

## Quick install (file-based)

1. Copy `examples/mcp-crypto.servers.json` to a private path (e.g. `~/.umbrella/mcp-crypto.servers.json`) and **delete** servers you will not run.
2. Set keys in your environment (shell, systemd, Docker `env_file`, etc.).
3. Start the agent:

```bash
export UMBRELLA_MCP_ENABLED=1
export UMBRELLA_MCP_SERVERS_FILE="$HOME/.umbrella/mcp-crypto.servers.json"
export UMBRELLA_MCP_MAX_TOOLS=512   # if you stack many servers
```

4. Confirm tools: open the dashboard `GET /api/mcp-tools` (with `UMBRELLA_DASHBOARD_PORT` set).

`UMBRELLA_MCP_SERVERS` (inline JSON) and `UMBRELLA_MCP_SERVERS_FILE` are **merged** (file first, then env).

## `${VAR}` expansion

In each server’s `env` map, values can use `${ENV_NAME}`. Umbrella replaces them from **its own** environment at startup so secrets are not hard-coded in JSON.

## Curated stdio packages (verify before relying)

| Area | npm package | Notes |
|------|-------------|--------|
| **EVM (many chains)** | [`@mcpdotdirect/evm-mcp-server`](https://www.npmjs.com/package/@mcpdotdirect/evm-mcp-server) | Broad EVM coverage; optional `ETHERSCAN_API_KEY`; **writes** if `EVM_PRIVATE_KEY` / mnemonic set — treat as **hot wallet risk**. |
| **Etherscan data** | [`mcp-etherscan-server`](https://www.npmjs.com/package/mcp-etherscan-server) | Read-oriented explorer API; needs `ETHERSCAN_API_KEY`. |
| **Market data** | [`@coingecko/coingecko-mcp`](https://www.npmjs.com/package/@coingecko/coingecko-mcp) | Official; uses Coingecko API keys / environment vars per their README. |
| **Solana** | [`solana-mcp-server`](https://www.npmjs.com/package/solana-mcp-server), [`solana-mcp`](https://www.npmjs.com/package/solana-mcp) | Multiple options; read each README for RPC and wallet env. |
| **Bitcoin** | [`@jamesanz/bitcoin-mcp`](https://www.npmjs.com/package/@jamesanz/bitcoin-mcp) | Community server; confirm tool surface before mainnet use. |
| **Chainlink (docs / assistant)** | [`@chainlink/mcp-server`](https://www.npmjs.com/package/@chainlink/mcp-server) | Often doc/developer-assistant oriented; check whether it fits your workflow. |
| **Crypto APIs (contracts, etc.)** | [`@cryptoapis-io/mcp-contracts`](https://www.npmjs.com/package/@cryptoapis-io/mcp-contracts) and siblings under [`@cryptoapis-io/*`](https://www.npmjs.com/search?q=scope%3Acryptoapis-io) | Uses `CRYPTOAPIS_API_KEY` (see package README). Modular; add only packages you need. |
| **Chainlink (docs assistant)** | [`@chainlink/mcp-server`](https://www.npmjs.com/package/@chainlink/mcp-server) | Often needs an OpenAI key per upstream docs — add manually to your JSON if you use it. |

**Correction vs generic “listicles”:** there is not a single verified npm package literally named `@cryptoapis-io/mcp-evm` at time of writing; prefer the **scoped `@cryptoapis-io/mcp-*`** packages you actually need.

**Coinbase CDP / AgentKit:** onboarding is often **library + CDP keys**, not always a one-line `npx` stdio server. Use [Coinbase AgentKit MCP docs](https://docs.cdp.coinbase.com/agent-kit/core-concepts/model-context-protocol) and add a custom `command` if their CLI emits stdio.

## Discover more servers

```bash
npm search mcp blockchain
npm search mcp solana
npm search mcp evm
npm search mcp bitcoin
```

Browse aggregators (quality varies):

- [MCP Servers directory](https://mcpservers.org/) — filter by topic.
- GitHub search: [`mcp-server blockchain`](https://github.com/search?q=mcp-server+blockchain&type=repositories) (sort by recently updated).

For each candidate, check:

- **Transport:** must support **stdio** for Umbrella today.
- **Maintenance:** last publish date, issues, license.
- **Write tools:** any path that moves funds or signs transactions.

## Safety (non-negotiable)

- **Never** put main-net keys in env on a shared machine.
- Prefer **read-only** configs first (no private keys / mnemonics).
- Keep **`UMBRELLA_SHELL_POLICY=strict`**, **`UMBRELLA_MCP_NETWORK_DISABLED`** for locked-down hosts, and **separate** “trading” keys with **loss caps**.
- Umbrella’s default **`UMBRELLA_MCP_MAX_TOOLS`** is now **128**; stack many servers with an explicit **`UMBRELLA_MCP_MAX_TOOLS=512`** (or higher) so tools are not silently truncated.

## Umbrella executor reminder

Tools are invoked as:

```text
mcp:{"server":<index>,"name":"<tool_name>","arguments":{...}}
```

Server index matches the **merged** order: entries from `UMBRELLA_MCP_SERVERS_FILE` first, then `UMBRELLA_MCP_SERVERS`.
