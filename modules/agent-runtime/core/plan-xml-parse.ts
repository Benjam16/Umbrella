/**
 * Pure plan XML parsing — deterministic for the same input (no LLM).
 * Used by the executor and by replay tests.
 */
export type ParsedTask = { name: string; action: string };

export function parseTasksFromXml(fragment: string): ParsedTask[] {
  const tasks = fragment.match(/<task>[\s\S]*?<\/task>/g) || [];
  const out: ParsedTask[] = [];
  for (const taskBlock of tasks) {
    const actionRaw = taskBlock.match(/<action>([\s\S]*?)<\/action>/)?.[1];
    const name = taskBlock.match(/<name>([\s\S]*?)<\/name>/)?.[1]?.trim();
    const action = actionRaw?.trim();
    if (!action) continue;
    out.push({ name: name ?? '(unnamed)', action });
  }
  return out;
}

export function extractGoal(planXml: string): string {
  return planXml.match(/<goal>([\s\S]*?)<\/goal>/)?.[1]?.trim() ?? '';
}

export type PlanSlice = {
  milestoneName: string;
  sliceLabel: string;
  body: string;
};

export function extractSlices(planXml: string): PlanSlice[] {
  const out: PlanSlice[] = [];
  const mRe = /<milestone\s*([^>]*)>([\s\S]*?)<\/milestone>/gi;
  let mm: RegExpExecArray | null;
  while ((mm = mRe.exec(planXml)) !== null) {
    const attrs = mm[1];
    const minner = mm[2];
    const nameM = attrs.match(/name="([^"]*)"/)?.[1] ?? 'milestone';
    const sRe = /<slice\s*([^>]*)>([\s\S]*?)<\/slice>/gi;
    let sm: RegExpExecArray | null;
    let sliceIdx = 0;
    while ((sm = sRe.exec(minner)) !== null) {
      sliceIdx += 1;
      const sattrs = sm[1];
      const sbody = sm[2];
      const idS = sattrs.match(/id="([^"]*)"/)?.[1] ?? String(sliceIdx);
      out.push({ milestoneName: nameM, sliceLabel: idS, body: sbody });
    }
  }
  if (out.length === 0) {
    out.push({
      milestoneName: 'default',
      sliceLabel: '1',
      body: planXml,
    });
  }
  return out;
}

/**
 * Flatten XML tasks in document order (planner-agnostic slice expansion without subagent).
 */
export function expandPlanXmlToActions(planXml: string): ParsedTask[] {
  const slices = extractSlices(planXml);
  const out: ParsedTask[] = [];
  for (const slice of slices) {
    out.push(...parseTasksFromXml(slice.body));
  }
  return out;
}
