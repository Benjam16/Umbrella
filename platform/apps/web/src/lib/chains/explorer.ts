/**
 * Public explorer URLs for Base / Base Sepolia. Used in client components.
 */
export function addressExplorerUrl(chainId: number | null | undefined, address: string): string {
  const a = address.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(a)) return "https://basescan.org";
  if (chainId === 84532) return `https://sepolia.basescan.org/address/${a}`;
  return `https://basescan.org/address/${a}`;
}

/** Contract page with the verified source tab (Basescan / Sepolia). */
export function contractCodeExplorerUrl(
  chainId: number | null | undefined,
  address: string,
): string {
  return `${addressExplorerUrl(chainId, address)}#code`;
}

export function txExplorerUrl(chainId: number | null | undefined, tx: string): string {
  const h = tx.trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(h)) return "https://basescan.org";
  if (chainId === 84532) return `https://sepolia.basescan.org/tx/${h}`;
  return `https://basescan.org/tx/${h}`;
}
