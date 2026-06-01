import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseAbi } from 'viem';
import type { PaymentConfig } from '../types';
import type { ChannelData } from '../api';
import { CHANNELS_ABI } from '../channels-abi';
import { getErrorMessage, usePaymentNetwork } from '../payment-network';
import { useChannels } from '../hooks/useChannels';
import { useAuthorizedWallet } from '../context/AuthorizedWalletContext';
import { Button } from './Button';
import './ChannelsView.scss';

interface ChannelsViewProps {
  config: PaymentConfig | null;
}

const GRACE_PERIOD = 900; // 15 minutes in seconds
const PAGE_SIZE = 10;
type ActivityFilter = 'all' | 'settlements' | 'closes';

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

type RowStatus =
  | 'active'
  | 'closing'
  | 'withdrawable'
  | 'settled'
  | 'timedout'
  | 'closed';

function getRowStatus(session: ChannelData): RowStatus {
  if (session.status === 2) return 'settled';
  if (session.status === 3) return 'timedout';
  if (session.status === 0) return 'closed';
  if (session.closeRequestedAt === 0) return 'active';
  const now = Math.floor(Date.now() / 1000);
  if (now < session.closeRequestedAt + GRACE_PERIOD) return 'closing';
  return 'withdrawable';
}

const STATUS_META: Record<RowStatus, { label: string; modifier: string }> = {
  active:       { label: 'Active',       modifier: 'status-pill--active' },
  closing:      { label: 'Closing',      modifier: 'status-pill--closing' },
  withdrawable: { label: 'Withdrawable', modifier: 'status-pill--withdrawable' },
  settled:      { label: 'Settled',      modifier: 'status-pill--muted' },
  timedout:     { label: 'Timed out',    modifier: 'status-pill--muted' },
  closed:       { label: 'Closed',       modifier: 'status-pill--muted' },
};

function matchesFilter(session: ChannelData, filter: ActivityFilter): boolean {
  if (filter === 'all') return true;
  const status = getRowStatus(session);
  if (filter === 'settlements') return status === 'settled';
  return status === 'closing' || status === 'withdrawable' || status === 'closed' || status === 'timedout';
}

function getEmptyMessage(filter: ActivityFilter): string {
  if (filter === 'settlements') return 'No settlements match this filter.';
  if (filter === 'closes') return 'No channel closes match this filter.';
  return 'No activity yet. Complete a request to see settlements here.';
}

