import type { PeerId } from "../types/peer.js";
import type { PeerOffering } from "../types/capability.js";
import type { ServiceApiProtocol } from "../types/service-api.js";
import { WELL_KNOWN_SERVICE_API_PROTOCOLS } from "../types/service-api.js";

export const METADATA_VERSION = 9;
export const WELL_KNOWN_SERVICE_CATEGORIES = [
  "privacy",
  "legal",
  "uncensored",
  "coding",
  "finance",
  "tee",
] as const;
export { WELL_KNOWN_SERVICE_API_PROTOCOLS };
export type { ServiceApiProtocol };

export interface TokenPricingUsdPerMillion {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion?: number;
}

export interface ProviderAnnouncement {
  provider: string;
  services: string[];
  defaultPricing: TokenPricingUsdPerMillion;
  servicePricing?: Record<string, TokenPricingUsdPerMillion>;
  serviceCategories?: Record<string, string[]>;
  serviceApiProtocols?: Record<string, ServiceApiProtocol[]>;
  /**
   * Canonical model identifiers declared by the provider (v9+).
   * Maps serviceId → canonical base name used for deduplication on the
   * buyer side. For example, a provider announcing
   * `{ "claude-sonnet-4-5-20250929": "claude-sonnet-4-5" }` declares that
   * its dated variant should be grouped with the stable base name.
   * Keys must appear in the provider's `services` array; values must match
   * the serviceId regex (^[a-z0-9][a-z0-9-]*$, max 32 chars).
   */
  canonical?: Record<string, string>;
  /**
   * Service customization declarations (v9+).
   * Maps serviceId → ServiceCustomization describing the provider's variant
   * for that service (e.g. a fine-tuned model, a TEE-hardened instance).
   * Keys must appear in the provider's `services` array.
   */
  customization?: Record<string, ServiceCustomization>;
  maxConcurrency: number;
  currentLoad: number;
}

/**
 * Describes a provider-specific customization of a base service (v9+).
 * `variant` identifies the customization (e.g. "tee-hardened", "fine-tuned").
 * `description` is an optional human-readable explanation (max 256 chars).
 */
export interface ServiceCustomization {
  /** Short identifier for the variant. Matches ^[a-z0-9][a-z0-9-]*$, max 32 chars. */
  variant: string;
  /** Optional human-readable description of the variant. Max 256 chars. */
  description?: string;
}

export interface PeerMetadata {
  peerId: PeerId;
  version: number;
  displayName?: string;
  publicAddress?: string;
  providers: ProviderAnnouncement[];
  offerings?: PeerOffering[];
  region: string;
  timestamp: number;
  stakeAmountUSDC?: number;
  onChainChannelCount?: number;
  onChainGhostCount?: number;
  /**
   * On-chain seller contract that fronts this peer (e.g. a DiemStakingProxy).
   * Buyers resolve `seller = sellerContract` for channel flows and verify the
   * binding by calling `sellerContract.isOperator(peerAddress)` on-chain.
   * Stored as 40 lowercase hex chars (no `0x` prefix) matching `peerId` format.
   */
  sellerContract?: string;
  /**
   * Buyer-local observation time for this metadata fetch. Not signed and not
   * encoded in metadata; used only for diagnostics/freshness decisions.
   */
  resolvedAtMs?: number;
  /**
   * Seller HTTP Date header observed during metadata fetch, in Unix ms. Not
   * signed and not encoded in metadata. When present, buyers can judge the
   * signed timestamp using the seller's wall clock instead of their own, which
   * keeps discovery working for users whose local desktop clock is wrong.
   */
  serverDateMs?: number;
  signature: string;
}
