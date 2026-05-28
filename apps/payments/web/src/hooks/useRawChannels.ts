/**
 * useRawChannels — react-query wrapper around getChannels().
 * Fetches the local channel list; other hooks (useChannels) layer on-chain reads.
 */
import { useQuery } from '@tanstack/react-query';
import { getChannels } from '../api';
import type { RawChannel } from '../api';

export const RAW_CHANNELS_KEY = ['raw-channels'] as const;

export function useRawChannels() {
  return useQuery<{ channels: RawChannel[] }, Error>({
    queryKey: RAW_CHANNELS_KEY,
    queryFn: getChannels,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 2,
    placeholderData: (prev) => prev,
  });
}