function formatTimeRemaining(closeRequestedAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remaining = closeRequestedAt + GRACE_PERIOD - now;
  if (remaining <= 0) return '0:00';
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Accepts either seconds (on-chain style) or milliseconds (Date.now()) — the
// channel store mixes units because `deadline` is a block timestamp (seconds)
// while `reservedAt` is wall-clock ms. Values ≥ 1e12 are treated as ms.
function toMs(ts: number): number {
  return ts > 1e12 ? ts : ts * 1000;
}

function formatDate(ts: number): string {
  if (!ts) return '—';
  return new Date(toMs(ts)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const parsedAbi = parseAbi(CHANNELS_ABI);

function ChannelRow({
  session,
  config,
  onRefresh,
}: {
  session: ChannelData;
  config: PaymentConfig;
  onRefresh: () => void;
}) {
  const status = getRowStatus(session);
  const { expectedChainId, ensureCorrectNetwork } = usePaymentNetwork(config);
  const { requireAuthorization } = useAuthorizedWallet();
  const [error, setError] = useState<string | null>(null);

  const { writeContract: writeRequestClose, data: closeTxHash } = useWriteContract();
  const { isSuccess: closeConfirmed } = useWaitForTransactionReceipt({
    hash: closeTxHash,
    chainId: expectedChainId,
  });

  const { writeContract: writeWithdraw, data: withdrawTxHash } = useWriteContract();
  const { isSuccess: withdrawConfirmed } = useWaitForTransactionReceipt({
    hash: withdrawTxHash,
    chainId: expectedChainId,
  });

  const handleRequestClose = useCallback(() => {
    requireAuthorization(async () => {
      setError(null);
      try {
        await ensureCorrectNetwork();
        writeRequestClose({
          address: config.channelsContractAddress as `0x${string}`,
          abi: parsedAbi,
          functionName: 'requestClose',
          chainId: expectedChainId,
          args: [session.channelId as `0x${string}`],
        });
      } catch (err) {
        setError(getErrorMessage(err));
      }
    });
  }, [config.channelsContractAddress, ensureCorrectNetwork, expectedChainId, session.channelId, writeRequestClose, requireAuthorization]);

  const handleWithdraw = useCallback(() => {
    requireAuthorization(async () => {
      setError(null);
      try {
        await ensureCorrectNetwork();
        writeWithdraw({
          address: config.channelsContractAddress as `0x${string}`,
          abi: parsedAbi,
          functionName: 'withdraw',
          chainId: expectedChainId,
          args: [session.channelId as `0x${string}`],
        });
      } catch (err) {
        setError(getErrorMessage(err));
      }
    });
  }, [config.channelsContractAddress, ensureCorrectNetwork, expectedChainId, session.channelId, writeWithdraw, requireAuthorization]);

  const meta = STATUS_META[status];
  const pillLabel = status === 'closing'
    ? `Closing ${formatTimeRemaining(session.closeRequestedAt)}`
    : meta.label;

  return (
    <tr>
      <td className="channels-table-cell-seller" title={session.seller}>
        {truncateAddress(session.seller)}
      </td>
      <td className="channels-table-cell-id" title={session.channelId}>
        {session.channelId.slice(0, 10)}…
      </td>
      <td>
        <span className={`status-pill ${meta.modifier}`}>{pillLabel}</span>
      </td>
      <td className="channels-table-num">${session.deposit}</td>
      <td className="channels-table-num">${session.settled}</td>
      <td className="channels-table-date" title={formatDate(session.reservedAt)}>
        {formatDate(session.reservedAt)}
      </td>
      <td className="channels-table-action">
        {closeConfirmed || withdrawConfirmed ? (
          <button className="btn-link" onClick={onRefresh}>Refresh</button>
        ) : status === 'active' ? (
          <Button size="sm" variant="outline" onClick={handleRequestClose}>Close</Button>
        ) : status === 'closing' ? (
          <Button size="sm" variant="outline" disabled>Waiting…</Button>
        ) : status === 'withdrawable' ? (
          <Button size="sm" onClick={handleWithdraw}>Withdraw</Button>
        ) : (
          <span className="channels-table-dash">—</span>
        )}
        {error && <div className="channels-table-error">{error}</div>}
      </td>
    </tr>
  );
}

export function ChannelsView({ config }: ChannelsViewProps) {
  const { channels, history, loading, refetch } = useChannels(config);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<ActivityFilter>('all');

  const fetchData = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Active first, then history — keeps actionable rows on page one.
  const allChannels = useMemo(() => [...channels, ...history], [channels, history]);
  const filteredChannels = useMemo(
    () => allChannels.filter((session) => matchesFilter(session, filter)),
    [allChannels, filter],
  );

  const handleFilterChange = useCallback((nextFilter: ActivityFilter) => {
    setFilter(nextFilter);
    setPage(0);
  }, []);

  const pageCount = Math.max(1, Math.ceil(filteredChannels.length / PAGE_SIZE));
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

  const pageRows = useMemo(
    () => filteredChannels.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filteredChannels, page],
  );
  const activitySummary = allChannels.length === filteredChannels.length
    ? `${allChannels.length} entries`
    : `${filteredChannels.length} of ${allChannels.length} entries`;

  return (
    <div className="activity-view">
      <section className="portal-section-head">
        <h1>Activity</h1>
        <p>Settlements and channel closes</p>
      </section>

      <div className="activity-toolbar">
        <div className="activity-filter-group" role="group" aria-label="Activity filter">
          <button type="button" className={filter === 'all' ? 'is-active' : ''} onClick={() => handleFilterChange('all')}>All</button>
          <button type="button" className={filter === 'settlements' ? 'is-active' : ''} onClick={() => handleFilterChange('settlements')}>Settlements</button>
          <button type="button" className={filter === 'closes' ? 'is-active' : ''} onClick={() => handleFilterChange('closes')}>Channel closes</button>
        </div>
        <div className="activity-window">{activitySummary}</div>
      </div>

      {loading && allChannels.length === 0 ? (
        <div className="activity-empty">Loading activity…</div>
      ) : filteredChannels.length === 0 ? (
        <div className="activity-empty">{getEmptyMessage(filter)}</div>
      ) : (
        <div className="activity-table-card">
          <div className="channels-table-wrap">
            <table className="channels-table">
              <thead>
                <tr>
                  <th>Seller</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th className="channels-table-num">Reserved</th>
                  <th className="channels-table-num">Used</th>
                  <th>Opened</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((session) => (
                  config ? (
                    <ChannelRow
                      key={session.channelId}
                      session={session}
                      config={config}
                      onRefresh={fetchData}
                    />
                  ) : null
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="channels-pagination">
              <button
                type="button"
                className="channels-pagination-btn"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                aria-label="Previous page"
              >
                <span aria-hidden="true">←</span>
                <span>Prev</span>
              </button>
              <span className="channels-pagination-info">
                Page <strong>{page + 1}</strong> of {pageCount}
              </span>
              <button
                type="button"
                className="channels-pagination-btn"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                aria-label="Next page"
              >
                <span>Next</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
