import type { ServiceHost } from '@antseed/service-core';

/** The slice of chain config the funding service needs. Structurally satisfied
 * by @antseed/node's ChainConfig, so the host can pass that straight through. */
export interface FundingChainContext {
  chainId: string;
  evmChainId: number;
  rpcUrl: string;
  fallbackRpcUrls?: string[];
  usdcContractAddress: string;
  depositsContractAddress: string;
}

/** The funding service's host: the generic {@link ServiceHost} plus the wallet
 * key and chain it needs to move money. The host (CLI buyer process) owns the
 * key and consent and passes them in; the plugin never reads them from disk. */
export interface FundingHost extends ServiceHost {
  privateKey: `0x${string}`;
  chain: FundingChainContext;
}
