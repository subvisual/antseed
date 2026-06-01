import { useEffect, useMemo, useState } from 'react';
import { formatUnits } from 'viem';
import type { BalanceData, PaymentConfig } from '../types';
import {
  getBuyerUsage,
  getEmissionsPending,
  type BuyerUsageChannelPoint,
  type BuyerUsageTotals,
} from '../api';
import { UsageChart } from '../components/UsageChart';
import { formatCompact, formatNumber, bigintFromString } from '../utils/format';
import './DashboardView.scss';

interface DashboardViewProps {
  config: PaymentConfig | null;
  balance: BalanceData | null;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
}

const EMPTY_CHANNELS: BuyerUsageChannelPoint[] = [];
const ANTS_DECIMALS = 18;

function formatUsd(value: string | null | undefined): string {
  const n = Number(value ?? 0);
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safeWei(value: string): bigint {
  try { return BigInt(value); } catch { return 0n; }
}

function formatAnts(value: bigint): string {
  if (value === 0n) return '0';
  const n = Number(formatUnits(value, ANTS_DECIMALS));
  if (n > 0 && n < 0.0001) return '< 0.0001';
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export function DashboardView({ config, balance, onOpenDeposit, onOpenWithdraw }: DashboardViewProps) {
  const [buyerUsage, setBuyerUsage] = useState<BuyerUsageTotals | null>(null);
  const [buyerUsageError, setBuyerUsageError] = useState(false);
  const [claimableAnts, setClaimableAnts] = useState<bigint>(0n);

  useEffect(() => {
    let cancelled = false;
    getBuyerUsage()
      .then((totals) => {
        if (cancelled) return;
        setBuyerUsage(totals);
        setBuyerUsageError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setBuyerUsageError(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!config?.evmAddress) {
      setClaimableAnts(0n);
      return;
    }
    let cancelled = false;
    getEmissionsPending(config.evmAddress)
      .then((pending) => {
        if (cancelled) return;
        const total = pending.rows.reduce((sum, row) => {
          if (row.isCurrent) return sum;
          return sum + safeWei(row.seller.amount) + safeWei(row.buyer.amount);
        }, 0n);
        setClaimableAnts(total);
      })
      .catch(() => {
        if (!cancelled) setClaimableAnts(0n);
      });
    return () => { cancelled = true; };
  }, [config?.evmAddress]);

  const total = Number(balance?.total ?? 0);
  const available = formatUsd(balance?.available);
  const reserved = formatUsd(balance?.reserved);
  const personalTokens = useMemo(
    () => bigintFromString(buyerUsage?.totalInputTokens) + bigintFromString(buyerUsage?.totalOutputTokens),
    [buyerUsage?.totalInputTokens, buyerUsage?.totalOutputTokens],
  );
  const usageChannels = useMemo(
    () => (buyerUsage?.channels ?? EMPTY_CHANNELS).filter((channel) => (channel.updatedAt || channel.reservedAt) > 1_000_000_000_000),
    [buyerUsage?.channels],
  );

  return (
    <div className="portal-overview">
      <section className="portal-section-head">
        <h1>Overview</h1>
        <p>Your AntSeed account at a glance</p>
      </section>

      {buyerUsageError && (
        <div className="portal-inline-warning">
          <span aria-hidden="true" />
          Couldn&apos;t refresh — showing last known data
        </div>
      )}

      <section className="overview-balance">
        <div className="overview-balance-main">
          <div className="portal-kicker">Available balance</div>
          <div className="overview-balance-value">
            ${formatUsd(balance?.total)}
            <span>USDC</span>
          </div>
          <p>
            ${available} available · ${reserved} in {buyerUsage?.activeChannels ?? 0} active channels ·{' '}
            <button type="button" onClick={onOpenWithdraw}>details</button>
          </p>
          <div className="overview-actions">
            <button type="button" className="portal-primary-btn" onClick={onOpenDeposit}>+ Add funds</button>
            <button type="button" className="portal-secondary-btn" onClick={onOpenWithdraw}>Withdraw</button>
          </div>
        </div>

        <div className="overview-reward-card">
          <div className="portal-kicker">Claimable rewards</div>
          <div className="overview-reward-value">
            <span className="overview-reward-line" />
            {formatAnts(claimableAnts)} $ANTS
          </div>
          <p>emissions + DIEM</p>
          <button type="button" className="portal-primary-btn" disabled={claimableAnts === 0n}>Claim all</button>
        </div>
      </section>

      <section className="overview-stat-row" aria-label="Usage totals">
        <div>
          <div className="portal-kicker">Requests (all-time)</div>
          <strong>{formatNumber(buyerUsage?.totalRequests ?? 0)}</strong>
        </div>
        <div>
          <div className="portal-kicker">Tokens (all-time)</div>
          <strong>{formatCompact(personalTokens)}</strong>
        </div>
        <div>
          <div className="portal-kicker">Sellers used</div>
          <strong>{formatNumber(buyerUsage?.uniqueSellers ?? 0)}</strong>
        </div>
        <div>
          <div className="portal-kicker">Active channels</div>
          <strong>{formatNumber(buyerUsage?.activeChannels ?? 0)}</strong>
        </div>
      </section>

      <section className="overview-lower-grid">
        <div>
          <div className="portal-kicker">Usage · last 14 days</div>
          {total === 0 || usageChannels.length === 0 ? (
            <div className="overview-empty-chart">No usage yet — start sending requests to see your activity here.</div>
          ) : (
            <UsageChart channels={usageChannels} />
          )}
        </div>
        <div className="overview-recent">
          <div className="overview-recent-head">
            <div className="portal-kicker">Recent activity</div>
            <button type="button">View all →</button>
          </div>
          <p>No activity yet.</p>
        </div>
      </section>
    </div>
  );
}
