/**
 * useActivity — derives recent activity entries from raw channels.
 * Activity is a derived view over useRawChannels; no dedicated API endpoint yet.
 */
import { useMemo } from 'react';
import { useRawChannels } from './useRawChannels';
import type { RawChannel } from '../api';

export interface ActivityItem {
  label: string;
  amount: string;
  positive: boolean;
  ts: number;
}

function buildActivity(channels: RawChannel[]): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const ch of channels) {
    const settled = parseFloat(ch.cumulativeSigned) / 1e6;
    if (
      (ch.status === 'settled' || ch.status === 'closed') &&
      settled > 0
    ) {
      const model = ch.peerId ? ch.peerId.slice(0, 16) : `${ch.seller.slice(0, 8)}…`;
      items.push({
        label: `Settled · ${model}`,
        amount: `-$${settled.toFixed(2)}`,
        positive: false,
        ts: ch.reservedAt,
      });
    }
  }

  items.sort((a, b) => b.ts - a.ts);
  return items;
}

export function useActivity() {
  const { data, isLoading, isError, error } = useRawChannels();

  const activity = useMemo(
    () => buildActivity(data?.channels ?? []),
    [data],
  );

  return { activity, isLoading, isError, error };
}

export function useRecentActivity(limit = 4) {
  const { activity, isLoading, isError, error } = useActivity();
  return {
    activity: activity.slice(0, limit),
    isLoading,
    isError,
    error,
  };
}
