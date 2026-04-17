# Security policy

## Supported versions

Security fixes are applied on the **default branch** (`main`) for:

- The **`@benjam16/umbrella`** CLI package (published to npm from the repository root).
- The **`platform/`** workspace (desktop + API), which is developed in-repo and not separately versioned on npm.

There is no separate LTS line; use the latest `main` and the latest published npm version for production use.

## Reporting a vulnerability

**Please do not** open a public GitHub issue for undisclosed security problems.

1. **GitHub (preferred):** On [Benjam16/Umbrella](https://github.com/Benjam16/Umbrella), open **Security → Report a vulnerability** if [private reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) is enabled.
2. **Email:** If you cannot use GitHub, contact the maintainers via the channel listed on [npm](https://www.npmjs.com/package/@benjam16/umbrella) or your existing maintainer contact, with subject line `Security: Umbrella`.

Include:

- A short description of the issue and impact.
- Steps to reproduce (or a proof-of-concept) if safe to share.
- Affected component (CLI daemon, platform API, desktop app, etc.) and version/commit if known.

We aim to acknowledge reports within a few business days and coordinate disclosure after a fix is available.

## Scope notes

- The **agent runtime** can execute shell commands and MCP tools according to your configuration. Treat host access, API keys, and policy flags (`UMBRELLA_SHELL_*`, etc.) as part of your threat model—see root `README.md` and `FEATURES.md`.
- The **platform API** is designed for local or controlled deployment; use TLS, authentication, and network isolation in any exposed environment.
