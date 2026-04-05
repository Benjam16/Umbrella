# Solo build & publish (CLI tools)

This is the **safe** path to let Umbrella (or you) repeatedly spin up **small npm CLIs** with a **human gate** before anything reaches the registry.

## What ships in-repo

| Piece | Purpose |
|--------|---------|
| `examples/shipping-cli-template/` | Valid npm package: TypeScript, Commander, Vitest, `prepublishOnly` = build + test |
| `examples/shipping-cli-template/.github/workflows/publish.yml` | On tag `v*.*.*`, runs `npm publish --provenance` (OIDC — no `NPM_TOKEN` in Umbrella) |
| `umbrella scaffold cli <dir> <package> [--bin name]` | Copies the template and renames `@umbrella/shipping-cli-template` / `shipping-template` |

## Recommended operator flow

### 1. Constrain where code may live

Pick a single parent directory (example: `~/umbrella-shipping`). Put **only** shipping-bound repos there.

- Set **`UMBRELLA_SHIPPING_ROOT`** in `~/.umbrella/.env` or your shell to that path.
- Tighten **`UMBRELLA_SHELL_POLICY`** / **`UMBRELLA_SHELL_ALLOW_PREFIXES`** so the agent’s shell tool may only touch that tree (and safe read-only paths you need). See `SKILL.md` shell policy.

This is the main guardrail against “random `rm -rf` in your home directory.”

### 2. Scaffold a new tool

From the Umbrella repo (or any install that has `examples/`):

```bash
umbrella scaffold cli ~/umbrella-shipping/my-widget @yourscope/my-widget
# optional explicit binary name:
umbrella scaffold cli ~/umbrella-shipping/my-widget @yourscope/my-widget --bin my-widget
cd ~/umbrella-shipping/my-widget
npm install
npm test
git init
git add .
git commit -m "chore: initial scaffold"
```

Create an **empty** GitHub repo, add `origin`, push `main`.

### 3. npm Trusted Publishing (once per package)

1. On [npmjs.com](https://www.npmjs.com/), create the package (or claim the name) under your scope.
2. Add a **Trusted Publisher** linking **this GitHub repo** + workflow file `publish.yml` (see [npm: Trusted publishers](https://docs.npmjs.com/trusted-publishers)).
3. Use **branch protection** on `main` and require review for merges.

After this, CI can publish **without** storing an automation token in Umbrella.

### 4. Release = tag, not “agent runs npm publish”

```bash
npm version patch   # or minor / major
git push origin main --follow-tags
```

The workflow runs tests, then `npm publish --provenance`. If something fails, fix and retag.

### 5. Umbrella “discovery” (start narrow)

Use **`~/.umbrella/schedule.json`** or a **core goal** to run a **bounded** check (your backlog file, one RSS, issues you watch) — not an open-ended “scrape Twitter” loop.

Examples to copy:

- `examples/schedule.shipping.example.json` — infrequent scheduled goal text.
- `examples/core-goal.shipping.example.txt` — text you can paste into `/api/core-goal` or Telegram `/umb core`.

Keep goals explicit: *read allowlisted sources → if a candidate matches criteria → scaffold or open a PR branch; never publish without your approval on GitHub.*

### 6. Human approval patterns you already have

Reuse the same ideas as chaos / skill promotion:

- **`UMBRELLA_CHAOS_APPROVE=1`** for dangerous shell recovery (if you let the agent run broader shell).
- **GitHub**: required reviewers + environment protection on **release** jobs if you add staging.
- **Telegram / HTTP**: send yourself a summary and only merge or tag after you agree.

## Automating with the agent (“when it sees fit”)

The daemon executor understands a dedicated action (no shell needed):

```text
scaffold-cli:{"packageName":"@yourscope/my-cli","subdir":"my-cli","bin":"my-cli"}
```

- **`packageName`** — npm name after scaffold (same as `umbrella scaffold cli`).
- **`subdir`** — folder **under `UMBRELLA_SHIPPING_ROOT`** only (relative path, no `..`).
- **`bin`** — optional CLI binary name; default is the unscoped part of `packageName`.

**Requirements**

1. Set **`UMBRELLA_SHIPPING_ROOT`** in `~/.umbrella/.env` (or the daemon environment) to your shipping parent directory.
2. Keep **`UMBRELLA_AGENT_SCAFFOLD`** unset, or not `0` / `false`. Set **`UMBRELLA_AGENT_SCAFFOLD=0`** to hard-disable agent-driven scaffolds.

The **planner / subagent** prompts mention `scaffold-cli:` so the LLM can emit it inside XML plans when the goal matches (e.g. core goal or schedule text you write). Pair with a **core goal** or **`schedule.json`** that describes *when* to propose a new CLI (narrow criteria — not open-ended web scraping).

Still **no `npm publish`** from Umbrella: after scaffold, the agent (or you) uses normal **`shell:`** / git in the child repo; releases stay **tag + GitHub Action** as above.

## Verify the template inside Umbrella

```bash
cd examples/shipping-cli-template
npm install
npm test
```

You should not publish `@umbrella/shipping-cli-template` to npm; it exists so CI and `npm test` stay honest. Use **`umbrella scaffold cli`** for real packages.
