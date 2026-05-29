/**
 * Shared helper: derive a block-explorer URL for a transaction hash.
 * Returns null when no known explorer is available for the given chainId.
 */
export function getExplorerTxUrl(txHash: string, chainId?: number): string | null {
  if (!txHash) return null;
  // Base mainnet
  if (chainId === 8453) return `https://basescan.org/tx/${txHash}`;
  // Base Sepolia
  if (chainId === 84532) return `https://sepolia.basescan.org/tx/${txHash}`;
  return null;
}
