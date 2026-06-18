/**
 * Generic buyer-side funding plugin contract. A funding plugin moves money into
 * the network on the buyer's behalf (e.g. the gasless USDC auto-deposit in this
 * package). The host (CLI buyer process) owns the wallet key and consent and
 * passes them in; plugins never read them from disk.
 *
 * This contract lives here rather than in @antseed/node because funding is not
 * part of the protocol. Other funding mechanisms can implement it without
 * depending on the auto-deposit internals.
 */

/** The slice of chain config a funding plugin may need. Structurally satisfied
 * by @antseed/node's ChainConfig, so the host can pass that straight through. */
export interface FundingChainContext {
  chainId: string;
  evmChainId: number;
  rpcUrl: string;
  fallbackRpcUrls?: string[];
  usdcContractAddress: string;
  depositsContractAddress: string;
}

/** Serializable, mechanism-agnostic status the desktop renders directly. */
export interface FundingStatus {
  enabled: boolean;
  /** True when the plugin is paused on a deterministic failure; drives error styling. */
  attention: boolean;
  /** Human-readable status line shown under the toggle. */
  summary: string;
  /** Optional address the user can fund; present => UI shows copy + QR. */
  receiveAddress?: string | null;
}

export interface FundingHost {
  privateKey: `0x${string}`;
  chain: FundingChainContext;
  consent: { isEnabled(): boolean };
  onAttention?(message: string): void;
}

export interface FundingService {
  start(): void;
  stop(): void;
  getStatus(): FundingStatus;
  /** Optional: trigger an immediate evaluation, e.g. right after consent is enabled. */
  poke?(): void | Promise<void>;
}

export interface AntseedFundingPlugin {
  type: 'funding';
  name: string;
  displayName: string;
  version: string;
  description: string;
  createFundingService(host: FundingHost): FundingService | null | Promise<FundingService | null>;
}
