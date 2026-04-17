# Umbrella: Sovereign Agentic Workstation (v1.0)

Umbrella is a local-first, high-concurrency platform for orchestrating autonomous AI swarms with enterprise-grade safety, persistence, and disaster recovery.

## Core Architecture

- **Supervisor-Worker DAG:** Dependency-aware mission planning and parallel execution across specialized workers.
- **Self-Healing Loop:** Automatic red-to-green verify/repair cycles with bounded retries and human override points.
- **Sovereign Tenancy:** Tenant-scoped data isolation with role-based controls (`owner`, `admin`, `operator`, `analyst`).
- **RAG Memory Vault:** Hybrid lexical/vector retrieval for cross-run memory persistence and context reuse.

## Governance and Safety

- **Risk-Scored Actions:** Shell/tool actions are risk-scored (1-10) with structured reasons.
- **Informed Consent:** High-risk actions and transaction proposals are blocked for explicit approval/signature.
- **Checkpointing and Rollback:** Checkpoint metadata plus preview/execute rollback handshake before destructive changes.
- **Audit Trail:** Redacted, structured audit logging for API operations and system integrity events.

## Integration and Operations

- **MCP Native:** Dynamic MCP server connectivity for tools/resources.
- **Web Observer:** Playwright-based semantic extraction and Site-Watch triggers.
- **AgentFi Gateway:** Wallet/transaction proposal flow (including Coinbase AgentKit-ready pathways).
- **Outreach and CRM:** Campaign management, dispatch queueing, and delivery telemetry.

## Reliability and Disaster Recovery

| Feature | Description |
| :--- | :--- |
| **Snapshots** | Scheduled/manual backups with persisted metadata and SHA-256 integrity hashes. |
| **Restore Handshake** | Tokenized preview + explicit execute confirmation flow (`EXECUTE_RESTORE`). |
| **Pre-Restore Guardrail** | Automatic pre-restore snapshot creation before data restoration. |
| **Integrity Sweep** | Startup (and optional interval) integrity worker validates recent snapshots and emits audit warnings. |
| **DR Status UI** | Live desktop DR status card + header health dot powered by `GET /v1/health/dr` (alias of `GET /v1/backups/integrity`). |

## API Surface Map (Summary)

- `POST /v1/runs` - Launch missions (manual or blueprint-driven).
- `GET /v1/runs` / `GET /v1/runs/:id` - Inspect mission lifecycle, logs, DAG steps, and pending decisions.
- `GET /v1/blueprints` - List built-in and minted blueprint templates (merged list per user).
- `POST /v1/blueprints/mint` - Mint a reusable blueprint from a **completed** run: model-generalizes the objective into `{{PLACEHOLDER}}` templates (with heuristic fallback), stores `missionVariables`, optional `icon` and category.
- `POST /v1/backups/snapshot` - Trigger immediate snapshot creation.
- `GET /v1/backups` - List backup snapshots and metadata.
- `POST /v1/backups/restore-preview` - Generate restore preview token.
- `POST /v1/backups/restore` - Execute restore with preview token confirmation.
- `POST /v1/backups/verify` - Verify a snapshot's integrity hash/path safety.
- `GET /v1/health/dr` - Read DR integrity sweep status (short URL for demos and monitoring).
- `GET /v1/backups/integrity` - Same payload as `/v1/health/dr` (backups-scoped path).
- `POST /v1/runs/:id/export-research` - Materialize agent research output to files.

## Operator Demo Flow (Recommended)

1. **Safety Check:** Confirm DR status is healthy in the desktop header dot/card.
2. **Selection:** Choose a blueprint (for example, market intelligence or CRO workflow).
3. **Swarm Execution:** Observe the live DAG graph and parallel worker activity.
4. **Governance:** Show risk scoring and approval gates in blocked/pending actions.
5. **Outcome:** Copy the CEO briefing and review export artifacts.
6. **Persistence:** Demonstrate minted blueprint reuse from a successful custom run.

## Product Loop: Mint from Success

Minting a successful run into a blueprint turns execution knowledge into a reusable product asset. This creates a compounding loop: run -> verify -> mint -> reuse/share -> faster future execution.
