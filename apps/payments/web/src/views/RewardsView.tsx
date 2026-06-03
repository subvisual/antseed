/**
 * Rewards view — merges Emissions + DIEM staking into one page.
 *
 * Layout (matches prototype):
 *   1. Claimable total hero + "Claim all" button tightly grouped
 *   2. Breakdown: emissions + DIEM
 *   3. Reward-growth bar chart per epoch
 *   4. Current-epoch summary (closes-in, earned-so-far, pool-share)
 *   5. Epoch history list with claimable / claimed pills
 *   6. Claim-confirm sheet (modal overlay)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  usePublicClient,
} from 'wagmi';
import { parseAbi, formatUnits } from 'viem';
import type { PaymentConfig } from '../types';
import {
  getEmissionsInfo,
  getEmissionsPending,
  getEmissionsShares,
  getTransfersEnabled,
  type EmissionsEpochInfo,
  type EmissionsPendingResponse,
  type EmissionsShares as SharesType,
} from '../api';
import { EMISSIONS_CLAIM_ABI } from '../emissions-abi';
import { DIEM_STAKING_PROXY_ABI, DIEM_STAKING_PROXY_ADDRESS } from '../diem-proxy-abi';
import { getErrorMessage, usePaymentNetwork } from '../payment-network';
import { useAuthorizedWallet } from '../context/AuthorizedWalletContext';
import { getExplorerTxUrl } from '../utils/txLink';
import './RewardsView.scss';

// ─── Constants ────────────────────────────────────────────────────────────────

const ANTS_DECIMALS = 18;
const MAX_DIEM_EPOCHS = 16;
const DIEM_PROXY_ABI_PARSED = parseAbi(DIEM_STAKING_PROXY_ABI);

// ─── Utility helpers ──────────────────────────────────────────────────────────

function safeBigint(s: string): bigint {
  try { return BigInt(s); } catch { return 0n; }
}

function addWei(a: string, b: string): string {
  try { return (BigInt(a) + BigInt(b)).toString(); } catch { return '0'; }
}

function formatAnts(amountWei: string | bigint): string {
  try {
    const raw = typeof amountWei === 'bigint' ? amountWei : BigInt(amountWei);
    const n = parseFloat(formatUnits(raw, ANTS_DECIMALS));
    if (n === 0) return '0';
    if (n < 0.0001) return '< 0.0001';
    return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  } catch {
    return '0';
  }
}

function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'ending now';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function estimateSideReward(
  epochEmission: string,
  sharePct: number,
  userPts: string,
  totalPts: string,
): bigint {
  const emission = safeBigint(epochEmission);
  const user = safeBigint(userPts);
  const total = safeBigint(totalPts);
  if (total === 0n) return 0n;
  return emission * BigInt(Math.round(sharePct * 100)) * user / (10000n * total);
}

function estimateRowReward(
  row: EmissionsPendingResponse['rows'][number],
  epochEmission: string,
  shares: SharesType,
): string {
  const emission = safeBigint(epochEmission);
  const userSP = safeBigint(row.seller.userPoints);
  const totalSP = safeBigint(row.seller.totalPoints);
  const userBP = safeBigint(row.buyer.userPoints);
  const totalBP = safeBigint(row.buyer.totalPoints);
  let est = 0n;
  if (totalSP > 0n) {
    est += emission * BigInt(Math.round(shares.sellerSharePct * 100)) * userSP / (10000n * totalSP);
  }
  if (totalBP > 0n) {
    est += emission * BigInt(Math.round(shares.buyerSharePct * 100)) * userBP / (10000n * totalBP);
  }
  return est.toString();
}

function computeEpochShare(
  row: EmissionsPendingResponse['rows'][number] | undefined,
  shares: SharesType,
): number {
  if (!row) return 0;
  const userSP = safeBigint(row.seller.userPoints);
  const totalSP = safeBigint(row.seller.totalPoints);
  const userBP = safeBigint(row.buyer.userPoints);
  const totalBP = safeBigint(row.buyer.totalPoints);
  let pct = 0;
  if (totalSP > 0n) pct += shares.sellerSharePct * Number((userSP * 10000n) / totalSP) / 10000;
  if (totalBP > 0n) pct += shares.buyerSharePct * Number((userBP * 10000n) / totalBP) / 10000;
  return pct;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function asBigint(value: unknown): bigint {
  return typeof value === 'bigint' ? value : 0n;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface DiemRewardRow {
  epoch: number;
  amount: bigint;
  claimed: boolean;
}

interface DiemSnapshot {
  firstRewardEpoch: number;
  finalizedRewardEpoch: number;
  syncedRewardEpoch: number;
  userLastClaimedEpoch: number;
  rows: DiemRewardRow[];
  hasMore: boolean;
}

// ─── Sub-component: Epoch growth chart ────────────────────────────────────────

interface EpochBar {
  epoch: number;
  ants: bigint;
  isCurrent: boolean;
  isPeak: boolean;
}

function EpochChart({ bars }: { bars: EpochBar[] }) {
  const [tooltip, setTooltip] = useState<number | null>(null);
  if (bars.length === 0) return null;

  const maxAnts = bars.reduce((m, b) => b.ants > m ? b.ants : m, 0n);

  return (
    <div className="rewards-chart-wrap">
      <div className="rewards-chart">
        {bars.map((bar) => {
          const pct = maxAnts > 0n ? Number((bar.ants * 100n) / maxAnts) : 0;
          // in-progress bar is at least 5% tall if there's any activity
          const heightPct = bar.isCurrent ? Math.max(pct, bar.ants > 0n ? 5 : 0) : pct;
          return (
            <div
              key={bar.epoch}
              className="rewards-chart-col"
              onMouseEnter={() => setTooltip(bar.epoch)}
              onMouseLeave={() => setTooltip(null)}
            >
              <div className="rewards-chart-bar-wrap">
                {tooltip === bar.epoch && (
                  <div className="rewards-chart-tip">
                    <span className="rewards-chart-tip-epoch">Epoch #{bar.epoch}</span>
                    <span className="rewards-chart-tip-val acc">{formatAnts(bar.ants)} <span>ANTS</span></span>
                    {bar.isCurrent && <span className="rewards-chart-tip-note">In progress</span>}
                  </div>
                )}
                <div
                  className={[
                    'rewards-chart-bar',
                    bar.isPeak && !bar.isCurrent ? 'rewards-chart-bar--peak' : '',
                    bar.isCurrent ? 'rewards-chart-bar--current' : '',
                  ].filter(Boolean).join(' ')}
                  style={{ height: `${Math.max(heightPct, 2)}%` }}
                />
              </div>
              <div className="rewards-chart-ep">
                {bar.isCurrent ? `${bar.epoch}·now` : String(bar.epoch)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Sub-component: Claim confirm sheet ───────────────────────────────────────

interface ClaimSheetProps {
  totalEmissions: bigint;
  totalDiem: bigint;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
  errorDetail: string | null;
  errorOpen: boolean;
  onToggleErrorDetail: () => void;
}

function ClaimSheet({
  totalEmissions,
  totalDiem,
  onConfirm,
  onCancel,
  isSubmitting,
  error,
  errorDetail,
  errorOpen,
  onToggleErrorDetail,
}: ClaimSheetProps) {
  const total = totalEmissions + totalDiem;
  return (
    <div className="rewards-sheet-backdrop" onClick={onCancel}>
      <div className="rewards-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rewards-sheet-icon">★</div>
        <h3 className="rewards-sheet-title">Claim {formatAnts(total)} $ANTS</h3>
        <p className="rewards-sheet-desc">
          {totalEmissions > 0n && totalDiem > 0n ? (
            <>{formatAnts(totalEmissions)} emissions + {formatAnts(totalDiem)} DIEM will be sent to your wallet. Confirm in your wallet to continue.</>
          ) : totalEmissions > 0n ? (
            <>{formatAnts(totalEmissions)} ANTS from emissions will be sent to your wallet. Confirm in your wallet.</>
          ) : (
            <>{formatAnts(totalDiem)} ANTS from DIEM staking will be sent to your wallet. Confirm in your wallet.</>
          )}
        </p>
        {error && (
          <div className="rewards-sheet-error dv-error" role="alert">
            <div className="dv-error-summary">
              <span>{error}</span>
              {errorDetail && (
                <button
                  type="button"
                  className="dv-error-toggle"
                  onClick={onToggleErrorDetail}
                  aria-expanded={errorOpen}
                >
                  {errorOpen ? 'Hide detail' : 'Show detail'}
                </button>
              )}
            </div>
            {errorOpen && errorDetail && (
              <div className="dv-error-detail">{errorDetail}</div>
            )}
          </div>
        )}
        <div className="rewards-sheet-actions">
          <button
            className="btn primary"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Claiming…' : 'Confirm claim'}
          </button>
          <button className="btn ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

interface RewardsViewProps {
  config: PaymentConfig | null;
}

export function RewardsView({ config }: RewardsViewProps) {
  // ── Emissions state ──
  const [emissionsInfo, setEmissionsInfo] = useState<EmissionsEpochInfo | null>(null);
  const [emissionsPending, setEmissionsPending] = useState<EmissionsPendingResponse | null>(null);
  const [shares, setShares] = useState<SharesType | null>(null);
  const [transfersEnabled, setTransfersEnabled] = useState<boolean | null>(null);
  const [emissionsLoading, setEmissionsLoading] = useState(true);
  const [emissionsError, setEmissionsError] = useState<string | null>(null);

  // ── DIEM state ──
  const [diemSnapshot, setDiemSnapshot] = useState<DiemSnapshot | null>(null);
  const [diemLoading, setDiemLoading] = useState(true);

  // ── UI state ──
  const [showClaimSheet, setShowClaimSheet] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimErrorDetail, setClaimErrorDetail] = useState<string | null>(null);
  const [claimErrorOpen, setClaimErrorOpen] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [claimedTxHash, setClaimedTxHash] = useState<string | null>(null);

  const buyerAddress = config?.evmAddress ?? null;
  const { expectedChainId, ensureCorrectNetwork } = usePaymentNetwork(config);
  const { requireAuthorization } = useAuthorizedWallet();
  const { address: walletAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();

  // ── Load emissions ──
  const loadEmissions = useCallback(async () => {
    if (!buyerAddress) {
      setEmissionsLoading(false);
      return;
    }
    setEmissionsLoading(true);
    setEmissionsError(null);
    try {
      const [infoRes, pendingRes, sharesRes, teRes] = await Promise.all([
        getEmissionsInfo().catch(() => null),
        getEmissionsPending(buyerAddress).catch(() => null),
        getEmissionsShares().catch(() => null),
        getTransfersEnabled().catch(() => ({ enabled: false, configured: false })),
      ]);
      setEmissionsInfo(infoRes);
      setEmissionsPending(pendingRes);
      setShares(sharesRes);
      setTransfersEnabled(teRes.enabled);
      if (!infoRes) setEmissionsError('Emissions not available on this chain');
    } finally {
      setEmissionsLoading(false);
    }
  }, [buyerAddress]);

  useEffect(() => { void loadEmissions(); }, [loadEmissions]);

  // ── Load DIEM ──
  const loadDiem = useCallback(async () => {
    if (!isConnected || !walletAddress || !publicClient) {
      setDiemLoading(false);
      return;
    }
    setDiemLoading(true);
    try {
      const [firstRaw, finalizedRaw, syncedRaw, lastClaimedRaw] = await publicClient.multicall({
        allowFailure: true,
        contracts: [
          { address: DIEM_STAKING_PROXY_ADDRESS, abi: DIEM_PROXY_ABI_PARSED, functionName: 'firstRewardEpoch' },
          { address: DIEM_STAKING_PROXY_ADDRESS, abi: DIEM_PROXY_ABI_PARSED, functionName: 'finalizedRewardEpoch' },
          { address: DIEM_STAKING_PROXY_ADDRESS, abi: DIEM_PROXY_ABI_PARSED, functionName: 'syncedRewardEpoch' },
          { address: DIEM_STAKING_PROXY_ADDRESS, abi: DIEM_PROXY_ABI_PARSED, functionName: 'userLastClaimedEpoch', args: [walletAddress] },
        ],
      });

      const firstRewardEpoch = asNumber(firstRaw.result);
      const finalizedRewardEpoch = asNumber(finalizedRaw.result);
      const syncedRewardEpoch = asNumber(syncedRaw.result);
      const userLastClaimedEpoch = asNumber(lastClaimedRaw.result);
      const from = Math.max(userLastClaimedEpoch, firstRewardEpoch);
      const to = Math.min(finalizedRewardEpoch, from + MAX_DIEM_EPOCHS);
      const epochs: number[] = [];
      for (let e = from; e < to; e++) epochs.push(e);

      const rows = epochs.length === 0
        ? []
        : await publicClient.multicall({
            allowFailure: true,
            contracts: epochs.flatMap((epoch) => [
              { address: DIEM_STAKING_PROXY_ADDRESS, abi: DIEM_PROXY_ABI_PARSED, functionName: 'pendingAntsForEpoch', args: [walletAddress, epoch] as const },
              { address: DIEM_STAKING_PROXY_ADDRESS, abi: DIEM_PROXY_ABI_PARSED, functionName: 'userEpochClaimed', args: [walletAddress, epoch] as const },
            ]),
          });

      const diemRows: DiemRewardRow[] = epochs.map((epoch, i) => ({
        epoch,
        amount: asBigint(rows[i * 2]?.result),
        claimed: rows[i * 2 + 1]?.result === true,
      }));

      setDiemSnapshot({
        firstRewardEpoch,
        finalizedRewardEpoch,
        syncedRewardEpoch,
        userLastClaimedEpoch,
        rows: diemRows,
        hasMore: from + MAX_DIEM_EPOCHS < finalizedRewardEpoch,
      });
    } catch {
      // DIEM unavailable — non-fatal, show 0
    } finally {
      setDiemLoading(false);
    }
  }, [isConnected, walletAddress, publicClient]);

  useEffect(() => { void loadDiem(); }, [loadDiem]);

  // ── Derived: claimable amounts ──
  const emissionsRows = emissionsPending?.rows ?? [];

  const totalEmissionsClaimable = useMemo(() => {
    let total = 0n;
    for (const r of emissionsRows) {
      if (r.isCurrent) continue;
      if (!r.seller.claimed) total += safeBigint(r.seller.amount);
      if (!r.buyer.claimed) total += safeBigint(r.buyer.amount);
    }
    return total;
  }, [emissionsRows]);

  const totalEmissionsClaimed = useMemo(() => {
    if (!shares) return 0n;
    let total = 0n;
    for (const r of emissionsRows) {
      if (r.isCurrent) continue;
      const ep = r.epochEmission ?? (emissionsInfo?.epochEmission ?? '0');
      if (r.seller.claimed) {
        total += estimateSideReward(ep, shares.sellerSharePct, r.seller.userPoints, r.seller.totalPoints);
      }
      if (r.buyer.claimed) {
        total += estimateSideReward(ep, shares.buyerSharePct, r.buyer.userPoints, r.buyer.totalPoints);
      }
    }
    return total;
  }, [emissionsRows, shares, emissionsInfo]);

  const diemClaimableEpochs = useMemo(() => (
    diemSnapshot?.rows.filter((r) => !r.claimed).map((r) => r.epoch) ?? []
  ), [diemSnapshot]);

  const totalDiemClaimable = useMemo(() => (
    diemSnapshot?.rows.filter((r) => !r.claimed).reduce((s, r) => s + r.amount, 0n) ?? 0n
  ), [diemSnapshot]);

  const grandTotalClaimable = totalEmissionsClaimable + totalDiemClaimable;
  const totalEarned = totalEmissionsClaimable + totalEmissionsClaimed + totalDiemClaimable;

  // ── Current epoch data ──
  const now = Math.floor(Date.now() / 1000);
  const currentRow = emissionsRows.find((r) => r.isCurrent);
  const currentEstimate = currentRow && emissionsInfo && shares
    ? estimateRowReward(currentRow, emissionsInfo.epochEmission, shares)
    : '0';
  const epochSharePct = shares ? computeEpochShare(currentRow, shares) : 0;
  const epochStart = emissionsInfo
    ? emissionsInfo.genesis + emissionsInfo.currentEpoch * emissionsInfo.epochDuration
    : 0;
  const epochEnd = epochStart + (emissionsInfo?.epochDuration ?? 0);
  const timeRemaining = epochEnd - now;

  // ── Build chart bars ──
  const chartBars = useMemo((): EpochBar[] => {
    if (!emissionsInfo || !shares) return [];
    const rows = [...emissionsRows].reverse().slice(0, 10);
    const bars: EpochBar[] = rows.map((r) => {
      const ep = r.epochEmission ?? emissionsInfo.epochEmission;
      const ants = r.isCurrent
        ? safeBigint(currentEstimate)
        : safeBigint(addWei(r.seller.amount, r.buyer.amount)) > 0n
          ? safeBigint(addWei(r.seller.amount, r.buyer.amount))
          : safeBigint(estimateRowReward(r, ep, shares));
      return { epoch: r.epoch, ants, isCurrent: r.isCurrent, isPeak: false };
    });
    // Mark the highest non-current bar as peak
    let maxVal = 0n;
    for (const b of bars) { if (!b.isCurrent && b.ants > maxVal) maxVal = b.ants; }
    for (const b of bars) { if (!b.isCurrent && b.ants === maxVal && maxVal > 0n) { b.isPeak = true; break; } }
    return bars;
  }, [emissionsRows, emissionsInfo, shares, currentEstimate]);

  // ── Wagmi: emissions seller claim ──
  const {
    writeContract: writeSellerClaim,
    data: sellerClaimTx,
    reset: resetSellerClaim,
    isPending: sellerClaimSubmitting,
  } = useWriteContract();
  const { isSuccess: sellerClaimConfirmed } = useWaitForTransactionReceipt({
    hash: sellerClaimTx,
    chainId: expectedChainId,
  });

  // ── Wagmi: emissions buyer claim ──
  const {
    writeContract: writeBuyerClaim,
    data: buyerClaimTx,
    reset: resetBuyerClaim,
    isPending: buyerClaimSubmitting,
  } = useWriteContract();
  const { isSuccess: buyerClaimConfirmed } = useWaitForTransactionReceipt({
    hash: buyerClaimTx,
    chainId: expectedChainId,
  });

  // ── Wagmi: DIEM claim ──
  const {
    writeContract: writeDiemClaim,
    data: diemClaimTx,
    reset: resetDiemClaim,
    isPending: diemClaimSubmitting,
  } = useWriteContract();
  const { isSuccess: diemClaimConfirmed } = useWaitForTransactionReceipt({
    hash: diemClaimTx,
    chainId: expectedChainId,
  });

  // When any claim confirms, reload data
  useEffect(() => {
    if (sellerClaimConfirmed) { resetSellerClaim(); void loadEmissions(); }
  }, [sellerClaimConfirmed, resetSellerClaim, loadEmissions]);
  useEffect(() => {
    if (buyerClaimConfirmed) { resetBuyerClaim(); void loadEmissions(); }
  }, [buyerClaimConfirmed, resetBuyerClaim, loadEmissions]);
  useEffect(() => {
    if (diemClaimConfirmed) {
      resetDiemClaim();
      setClaimSuccess(true);
      void loadDiem();
    }
  }, [diemClaimConfirmed, resetDiemClaim, loadDiem]);

  const isAnyClaiming = sellerClaimSubmitting || buyerClaimSubmitting || diemClaimSubmitting;

  // ── Claim all handler ──
  const handleClaimAll = useCallback(() => {
    setShowClaimSheet(true);
    setClaimError(null);
    setClaimErrorDetail(null);
    setClaimErrorOpen(false);
    setClaimSuccess(false);
    setClaimedTxHash(null);
  }, []);

  const handleConfirmClaim = useCallback(() => {
    requireAuthorization(async () => {
      setClaimError(null);
      try {
        await ensureCorrectNetwork();
        const sellerEpochs = emissionsRows
          .filter((r) => !r.isCurrent && !r.seller.claimed && r.seller.amount !== '0')
          .map((r) => BigInt(r.epoch));
        const buyerEpochs = emissionsRows
          .filter((r) => !r.isCurrent && !r.buyer.claimed && r.buyer.amount !== '0')
          .map((r) => BigInt(r.epoch));

        let claimed = false;

        if (sellerEpochs.length > 0 && config?.emissionsContractAddress) {
          writeSellerClaim({
            address: config.emissionsContractAddress as `0x${string}`,
            abi: parseAbi(EMISSIONS_CLAIM_ABI),
            functionName: 'claimSellerEmissions',
            chainId: expectedChainId,
            args: [sellerEpochs],
          }, {
            onSuccess: (hash) => setClaimedTxHash(hash),
            onError: (err) => {
              setClaimError('Seller emissions claim failed.');
              setClaimErrorDetail(getErrorMessage(err));
            },
          });
          claimed = true;
        }

        if (buyerEpochs.length > 0 && config?.emissionsContractAddress && buyerAddress) {
          writeBuyerClaim({
            address: config.emissionsContractAddress as `0x${string}`,
            abi: parseAbi(EMISSIONS_CLAIM_ABI),
            functionName: 'claimBuyerEmissions',
            chainId: expectedChainId,
            args: [buyerAddress as `0x${string}`, buyerEpochs],
          }, {
            onSuccess: (hash) => setClaimedTxHash(hash),
            onError: (err) => {
              setClaimError('Buyer emissions claim failed.');
              setClaimErrorDetail(getErrorMessage(err));
            },
          });
          claimed = true;
        }

        if (diemClaimableEpochs.length > 0) {
          writeDiemClaim({
            address: DIEM_STAKING_PROXY_ADDRESS,
            abi: DIEM_PROXY_ABI_PARSED,
            functionName: 'claimAnts',
            chainId: expectedChainId,
            args: [diemClaimableEpochs],
          }, {
            onSuccess: (hash) => setClaimedTxHash(hash),
            onError: (err) => {
              setClaimError('DIEM claim failed.');
              setClaimErrorDetail(getErrorMessage(err));
            },
          });
          claimed = true;
        }

        if (claimed) setShowClaimSheet(false);
      } catch (err) {
        setClaimError(getErrorMessage(err));
      }
    });
  }, [
    requireAuthorization,
    ensureCorrectNetwork,
    config,
    buyerAddress,
    emissionsRows,
    diemClaimableEpochs,
    expectedChainId,
    writeSellerClaim,
    writeBuyerClaim,
    writeDiemClaim,
  ]);

  const hasAnythingToClaimEmissions = emissionsRows.some(
    (r) => !r.isCurrent && (!r.seller.claimed && r.seller.amount !== '0' || !r.buyer.claimed && r.buyer.amount !== '0'),
  );
  const hasAnythingToClaimDiem = diemClaimableEpochs.length > 0;
  const hasAnythingToClaim = hasAnythingToClaimEmissions || hasAnythingToClaimDiem;

  // ── Loading state ──
  const isLoading = (emissionsLoading && !emissionsInfo) || (diemLoading && !diemSnapshot && isConnected);

  // ── Not configured ──
  if (!isLoading && emissionsError && !emissionsInfo) {
    return (
      <div className="rewards-view">
        {/* Page title/subtitle live in the sticky TopBar (layout/TopBar.tsx). */}
        <div className="rewards-empty">
          <div className="rewards-empty-title">Rewards not available</div>
          <div className="rewards-empty-desc">
            {emissionsError ?? 'The emissions contract is not configured for this chain.'}
          </div>
        </div>
      </div>
    );
  }

  // ── Epoch history rows (combine emissions + DIEM, keyed by emissions epoch) ──
  const historyRows = useMemo(() => {
    const rows = emissionsRows
      .filter((r) => !r.isCurrent)
      .slice()
      .reverse()
      .slice(0, 8)
      .map((r) => {
        const ep = r.epochEmission ?? (emissionsInfo?.epochEmission ?? '0');
        const emAmt = addWei(r.seller.amount, r.buyer.amount);
        const sellerDone = r.seller.claimed || r.seller.userPoints === '0';
        const buyerDone = r.buyer.claimed || r.buyer.userPoints === '0';
        const emClaimed = !r.isCurrent && sellerDone && buyerDone && (r.seller.claimed || r.buyer.claimed);
        const emClaimable = !emClaimed && safeBigint(emAmt) > 0n;
        // Estimate if claimed
        const displayAmt = emClaimed && shares
          ? estimateRowReward(r, ep, shares)
          : emAmt;
        return {
          epoch: r.epoch,
          ants: displayAmt,
          claimable: emClaimable,
          claimed: emClaimed,
          isEstimate: r.isCurrent,
        };
      });
    return rows;
  }, [emissionsRows, emissionsInfo, shares]);

  return (
    <div className="rewards-view">
      {/* Page title/subtitle live in the sticky TopBar (layout/TopBar.tsx). */}

      {/* ── Hero: claimable total + Claim all button ── */}
      <div className="rewards-hero">
        <div className="page-label">Claimable now</div>
        <div className="rewards-hero-row">
          <div className="rewards-hero-val">
            {isLoading ? '…' : formatAnts(grandTotalClaimable)}{' '}
            <small>$ANTS</small>
          </div>
          <button
            className="btn primary"
            onClick={handleClaimAll}
            disabled={!hasAnythingToClaim || isAnyClaiming || isLoading}
          >
            {isAnyClaiming ? 'Claiming…' : 'Claim all'}
          </button>
        </div>
        <div className="rewards-hero-brk">
          {!isLoading && (
            <>
              {formatAnts(totalEmissionsClaimable)} emissions
              {totalDiemClaimable > 0n && ` + ${formatAnts(totalDiemClaimable)} DIEM`}
            </>
          )}
        </div>
        {claimSuccess && (
          <div className="status-msg status-success rewards-claim-success">
            Claim confirmed — $ANTS sent to your wallet.
            {claimedTxHash && (() => {
              const url = getExplorerTxUrl(claimedTxHash, expectedChainId);
              return url ? (
                <>{' '}<a href={url} target="_blank" rel="noopener noreferrer" className="rewards-tx-link">View tx ↗</a></>
              ) : (
                <>{' '}<span className="rewards-tx-raw">{claimedTxHash.slice(0, 10)}…{claimedTxHash.slice(-6)}</span></>
              );
            })()}
          </div>
        )}
      </div>

      <div className="page-rule" />

      {/* ── Reward-growth chart ── */}
      {!isLoading && chartBars.length > 0 && (
        <>
          <div className="portal-sechead">
            <div className="page-label">Reward growth · per epoch</div>
            <div className="rewards-sechead-meta">
              Total earned to date <strong>{formatAnts(totalEarned)} $ANTS</strong>
            </div>
          </div>
          <EpochChart bars={chartBars} />
        </>
      )}

      {/* ── Current-epoch summary ── */}
      {emissionsInfo && (
        <div className="rewards-epline">
          <div className="rewards-epline-item">
            <span className="page-label">Current epoch</span>
            <b>#{emissionsInfo.currentEpoch}</b> · closes in {formatTimeRemaining(timeRemaining)}
          </div>
          <div className="rewards-epline-item">
            <span className="page-label">Earned so far</span>
            <b>~{formatAnts(currentEstimate)} $ANTS</b>
          </div>
          <div className="rewards-epline-item">
            <span className="page-label">Your share</span>
            <b>{epochSharePct > 0 ? `${epochSharePct.toFixed(2)}%` : '—'}</b>
            {epochSharePct > 0 && <span className="rewards-epline-note"> of pool</span>}
          </div>
        </div>
      )}

      <div className="page-rule" />

      {/* ── Epoch history ── */}
      {historyRows.length > 0 && (
        <>
          <div className="portal-sechead">
            <div className="page-label">Epoch history</div>
          </div>
          <div className="rewards-history">
            {historyRows.map((row) => (
              <div key={row.epoch} className="portal-list-row">
                <span className="portal-list-who rewards-history-epoch">Epoch {row.epoch}</span>
                <span className="portal-list-amt rewards-history-amt">{formatAnts(row.ants)} $ANTS</span>
                {row.claimable ? (
                  <span className="portal-pill active">Claimable</span>
                ) : row.claimed ? (
                  <span className="portal-pill">Claimed</span>
                ) : (
                  <span className="portal-pill">—</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── DIEM section (only if wallet connected and has data) ── */}
      {isConnected && walletAddress && diemSnapshot && diemSnapshot.rows.length > 0 && (
        <>
          <div className="page-rule" />
          <div className="portal-sechead">
            <div className="page-label">DIEM staking</div>
            {diemSnapshot.hasMore && (
              <span className="rewards-sechead-meta">More epochs after claim</span>
            )}
          </div>
          <div className="rewards-history">
            {diemSnapshot.rows.slice().reverse().slice(0, 8).map((row) => (
              <div key={row.epoch} className="portal-list-row">
                <span className="portal-list-who rewards-history-epoch">DIEM epoch {row.epoch}</span>
                <span className="portal-list-amt rewards-history-amt">{formatAnts(row.amount)} $ANTS</span>
                {row.claimed ? (
                  <span className="portal-pill">Claimed</span>
                ) : row.amount > 0n ? (
                  <span className="portal-pill active">Claimable</span>
                ) : (
                  <span className="portal-pill">Clearable</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* DIEM: prompt to connect wallet if not connected */}
      {!isConnected && (
        <>
          <div className="page-rule" />
          <div className="portal-sechead">
            <div className="page-label">DIEM staking</div>
          </div>
          <div className="rewards-diem-connect">
            <p className="rewards-diem-connect-desc">
              Connect the wallet you used on the DIEM staking portal to view and claim $ANTS.
            </p>
            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) => (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={openConnectModal}
                  disabled={!mounted}
                >
                  Connect wallet
                </button>
              )}
            </ConnectButton.Custom>
          </div>
        </>
      )}

      {/* ── Transfers-disabled banner ── */}
      {transfersEnabled === false && (
        <div className="emissions-banner emissions-banner--warn">
          <strong>ANTS is not yet transferable.</strong>
          Claimed tokens remain in your wallet until governance enables transfers.
        </div>
      )}

      {/* ── Claim confirm sheet ── */}
      {showClaimSheet && (
        <ClaimSheet
          totalEmissions={totalEmissionsClaimable}
          totalDiem={totalDiemClaimable}
          onConfirm={handleConfirmClaim}
          onCancel={() => { setShowClaimSheet(false); setClaimError(null); setClaimErrorDetail(null); setClaimErrorOpen(false); }}
          isSubmitting={isAnyClaiming}
          error={claimError}
          errorDetail={claimErrorDetail}
          errorOpen={claimErrorOpen}
          onToggleErrorDetail={() => setClaimErrorOpen((v) => !v)}
        />
      )}
    </div>
  );
}
