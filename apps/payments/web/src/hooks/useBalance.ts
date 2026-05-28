/**
 * useBalance — react-query wrapper around getBalance().
 * Caches last-good data so views paint instantly then refresh in the background.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getBalance } from '../api';
import type { BalanceData } from '../types';

export const BALANCE_KEY = ['balance'] as const;

/**
 * Stale time: 15 s — balance refreshes frequently but not every render.
 * gcTime: 5 min — keep last-good data around while the app is open.
 */
export function useBalance() {
  return useQuery<BalanceData, Error>({
    queryKey: BALANCE_KEY,
    queryFn: getBalance,
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    retry: 2,
    // Keep previous data visible while refetching (no flash to empty)
    placeholderData: (prev) => prev,
  });
}

/** Imperatively force a balance refresh (e.g. after a tx). */
export function useInvalidateBalance() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: BALANCE_KEY });
}
