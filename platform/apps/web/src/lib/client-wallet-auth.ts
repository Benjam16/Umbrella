"use client";

/**
 * Ensure the browser has a valid Umbrella wallet session cookie.
 *
 * Flow:
 *  1) Ask server for a short-lived challenge message.
 *  2) Sign message with user's wallet.
 *  3) Exchange signature for a secure HttpOnly session cookie.
 */
export async function ensureWalletSession(args: {
  walletAddress: string;
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>;
}) {
  const walletAddress = args.walletAddress.toLowerCase();
  const existing = await fetch("/api/v1/auth/session", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null) as { wallet?: string } | null;
  if (existing?.wallet?.toLowerCase() === walletAddress) return;

  const challengeRes = await fetch("/api/v1/auth/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  });
  if (!challengeRes.ok) {
    const body = await challengeRes.json().catch(() => ({}));
    throw new Error(body?.error ?? "failed to create auth challenge");
  }
  const challenge = (await challengeRes.json()) as {
    message: string;
    challengeToken: string;
  };
  const signature = await args.signMessageAsync({ message: challenge.message });
  const sessionRes = await fetch("/api/v1/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      walletAddress,
      message: challenge.message,
      signature,
      challengeToken: challenge.challengeToken,
    }),
  });
  if (!sessionRes.ok) {
    const body = await sessionRes.json().catch(() => ({}));
    throw new Error(body?.error ?? "failed to create auth session");
  }
}

