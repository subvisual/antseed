import { useMemo } from 'react';
import type { BuyerUsageChannelPoint } from '../api';
import { formatCompact } from '../utils/format';
import './UsageChart.scss';

interface UsageChartProps {
  channels: BuyerUsageChannelPoint[];
  /** Number of days to show in the spark view (default 14). */
  days?: number;
}

interface DayBucket {
  t: number;
  dateLabel: string;
  fullDate: string;
  requests: number;
  tokens: number;
  /** Estimated spend from tokens (rough: (tokens / 1_000_000) * 3 cents) */
  spendUsd: number;
}

const DAY_MS = 86_400_000;

/** Transform raw channel points into per-day buckets for the last `days` days. */
export function bucketByDay(
  channels: BuyerUsageChannelPoint[],
  days = 14,
): DayBucket[] {
  const now = Date.now();
  const cutoff = now - days * DAY_MS;

  // Only include channels that had real activity.
  const active = channels.filter((c) => c.requestCount > 0);

  const map = new Map<number, DayBucket>();

  for (const c of active) {
    const stamp = c.updatedAt || c.reservedAt;
    if (!Number.isFinite(stamp) || stamp <= 0) continue;
    const t = Math.floor(stamp / DAY_MS) * DAY_MS;
    // Keep only the window we're interested in
    if (t < cutoff) continue;

    let tokens = 0;
    try {
      tokens = Number(BigInt(c.inputTokens || '0') + BigInt(c.outputTokens || '0'));
    } catch { /* skip */ }

    const existing = map.get(t);
    if (existing) {
      existing.requests += c.requestCount;
      existing.tokens += tokens;
      existing.spendUsd += estimateSpend(tokens);
    } else {
      map.set(t, {
        t,
        dateLabel: shortDate(t),
        fullDate: fullDate(t),
        requests: c.requestCount,
        tokens,
        spendUsd: estimateSpend(tokens),
      });
    }
  }

  // Build a contiguous array for the window, filling gaps with zeros.
  const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
  const windowStart = todayStart - (days - 1) * DAY_MS;
  const buckets: DayBucket[] = [];
  for (let t = windowStart; t <= todayStart; t += DAY_MS) {
    buckets.push(
      map.get(t) ?? {
        t,
        dateLabel: shortDate(t),
        fullDate: fullDate(t),
        requests: 0,
        tokens: 0,
        spendUsd: 0,
      },
    );
  }
  return buckets;
}

function estimateSpend(tokens: number): number {
  // Rough estimate: ~$3 per million tokens average
  return (tokens / 1_000_000) * 3;
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fullDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * 14-day hoverable bar chart.
 * Each column shows a bar proportional to request count for that day.
 * Hovering reveals a tooltip with requests / tokens / estimated spend.
 */
export function UsageChart({ channels, days = 14 }: UsageChartProps) {
  const buckets = useMemo(() => bucketByDay(channels, days), [channels, days]);

  const maxRequests = useMemo(
    () => Math.max(1, ...buckets.map((b) => b.requests)),
    [buckets],
  );

  const totals = useMemo(() => {
    const requests = buckets.reduce((s, b) => s + b.requests, 0);
    const tokens   = buckets.reduce((s, b) => s + b.tokens,   0);
    const spendUsd = buckets.reduce((s, b) => s + b.spendUsd, 0);
    return { requests, tokens, spendUsd };
  }, [buckets]);

  if (totals.requests === 0) {
    return (
      <div className="usage-chart usage-chart--empty">
        <div className="usage-chart-empty-text">
          No usage yet — start sending requests to see your activity here.
        </div>
      </div>
    );
  }

  return (
    <div className="usage-chart">
      {/* 14-day totals bar */}
      <div className="usage-chart-totbar">
        <div className="usage-chart-tot">
          Requests
          <b>{totals.requests.toLocaleString('en-US')}</b>
        </div>
        <div className="usage-chart-tot">
          Tokens
          <b>{formatCompact(totals.tokens)}</b>
        </div>
        <div className="usage-chart-tot">
          Spent
          <b>${totals.spendUsd.toFixed(2)}</b>
        </div>
      </div>

      {/* Hoverable spark chart */}
      <div className="portal-spark" role="img" aria-label={`${days}-day usage chart`}>
        {buckets.map((b) => {
          const heightPct = b.requests === 0 ? 4 : Math.max(4, (b.requests / maxRequests) * 100);
          return (
            <div key={b.t} className="portal-spark-col">
              <div
                className="portal-spark-bar"
                style={{ height: `${heightPct}%` }}
              />
              <div className="portal-spark-tip" role="tooltip">
                <b>{b.fullDate}</b>
                <br />
                Requests{' '}
                <span className="acc">{b.requests.toLocaleString('en-US')}</span>
                <br />
                Tokens{' '}
                <span className="acc">{formatCompact(b.tokens)}</span>
                <br />
                Spent{' '}
                <span className="acc">${b.spendUsd.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
