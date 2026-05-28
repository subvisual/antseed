/**
 * Pure utility functions for optimistic balance reconciliation.
 * Extracted so they can be tested independently of React hooks.
 */

/** Add a float delta (USDC) to a USDC string, clamp to >= 0, return 6dp string. */
export function applyDeltaToField(value: string, delta: number): string {
  const base = parseFloat(value);
  if (!Number.isFinite(base)) return value;
  const result = Math.max(0, base + delta);
  return result.toFixed(6);
}

/**
 * Return true when a server-reported balance has moved far enough that the
 * pending delta is considered reconciled (90% threshold to handle rounding).
 *
 * @param realValue      - current on-chain/server balance
 * @param baselineValue  - server balance at the time the delta was applied
 * @param delta          - signed USDC delta (positive = deposit, negative = withdraw)
 */
export function isDeltaReconciled(
  realValue: number,
  baselineValue: number,
  delta: number,
): boolean {
  if (delta === 0) return true;
  if (delta > 0) {
    // Deposit / claim: server should have moved up by at least 90% of the delta
    return realValue >= baselineValue + delta * 0.9;
  } else {
    // Withdraw / spend: server should have moved down by at least 90% of |delta|
    return realValue <= baselineValue + delta * 0.9;
  }
}

/**
 * Apply a list of pending deltas onto a record of balance fields.
 * Returns a new record with each delta applied.
 */
export function applyDeltas(
  fields: Record<string, string>,
  deltas: Array<{ field: string; delta: number }>,
): Record<string, string> {
  let result = { ...fields };
  for (const { field, delta } of deltas) {
    if (field in result) {
      result = { ...result, [field]: applyDeltaToField(result[field], delta) };
    }
  }
  return result;
}
