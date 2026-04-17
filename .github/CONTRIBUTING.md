# Contributing to Umbrella

Thanks for helping improve Umbrella. This repository contains two major surfaces—the **CLI / agent daemon** (root) and the **platform** (`platform/`) workstation—so please scope your change to the right area.

## Before you start

1. Open an issue (or comment on an existing one) for **large features** or **behavior changes** so maintainers can align on direction.
2. Read [`REPOSITORY.md`](../REPOSITORY.md) for layout and [`CAPABILITIES.md`](../CAPABILITIES.md) for the workstation product story.

## Local checks

### CLI (root)

```bash
npm install
npm run build
npm test
```

### Platform API

```bash
cd platform && npm install
cd apps/api && npm test
```

### Platform full workspace build

```bash
cd platform && npm install && npm run build
```

## Pull requests

- **One logical change per PR** when possible; link related issues.
- **Match existing style**: TypeScript strictness, formatting, and naming in the touched package.
- **Tests**: Add or update tests when you fix bugs or add API behavior (`platform/apps/api/src/tests/`).
- **No secrets**: Do not commit `.env`, tokens, or private keys.

## Commits

Use clear messages (e.g. `fix(api): …`, `feat(platform): …`, `docs: …`). Follow whatever conventional style the recent history uses.

## Publishing (maintainers)

CLI releases go to npm as `@benjam16/umbrella`; see [`REPOSITORY.md`](../REPOSITORY.md#releases-cli-on-npm). External contributors typically do not publish—maintainers cut releases after review.
