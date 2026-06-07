/**
 * ActivityView — full day-grouped transaction history with type filter chips.
 *
 * Data source: /api/activity via useActivity (react-query, cached + stale-while-revalidate).
 * Skeleton placeholders on initial load; StaleDataBanner on refresh failure.
 */
import { useState, useMemo } from 'react';
import type { PaymentConfig } from '../types';
import type { ActivityItem, ActivityItemType } from '../api';
import { useActivity } from '../hooks/useActivity';
import { SkeletonList } from '../components/Skeleton';
import { StaleDataBanner } from '../components/StaleDataBanner';
import './ActivityView.scss';

interface ActivityViewProps {
  config: PaymentConfig | null;
}

// ── Filter chip types ────────────────────────────────────────────────────────

type FilterId = 'all' | ActivityItemType;

/**
 * Only filters backed by a live data source are shown.
 * Deposits / Withdrawals / Claims are hidden until on-chain event indexing
 * lands — re-add them here when the backend exposes those events.
 */
const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all',           label: 'All' },
  { id: 'settlement',    label: 'Settlements' },
  { id: 'channel_close', label: 'Channel closes' },
];

// ── Day grouping ─────────────────────────────────────────────────────────────

function dayKey(ts: number): string {
  return new Date(ts * 1000).toDateString();
}

function formatDayLabel(ts: number): string {
  const d = new Date(ts * 1000);
  const today     = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString())     return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

interface DayGroup {
  label: string;
  items: ActivityItem[];
}

function groupByDay(items: ActivityItem[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const item of items) {
    const key = dayKey(item.ts);
    if (!map.has(key)) {
      map.set(key, { label: formatDayLabel(item.ts), items: [] });
    }
    map.get(key)!.items.push(item);
  }
  return Array.from(map.values());
}

// ── Row component ─────────────────────────────────────────────────────────────

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <div className="act-row">
      <div className="act-row__left">
        <span className="act-row__label">{item.label}</span>
        <span className="act-row__meta">
          {item.meta}
          {item.ts > 0 && (
            <>
              {item.meta ? ' · ' : ''}
              {formatTime(item.ts)}
            </>
          )}
        </span>
      </div>
      <span className={`act-row__amount${item.positive ? ' act-row__amount--in' : ''}`}>
        {item.positive ? item.amount : `−${item.amount.replace(/^[-−]/, '')}`}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ActivityView({ config: _config }: ActivityViewProps) {
  const [activeFilter, setActiveFilter] = useState<FilterId>('all');
  const { activity, isLoading, isError, isRefetching } = useActivity();

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return activity;
    return activity.filter((item) => item.type === activeFilter);
  }, [activity, activeFilter]);

  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  const hasCachedData = activity.length > 0;
  const showSkeletons = isLoading && !hasCachedData;

  return (
    <div className="activity-view">
      {/* Page title/subtitle live in the sticky TopBar (layout/TopBar.tsx). */}

      {/* Stale data notice */}
      <StaleDataBanner
        hasError={isError && !isLoading}
        hasCachedData={hasCachedData}
      />

      {/* Filter chips + meta row */}
      <div className="act-toolbar">
        <div className="act-chips" role="group" aria-label="Filter by type">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`act-chip${activeFilter === f.id ? ' act-chip--on' : ''}`}
              onClick={() => setActiveFilter(f.id)}
              aria-pressed={activeFilter === f.id}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="act-meta">Last 30 days</span>
      </div>

      {/* Background refresh indicator */}
      {isRefetching && hasCachedData && (
        <div className="act-refreshing" role="status" aria-label="Refreshing activity…" />
      )}

      {/* Content */}
      {showSkeletons ? (
        <div className="act-skeleton-wrap">
          <SkeletonList rows={6} />
        </div>
      ) : groups.length === 0 ? (
        <div className="act-empty">
          {activeFilter === 'all'
            ? 'No activity yet. Complete a request to see settlements here.'
            : `No ${FILTERS.find((f) => f.id === activeFilter)?.label.toLowerCase() ?? 'items'} found.`}
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.label} className="act-group">
            <div className="act-day-label page-label">{group.label}</div>
            <div className="act-group__rows">
              {group.items.map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
