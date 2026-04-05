#!/usr/bin/env node
/**
 * Copy a skill folder (must contain SKILL.md) into ~/.umbrella/skills/umb-imported/<name>/
 * Usage: node bin/import-skill.js <path-to-skill-folder> [import-name]
 */
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

async function main() {
  const src = process.argv[2];
  if (!src) {
    console.error('Usage: import-skill.js <source-folder> [import-name]');
    process.exit(1);
  }
  const abs = path.resolve(src);
  if (!(await fs.pathExists(abs))) {
    console.error('Source does not exist:', abs);
    process.exit(1);
  }
  const stat = await fs.stat(abs);
  if (!stat.isDirectory()) {
    console.error('Source must be a directory:', abs);
    process.exit(1);
  }
  const skillMd = path.join(abs, 'SKILL.md');
  if (!(await fs.pathExists(skillMd))) {
    console.error('Missing SKILL.md in', abs);
    process.exit(1);
  }
  const name =
    process.argv[3]?.trim() ||
    path.basename(abs).replace(/[^a-zA-Z0-9_-]/g, '_') ||
    'imported';
  const dest = path.join(os.homedir(), '.umbrella', 'skills', 'umb-imported', name);
  await fs.ensureDir(path.dirname(dest));
  await fs.copy(abs, dest, { overwrite: true });
  console.log('Installed skill to', dest);
  console.log('Point your IDE skills path at ~/.umbrella/skills (or run umbrella install from a clone).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
