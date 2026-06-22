import type { ScopeId, ScopeAccount, ScopeContext } from './types.js';

export class ScopeResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScopeResolutionError';
  }
}

export interface ScopeDef {
  id: ScopeId;
  /** Short human label for the consent screen. */
  label: string;
  /** One line telling the user what the value is and whether it is sensitive. */
  description: string;
  resolve(account: ScopeAccount, context?: ScopeContext): string;
}

/**
 * Deterministic compact JSON for the auto_deposit value. Fixed key order so the
 * signed bytes are stable across runs. Note the on-the-wire key is `limitUsdc`.
 */
export function encodeAutoDeposit(state: {
  enabled: boolean;
  receiveLimitUsdc: number | null;
}): string {
  return `{"enabled":${state.enabled ? 'true' : 'false'},"limitUsdc":${
    state.receiveLimitUsdc === null ? 'null' : String(state.receiveLimitUsdc)
  }}`;
}

export const SCOPES: Record<ScopeId, ScopeDef> = {
  address: {
    id: 'address',
    label: 'Account address',
    description:
      'Your AntSeed account address on Base. It is already public on-chain, so sharing it reveals nothing secret.',
    resolve: (account) => account.address.toLowerCase(),
  },
  auto_deposit: {
    id: 'auto_deposit',
    label: 'Auto-deposit funding',
    description:
      'Whether gasless auto-deposit is enabled and how much USDC it can currently receive. Lets the app pre-fund your account.',
    resolve: (_account, context) => {
      if (!context?.autoDeposit) {
        throw new ScopeResolutionError('auto_deposit scope requires funding context');
      }
      return encodeAutoDeposit(context.autoDeposit);
    },
  },
};

export function isScopeId(value: string): value is ScopeId {
  return Object.prototype.hasOwnProperty.call(SCOPES, value);
}
