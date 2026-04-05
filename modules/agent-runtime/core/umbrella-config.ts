import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';

export type UmbrellaConfigJson = {
  /** Applied to `process.env` when not already set (non-empty env wins). */
  env?: Record<string, string | number | boolean>;
};

/** Data directory: `UMBRELLA_HOME` or `~/.umbrella`. */
export function getUmbrellaBaseDir(): string {
  const home = process.env.UMBRELLA_HOME?.trim();
  if (home) return home;
  return path.join(os.homedir(), '.umbrella');
}

/** Paths checked in order; first existing wins for new vars (`override: false`). */
export function resolveDotEnvCandidates(): string[] {
  const out: string[] = [];
  const explicit = process.env.UMBRELLA_DOTENV?.trim();
  if (explicit) {
    out.push(path.resolve(explicit));
  }
  out.push(path.join(getUmbrellaBaseDir(), '.env'));
  return [...new Set(out)];
}

/**
 * Load `.env` files into `process.env` without overriding existing vars.
 * Runs before `applyConfigFromDisk()` so: shell → .env → config.json (each fills gaps only).
 */
export function loadDotEnvFiles(): { loadedPaths: string[] } {
  const loadedPaths: string[] = [];
  for (const p of resolveDotEnvCandidates()) {
    if (!fs.pathExistsSync(p)) continue;
    const result = dotenv.config({ path: p, override: false });
    if (!result.error) {
      loadedPaths.push(p);
    }
  }
  return { loadedPaths };
}

/** Explicit file, or `<UMBRELLA_HOME|~/.umbrella>/config.json`. */
export function resolveConfigPath(): string {
  const explicit = process.env.UMBRELLA_CONFIG?.trim();
  if (explicit) return path.resolve(explicit);
  return path.join(getUmbrellaBaseDir(), 'config.json');
}

function envAlreadySet(key: string): boolean {
  const v = process.env[key];
  return v !== undefined && v !== '';
}

/**
 * Merge `config.json` env into `process.env`. Existing non-empty env vars are not overwritten.
 */
export type ConfigApplyResult = {
  loaded: boolean;
  path: string;
  appliedKeys: string[];
  /** File exists but JSON read/parse failed */
  invalid?: boolean;
};

export function applyConfigFromDisk(): ConfigApplyResult {
  const configPath = resolveConfigPath();
  const appliedKeys: string[] = [];

  if (!fs.pathExistsSync(configPath)) {
    return { loaded: false, path: configPath, appliedKeys: [] };
  }

  let raw: unknown;
  try {
    raw = fs.readJsonSync(configPath);
  } catch {
    return { loaded: false, path: configPath, appliedKeys: [], invalid: true };
  }

  const cfg = raw as UmbrellaConfigJson;
  const envBlock = cfg?.env;
  if (!envBlock || typeof envBlock !== 'object') {
    return { loaded: true, path: configPath, appliedKeys: [] };
  }

  for (const [key, val] of Object.entries(envBlock)) {
    if (typeof key !== 'string' || !key.trim()) continue;
    if (envAlreadySet(key)) continue;
    if (val === undefined || val === null) continue;
    const str = typeof val === 'boolean' || typeof val === 'number' ? String(val) : String(val);
    if (str === '') continue;
    process.env[key] = str;
    appliedKeys.push(key);
  }

  return { loaded: true, path: configPath, appliedKeys };
}

/** For `umbrella up --dry-run` — does not mutate env. */
export function previewConfigApply(): {
  path: string;
  exists: boolean;
  invalid?: boolean;
  wouldApply: string[];
  skippedBecauseEnv: string[];
} {
  const configPath = resolveConfigPath();
  if (!fs.pathExistsSync(configPath)) {
    return {
      path: configPath,
      exists: false,
      wouldApply: [],
      skippedBecauseEnv: [],
    };
  }

  let raw: unknown;
  try {
    raw = fs.readJsonSync(configPath);
  } catch {
    return {
      path: configPath,
      exists: true,
      invalid: true,
      wouldApply: [],
      skippedBecauseEnv: [],
    };
  }

  const cfg = raw as UmbrellaConfigJson;
  const envBlock = cfg?.env;
  const wouldApply: string[] = [];
  const skippedBecauseEnv: string[] = [];

  if (!envBlock || typeof envBlock !== 'object') {
    return { path: configPath, exists: true, wouldApply, skippedBecauseEnv };
  }

  for (const key of Object.keys(envBlock)) {
    if (!key.trim()) continue;
    if (envAlreadySet(key)) {
      skippedBecauseEnv.push(key);
      continue;
    }
    const val = envBlock[key];
    if (val === undefined || val === null) continue;
    const str = typeof val === 'boolean' || typeof val === 'number' ? String(val) : String(val);
    if (str === '') continue;
    wouldApply.push(key);
  }

  return { path: configPath, exists: true, wouldApply, skippedBecauseEnv };
}
