/**
 * useRewards — react-query wrapper for emissions/DIEM rewards data.
 * Rewards change only on epoch ticks (~daily), so stale time is generous.
 * The hook is a no-op when no emissions contract is configured (config is null).
 */
import { useQuery } from '@tanstack/react-query';
import { getEmissionsInfo, getEmissionsPending } from '../api';
import type { EmissionsEpochInfo, EmissionsPendingResponse } from '../api';
import type { PaymentConfig } from '../types';

export const EMISSIONS_INFO_KEY = ['emissions-info'] as const;
export const EMISSIONS_PENDING_KEY = (address: string) =>
  ['emissions-pending', address] as const;

export function useEmissionsInfo(config: PaymentConfig | null) {
  return useQuery<EmissionsEpochInfo, Error>({
    queryKey: EMISSIONS_INFO_KEY,
    queryFn: getEmissionsInfo,
    enabled: config?.emissionsContractAddress != null,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 2,
    placeholderData: (prev) => prev,
  });
}

export function useEmissionsPending(config: PaymentConfig | null, epochs = 10) {
  const address = config?.evmAddress ?? '';
  return useQuery<EmissionsPendingResponse, Error>({
    queryKey: EMISSIONS_PENDING_KEY(address),
    queryFn: () => getEmissionsPending(address, epochs),
    enabled: config?.emissionsContractAddress != null && address.length > 0,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 2,
    placeholderData: (prev) => prev,
  });
}
