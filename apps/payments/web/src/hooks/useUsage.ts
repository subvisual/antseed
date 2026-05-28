/**
 * useUsage — react-query wrapper around getBuyerUsage().
 * Buyer usage totals are relatively stable — 60 s stale time is fine.
 */
import { useQuery } from '@tanstack/react-query';
import { getBuyerUsage } from '../api';
import type { BuyerUsageTotals } from '../api';

export const USAGE_KEY = ['buyer-usage'] as const;

export function useUsage() {
  return useQuery<BuyerUsageTotals, Error>({
    queryKey: USAGE_KEY,
    queryFn: getBuyerUsage,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 2,
    placeholderData: (prev) => prev,
  });
}
