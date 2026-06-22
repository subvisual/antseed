import { describe, it, expect } from 'vitest';
import { SCOPES, encodeAutoDeposit, ScopeResolutionError } from './scopes.js';
import type { ScopeAccount, ScopeContext } from './types.js';

const ACCOUNT: ScopeAccount = { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' };

describe('encodeAutoDeposit', () => {
  it('produces exact deterministic byte strings', () => {
    expect(encodeAutoDeposit({ enabled: true, receiveLimitUsdc: 7.5 })).toBe(
      '{"enabled":true,"limitUsdc":7.5}',
    );
    expect(encodeAutoDeposit({ enabled: false, receiveLimitUsdc: 0 })).toBe(
      '{"enabled":false,"limitUsdc":0}',
    );
    expect(encodeAutoDeposit({ enabled: true, receiveLimitUsdc: null })).toBe(
      '{"enabled":true,"limitUsdc":null}',
    );
  });
});

describe('address scope', () => {
  it('lowercases the account address and ignores context', () => {
    expect(SCOPES.address.resolve(ACCOUNT)).toBe(ACCOUNT.address.toLowerCase());
    expect(SCOPES.address.resolve(ACCOUNT, {})).toBe(ACCOUNT.address.toLowerCase());
  });
});

describe('auto_deposit scope', () => {
  it('resolves an enabled funding state', () => {
    const context: ScopeContext = { autoDeposit: { enabled: true, receiveLimitUsdc: 12 } };
    expect(SCOPES.auto_deposit.resolve(ACCOUNT, context)).toBe('{"enabled":true,"limitUsdc":12}');
  });

  it('resolves a disabled funding state', () => {
    const context: ScopeContext = { autoDeposit: { enabled: false, receiveLimitUsdc: null } };
    expect(SCOPES.auto_deposit.resolve(ACCOUNT, context)).toBe(
      '{"enabled":false,"limitUsdc":null}',
    );
  });

  it('throws a typed error when the funding context is missing', () => {
    expect(() => SCOPES.auto_deposit.resolve(ACCOUNT)).toThrow(ScopeResolutionError);
    expect(() => SCOPES.auto_deposit.resolve(ACCOUNT, {})).toThrow(ScopeResolutionError);
  });
});
