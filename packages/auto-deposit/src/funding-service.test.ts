import { describe, it, expect } from 'vitest';
import { toFundingStatus } from './factory.js';
import type { AutoDepositStatus } from './manager.js';

function status(overrides: Partial<AutoDepositStatus>): AutoDepositStatus {
  return {
    enabled: true,
    delegated: false,
    state: 'idle',
    looseBaseUnits: '0',
    strandedBaseUnits: '0',
    creditLimitBaseUnits: '0',
    lastDeposit: null,
    lastError: null,
    ...overrides,
  };
}

const ADDRESS = '0x1111111111111111111111111111111111111111';

describe('toFundingStatus', () => {
  it('maps disabled to Off without attention', () => {
    const funding = toFundingStatus(status({ enabled: false, state: 'disabled' }), ADDRESS);
    expect(funding.enabled).toBe(false);
    expect(funding.attention).toBe(false);
    expect(funding.summary).toBe('Off');
    expect(funding.receiveAddress).toBe(ADDRESS);
  });

  it('flags needs_attention and surfaces the error', () => {
    const funding = toFundingStatus(status({ state: 'needs_attention', lastError: 'boom' }), ADDRESS);
    expect(funding.attention).toBe(true);
    expect(funding.summary).toContain('boom');
  });

  it('summarizes stranded funds with a USDC amount', () => {
    const funding = toFundingStatus(status({ state: 'stranded', strandedBaseUnits: '2500000' }), ADDRESS);
    expect(funding.attention).toBe(false);
    expect(funding.summary).toContain('2.50 USDC');
  });

  it('shows Active when idle and delegated', () => {
    expect(toFundingStatus(status({ state: 'idle', delegated: true }), ADDRESS).summary).toBe('Active');
  });

  it('mentions the wallet upgrade when idle and not yet delegated', () => {
    expect(toFundingStatus(status({ state: 'idle', delegated: false }), ADDRESS).summary)
      .toContain('upgrades on the first deposit');
  });
});
