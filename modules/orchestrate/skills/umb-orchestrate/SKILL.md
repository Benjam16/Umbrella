# /umb:orchestrate-* (Orchestration)

Coordinate multi-step work across memory, lean execution, and verification.

- **GSD-style structure:** group work into `<milestone>` → `<slice>` → `<task>` in planner XML (thin orchestrator, fat slices of actionable tasks).
- Each task: atomic action + explicit `<verify>`; keep each slice small enough for one agent context.
- Pull context via /umb:memory-recall before acting.
- Daemon shell tasks: failures flow through **ChaosMonitor** → **Chaos Specialist** (`modules/orchestrate/specialists/chaos.ts`) for recursive recovery; tail `chaos_event` or the dashboard feed.
- After repeated similar failures, the daemon injects an **escalation goal** so the next plan switches to diagnostics (see `stuck-detector`).
