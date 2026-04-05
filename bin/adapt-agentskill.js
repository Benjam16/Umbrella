#!/usr/bin/env node
/**
 * Optional helper: read a SKILL.md and print agentskills.io–friendly notes.
 * Usage: node bin/adapt-agentskill.js /path/to/SKILL.md
 */
const fs = require('fs');
const path = require('path');

const p = process.argv[2];
if (!p) {
  console.error('Usage: node bin/adapt-agentskill.js <path-to-SKILL.md>');
  process.exit(1);
}
const abs = path.resolve(p);
if (!fs.existsSync(abs)) {
  console.error('File not found:', abs);
  process.exit(1);
}
const base = path.basename(path.dirname(abs));
const text = fs.readFileSync(abs, 'utf8');
const title = (text.match(/^#\s+(.+)$/m) || [])[1] || base;

console.log('--- suggested frontmatter (optional; Umbrella works without it) ---');
console.log(`name: ${JSON.stringify(base)}`);
console.log(`description: ${JSON.stringify((title + ' — see SKILL.md').slice(0, 120))}`);
console.log('---');
console.log('Checklist:');
console.log('  • One folder per skill; SKILL.md at root.');
console.log('  • Use ## headings for "When to use", "How to use", safety notes.');
console.log('  • Import: node bin/import-skill.js <folder> [alias]');
console.log('Full notes: docs/AGENTSKILLS.md');
