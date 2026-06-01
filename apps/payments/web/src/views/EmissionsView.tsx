import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { formatUnits, parseAbi } from 'viem';
import type { PaymentConfig } from '../types';
import {
  getEmissionsInfo,
  getEmissionsPending,
  getEmissionsShares,
  getTransfersEnabled,
  type EmissionsEpochInfo,
  type EmissionsEpochParams,
  type EmissionsPendingResponse,
  type EmissionsShares,
} from '../api';
import { EMISSIONS_CLAIM_ABI } from '../emissions-abi';
import { getErrorMessage, usePaymentNetwork } from '../payment-network';
import { useAuthorizedWallet } from '../context/AuthorizedWalletContext';

interface EmissionsViewProps {
  config: PaymentConfig | null;
}

const ANTS_DECIMALS = 18;

function safeBigint(value: string): bigint {
  try { return BigInt(value); } catch { return 0n; }
}

function formatAnts(amountWei: string | bigint): string {
  const amount = typeof amountWei === 'bigint' ? amountWei : safeBigint(amountWei);
  if (amount === 0n) return '0';
  const n = Number(formatUnits(amount, ANTS_DECIMALS));
  if (n > 0 && n < 0.0001) return '< 0.0001';
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function getEffectiveParams(
  row: EmissionsPendingResponse['rows'][number] | undefined,
  fallback: EmissionsShares | null,
): EmissionsEpochParams | null {
  if (row?.params?.initialized) return row.params;
  return fallback ?? row?.params ?? null;
}

function estimateSideReward(
  epochEmission: string,
  sharePct: number,
  maxSharePct: number,
  userPoints: string,
  totalPoints: string,
): bigint {
  const emission = safeBigint(epochEmission);
  const user = safeBigint(userPoints);
  const total = safeBigint(totalPoints);
  if (emission === 0n || user === 0n || total === 0n) return 0n;
  const bucket = emission * BigInt(Math.round(sharePct * 100)) / 10000n;
  const reward = bucket * user / total;
  const maxReward = bucket * BigInt(Math.round(maxSharePct * 100)) / 10000n;
  return reward > maxReward ? maxReward : reward;
}

function estimateRowReward(
  row: EmissionsPendingResponse['rows'][number],
  shares: EmissionsShares | null,
): bigint {
  const params = getEffectiveParams(row, shares);
  if (!params) return 0n;
  return (
    estimateSideReward(row.epochEmission, params.sellerSharePct, params.maxSellerSharePct, row.seller.userPoints, row.seller.totalPoints) +
    estimateSideReward(row.epochEmission, params.buyerSharePct, params.maxBuyerSharePct, row.buyer.userPoints, row.buyer.totalPoints)
  );
}

function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'closes now';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `closes in ${days}d ${hours}h`;
  return `closes in ${hours}h`;
}

