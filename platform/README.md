# Umbrella platform (MVP scaffold)

Monorepo for the **Umbrella** desktop app + **credit-metered API**. This is the vertical slice to extend with hosted inference (vLLM / NIM), Stripe, and later x402 / token top-ups.

## Layout

| Path | Role |
|------|------|
| `apps/desktop` | Tauri 2 + React — connects to API, dev signup, chat stub |
| `apps/api` | Hono server — credits ledger (JSON file), `/v1/me`, `/v1/chat` |
| `packages/shared` | Zod schemas + shared constants |

## Prerequisites

- Node 20+
- [Rust](https://rustup.rs/) (for Tauri)

## Setup

```bash
cd platform
npm install
```

## Run API

```bash
npm run dev:api
```

- Health: http://127.0.0.1:8787/health (`defaultModel`, `provider`, and model count)  
- Models: http://127.0.0.1:8787/v1/models (enabled model registry + per-model credit rates)  
- Runs: `/v1/runs` (long-horizon manager/worker loop with verify/retry + HITL pause)
- Data file: `platform/apps/api/data/store.json` when the API runs with cwd `apps/api` (or set `UMBRELLA_DATA_DIR`; ignored by git)

### Local inference (Ollama)

1. Install [Ollama](https://ollama.com/) and pull a model, e.g. `ollama pull gemma3:4b` (use any tag you actually have; names change over time).  
2. Ensure the OpenAI-compatible server is up (default `http://127.0.0.1:11434/v1`).  
3. Set `UMBRELLA_INFERENCE_URL` and `UMBRELLA_INFERENCE_MODEL` in `apps/api/.env` (see `.env.example`).  
4. Credits are charged from **reported token usage** (per selected model, minimum 1 credit). If no model is configured, the API falls back to a **stub** model.
5. Optional multi-model setup: define `UMBRELLA_MODEL_IDS` and `UMBRELLA_MODEL_<ID>_*` vars (see `.env.example`), then pass `requestedModel` in `/v1/chat`.

For production, point the same variables at **vLLM / NIM** (still OpenAI-compatible `/v1/chat/completions`).

## Run desktop

In a second terminal:

```bash
cd platform
npm run dev:desktop
```

1. Click **Dev signup** (only when `UMBRELLA_ALLOW_DEV_SIGNUP=true`).  
2. Send chat messages — each deducts credits (token-metered by selected model, or flat stub if no real model).  
3. When credits hit zero, `/v1/chat` returns **402** with a JSON body (placeholder for x402-style flows).

## Long-horizon runs (autonomy MVP)

`/v1/runs` adds a manager/worker loop:

- **planning**: model generates a step plan from your objective
- **executing**: worker emits JSON tool actions and the runner executes them (`run_command`, `write_file_patch`)
- **verifying**: runs real verify commands (`UMBRELLA_RUN_VERIFY_COMMANDS`) with sandbox-style limits; if not configured, falls back to model `PASS:` / `FAIL:`
- **blocked**: waits for approval on risky steps or retry/cancel decisions

Endpoints (Bearer auth required):

- `POST /v1/runs` → create and start run
- `GET /v1/runs` → list your runs
- `GET /v1/runs/:id` → run details (steps/logs/status)
- `POST /v1/runs/:id/approve` with `{ "action": "continue" | "retry" | "cancel" }`
- `POST /v1/runs/:id/cancel`

Example create payload:

```json
{
  "objective": "Refactor auth layer and verify with tests",
  "requestedModel": "gemma",
  "maxCredits": 250,
  "maxSteps": 8,
  "maxMinutes": 20,
  "maxAutoFixes": 2
}
```

Verification command safety knobs (`apps/api/.env`):

- `UMBRELLA_RUN_PROJECT_ROOT` absolute path where commands run
- `UMBRELLA_RUN_VERIFY_COMMANDS` comma-separated commands (e.g. `npm run -s test,npm run -s build`)
- `UMBRELLA_RUN_ALLOWED_COMMAND_PREFIXES` allowlist for first token
- `UMBRELLA_RUN_COMMAND_TIMEOUT_MS` per-command timeout
- `UMBRELLA_RUN_MAX_OUTPUT_BYTES` output cap per command
- `UMBRELLA_RUN_WRITE_ALLOWLIST` comma-separated relative path prefixes allowed for `write_file_patch`
- `UMBRELLA_RUN_REQUIRE_APPROVAL_FOR_PROTECTED_WRITES` (default `true`) pauses runs before protected writes
- `UMBRELLA_RUN_PROTECTED_PATHS` comma-separated path prefixes that require explicit `continue` approval

## Environment

1. **API** — copy `platform/.env.example` to `platform/apps/api/.env` and edit values. The server loads that file on startup (`dotenv` from `apps/api/src/index.ts`).  
2. **Desktop** — optional: create `platform/apps/desktop/.env` with `VITE_API_URL=...` if the API is not on `http://127.0.0.1:8787`.  
3. If you skip `.env` files entirely, the defaults in code still work for local dev (including dev signup, unless you set `UMBRELLA_ALLOW_DEV_SIGNUP=false`).

## Next steps (not implemented here)

- Add complexity-based routing/escalation policy (Gemma-first -> frontier model when needed)  
- Add Stripe webhooks → credit top-ups  
- Add proper auth (OAuth) and retire `dev-signup` in production  
- Sandboxed tools + project folder allowlist in the desktop app  

## Repo note

This folder lives inside the **[Umbrella](https://github.com/Benjam16/Umbrella)** repo. [Vercel](https://vercel.com) should keep **Root Directory = `website`** for the marketing site only; the platform is not part of that deploy unless you add a second Vercel project pointed at `platform/apps/api` (or Docker/ Fly.io / Railway for the API).
