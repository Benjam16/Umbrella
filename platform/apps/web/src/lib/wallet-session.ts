import { createHmac, timingSafeEqual } from "node:crypto";
import { verifyMessage } from "viem";

const SESSION_COOKIE = "umbrella_wallet_session";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type TokenPayload = Record<string, unknown>;

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromBase64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function secret(): string {
  const s =
    process.env.UMBRELLA_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE?.trim() ||
    process.env.UMBRELLA_RELAYER_SECRET?.trim();
  if (!s) {
    throw new Error("UMBRELLA_SESSION_SECRET is required");
  }
  return s;
}

function signPayload(payload: TokenPayload): string {
  const body = base64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifySignedToken<T extends TokenPayload>(token: string): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(fromBase64url(body)) as T;
  } catch {
    return null;
  }
}

export function createAuthChallenge(wallet: string): {
  message: string;
  challengeToken: string;
} {
  const now = Date.now();
  const nonce = Math.random().toString(36).slice(2, 10);
  const normalized = wallet.toLowerCase();
  const message =
    `Umbrella Wallet Auth\n` +
    `Address: ${normalized}\n` +
    `Nonce: ${nonce}\n` +
    `Issued At: ${new Date(now).toISOString()}\n` +
    `Purpose: authorize secure write actions in Umbrella`;
  const challengeToken = signPayload({
    t: "challenge",
    wallet: normalized,
    nonce,
    message,
    iat: now,
    exp: now + CHALLENGE_TTL_MS,
  });
  return { message, challengeToken };
}

export async function verifyAuthChallenge(args: {
  wallet: string;
  message: string;
  signature: string;
  challengeToken: string;
}): Promise<boolean> {
  const payload = verifySignedToken<{
    t: "challenge";
    wallet: string;
    message: string;
    iat: number;
    exp: number;
  }>(args.challengeToken);
  if (!payload) return false;
  if (payload.t !== "challenge") return false;
  if (Date.now() > payload.exp) return false;
  if (payload.wallet !== args.wallet.toLowerCase()) return false;
  if (payload.message !== args.message) return false;
  const ok = await verifyMessage({
    address: args.wallet as `0x${string}`,
    message: args.message,
    signature: args.signature as `0x${string}`,
  });
  return ok;
}

export function createWalletSession(wallet: string): string {
  const now = Date.now();
  return signPayload({
    t: "session",
    wallet: wallet.toLowerCase(),
    iat: now,
    exp: now + SESSION_TTL_MS,
  });
}

export function readWalletSessionFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const entries = cookieHeader.split(";").map((v) => v.trim());
  const hit = entries.find((v) => v.startsWith(`${SESSION_COOKIE}=`));
  if (!hit) return null;
  const token = hit.slice(`${SESSION_COOKIE}=`.length);
  const payload = verifySignedToken<{ t: "session"; wallet: string; exp: number }>(token);
  if (!payload || payload.t !== "session") return null;
  if (Date.now() > payload.exp) return null;
  return payload.wallet;
}

export function walletSessionCookie(sessionToken: string): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${sessionToken}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax; Secure`;
}

