/**
 * useActivity — fetches the full activity list from /api/activity.
 *
 * The server aggregates settlements and channel-close events from the local
 * channel store.  The hook re-exports a typed ActivityItem that the views
 * can consume directly.
 */
import { useQuery } from '@tanstack/react-query';
import { getActivity } from '../api';
import type { ActivityItem } from '../api';

export type { ActivityItem };

export const ACTIVITY_KEY = ['activity'] as const;

export function useActivity() {
  const { data, isLoading, isError, error, isRefetching } = useQuery({
    queryKey: ACTIVITY_KEY,
    queryFn: getActivity,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 2,
    placeholderData: (prev) => prev,
  });

  return {
    activity: data?.items ?? [],
    isLoading,
    isError,
    isRefetching,
    error,
  };
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
