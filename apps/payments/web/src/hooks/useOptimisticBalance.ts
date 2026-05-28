/**
 * useOptimisticBalance — optimistic balance layer.
 *
 * Provides a single helper `applyDelta(field, deltaUsdc)` that other flows
 * (deposit, withdraw, claim, close) call on confirmed tx to update the
 * displayed balance immediately, before the next on-chain read reconciles it.
 *
 * Reconciliation:
 * - Each applyDelta call stores a "pending" delta keyed by a unique id.
 * - On each fresh server read (data changes), we remove any pending delta
 *   whose signed direction is now reflected in the real value, then
 *   re-apply only the remaining unreconciled deltas.
 *
 * Usage:
 *   const { balance, applyDelta } = useOptimisticBalance();
 *   // on deposit confirmed:
 *   applyDelta('available', +100);  // USDC, plain float
 *   applyDelta('total', +100);
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBalance, BALANCE_KEY } from './useBalance';
import type { BalanceData } from '../types';
import {
  applyDeltaToField,
  isDeltaReconciled,
} from './optimisticBalance.utils';

// Re-export for consumers that need to do UI-level math
export { applyDeltaToField } from './optimisticBalance.utils';
export { isDeltaReconciled as reconcileDeltas } from './optimisticBalance.utils';

export type BalanceField = 'available' | 'reserved' | 'total';

interface PendingDelta {
  id: string;
  field: BalanceField;
  delta: number; // USDC float (positive = increase)
  baselineValue: number; // server value at the time the delta was applied
}

let _idCounter = 0;
function nextId(): string {
  return `delta-${++_idCounter}`;
}

export interface OptimisticBalanceResult {
  /** Effective balance with unreconciled deltas applied. May be null while loading. */
  balance: BalanceData | null;
  /** True on initial load (no cached data yet). */
  isLoading: boolean;
  /** True when a background refetch is in progress. */
  isRefetching: boolean;
  /** Last fetch error, if any. */
  error: Error | null;
  /**
   * Apply an optimistic delta to a balance field.
   * Call once per affected field after a tx is confirmed.
   * @param field - which balance field to update
   * @param deltaUsdc - signed float in USDC (e.g. +50 for deposit, -50 for withdraw)
   */
  applyDelta: (field: BalanceField, deltaUsdc: number) => void;
  /** Trigger an immediate balance refresh (e.g. a few seconds after a tx). */
  refresh: () => Promise<void>;
}

export function useOptimisticBalance(): OptimisticBalanceResult {
  const qc = useQueryClient();
  const { data: serverBalance, isLoading, isFetching, error } = useBalance();

  // Pending deltas awaiting reconciliation
  const pendingRef = useRef<PendingDelta[]>([]);
  // Last displayed balance (with optimistic adjustments)
  const [optimisticBalance, setOptimisticBalance] = useState<BalanceData | null>(null);

  // Re-apply pending deltas whenever server data changes
  useEffect(() => {
    if (!serverBalance) {
      setOptimisticBalance(null);
      return;
    }

    // Reconcile: drop deltas that the server has already reflected
    pendingRef.current = pendingRef.current.filter((pd) => {
      const realValue = parseFloat(serverBalance[pd.field]);
      const alreadyReflected = isDeltaReconciled(realValue, pd.baselineValue, pd.delta);
      return !alreadyReflected;
    });

    // Apply remaining pending deltas
    let result: BalanceData = { ...serverBalance };
    for (const pd of pendingRef.current) {
      result = {
        ...result,
        [pd.field]: applyDeltaToField(result[pd.field], pd.delta),
      };
    }
    setOptimisticBalance(result);
  }, [serverBalance]);

  const applyDelta = useCallback(
    (field: BalanceField, deltaUsdc: number) => {
      // Read the current server-side baseline (or last known)
      const cached = qc.getQueryData<BalanceData>(BALANCE_KEY);
      const baselineValue = cached ? parseFloat(cached[field]) : 0;

      const pd: PendingDelta = {
        id: nextId(),
        field,
        delta: deltaUsdc,
        baselineValue,
      };
      pendingRef.current = [...pendingRef.current, pd];

      // Immediately update displayed balance
      setOptimisticBalance((prev) => {
        const base = prev ?? cached;
        if (!base) return prev;
        return {
          ...base,
          [field]: applyDeltaToField(base[field], deltaUsdc),
        };
      });
    },
    [qc],
  );

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: BALANCE_KEY });
  }, [qc]);

  return {
    balance: optimisticBalance,
    isLoading,
    isRefetching: isFetching && !isLoading,
    error: error ?? null,
    applyDelta,
    refresh,
  };
}