export function EmissionsView({ config }: EmissionsViewProps) {
  const [info, setInfo] = useState<EmissionsEpochInfo | null>(null);
  const [pending, setPending] = useState<EmissionsPendingResponse | null>(null);
  const [shares, setShares] = useState<EmissionsShares | null>(null);
  const [transfersEnabled, setTransfersEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const buyerAddress = config?.evmAddress ?? null;
  const { expectedChainId, ensureCorrectNetwork } = usePaymentNetwork(config);
  const { requireAuthorization } = useAuthorizedWallet();

  const load = useCallback(async () => {
    if (!buyerAddress) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [infoRes, pendingRes, sharesRes, transferRes] = await Promise.all([
        getEmissionsInfo().catch(() => null),
        getEmissionsPending(buyerAddress).catch(() => null),
        getEmissionsShares().catch(() => null),
        getTransfersEnabled().catch(() => ({ enabled: false, configured: false })),
      ]);
      setInfo(infoRes);
      setPending(pendingRes);
      setShares(sharesRes);
      setTransfersEnabled(transferRes.enabled);
      if (!infoRes) setLoadError('Emissions are not available on this chain.');
    } finally {
      setLoading(false);
    }
  }, [buyerAddress]);

  useEffect(() => { void load(); }, [load]);

  const {
    writeContract: writeSellerClaim,
    data: sellerClaimTx,
    reset: resetSellerClaim,
  } = useWriteContract();
  const { isSuccess: sellerClaimConfirmed } = useWaitForTransactionReceipt({
    hash: sellerClaimTx,
    chainId: expectedChainId,
  });

  const {
    writeContract: writeBuyerClaim,
    data: buyerClaimTx,
    reset: resetBuyerClaim,
  } = useWriteContract();
  const { isSuccess: buyerClaimConfirmed } = useWaitForTransactionReceipt({
    hash: buyerClaimTx,
    chainId: expectedChainId,
  });

  useEffect(() => {
    if (sellerClaimConfirmed || buyerClaimConfirmed) {
      resetSellerClaim();
      resetBuyerClaim();
      void load();
    }
  }, [sellerClaimConfirmed, buyerClaimConfirmed, resetSellerClaim, resetBuyerClaim, load]);

  const claimable = useMemo(() => {
    let total = 0n;
    for (const row of pending?.rows ?? []) {
      if (row.isCurrent) continue;
      if (!row.seller.claimed) total += safeBigint(row.seller.amount);
      if (!row.buyer.claimed) total += safeBigint(row.buyer.amount);
    }
    return total;
  }, [pending?.rows]);

  const totalEarned = useMemo(() => (
    (pending?.rows ?? []).reduce((sum, row) => sum + (row.isCurrent ? estimateRowReward(row, shares) : safeBigint(row.seller.amount) + safeBigint(row.buyer.amount)), 0n)
  ), [pending?.rows, shares]);

  const currentRow = pending?.rows.find((row) => row.isCurrent);
  const currentShare = currentRow ? estimateRowReward(currentRow, shares) : 0n;
  const rows = pending?.rows ?? [];
  const now = Math.floor(Date.now() / 1000);
  const epochEnd = info ? info.genesis + (info.currentEpoch + 1) * info.epochDuration : now;

  const handleClaimAll = useCallback(() => {
    if (!config?.emissionsContractAddress || !pending || !buyerAddress) return;
    const sellerEpochs = pending.rows
      .filter((row) => !row.isCurrent && !row.seller.claimed && row.seller.amount !== '0')
      .map((row) => BigInt(row.epoch));
    const buyerEpochs = pending.rows
      .filter((row) => !row.isCurrent && !row.buyer.claimed && row.buyer.amount !== '0')
      .map((row) => BigInt(row.epoch));
    if (sellerEpochs.length === 0 && buyerEpochs.length === 0) return;

    requireAuthorization(async () => {
      setClaimError(null);
      try {
        await ensureCorrectNetwork();
        if (sellerEpochs.length > 0) {
          writeSellerClaim({
            address: config.emissionsContractAddress as `0x${string}`,
            abi: parseAbi(EMISSIONS_CLAIM_ABI),
            functionName: 'claimSellerEmissions',
            chainId: expectedChainId,
            args: [sellerEpochs],
          }, { onError: (err) => setClaimError(getErrorMessage(err)) });
        }
        if (buyerEpochs.length > 0) {
          writeBuyerClaim({
            address: config.emissionsContractAddress as `0x${string}`,
            abi: parseAbi(EMISSIONS_CLAIM_ABI),
            functionName: 'claimBuyerEmissions',
            chainId: expectedChainId,
            args: [buyerAddress as `0x${string}`, buyerEpochs],
          }, { onError: (err) => setClaimError(getErrorMessage(err)) });
        }
      } catch (err) {
        setClaimError(getErrorMessage(err));
      }
    });
  }, [buyerAddress, config?.emissionsContractAddress, ensureCorrectNetwork, expectedChainId, pending, requireAuthorization, writeBuyerClaim, writeSellerClaim]);

  if (loading && !info) {
    return <div className="rewards-view"><div className="overview-empty-desc">Loading rewards…</div></div>;
  }

  if (loadError || !info) {
    return (
      <div className="rewards-view">
        <section className="portal-section-head">
          <h1>Rewards</h1>
          <p>$ANTS earned from network usage and DIEM staking</p>
        </section>
        <div className="overview-empty">
          <div className="overview-empty-title">Rewards unavailable</div>
          <div className="overview-empty-desc">{loadError ?? 'The emissions contract is not configured for this chain.'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rewards-view">
      <section className="portal-section-head">
        <h1>Rewards</h1>
        <p>$ANTS earned from network usage and DIEM staking</p>
      </section>

      <section className="rewards-claim-row">
        <div>
          <div className="portal-kicker">Claimable now</div>
          <div className="rewards-claim-value">
            {formatAnts(claimable)}
            <span>$ANTS</span>
          </div>
          <p>{rows.length} emissions</p>
        </div>
        <button type="button" className="portal-primary-btn" disabled={claimable === 0n} onClick={handleClaimAll}>Claim all</button>
      </section>

      <section className="rewards-growth">
        <div className="rewards-growth-head">
          <div className="portal-kicker">Reward growth · per epoch</div>
          <p>Total earned to date <strong>{formatAnts(totalEarned)} $ANTS</strong></p>
        </div>
        <div className="rewards-bars" aria-hidden="true">
          {rows.filter((row) => !row.isCurrent).slice(-3).map((row, index) => (
            <span key={row.epoch} style={{ flexGrow: index + 1 }} />
          ))}
          <span className="rewards-bars-current" />
        </div>
      </section>

      <section className="rewards-epoch-row">
        <div>
          <div className="portal-kicker">Current epoch</div>
          <strong>#{info.currentEpoch}</strong>
          <p>{formatTimeRemaining(epochEnd - now)}</p>
        </div>
        <div>
          <div className="portal-kicker">Earned so far</div>
          <strong>~{formatAnts(currentShare)} $ANTS</strong>
        </div>
        <div>
          <div className="portal-kicker">Your share</div>
          <strong>{currentShare > 0n ? 'active' : '—'}</strong>
          <p>of pool</p>
        </div>
      </section>

      <section className="rewards-history">
        <div className="portal-kicker">Epoch history</div>
        {rows.filter((row) => !row.isCurrent).length === 0 ? (
          <p>No closed epochs yet.</p>
        ) : (
          rows.filter((row) => !row.isCurrent).slice().reverse().map((row) => (
            <div className="rewards-history-row" key={row.epoch}>
              <span>Epoch {row.epoch}</span>
              <strong>{formatAnts(safeBigint(row.seller.amount) + safeBigint(row.buyer.amount))} $ANTS</strong>
            </div>
          ))
        )}
      </section>

      <section className="rewards-diem">
        <div className="portal-kicker">DIEM staking</div>
        <p>Connect the wallet you used on the DIEM staking portal to view and claim $ANTS.</p>
        <ConnectButton />
      </section>

      {claimError && <div className="status-msg status-error">{claimError}</div>}
      {transfersEnabled === false && (
        <div className="portal-inline-warning">
          <span aria-hidden="true" />
          ANTS transfers are not enabled yet. Claimed tokens remain in your wallet until governance enables transfers.
        </div>
      )}
    </div>
  );
}
