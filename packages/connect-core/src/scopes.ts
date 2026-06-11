import type { ScopeId, ScopeAccount } from './types.js';

export interface ScopeDef {
  id: ScopeId;
  /** Short human label for the consent screen. */
  label: string;
  /** One line telling the user what the value is and whether it is sensitive. */
  description: string;
  resolve(account: ScopeAccount): string;
}

export const SCOPES: Record<ScopeId, ScopeDef> = {
  address: {
    id: 'address',
    label: 'Account address',
    description:
      'Your AntSeed account address on Base. It is already public on-chain, so sharing it reveals nothing secret.',
    resolve: (account) => account.address.toLowerCase(),
  },
};

export function isScopeId(value: string): value is ScopeId {
  return Object.prototype.hasOwnProperty.call(SCOPES, value);
}
