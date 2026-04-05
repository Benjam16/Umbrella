# agentskills.io alignment

[agentskills.io](https://agentskills.io) describes portable agent skills (often `SKILL.md` + optional scripts). Umbrella installs **`SKILL.md`** trees and slash **commands** under `~/.umbrella` via `bin/install.js`.

## Field mapping

| agentskills-style concept | Umbrella |
|---------------------------|----------|
| Skill folder with `SKILL.md` | `modules/*/skills/<name>/SKILL.md` copied to `~/.umbrella/skills/...` |
| Frontmatter `name`, `description` | Use the H1 title + first paragraph in `SKILL.md` for human context; IDE runtimes read the file as-is |
| Optional scripts | Place next to `SKILL.md`; reference paths relative to the installed copy under `~/.umbrella` |
| Discovery | Claude / Cursor / etc. pick up installed paths after `umbrella install` |

## Importing a community skill

1. Clone or download the skill repo.
2. Run **`node bin/import-skill.js /path/to/skill-folder [alias]`** (or your global `umbrella` install’s `import-skill.js`).
3. Re-run **`umbrella install`** if your IDE needs refreshed command links.

## Normalizing layout (optional)

**`node bin/adapt-agentskill.js /path/to/SKILL.md`** prints a short checklist and optional frontmatter suggestion so a repo matches Umbrella’s usual layout (`SKILL.md` at folder root, `##` sections for Usage / When to use).

Umbrella does **not** require YAML frontmatter today; this is a compatibility aid only.
