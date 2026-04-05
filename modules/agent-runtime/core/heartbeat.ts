/**
 * Heartbeat helpers (extend with metrics / backoff).
 */
export const DEFAULT_HEARTBEAT_MS = (): number => {
  const raw = process.env.UMBRELLA_HEARTBEAT_MS;
  if (raw && !Number.isNaN(Number(raw))) return Number(raw);
  return 60_000;
};
