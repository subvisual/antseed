/**
 * Channels drill-down — reached from the Overview balance "details" link.
 * Shows per-seller flat rows with status pill and Close / Waiting / Withdraw actions.
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseAbi } from 'viem';
import type { PaymentConfig } from '../types';
import type { ChannelData } from '../api';
import { CHANNELS_ABI } from '../channels-abi';
import { getErrorMessage, usePaymentNetwork } from '../payment-network';
import { useChannels } from '../hooks/useChannels';
import { useAuthorizedWallet } from '../context/AuthorizedWalletContext';
import './ChannelsView.scss';

interface ChannelsStubViewProps {
  config: PaymentConfig | null;
  onBack: () => void;
}

const GRACE_PERIOD = 900; // 15 minutes in seconds
const PAGE_SIZE = 15;

type RowStatus =
  | 'active'
  | 'closing'
  | 'withdrawable'
  | 'settled'
  | 'timedout'
  | 'closed';

function getRowStatus(ch: ChannelData): RowStatus {
  if (ch.status === 2) return 'settled';
  if (ch.status === 3) return 'timedout';
  if (ch.status === 0) return 'closed';
  if (ch.closeRequestedAt === 0) return 'active';
  const now = Math.floor(Date.now() / 1000);
  return now < ch.closeRequestedAt + GRACE_PERIOD ? 'closing' : 'withdrawable';
}

function formatTimeRemaining(closeRequestedAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remaining = closeRequestedAt + GRACE_PERIOD - now;
  if (remaining <= 0) return '0:00';
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function toMs(ts: number): number {
  return ts > 1e12 ? ts : ts * 1000;
}

function formatDate(ts: number): string {
  if (!ts) return '—';
  return new Date(toMs(ts)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Derive a short display label: peerId (up to 20 chars) or truncated EVM address. */
function displayLabel(ch: ChannelData): string {
  if (ch.peerId && ch.peerId.length > 0) {
    return ch.peerId.length > 20 ? ch.peerId.slice(0, 20) + '…' : ch.peerId;
  }
  return truncateAddress(ch.seller);
}

const STATUS_PILL: Record<RowStatus, { label: string; modifier: string }> = {
  active:       { label: 'Active',       modifier: 'active' },
  closing:      { label: 'Closing',      modifier: 'warn' },
  withdrawable: { label: 'Withdrawable', modifier: '' },
  settled:      { label: 'Settled',      modifier: '' },
  timedout:     { label: 'Timed out',    modifier: '' },
  closed:       { label: 'Closed',       modifier: '' },
};

const parsedAbi = parseAbi(CHANNELS_ABI);

function ChannelRow({
  ch,
  config,
  onRefresh,
}: {
  ch: ChannelData;
  config: PaymentConfig;
  onRefresh: () => void;
}) {
  const status = getRowStatus(ch);
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
          args: [ch.channelId as `0x${string}`],
        });
      } catch (err) {
        setError(getErrorMessage(err));
      }
    });
  }, [config.channelsContractAddress, ensureCorrectNetwork, expectedChainId, ch.channelId, writeRequestClose, requireAuthorization]);

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
          args: [ch.channelId as `0x${string}`],
        });
      } catch (err) {
        setError(getErrorMessage(err));
      }
    });
  }, [config.channelsContractAddress, ensureCorrectNetwork, expectedChainId, ch.channelId, writeWithdraw, requireAuthorization]);

  const pillMeta = STATUS_PILL[status];
  const pillLabel =
    status === 'closing'
      ? `Closing · ${formatTimeRemaining(ch.closeRequestedAt)}`
      : pillMeta.label;

  const sellerLabel = truncateAddress(ch.seller);
  const modelLabel  = displayLabel(ch);
  const whoLabel    = modelLabel !== sellerLabel ? `${modelLabel} · ${sellerLabel}` : sellerLabel;

  const usedMeta =
    status === 'closing'
      ? `closing · grace ends in ${formatTimeRemaining(ch.closeRequestedAt)}`
      : status === 'withdrawable'
      ? 'ready to withdraw'
      : `opened ${formatDate(ch.reservedAt)} · $${parseFloat(ch.settled).toFixed(2)} used`;

  return (
    <div className="channels-drill-row">
      <div className="channels-drill-info">
        <div className="channels-drill-who" title={ch.seller}>{whoLabel}</div>
        <div className="channels-drill-meta">{usedMeta}</div>
      </div>

      <span className="channels-drill-reserved">
        ${parseFloat(ch.deposit).toFixed(2)} reserved
      </span>

      <span className="channels-drill-pill-col">
        <span className={`portal-pill${pillMeta.modifier ? ` ${pillMeta.modifier}` : ''}`}>
          {pillLabel}
        </span>
      </span>

      <div className="channels-drill-action">
        {closeConfirmed || withdrawConfirmed ? (
          <button className="btn ghost sm" onClick={onRefresh}>Refresh</button>
        ) : status === 'active' ? (
          <button className="btn ghost sm" onClick={handleRequestClose}>Close</button>
        ) : status === 'closing' ? (
          <button className="btn ghost sm" disabled>Waiting…</button>
        ) : status === 'withdrawable' ? (
          <button className="btn primary sm" onClick={handleWithdraw}>Withdraw</button>
        ) : (
          <span />
        )}
        {error && <div className="channels-drill-error">{error}</div>}
      </div>
    </div>
  );
}

export function ChannelsStubView({ config, onBack }: ChannelsStubViewProps) {
  const { channels, history, loading, refetch } = useChannels(config);
  const [page, setPage] = useState(0);

  const fetchData = useCallback(async () => { await refetch(); }, [refetch]);

  // Active channels first, then history
  const allChannels = useMemo(() => [...channels, ...history], [channels, history]);

  const reserved = useMemo(
    () => channels.reduce((a, c) => a + (parseFloat(c.deposit) || 0), 0),
    [channels],
  );

  const pageCount = Math.max(1, Math.ceil(allChannels.length / PAGE_SIZE));
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

  const pageRows = useMemo(
    () => allChannels.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [allChannels, page],
  );

  const subtitle = channels.length > 0
    ? `$${reserved.toFixed(2)} reserved across ${channels.length} active channel${channels.length !== 1 ? 's' : ''} · funds committed to sellers, reclaimable by closing`
    : 'Funds committed to sellers, reclaimable by closing';

  return (
    <div className="channels-drill">
      <button type="button" className="channels-drill-back" onClick={onBack}>
        ← Balance
      </button>

      <div className="channels-drill-h1">Active channels</div>
      <div className="channels-drill-sub">{subtitle}</div>

      {loading && allChannels.length === 0 ? (
        <div className="channels-drill-empty">Loading channels…</div>
      ) : allChannels.length === 0 ? (
        <div className="channels-drill-empty">No channels yet.</div>
      ) : (
        <>
          <div className="channels-drill-list">
            {pageRows.map((ch) =>
              config ? (
                <ChannelRow key={ch.channelId} ch={ch} config={config} onRefresh={fetchData} />
              ) : null,
            )}
          </div>

          {pageCount > 1 && (
            <div className="channels-drill-pagination">
              <button
                type="button"
                className="channels-drill-pagination-btn"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                aria-label="Previous page"
              >
                ← Prev
              </button>
              <span className="channels-drill-pagination-info">
                Page <strong>{page + 1}</strong> of {pageCount}
              </span>
              <button
                type="button"
                className="channels-drill-pagination-btn"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                aria-label="Next page"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
