import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { memory } from './memory.js';

function umbrellaHome(): string {
  return path.join(os.homedir(), '.umbrella');
}

export function pendingSkillDir(): string {
  return path.join(umbrellaHome(), 'skill-pending');
}

export function approvedSkillDir(): string {
  return path.join(umbrellaHome(), 'skill-approved');
}

export function learnedSkillDir(): string {
  return path.join(umbrellaHome(), 'skills', 'umb-learned');
}

export function skillApproveRequired(): boolean {
  return (
    process.env.UMBRELLA_SKILL_APPROVE === '1' ||
    process.env.UMBRELLA_SKILL_APPROVE === 'true'
  );
}

/** HTTP / manual: approve proposal id (folder name under skill-pending, e.g. mem-42). */
export async function markSkillProposalApproved(proposalId: string): Promise<void> {
  const dir = approvedSkillDir();
  await fs.ensureDir(dir);
  await fs.writeFile(
    path.join(dir, proposalId),
    `${new Date().toISOString()}\n`,
    'utf8',
  );
}

/** Create ~/.umbrella/skill-pending/mem-<id>/ from memory rows (idempotent). */
export async function drainSkillCandidatesToPending(): Promise<number> {
  const rows = await memory.recallByType('skill_candidate', 30);
  const base = pendingSkillDir();
  await fs.ensureDir(base);
  let created = 0;

  for (const row of rows) {
    const id = `mem-${row.id}`;
    const dir = path.join(base, id);
    if (await fs.pathExists(path.join(dir, 'meta.json'))) continue;

    await fs.ensureDir(dir);
    const body =
      typeof row.content === 'string' && row.content.trim()
        ? row.content.trim()
        : '(empty skill candidate)';
    const skillMd = `---
name: umbrella-learned-${row.id}
description: Auto-proposed from a verified task (memory #${row.id}).
---

# Learned note

${body}
`;
    await fs.writeFile(path.join(dir, 'SKILL.md'), skillMd, 'utf8');
    await fs.writeJson(
      path.join(dir, 'meta.json'),
      {
        memoryId: row.id,
        createdAt: new Date().toISOString(),
        sourceType: 'skill_candidate',
      },
      { spaces: 2 },
    );
    created += 1;
  }

  return created;
}

async function isApproved(proposalId: string): Promise<boolean> {
  const stamp = path.join(approvedSkillDir(), proposalId);
  return fs.pathExists(stamp);
}

async function markApprovedConsumed(proposalId: string): Promise<void> {
  const stamp = path.join(approvedSkillDir(), proposalId);
  await fs.remove(stamp).catch(() => {});
}

/** Promote pending proposals into ~/.umbrella/skills/umb-learned/<id>/. */
export async function promoteApprovedSkills(): Promise<number> {
  const base = pendingSkillDir();
  if (!(await fs.pathExists(base))) return 0;

  const entries = await fs.readdir(base);
  let promoted = 0;
  const requireApprove = skillApproveRequired();

  for (const proposalId of entries) {
    const srcDir = path.join(base, proposalId);
    if (!(await fs.stat(srcDir)).isDirectory()) continue;
    if (!(await fs.pathExists(path.join(srcDir, 'SKILL.md')))) continue;

    if (requireApprove) {
      const ok = await isApproved(proposalId);
      if (!ok) continue;
    }

    const destRoot = learnedSkillDir();
    const dest = path.join(destRoot, proposalId);
    await fs.ensureDir(destRoot);
    if (await fs.pathExists(dest)) {
      await fs.remove(srcDir);
      await markApprovedConsumed(proposalId);
      continue;
    }

    await fs.copy(srcDir, dest);
    await fs.remove(srcDir);
    await markApprovedConsumed(proposalId);
    promoted += 1;
    await memory.ingest(
      'skill_promoted',
      `Promoted skill proposal ${proposalId} → ~/.umbrella/skills/umb-learned/${proposalId}/`,
    );
  }

  return promoted;
}
