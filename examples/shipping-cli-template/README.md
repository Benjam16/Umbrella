# @umbrella/shipping-cli-template

Cookie-cutter **Node 18+** CLI: TypeScript, Commander, Vitest, and a GitHub Action that publishes to npm with **provenance** (OIDC) after you push a **semver tag**.

## Not for publishing as-is

This folder ships inside **Umbrella** as a template. Copy it with your names:

```bash
umbrella scaffold cli ./my-tool @yourscope/my-tool
# optional: --bin my-tool
```

## Local development

```bash
npm install
npm run build
npm test
node dist/cli.js
```

## Release (human-gated CI)

1. On [npmjs.com](https://www.npmjs.com/), enable **Trusted Publisher** for this package and link **this** GitHub repository (see [npm docs](https://docs.npmjs.com/trusted-publishers)).
2. Merge only what you trust to `main`.
3. Bump version and tag, for example:

```bash
npm version patch
git push origin main --follow-tags
```

Pushing tag `v*` triggers `.github/workflows/publish.yml`, which runs tests and runs `npm publish --provenance`.

**Do not** put long-lived `NPM_TOKEN` secrets in Umbrella’s `.env` for routine publishes; prefer OIDC + branch protection on the **child** repo.
