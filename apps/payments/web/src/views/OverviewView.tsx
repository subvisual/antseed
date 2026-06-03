import type { PaymentConfig } from '../types';
import { useOptimisticBalance } from '../hooks/useOptimisticBalance';
import { useUsage } from '../hooks/useUsage';
import { useRecentActivity } from '../hooks/useActivity';
import { useRawChannels } from '../hooks/useRawChannels';
import { UsageChart } from '../components/UsageChart';
import {
  SkeletonHero,
  SkeletonStatRow,
  SkeletonList,
  SkeletonChart,
} from '../components/Skeleton';
import { StaleDataBanner } from '../components/StaleDataBanner';
import { GettingStarted } from '../components/GettingStarted';
import { formatCompact, formatNumber, bigintFromString } from '../utils/format';
import './OverviewView.scss';

interface OverviewViewProps {
  // balance + config are still accepted as props for compatibility with the
  // existing AppShell — the view also reads from react-query, which is the
  // authoritative source for cached/optimistic data.
  balance: import('../types').BalanceData | null;
  config: PaymentConfig | null;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onOpenHowItWorks: () => void;
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

export function OverviewView({
  config: _config,
  onOpenDeposit,
  onOpenWithdraw,
  onOpenHowItWorks,
  onGoToChannels,
  onGoToActivity,
}: OverviewViewProps) {
  // ── Data hooks ───────────────────────────────────────────────────────────
  const {
    balance,
    isLoading: balanceLoading,
    isRefetching: balanceRefetching,
    error: balanceError,
  } = useOptimisticBalance();

  const {
    data: buyerUsage,
    isLoading: usageLoading,
    error: usageError,
  } = useUsage();

  const {
    data: channelsData,
    isLoading: channelsLoading,
    error: channelsError,
  } = useRawChannels();

  const {
    activity: recentActivity,
    isLoading: activityLoading,
    error: activityError,
  } = useRecentActivity(4);

  const rawChannels = channelsData?.channels ?? [];

  // ── Derived values ────────────────────────────────────────────────────────
  const available = balance?.available ?? null;
  const reserved  = balance?.reserved  ?? null;
  const total     = balance?.total     ?? null;

  const totalUsd     = total     ? parseFloat(total)     : null;
  const availableUsd = available ? parseFloat(available) : null;
  const reservedUsd  = reserved  ? parseFloat(reserved)  : null;

  const activeChannels =
    buyerUsage?.activeChannels ?? rawChannels.filter((c) => c.status === 'open').length;

  const totalRequests = buyerUsage?.totalRequests ?? 0;
  const totalTokens =
    bigintFromString(buyerUsage?.totalInputTokens) +
    bigintFromString(buyerUsage?.totalOutputTokens);
  const uniqueSellers = buyerUsage?.uniqueSellers ?? 0;

  // ── Graceful degrade: any fetch error with stale data ────────────────────
  const anyError = balanceError ?? usageError ?? channelsError ?? activityError;
  const hasCachedBalance = balance !== null;
  const isRefreshing = balanceRefetching;

  return (
    <div className="overview-view">
      {/* Page title/subtitle live in the sticky TopBar (layout/TopBar.tsx). */}

      {/* Onboarding checklist — self-hides once dismissed / all steps done */}
      <GettingStarted
        onOpenDeposit={onOpenDeposit}
        onOpenHowItWorks={onOpenHowItWorks}
      />

      {/* Stale data notice */}
      <StaleDataBanner
        hasError={anyError != null && !balanceLoading}
        hasCachedData={hasCachedBalance}
      />

      {/* Background refresh indicator (subtle) */}
      {isRefreshing && (
        <div
          className="overview-refreshing"
          role="status"
          aria-label="Refreshing balance…"
        />
      )}

      {/* Balance hero */}
      <div className="overview-top">
        <div className="overview-bal-col">
          {balanceLoading && !hasCachedBalance ? (
            <SkeletonHero />
          ) : (
            <>
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
            </>
          )}
        </div>

        <div className="overview-vrule" aria-hidden="true" />

        {/* Rewards column */}
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
      {(usageLoading || channelsLoading) && !buyerUsage ? (
        <SkeletonStatRow count={4} />
      ) : (
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
      )}

      <div className="page-rule" />

      {/* Two-column: usage chart left, recent activity right */}
      <div className="overview-cols">
        <div>
          <div className="portal-sechead">
            <div className="page-label">Usage · last 14 days</div>
          </div>
          {usageLoading && !buyerUsage ? (
            <SkeletonChart bars={14} />
          ) : (
            <UsageChart channels={buyerUsage?.channels ?? []} days={14} />
          )}
        </div>

        <div>
          <div className="portal-sechead">
            <div className="page-label">Recent activity</div>
            <button type="button" className="portal-link" onClick={onGoToActivity}>
              View all →
            </button>
          </div>

          {activityLoading && recentActivity.length === 0 ? (
            <SkeletonList rows={4} />
          ) : recentActivity.length > 0 ? (
            recentActivity.map((item, i) => (
              <div key={i} className="portal-list-row">
                <span className="portal-list-who">{item.label}</span>
                <span className={`portal-list-amt${item.positive ? ' in' : ''}`}>
                  {item.amount}
                </span>
              </div>
            ))
          ) : (
            <div
              className="overview-empty-desc"
              style={{ marginTop: 'var(--sp-4)', color: 'var(--muted)' }}
            >
              No activity yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
