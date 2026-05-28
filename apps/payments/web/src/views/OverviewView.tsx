import { useEffect, useState } from 'react';
import type { BalanceData, PaymentConfig } from '../types';
import {
  getBuyerUsage,
  getChannels,
  type BuyerUsageChannelPoint,
  type BuyerUsageTotals,
  type RawChannel,
} from '../api';
import { UsageChart } from '../components/UsageChart';
import { formatCompact, formatNumber, bigintFromString } from '../utils/format';
import './OverviewView.scss';

interface OverviewViewProps {
  balance: BalanceData | null;
  config: PaymentConfig | null;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onGoToChannels: () => void;
  onGoToActivity: () => void;
  onGoToRewards: () => void;
}

function formatUsd(s: string | null | undefined): string {
  if (!s) return '—';
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const EMPTY_CHANNELS: BuyerUsageChannelPoint[] = [];

/**
 * Derive a short list of "recent activity" entries from the raw channel list.
 * Channels with status "settled" / "closed" contribute as settled items.
 * We don't have a proper activity log here, so we show what we can.
 */
function buildRecentActivity(
  channels: RawChannel[],
): Array<{ label: string; amount: string; positive: boolean }> {
  const items: Array<{ label: string; amount: string; positive: boolean; ts: number }> = [];

  for (const ch of channels) {
    const settled = parseFloat(ch.cumulativeSigned) / 1e6;
    if (
      (ch.status === 'settled' || ch.status === 'closed') &&
      settled > 0
    ) {
      const model = ch.peerId ? ch.peerId.slice(0, 16) : ch.seller.slice(0, 8) + '…';
      items.push({
        label: `Settled · ${model}`,
        amount: `-$${settled.toFixed(2)}`,
        positive: false,
        ts: ch.reservedAt,
      });
    }
  }

  // Sort by most recent first, cap at 4 items
  items.sort((a, b) => b.ts - a.ts);
  return items.slice(0, 4);
}

export function OverviewView({
  balance,
  config: _config,
  onOpenDeposit,
  onOpenWithdraw,
  onGoToChannels,
  onGoToActivity,
}: OverviewViewProps) {
  const [buyerUsage, setBuyerUsage] = useState<BuyerUsageTotals | null>(null);
  const [rawChannels, setRawChannels] = useState<RawChannel[]>([]);

  useEffect(() => {
    let cancelled = false;
    getBuyerUsage()
      .then((totals) => { if (!cancelled) setBuyerUsage(totals); })
      .catch(() => {});
    getChannels()
      .then(({ channels }) => { if (!cancelled) setRawChannels(channels); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const available  = balance?.available  ?? null;
  const reserved   = balance?.reserved   ?? null;
  const total      = balance?.total      ?? null;

  const availableUsd = available ? parseFloat(available) : null;
  const reservedUsd  = reserved  ? parseFloat(reserved)  : null;
  const totalUsd     = total     ? parseFloat(total)      : null;

  const activeChannels = buyerUsage?.activeChannels ?? rawChannels.filter((c) => c.status === 'open').length;

  const totalRequests = buyerUsage?.totalRequests ?? 0;
  const totalTokens =
    bigintFromString(buyerUsage?.totalInputTokens) +
    bigintFromString(buyerUsage?.totalOutputTokens);
  const uniqueSellers = buyerUsage?.uniqueSellers ?? 0;

  const recentActivity = buildRecentActivity(rawChannels);

  return (
    <div className="overview-view">
      {/* Page header */}
      <div className="page-h1">Overview</div>
      <div className="page-subtitle">Your AntSeed account at a glance</div>

      {/* Balance hero — asymmetric: balance left, rewards right */}
      <div className="overview-top">
        <div className="overview-bal-col">
          <div className="page-label">Available balance</div>
          <div className="overview-bal">
            {totalUsd !== null ? (
              <>
                ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                <small>USDC</small>
              </>
            ) : (
              <span style={{ color: 'var(--faint)' }}>—</span>
            )}
          </div>
          <div className="overview-bal-note">
            {availableUsd !== null && reservedUsd !== null ? (
              <>
                ${formatUsd(available)} available · ${formatUsd(reserved)} in{' '}
                {activeChannels} active channel{activeChannels !== 1 ? 's' : ''}{' '}
                ·{' '}
              </>
            ) : null}
            <button type="button" className="portal-link" onClick={onGoToChannels}>
              details
            </button>
          </div>
          <div className="overview-actions">
            <button type="button" className="btn primary" onClick={onOpenDeposit}>
              + Add funds
            </button>
            <button type="button" className="btn ghost" onClick={onOpenWithdraw}>
              Withdraw
            </button>
          </div>
        </div>

        <div className="overview-vrule" aria-hidden="true" />

        {/* Rewards column — data comes from emissions/DIEM; show a placeholder until wired */}
        <div className="overview-rew-col">
          <div className="page-label">Claimable rewards</div>
          <div className="overview-rew-val">
            — <small>$ANTS</small>
          </div>
          <div className="overview-rew-brk">
            emissions + DIEM
          </div>
          <div className="overview-actions" style={{ marginTop: 'var(--sp-3)' }}>
            <button type="button" className="btn primary" disabled>
              Claim all
            </button>
          </div>
        </div>
      </div>

      <div className="page-rule" />

      {/* All-time stat row */}
      <div className="portal-stats">
        <div className="portal-stat">
          <div className="page-label">Requests (all-time)</div>
          <div className="portal-stat-num">{formatNumber(totalRequests)}</div>
        </div>
        <div className="portal-stat">
          <div className="page-label">Tokens (all-time)</div>
          <div className="portal-stat-num">{formatCompact(totalTokens)}</div>
        </div>
        <div className="portal-stat">
          <div className="page-label">Sellers used</div>
          <div className="portal-stat-num">{formatNumber(uniqueSellers)}</div>
        </div>
        <div className="portal-stat">
          <div className="page-label">Active channels</div>
          <div className="portal-stat-num">{formatNumber(activeChannels)}</div>
        </div>
      </div>

      <div className="page-rule" />

      {/* Two-column: usage chart left, recent activity right */}
      <div className="overview-cols">
        <div>
          <div className="portal-sechead">
            <div className="page-label">Usage · last 14 days</div>
          </div>
          <UsageChart channels={buyerUsage?.channels ?? EMPTY_CHANNELS} days={14} />
        </div>

        <div>
          <div className="portal-sechead">
            <div className="page-label">Recent activity</div>
            <button type="button" className="portal-link" onClick={onGoToActivity}>
              View all →
            </button>
          </div>

          {recentActivity.length > 0 ? (
            recentActivity.map((item, i) => (
              <div key={i} className="portal-list-row">
                <span className="portal-list-who">{item.label}</span>
                <span className={`portal-list-amt${item.positive ? ' in' : ''}`}>
                  {item.amount}
                </span>
              </div>
            ))
          ) : (
            <div className="overview-empty-desc" style={{ marginTop: 'var(--sp-4)', color: 'var(--muted)' }}>
              No activity yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
