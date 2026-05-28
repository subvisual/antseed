import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { ActivityItem } from '../api';
import {
  isCurrentMonth,
  spendThisMonth,
  budgetFraction,
  budgetWarningLevel,
  formatUsd,
} from './budgetMath';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal ActivityItem for test purposes. */
function makeItem(opts: {
  ts: number;
  positive: boolean;
  amount: string;
  type?: ActivityItem['type'];
}): ActivityItem {
  return {
    id: String(opts.ts),
    type: opts.type ?? 'settlement',
    label: 'Test',
    meta: '',
    amount: opts.amount,
    positive: opts.positive,
    ts: opts.ts,
  };
}

/** Seconds since epoch for a given Date. */
function sec(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

/** Timestamp (secs) N days ago. */
function daysAgo(n: number): number {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return sec(d);
}

/** Timestamp (secs) in the current month but a specific day. */
function thisMonthDay(day: number): number {
  const d = new Date();
  d.setDate(day);
  return sec(d);
}

/** Timestamp (secs) last month. */
function lastMonth(): number {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return sec(d);
}

// ── isCurrentMonth ────────────────────────────────────────────────────────────

describe('isCurrentMonth', () => {
  it('returns true for "now"', () => {
    expect(isCurrentMonth(sec(new Date()))).toBe(true);
  });

  it('returns false for a timestamp in the previous month', () => {
    expect(isCurrentMonth(lastMonth())).toBe(false);
  });

  it('returns false for a timestamp one year ago', () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    expect(isCurrentMonth(sec(d))).toBe(false);
  });
});

// ── spendThisMonth ────────────────────────────────────────────────────────────

describe('spendThisMonth', () => {
  it('returns 0 for an empty list', () => {
    expect(spendThisMonth([])).toBe(0);
  });

  it('ignores positive (incoming) items', () => {
    const items = [makeItem({ ts: daysAgo(1), positive: true, amount: '$100.00' })];
    expect(spendThisMonth(items)).toBe(0);
  });

  it('ignores items from a previous month', () => {
    const items = [makeItem({ ts: lastMonth(), positive: false, amount: '$50.00' })];
    expect(spendThisMonth(items)).toBe(0);
  });

  it('sums negative items from the current month', () => {
    const items = [
      makeItem({ ts: daysAgo(1), positive: false, amount: '$14.20' }),
      makeItem({ ts: daysAgo(2), positive: false, amount: '$5.80' }),
    ];
    expect(spendThisMonth(items)).toBeCloseTo(20.0, 4);
  });

  it('mixes current-month and last-month items correctly', () => {
    const items = [
      makeItem({ ts: daysAgo(1),  positive: false, amount: '$10.00' }),
      makeItem({ ts: lastMonth(), positive: false, amount: '$90.00' }),
      makeItem({ ts: daysAgo(0),  positive: true,  amount: '$200.00' }),
    ];
    expect(spendThisMonth(items)).toBeCloseTo(10.0, 4);
  });

  it('handles amount strings with leading $ and commas', () => {
    const items = [
      makeItem({ ts: daysAgo(1), positive: false, amount: '$1,250.00' }),
    ];
    expect(spendThisMonth(items)).toBeCloseTo(1250.0, 4);
  });

  it('skips non-numeric / malformed amounts without throwing', () => {
    const items = [
      makeItem({ ts: daysAgo(1), positive: false, amount: 'N/A' }),
      makeItem({ ts: daysAgo(1), positive: false, amount: '$20.00' }),
    ];
    expect(spendThisMonth(items)).toBeCloseTo(20.0, 4);
  });
});

// ── budgetFraction ────────────────────────────────────────────────────────────

describe('budgetFraction', () => {
  it('returns 0 when cap is 0', () => {
    expect(budgetFraction(10, 0)).toBe(0);
  });

  it('returns the ratio spend/cap', () => {
    expect(budgetFraction(25, 100)).toBeCloseTo(0.25, 6);
  });

  it('clamps to 1 when spend exceeds cap', () => {
    expect(budgetFraction(120, 100)).toBe(1);
  });

  it('returns 0 when spend is 0', () => {
    expect(budgetFraction(0, 50)).toBe(0);
  });
});

// ── budgetWarningLevel ────────────────────────────────────────────────────────

describe('budgetWarningLevel', () => {
  it('returns "none" when no cap is set (0)', () => {
    expect(budgetWarningLevel(50, 0)).toBe('none');
  });

  it('returns "none" below 80 %', () => {
    expect(budgetWarningLevel(79, 100)).toBe('none');
    expect(budgetWarningLevel(0, 100)).toBe('none');
  });

  it('returns "warning" at 80 %', () => {
    expect(budgetWarningLevel(80, 100)).toBe('warning');
  });

  it('returns "warning" between 80 % and 100 %', () => {
    expect(budgetWarningLevel(95, 100)).toBe('warning');
  });

  it('returns "critical" at exactly 100 %', () => {
    expect(budgetWarningLevel(100, 100)).toBe('critical');
  });

  it('returns "critical" when spend exceeds cap', () => {
    expect(budgetWarningLevel(110, 100)).toBe('critical');
  });
});

// ── formatUsd ─────────────────────────────────────────────────────────────────

describe('formatUsd', () => {
  it('formats zero', () => {
    expect(formatUsd(0)).toBe('$0.00');
  });

  it('formats a dollar amount with 2 decimal places', () => {
    expect(formatUsd(14.2)).toBe('$14.20');
    expect(formatUsd(50)).toBe('$50.00');
  });
});
