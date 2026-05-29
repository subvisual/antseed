import { useState, useEffect, useCallback } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  useAccount,
  useChainId,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from 'wagmi';
import { formatUnits, parseUnits, maxUint256 } from 'viem';
import type { BalanceData, PaymentConfig } from '../types';
import { getErrorMessage, usePaymentNetwork } from '../payment-network';
import { useOptimisticBalance } from '../hooks/useOptimisticBalance';
import { getExplorerTxUrl } from '../utils/txLink';
import './DepositView.scss';

const MIN_FIRST_DEPOSIT = 1; // USDC — matches AntseedDeposits.MIN_BUYER_DEPOSIT
const QUICK_CHIPS = [10, 25, 50, 100] as const;

function formatUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseUsd(value?: string | null): number {
  const parsed = Number.parseFloat(value ?? '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmountInput(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return n.toFixed(6).replace(/\.?(0+)$/, '');
}

function safeParseUsdc(value: string): bigint {
  try {
    return parseUnits(value || '0', 6);
  } catch {
    return 0n;
  }
}

interface DepositViewProps {
  config: PaymentConfig | null;
  balance: BalanceData | null;
  buyerAddress: string | null;
  onDeposited: () => void;
}

const DEPOSITS_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'buyer', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export function DepositView({ config, balance, buyerAddress, onDeposited }: DepositViewProps) {
  const { applyDelta } = useOptimisticBalance();

  return (
    <div className="dv">
      <CryptoDeposit
        config={config}
        balance={balance}
        buyerAddress={buyerAddress}
        onDeposited={onDeposited}
        applyDelta={applyDelta}
      />
    </div>
  );
}

/* ── Crypto Deposit ── */

function CryptoDeposit({
  config,
  balance,
  buyerAddress,
  onDeposited,
  applyDelta,
}: {
  config: PaymentConfig | null;
  balance: BalanceData | null;
  buyerAddress: string | null;
  onDeposited: () => void;
  applyDelta: (field: 'available' | 'reserved' | 'total', deltaUsdc: number) => void;
}) {
  const { address, isConnected } = useAccount();
  const connectedChainId = useChainId();
  const [amount, setAmount] = useState('');
  const [activeChip, setActiveChip] = useState<number | 'max' | null>(null);
  const [step, setStep] = useState<'idle' | 'approving' | 'checking-allowance' | 'depositing' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [errorOpen, setErrorOpen] = useState(false);
  const [depositedTxHash, setDepositedTxHash] = useState<string | null>(null);

  const currentAvailable = parseUsd(balance?.available);
  const currentTotal = parseUsd(balance?.total);
  const creditLimit = parseUsd(balance?.creditLimit);
  const balanceKnown = balance !== null;
  const remainingCreditLimit = balanceKnown ? Math.max(0, creditLimit - currentTotal) : 0;
  const isFirstDeposit = currentTotal === 0;
  const minDeposit = isFirstDeposit ? MIN_FIRST_DEPOSIT : 0;

  const {
    expectedChainId,
    targetChainName,
    walletChainId,
    wrongChain,
    isSwitchingChain,
    ensureCorrectNetwork,
  } = usePaymentNetwork(config);

  const depositTarget = buyerAddress ?? address;

  // Wallet USDC balance
  const {
    data: walletUsdcRaw,
    refetch: refetchWalletUsdc,
    isLoading: walletUsdcLoading,
    isFetching: walletUsdcFetching,
  } = useReadContract({
    address: config?.usdcContractAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    chainId: expectedChainId,
    args: [address as `0x${string}`],
    query: { enabled: isConnected && !!config && !!address },
  });
  const walletUsdcBalance = walletUsdcRaw === undefined
    ? null
    : Number.parseFloat(formatUnits(walletUsdcRaw, 6));
  const walletUsdcKnown = walletUsdcBalance !== null && Number.isFinite(walletUsdcBalance);
  const maxDeposit = Math.max(
    0,
    Math.min(
      remainingCreditLimit,
      walletUsdcKnown ? walletUsdcBalance : remainingCreditLimit,
    ),
  );

  // Default amount once data loads
  useEffect(() => {
    if (amount !== '' || !balance) return;
    const suggested = maxDeposit >= 10 ? '10' : maxDeposit > 0 ? formatAmountInput(maxDeposit) : '';
    if (suggested) {
      setAmount(suggested);
      const chipVal = [10, 25, 50, 100].find((c) => c === Number(suggested));
      if (chipVal) setActiveChip(chipVal);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balance, walletUsdcRaw]);

  const amountNum = amount ? Number.parseFloat(amount) : 0;

  let validationError: string | null = null;
  if (amount !== '' && balance) {
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      validationError = 'Enter a valid amount.';
    } else if (!/^\d+(\.\d{0,6})?$/.test(amount.trim())) {
      validationError = 'USDC supports up to 6 decimal places.';
    } else if (amountNum < minDeposit) {
      validationError = `Minimum first deposit is $${minDeposit} USDC.`;
    } else if (!walletUsdcKnown) {
      validationError = 'Loading your connected wallet USDC balance…';
    } else if (amountNum > remainingCreditLimit) {
      validationError = remainingCreditLimit <= 0
        ? 'You have reached your credit limit.'
        : `You can add up to $${formatUsd(remainingCreditLimit)} more.`;
    } else if (walletUsdcKnown && amountNum > walletUsdcBalance) {
      validationError = `Your wallet only has $${formatUsd(walletUsdcBalance)} USDC available.`;
    }
  }
  const isValidAmount = amount !== '' && !validationError && amountNum > 0;

  // Read on-chain allowance
  const {
    data: allowance,
    refetch: refetchAllowance,
    isLoading: allowanceLoading,
    isFetching: allowanceFetching,
  } = useReadContract({
    address: config?.usdcContractAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    chainId: expectedChainId,
    args: [address as `0x${string}`, config?.depositsContractAddress as `0x${string}`],
    query: { enabled: isConnected && !!config && !!address },
  });

  const usdcAmount = safeParseUsdc(amount);
  const allowanceKnown = allowance !== undefined;
  // "approve once" threshold: if allowance >= half of maxUint256 treat as permanently approved
  const LARGE_ALLOWANCE_THRESHOLD = maxUint256 / 2n;
  const isApprovedOnce = allowanceKnown && allowance >= LARGE_ALLOWANCE_THRESHOLD;
  const hasAllowance = allowanceKnown && (allowance >= usdcAmount) && usdcAmount > 0n;
  const isCheckingAllowance = allowanceLoading || allowanceFetching || step === 'checking-allowance';
  const needsApproval = isValidAmount && allowanceKnown && !hasAllowance;

  // Step 1 = needs approval, step 2 = has allowance & ready to deposit
  const currentWizardStep: 1 | 2 = (!isValidAmount || !hasAllowance) ? 1 : 2;

  // Approve USDC (approve max so repeat deposits skip this step)
  const { writeContract: writeApprove, data: approveTxHash, reset: resetApprove } = useWriteContract();
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveTxHash,
    chainId: expectedChainId,
    query: { enabled: step === 'approving' && !!approveTxHash },
  });

  const { writeContract: writeDeposit, data: depositTxHash, reset: resetDeposit } = useWriteContract();
  const { isSuccess: depositConfirmed } = useWaitForTransactionReceipt({
    hash: depositTxHash,
    chainId: expectedChainId,
    query: { enabled: step === 'depositing' && !!depositTxHash },
  });

  // After approval confirms → refetch allowance
  useEffect(() => {
    if (step !== 'approving' || !approveConfirmed) return;
    setStep('checking-allowance');
    void refetchAllowance();
  }, [step, approveConfirmed, refetchAllowance]);

  useEffect(() => {
    if (step !== 'checking-allowance') return;
    if (hasAllowance) setStep('idle');
  }, [step, hasAllowance]);

  // After deposit confirms → optimistic update + done
  useEffect(() => {
    if (step !== 'depositing' || !depositConfirmed) return;
    // Optimistic balance update
    applyDelta('available', amountNum);
    applyDelta('total', amountNum);
    setDepositedTxHash(depositTxHash ?? null);
    setStep('done');
    onDeposited();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depositConfirmed, step]);

  const handleAmountChange = useCallback((value: string) => {
    setAmount(value);
    // Clear chip selection when user types freely
    const n = Number.parseFloat(value);
    if (Number.isFinite(n)) {
      const chipVal = QUICK_CHIPS.find((c) => c === n);
      setActiveChip(chipVal ?? null);
    } else {
      setActiveChip(null);
    }
  }, []);

  const selectChip = useCallback((chip: number | 'max') => {
    setActiveChip(chip);
    if (chip === 'max') {
      setAmount(formatAmountInput(maxDeposit));
    } else {
      setAmount(String(chip));
    }
  }, [maxDeposit]);

  async function handleAction() {
    if (!address || !isValidAmount || !config || !depositTarget) return;
    setError(null);
    setErrorDetail(null);

    try {
      await ensureCorrectNetwork();
    } catch (err) {
      setError(getErrorMessage(err, `Please switch your wallet to ${targetChainName}.`));
      return;
    }

    resetApprove();
    resetDeposit();

    // Refresh balances
    const walletResult = await refetchWalletUsdc();
    const latestWalletUsdc = walletResult.data === undefined
      ? null
      : Number.parseFloat(formatUnits(walletResult.data, 6));
    if (latestWalletUsdc === null || !Number.isFinite(latestWalletUsdc)) {
      setError('Could not check wallet USDC balance. Please try again.');
      return;
    }
    if (amountNum > latestWalletUsdc) {
      setError(`Your wallet only has $${formatUsd(latestWalletUsdc)} USDC available.`);
      return;
    }

    const allowanceResult = await refetchAllowance();
    const latestAllowance = allowanceResult.data;
    if (latestAllowance === undefined) {
      setError('Could not check USDC approval. Please try again.');
      return;
    }

    // Has sufficient allowance → deposit directly
    if (latestAllowance >= usdcAmount) {
      setStep('depositing');
      writeDeposit(
        {
          address: config.depositsContractAddress as `0x${string}`,
          abi: DEPOSITS_ABI,
          functionName: 'deposit',
          chainId: expectedChainId,
          args: [depositTarget as `0x${string}`, usdcAmount],
        },
        {
          onError: (err) => {
            setStep('idle');
            setError('Deposit failed.');
            setErrorDetail(getErrorMessage(err));
          },
        },
      );
      return;
    }

    // Needs approval — request max (approve once) so future deposits skip this step
    setStep('approving');
    writeApprove(
      {
        address: config.usdcContractAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        chainId: expectedChainId,
        args: [config.depositsContractAddress as `0x${string}`, maxUint256],
      },
      {
        onError: (err) => {
          setStep('idle');
          setError('Approval failed.');
          setErrorDetail(getErrorMessage(err));
        },
      },
    );
  }

  function resetForm() {
    setStep('idle');
    setError(null);
    setErrorDetail(null);
    setErrorOpen(false);
    setDepositedTxHash(null);
    resetApprove();
    resetDeposit();
    setAmount('');
    setActiveChip(null);
  }

  const explorerUrl = depositedTxHash
    ? getExplorerTxUrl(depositedTxHash, expectedChainId ?? connectedChainId)
    : null;

  const isWorking = step === 'approving' || step === 'depositing' || step === 'checking-allowance';
  const isLoadingWallet = walletUsdcLoading || walletUsdcFetching;
  const isLoadingAllowance = allowanceLoading || allowanceFetching;

  /* ── Done state ── */
  if (step === 'done') {
    return (
      <div className="dv-success">
        <div className="dv-success-icon" aria-hidden="true">✓</div>
        <div className="dv-success-title">Funds added!</div>
        <div className="dv-success-amount">${formatUsd(amountNum)} USDC</div>
        <div className="dv-success-note">
          Your available balance updated instantly. The on-chain transaction will reconcile in a moment.
        </div>
        {depositedTxHash && (
          <div className="dv-success-hash">
            {explorerUrl ? (
              <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="dv-success-hash-link">
                {depositedTxHash.slice(0, 10)}…{depositedTxHash.slice(-8)}
                <span className="dv-success-hash-arrow" aria-hidden="true">↗</span>
              </a>
            ) : (
              <span>{depositedTxHash.slice(0, 10)}…{depositedTxHash.slice(-8)}</span>
            )}
          </div>
        )}
        <button className="dv-btn-outline" onClick={resetForm}>
          Add more funds
        </button>
      </div>
    );
  }

  /* ── Not connected ── */
  if (!isConnected) {
    return (
      <div className="dv-form">
        <div className="dv-connect-hint">
          Connect your wallet to get started. If you've already approved USDC, the deposit will go straight to step 2.
        </div>
        <ConnectButton.Custom>
          {({ openConnectModal, mounted }) => (
            <button
              type="button"
              className="dv-btn-primary"
              onClick={openConnectModal}
              disabled={!mounted}
            >
              Connect wallet
            </button>
          )}
        </ConnectButton.Custom>
      </div>
    );
  }

  /* ── Main form ── */
  const actionButtonLabel = (() => {
    if (isSwitchingChain) return `Switching to ${targetChainName}…`;
    if (wrongChain) return `Switch to ${targetChainName}`;
    if (isLoadingWallet || !walletUsdcKnown) return 'Loading wallet…';
    if (isCheckingAllowance) return 'Checking approval…';
    if (step === 'approving') return 'Approving in wallet…';
    if (step === 'depositing') return 'Confirming in wallet…';
    if (needsApproval) return `Approve & add $${amount ? formatUsd(amountNum) : '—'}`;
    return `Add $${amount ? formatUsd(amountNum) : '—'}`;
  })();

  const actionButtonDisabled =
    isWorking ||
    !isValidAmount ||
    !config ||
    isSwitchingChain ||
    !depositTarget ||
    isLoadingAllowance ||
    isLoadingWallet ||
    !walletUsdcKnown;

  return (
    <div className="dv-form">
      {wrongChain && (
        <div className="dv-chain-warn" role="alert">
          Wallet is on chain {walletChainId ?? connectedChainId}. Switch to {targetChainName} to continue.
        </div>
      )}

      {/* Amount field */}
      <div className="dv-amount-block">
        <label className="dv-amount-label" htmlFor="dv-amount-input">
          Amount to add
        </label>
        <div className={`dv-amount-field${amount && validationError ? ' dv-amount-field--error' : ''}`}>
          <span className="dv-amount-cur" aria-hidden="true">$</span>
          <input
            id="dv-amount-input"
            className="dv-amount-input"
            type="number"
            inputMode="decimal"
            min={minDeposit || 0}
            max={maxDeposit || undefined}
            step="0.01"
            placeholder={isFirstDeposit ? '10.00' : '0.00'}
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            disabled={isWorking}
            aria-describedby="dv-amount-hint"
            autoFocus
          />
          <span className="dv-amount-unit" aria-hidden="true">USDC</span>
        </div>

        {/* Quick chips */}
        <div className="dv-chips" role="group" aria-label="Quick amount">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className={`dv-chip${activeChip === chip ? ' dv-chip--active' : ''}${chip > maxDeposit && maxDeposit > 0 ? ' dv-chip--disabled' : ''}`}
              onClick={() => selectChip(chip)}
              disabled={isWorking || (chip > maxDeposit && maxDeposit > 0)}
              aria-pressed={activeChip === chip}
            >
              ${chip}
            </button>
          ))}
          <button
            type="button"
            className={`dv-chip${activeChip === 'max' ? ' dv-chip--active' : ''}${maxDeposit <= 0 ? ' dv-chip--disabled' : ''}`}
            onClick={() => selectChip('max')}
            disabled={isWorking || maxDeposit <= 0}
            aria-pressed={activeChip === 'max'}
          >
            Max
          </button>
        </div>

        {/* Wallet balance inline */}
        <div id="dv-amount-hint" className="dv-wallet-hint">
          {isLoadingWallet && !walletUsdcKnown ? (
            <span className="dv-wallet-hint-loading">Loading wallet balance…</span>
          ) : walletUsdcKnown && address ? (
            <span>
              <span className="dv-wallet-hint-addr">{address.slice(0, 6)}…{address.slice(-4)}</span>
              {' · '}
              <strong className="dv-wallet-hint-bal">${formatUsd(walletUsdcBalance ?? 0)} USDC</strong>
              {' available in wallet'}
            </span>
          ) : null}
          {balanceKnown && remainingCreditLimit < (walletUsdcBalance ?? Infinity) && remainingCreditLimit > 0 && (
            <span className="dv-wallet-hint-limit">
              {' · '}${formatUsd(remainingCreditLimit)} deposit headroom
            </span>
          )}
        </div>

        {validationError && (
          <div className="dv-validation-error" role="alert">{validationError}</div>
        )}
      </div>

      {/* Two-step stepper */}
      <div className="dv-steps" aria-label="Deposit steps">
        <div className={`dv-step${isApprovedOnce || hasAllowance ? ' dv-step--done' : currentWizardStep === 1 ? ' dv-step--active' : ''}`}>
          <span className="dv-step-dot" aria-hidden="true">
            {isApprovedOnce || hasAllowance ? '✓' : '1'}
          </span>
          <span className="dv-step-label">
            {isApprovedOnce
              ? 'USDC approved — this wallet can deposit'
              : hasAllowance
                ? 'USDC approved for this amount'
                : step === 'approving'
                  ? 'Approving USDC in wallet…'
                  : step === 'checking-allowance'
                    ? 'Confirming approval on-chain…'
                    : 'Approve USDC — approve once, deposit anytime'}
          </span>
        </div>
        <div className={`dv-step${currentWizardStep === 2 && !isWorking ? ' dv-step--active' : step === 'depositing' ? ' dv-step--active' : ''}`}>
          <span className="dv-step-dot" aria-hidden="true">2</span>
          <span className="dv-step-label">
            {step === 'depositing'
              ? 'Confirming deposit in wallet…'
              : currentWizardStep === 2
                ? 'Confirm the deposit in your wallet'
                : 'Confirm the deposit in your wallet'}
          </span>
        </div>
      </div>

      {/* Primary action */}
      <button
        className="dv-btn-primary"
        onClick={handleAction}
        disabled={actionButtonDisabled}
        aria-busy={isWorking}
      >
        {actionButtonLabel}
      </button>

      {/* Approving note */}
      {needsApproval && !isWorking && (
        <div className="dv-approve-note">
          Approves the max USDC amount once — future deposits skip this step.
        </div>
      )}

      {/* Confirm note (step 2 ready) */}
      {!needsApproval && isValidAmount && !isWorking && (
        <div className="dv-confirm-note">
          ≈ one wallet confirmation
        </div>
      )}

      {/* Helper text */}
      <div className="dv-help">
        Funds credit your available balance right after the transaction confirms. Withdraw unused funds anytime.
      </div>

      {/* Error with expandable detail */}
      {error && (
        <div className="dv-error" role="alert">
          <div className="dv-error-summary">
            <span>{error}</span>
            {errorDetail && (
              <button
                type="button"
                className="dv-error-toggle"
                onClick={() => setErrorOpen((v) => !v)}
                aria-expanded={errorOpen}
              >
                {errorOpen ? 'Hide detail' : 'Show detail'}
              </button>
            )}
          </div>
          {errorOpen && errorDetail && (
            <div className="dv-error-detail">{errorDetail}</div>
          )}
          {depositTxHash && (
            <div className="dv-error-hash">
              {getExplorerTxUrl(depositTxHash, expectedChainId ?? connectedChainId) ? (
                <a
                  href={getExplorerTxUrl(depositTxHash, expectedChainId ?? connectedChainId)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dv-error-hash-link"
                >
                  View tx ↗
                </a>
              ) : (
                <span className="dv-error-hash-raw">{depositTxHash.slice(0, 18)}…</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
