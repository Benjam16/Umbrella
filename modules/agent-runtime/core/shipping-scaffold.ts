import path from 'path';
import fs from 'fs-extra';

export const TEMPLATE_PACKAGE = '@umbrella/shipping-cli-template';
export const TEMPLATE_BIN = 'shipping-template';

/**
 * Package root when running from compiled `dist/modules/agent-runtime/core/*.js`.
 */
export function resolveUmbrellaPackageRoot(): string {
  return path.resolve(__dirname, '..', '..', '..', '..');
}

export function resolveShippingTemplateDir(): string {
  return path.join(resolveUmbrellaPackageRoot(), 'examples', 'shipping-cli-template');
}

/** Unscoped last segment of an npm name, e.g. @scope/foo-bar → foo-bar */
export function deriveBinName(packageName: string): string {
  const t = packageName.trim();
  if (!t) return 'cli';
  if (t.startsWith('@')) {
    const i = t.indexOf('/');
    if (i === -1) return t.slice(1).replace(/[^a-zA-Z0-9-]/g, '-') || 'cli';
    const rest = t.slice(i + 1).trim();
    return rest || 'cli';
  }
  return t;
}

function isTextTemplateFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return (
    lower.endsWith('.json') ||
    lower.endsWith('.md') ||
    lower.endsWith('.ts') ||
    lower.endsWith('.yml') ||
    lower.endsWith('.yaml') ||
    fileName === 'LICENSE' ||
    fileName === '.gitignore'
  );
}

function applyReplacements(content: string, pkg: string, bin: string): string {
  return content.split(TEMPLATE_PACKAGE).join(pkg).split(TEMPLATE_BIN).join(bin);
}

function walkReplace(dir: string, pkg: string, bin: string): void {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkReplace(full, pkg, bin);
      continue;
    }
    if (!isTextTemplateFile(ent.name)) continue;
    const s0 = fs.readFileSync(full, 'utf8');
    const s1 = applyReplacements(s0, pkg, bin);
    if (s1 !== s0) fs.writeFileSync(full, s1, 'utf8');
  }
}

export type ScaffoldCoreResult =
  | { ok: true; dest: string; packageName: string; bin: string }
  | { ok: false; error: string };

/**
 * Copy the shipping CLI template into `destAbs` (must be missing or empty).
 * Does not enforce UMBRELLA_SHIPPING_ROOT — use for CLI + gated agent paths only.
 */
export function runScaffoldShippingCliCore(
  destAbs: string,
  packageName: string,
  binName?: string,
): ScaffoldCoreResult {
  const pkg = packageName.trim();
  if (!pkg) return { ok: false, error: 'Package name is required.' };
  const bin = (binName?.trim() || deriveBinName(pkg)).replace(/\s+/g, '-');
  if (!bin) return { ok: false, error: 'Could not derive CLI bin name.' };

  const template = resolveShippingTemplateDir();
  if (!fs.existsSync(template)) {
    return { ok: false, error: `Template not found: ${template}` };
  }

  const dest = path.resolve(destAbs);
  if (fs.existsSync(dest)) {
    const inner = fs.readdirSync(dest);
    if (inner.length > 0) {
      return {
        ok: false,
        error: `Destination must be empty or not exist: ${dest}`,
      };
    }
  } else {
    fs.mkdirpSync(dest);
  }

  fs.copySync(template, dest, {
    filter: (src) => !src.split(path.sep).includes('node_modules'),
  });
  walkReplace(dest, pkg, bin);

  return { ok: true, dest, packageName: pkg, bin };
}

/** True iff `destAbs` is the same as or nested under `shippingRoot` (after resolve). */
export function isPathUnderShippingRoot(
  shippingRoot: string,
  destAbs: string,
): boolean {
  const rootAbs = path.resolve(shippingRoot);
  const dest = path.resolve(destAbs);
  const rel = path.relative(rootAbs, dest);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  return true;
}

const PACKAGE_NAME_RE =
  /^@[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$|^[a-zA-Z0-9_.-]+$/;

export type ScaffoldCliAgentPayload = {
  packageName: string;
  subdir: string;
  bin?: string;
};

export function parseScaffoldCliJson(
  jsonBody: string,
): ScaffoldCliAgentPayload | null {
  let o: unknown;
  try {
    o = JSON.parse(jsonBody) as unknown;
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  const rec = o as Record<string, unknown>;
  const packageName =
    typeof rec.packageName === 'string' ? rec.packageName.trim() : '';
  const subdir = typeof rec.subdir === 'string' ? rec.subdir.trim() : '';
  const bin =
    typeof rec.bin === 'string' && rec.bin.trim()
      ? rec.bin.trim()
      : undefined;
  if (!packageName || !subdir) return null;
  return { packageName, subdir, bin };
}

/**
 * Agent-only scaffold: requires UMBRELLA_SHIPPING_ROOT, optional UMBRELLA_AGENT_SCAFFOLD=0 to disable.
 */
export async function executeScaffoldCliFromAgent(
  payload: ScaffoldCliAgentPayload,
): Promise<string> {
  const shippingRoot = process.env.UMBRELLA_SHIPPING_ROOT?.trim();
  if (!shippingRoot) {
    return '❌ scaffold-cli: set UMBRELLA_SHIPPING_ROOT to the parent directory for shipped CLIs (refuse unbounded scaffolding).';
  }
  const disable = process.env.UMBRELLA_AGENT_SCAFFOLD;
  if (disable === '0' || disable === 'false') {
    return '❌ scaffold-cli: agent scaffolding disabled (UMBRELLA_AGENT_SCAFFOLD=0).';
  }

  if (!(await fs.pathExists(shippingRoot))) {
    return `❌ scaffold-cli: UMBRELLA_SHIPPING_ROOT does not exist: ${shippingRoot}`;
  }
  if (!(await fs.stat(shippingRoot)).isDirectory()) {
    return `❌ scaffold-cli: UMBRELLA_SHIPPING_ROOT is not a directory: ${shippingRoot}`;
  }

  const normalized = payload.subdir.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some((p) => p === '..')) {
    return '❌ scaffold-cli: subdir must be relative and must not contain `..`.';
  }

  if (!PACKAGE_NAME_RE.test(payload.packageName)) {
    return '❌ scaffold-cli: invalid packageName (use @scope/pkg or unscoped name).';
  }

  const destAbs = path.resolve(shippingRoot, normalized);
  if (!isPathUnderShippingRoot(shippingRoot, destAbs)) {
    return '❌ scaffold-cli: resolved path escapes UMBRELLA_SHIPPING_ROOT.';
  }

  const core = runScaffoldShippingCliCore(
    destAbs,
    payload.packageName,
    payload.bin,
  );
  if (!core.ok) return `❌ scaffold-cli: ${core.error}`;

  return `✅ scaffold-cli: created ${core.dest} (package ${core.packageName}, bin ${core.bin}). Next: cd, npm install, git init — see examples/SHIPPING.md`;
}
