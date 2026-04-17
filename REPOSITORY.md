# Umbrella repository guide

This document is the **operator’s map** of the [Umbrella](https://github.com/Benjam16/Umbrella) monorepo: what ships where, how to develop it, and where deeper specs live.

## Products in this repo

| Product | Location | Published as | Role |
|--------|----------|--------------|------|
| **Umbrella CLI / agent daemon** | Repository root (`src/`, `modules/`, `runtime/`, `dist/`) | [`@benjam16/umbrella` on npm](https://www.npmjs.com/package/@benjam16/umbrella) | Installable CLI, 24/7 agent runtime, MCP, Telegram/Slack bridges, dashboard |
| **Sovereign Agentic Workstation (platform)** | [`platform/`](./platform) | **Not** on npm (private workspace) | Tauri desktop + Hono API: DAG runs, self-healing runner, backups/DR, blueprints, minting |
| **Marketing site** | [`website/`](./website) | Deploy separately (e.g. [Vercel](https://vercel.com)) | Static landing page; see [`website/deploy-vercel.txt`](./website/deploy-vercel.txt) |

Capability narrative for the workstation stack: [`CAPABILITIES.md`](./CAPABILITIES.md).

## Directory map (high level)

```
Umbrella/
├── src/, modules/, runtime/     # CLI + agent runtime (TypeScript → dist/)
├── bin/                         # Installers and helpers
├── tests/                       # CLI-focused tests (plan replay, etc.)
├── examples/                    # Config templates, shipping-cli template
├── website/                     # Static marketing site
├── platform/                    # npm workspace: apps/api, apps/desktop, packages/shared
│   ├── apps/api/               # Hono API (Node 20+)
│   ├── apps/desktop/           # Tauri 2 + React (Vite)
│   └── packages/shared/        # Shared types/schemas
├── CAPABILITIES.md             # Product + API summary (workstation)
├── FEATURES.md                 # CLI feature list and ops ideas
├── README.md                   # Primary entry (CLI + pointers)
└── REPOSITORY.md               # This file
```

## Requirements

| Area | Version / notes |
|------|------------------|
| **CLI package** | Node **18+** (`engines` in root `package.json`) |
| **Platform workspace** | Node **20+** (`platform/package.json`); **Rust** via `rustup` for Tauri desktop builds |
| **Local LLM (optional)** | [Ollama](https://ollama.com/) or any OpenAI-compatible server; see `platform/.env.example` |

## Development workflows

### CLI (`@benjam16/umbrella`)

```bash
npm install
npm run build
npm test
```

Entry development: `npm run dev` or `node dist/src/cli.js` after build.

### Platform API

```bash
cd platform
npm install
npm run dev:api
```

Configure `platform/apps/api/.env` (copy from `platform/.env.example`). Default API port **8787** (override with `PORT`). If you see **EADDRINUSE**, another process is already bound to that port—stop it or change `PORT`.

### Platform desktop (Tauri)

```bash
cd platform
npm run dev:desktop
```

Requires Rust toolchain for full Tauri; Vite-only pieces may run with `npm run dev` inside `apps/desktop` per that package’s scripts.

### Platform tests (API)

```bash
cd platform/apps/api
npm test
```

Tests run with **concurrency 1** to avoid shared JSON store races.

## Releases (CLI on npm)

- Version lives in root **`package.json`**.
- Publish from repo root (npm 10.9+ requires an explicit path):

  ```bash
  npm publish .
  ```

  Or: `npm run publish:npm` / `npm run publish:npm:dry` (see root `package.json` scripts).
- **Never republish the same semver**; bump patch/minor/major, commit, tag if you use tags, then publish.
- Platform packages are **`private: true`** and are not published to the registry as separate packages today.

## Authentication and secrets

- **CLI:** `~/.umbrella/.env`, `examples/.env.example`, and docs in `README.md`.
- **Platform API:** `platform/apps/api/.env`; never commit real secrets—use `.env` locally and your host’s secret store in production.

## Security

See [`SECURITY.md`](./SECURITY.md) for how to report vulnerabilities.

## Contributing

See [`.github/CONTRIBUTING.md`](./.github/CONTRIBUTING.md).

## Continuous integration

GitHub Actions workflow **`.github/workflows/ci.yml`** runs on push and pull requests: CLI build + tests, and platform workspace build + API tests.

## License

MIT — see [`LICENSE`](./LICENSE).
