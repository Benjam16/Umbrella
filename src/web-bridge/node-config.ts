import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/**
 * Persistent identity for this machine when acting as an Umbrella Remote Node.
 *
 *  - `nodeId`      short, human-pronounceable. Used as the DB `nodes.id` later.
 *  - `nodeToken`   bearer secret the website sends with dispatched missions.
 *  - `webUrl`      which Umbrella web deployment this node is paired against.
 *  - `pairingCode` short 6-char code the user pastes into `/app/nodes` to
 *                  complete the handshake on first connect. Rotated each
 *                  `umbrella connect`.
 */
export type NodeConfig = {
  nodeId: string;
  nodeToken: string;
  webUrl: string;
  pairingCode: string;
  createdAt: string;
  hostname: string;
  label?: string;
};

export const DEFAULT_WEB_URL =
  process.env.UMBRELLA_WEB_URL ?? 'https://umbrellagnt.xyz';

function configDir(): string {
  const override = process.env.UMBRELLA_HOME;
  if (override) return override;
  return path.join(os.homedir(), '.umbrella');
}

function configPath(): string {
  return path.join(configDir(), 'node.json');
}

export function loadNodeConfig(): NodeConfig | null {
  const p = configPath();
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as NodeConfig;
  } catch {
    return null;
  }
}

export function saveNodeConfig(cfg: NodeConfig): string {
  fs.ensureDirSync(configDir());
  const p = configPath();
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  return p;
}

export function clearNodeConfig(): boolean {
  const p = configPath();
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}

/** Short, base32-ish identifier. Not cryptographic — just human-friendly. */
function shortId(bytes = 4): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const buf = crypto.randomBytes(bytes);
  let out = '';
  for (let i = 0; i < buf.length; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

/**
 * Mint a fresh NodeConfig. Rotates the pairing code and token — existing
 * pairings on the website will need to re-pair after this.
 */
export function mintNodeConfig(opts: {
  webUrl?: string;
  label?: string;
  reuseId?: string | null;
}): NodeConfig {
  const nodeId = opts.reuseId ?? `node-${shortId(4).toLowerCase()}`;
  const nodeToken = crypto.randomBytes(32).toString('base64url');
  const pairingCode = `${shortId(3)}-${shortId(3)}`;
  return {
    nodeId,
    nodeToken,
    webUrl: (opts.webUrl ?? DEFAULT_WEB_URL).replace(/\/$/, ''),
    pairingCode,
    createdAt: new Date().toISOString(),
    hostname: os.hostname(),
    label: opts.label,
  };
}

/** Mask a bearer token for display: first 6 chars + last 4, dots in between. */
export function maskToken(token: string): string {
  if (token.length <= 12) return '•'.repeat(token.length);
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

export { configPath as nodeConfigPath };
