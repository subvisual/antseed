import { describe, it, expect } from 'vitest';
import {
  applyDeltaToField,
  isDeltaReconciled,
  applyDeltas,
} from './optimisticBalance.utils';

describe('applyDeltaToField', () => {
  it('adds a positive delta to a USDC string', () => {
    const result = applyDeltaToField('100.000000', 50);
    expect(parseFloat(result)).toBeCloseTo(150, 4);
  });

  it('subtracts a negative delta', () => {
    const result = applyDeltaToField('100.000000', -30);
    expect(parseFloat(result)).toBeCloseTo(70, 4);
  });

  it('clamps to 0 when delta would go negative', () => {
    const result = applyDeltaToField('10.000000', -200);
    expect(parseFloat(result)).toBe(0);
  });

  it('returns the original string when value is non-finite', () => {
    const result = applyDeltaToField('NaN', 50);
    expect(result).toBe('NaN');
  });

  it('returns 6 decimal places', () => {
    const result = applyDeltaToField('1.000000', 0.123456789);
    expect(result).toMatch(/^\d+\.\d{6}$/);
  });

  it('handles zero delta', () => {
    const result = applyDeltaToField('42.500000', 0);
    expect(parseFloat(result)).toBeCloseTo(42.5, 4);
  });
});

describe('isDeltaReconciled', () => {
  describe('positive delta (deposit / claim)', () => {
    it('returns true when real value is >= baseline + 90% of delta', () => {
      // baseline = 100, delta = +50, expect reconciled at real >= 145
      expect(isDeltaReconciled(145, 100, 50)).toBe(true);
      expect(isDeltaReconciled(150, 100, 50)).toBe(true);
    });

    it('returns false when real value has not moved enough', () => {
      // delta = +50, 90% = +45, threshold = 145 — real = 140 is not enough
      expect(isDeltaReconciled(140, 100, 50)).toBe(false);
      expect(isDeltaReconciled(100, 100, 50)).toBe(false);
    });

    it('handles exact threshold (exactly 90%)', () => {
      // baseline = 0, delta = 100, threshold = 90
      expect(isDeltaReconciled(90, 0, 100)).toBe(true);
      expect(isDeltaReconciled(89.9, 0, 100)).toBe(false);
    });
  });

  describe('negative delta (withdraw / settle)', () => {
    it('returns true when real value has dropped by at least 90% of |delta|', () => {
      // baseline = 100, delta = -50, threshold = real <= 55
      expect(isDeltaReconciled(55, 100, -50)).toBe(true);
      expect(isDeltaReconciled(50, 100, -50)).toBe(true);
    });

    it('returns false when real value has not dropped enough', () => {
      // threshold = 55 — real = 60 not enough
      expect(isDeltaReconciled(60, 100, -50)).toBe(false);
      expect(isDeltaReconciled(100, 100, -50)).toBe(false);
    });
  });

  describe('zero delta', () => {
    it('always returns true for zero delta', () => {
      expect(isDeltaReconciled(100, 100, 0)).toBe(true);
      expect(isDeltaReconciled(0, 0, 0)).toBe(true);
    });
  });

  describe('large deposits', () => {
    it('reconciles a large deposit when server catches up', () => {
      const baseline = 0;
      const delta = 10_000;
      // Not yet reconciled
      expect(isDeltaReconciled(5_000, baseline, delta)).toBe(false);
      // Reconciled at 90% of delta
      expect(isDeltaReconciled(9_000, baseline, delta)).toBe(true);
    });
  });
});

describe('applyDeltas', () => {
  it('applies multiple deltas to different fields', () => {
    const fields = { available: '100.000000', reserved: '50.000000', total: '150.000000' };
    const result = applyDeltas(fields, [
      { field: 'available', delta: +100 },
      { field: 'total', delta: +100 },
    ]);
    expect(parseFloat(result.available)).toBeCloseTo(200, 4);
    expect(parseFloat(result.total)).toBeCloseTo(250, 4);
    expect(result.reserved).toBe('50.000000');
  });

  it('applies deltas sequentially (each builds on the previous)', () => {
    const fields = { available: '100.000000', reserved: '0.000000', total: '100.000000' };
    const result = applyDeltas(fields, [
      { field: 'available', delta: -30 },
      { field: 'available', delta: -20 },
    ]);
    expect(parseFloat(result.available)).toBeCloseTo(50, 4);
  });

  it('ignores deltas for fields that do not exist', () => {
    const fields = { available: '100.000000' };
    const result = applyDeltas(fields, [{ field: 'nonexistent', delta: 999 }]);
    expect(result).toEqual(fields);
  });

  it('returns a new object (immutable)', () => {
    const fields = { available: '100.000000' };
    const result = applyDeltas(fields, [{ field: 'available', delta: 10 }]);
    expect(result).not.toBe(fields);
    expect(fields.available).toBe('100.000000');
  });
});
