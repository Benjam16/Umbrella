/**
 * Coinbase Developer Platform (CDP) Paymaster client.
 *
 * In production this wraps the Smart Wallet / UserOperation flow so the
 * relayer can call `recordSuccess` without holding ETH on the hot key:
 *   - the relayer builds a UserOperation calling AgentToken.recordSuccess
 *   - sets `capabilities.paymasterService.url = CDP_PAYMASTER_URL`
 *   - CDP approves if the policy matches (see the "Gas Policy" checks below)
 *   - bundler includes the UserOp, CDP pays the gas
 *
 * For now this file is deliberately thin — it tells the rest of the
 * relayer whether a paymaster is configured, and exposes the policy knobs
 * so the chain writer can decide "sponsor" vs "skip" without coupling.
 *
 * Wire this up for real with @coinbase/agentkit once you have:
 *   - CDP_PAYMASTER_URL
 *   - CDP_PROJECT_ID
 *   - CDP_API_KEY_NAME / CDP_API_KEY_PRIVATE_KEY
 */

export type PaymasterPolicy = {
  /** Hard ceiling, in USD cents, across all sponsored txs per 24h. */
  dailyCapCents: number;
  /** Per-run ceiling, in USD cents. */
  perRunCapCents: number;
};

export type PaymasterConfig =
  | { enabled: false; reason: "missing_env" }
  | {
      enabled: true;
      url: string;
      projectId?: string;
      policy: PaymasterPolicy;
    };

export function getPaymasterConfig(): PaymasterConfig {
  const url = process.env.CDP_PAYMASTER_URL;
  if (!url) return { enabled: false, reason: "missing_env" };

  const dailyCapCents = intEnv("UMBRELLA_PAYMASTER_DAILY_CAP_CENTS", 1_000);
  const perRunCapCents = intEnv("UMBRELLA_PAYMASTER_PER_RUN_CAP_CENTS", 25);

  return {
    enabled: true,
    url,
    projectId: process.env.CDP_PROJECT_ID,
    policy: { dailyCapCents, perRunCapCents },
  };
}

/**
 * Tracks accumulated gas sponsorship in-process. Real deployments should
 * read/write from a durable store (Supabase) so restarts don't leak the
 * daily cap.
 */
const spendCents: { day: string; cents: number } = {
  day: new Date().toISOString().slice(0, 10),
  cents: 0,
};

export function canSponsor(
  config: PaymasterConfig,
  estimatedCents: number,
): { ok: true } | { ok: false; reason: string } {
  if (!config.enabled) return { ok: false, reason: "paymaster not configured" };

  const today = new Date().toISOString().slice(0, 10);
  if (today !== spendCents.day) {
    spendCents.day = today;
    spendCents.cents = 0;
  }
  if (estimatedCents > config.policy.perRunCapCents) {
    return { ok: false, reason: "exceeds per-run cap" };
  }
  if (spendCents.cents + estimatedCents > config.policy.dailyCapCents) {
    return { ok: false, reason: "exceeds daily cap" };
  }
  return { ok: true };
}

export function recordSponsorship(cents: number): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== spendCents.day) {
    spendCents.day = today;
    spendCents.cents = 0;
  }
  spendCents.cents += Math.max(0, cents);
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}
