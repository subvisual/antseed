import { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import type { BalanceData, PaymentConfig } from '../types';
import { useAuthorizedWallet } from '../context/AuthorizedWalletContext';
import { useWithdraw } from '../hooks/useWithdraw';
import { useOptimisticBalance } from '../hooks/useOptimisticBalance';
import { usePaymentNetwork } from '../payment-network';
import { getExplorerTxUrl } from '../utils/txLink';
import './WithdrawView.scss';

interface WithdrawViewProps {
  config: PaymentConfig | null;
  balance: BalanceData | null;
  onAction: () => void;
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

const CHIPS = [25, 50, 100] as const;

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Derive a Base block-explorer tx link from a hash, or null if chain unknown. */
function getTxLink(config: PaymentConfig | null, txHash: string | undefined): string | null {
  if (!txHash || !config) return null;
  return getExplorerTxUrl(txHash, config.evmChainId ?? undefined);
}

export function WithdrawView({ config, balance: balanceFallback, onAction }: WithdrawViewProps) {
  // Use the optimistic balance hook so that confirming a withdrawal
  // updates the displayed balance immediately via applyDelta.
  const { balance: optimisticBalance, applyDelta } = useOptimisticBalance();
  // Use optimistic view when available; fall back to parent-provided balance
  // on initial render before the hook has loaded.
  const balance = optimisticBalance ?? balanceFallback;

  const [amount, setAmount] = useState('');
  const [errorExpanded, setErrorExpanded] = useState(false);

  const { address, isConnected } = useAccount();
  const { requireAuthorization, operator } = useAuthorizedWallet();
  const { targetChainName, walletChainId, wrongChain, isSwitchingChain } = usePaymentNetwork(config);

  const handleSuccess = useCallback(() => {
    const parsed = parseFloat(amount);
    if (Number.isFinite(parsed) && parsed > 0) {
      applyDelta('available', -parsed);
      applyDelta('total',     -parsed);
    }
    onAction();
  }, [amount, applyDelta, onAction]);

  const { run, running, success, error, reset, txHash } = useWithdraw(config, handleSuccess);

  if (!balance) {
    return (
      <div className="withdraw">
        <div className="card">
          <div className="card-section-title">Withdraw</div>
          <div className="withdraw-loading">Loading…</div>
        </div>
      </div>
    );
  }

  const availableAmount = parseFloat(balance.available);
  const reservedAmount  = parseFloat(balance.reserved);
  const buyer = config?.evmAddress ?? balance.evmAddress;

  const operatorSet  = !!operator && operator !== ZERO_ADDR;
  const wrongWallet  = Boolean(
    isConnected && operatorSet && address && address.toLowerCase() !== operator!.toLowerCase(),
  );

  const amountNum    = amount ? parseFloat(amount) : 0;
  const validAmount  = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= availableAmount;

  const txLink = getTxLink(config, txHash);

  function handleChip(value: number) {
    setAmount(value.toString());
    reset();
  }

  function handleMax() {
    if (availableAmount > 0) setAmount(formatUsd(availableAmount).replace(/,/g, ''));
    reset();
  }

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    setAmount(e.target.value);
    reset();
  }

  function handleClick() {
    if (!buyer) return;
    setErrorExpanded(false);
    requireAuthorization(async () => {
      reset();
      await run(buyer, amount);
    });
  }

  function resetForm() {
    setAmount('');
    reset();
    setErrorExpanded(false);
  }

  const buttonLabel = (() => {
    if (isSwitchingChain)  return `Switching to ${targetChainName}…`;
    if (wrongChain)        return `Switch to ${targetChainName}`;
    if (running)           return 'Processing…';
    if (validAmount)       return `Withdraw $${formatUsd(amountNum)}`;
    return 'Withdraw';
  })();

  return (
    <div className="withdraw">
      <div className="card">
        <div className="card-section-title">Withdraw USDC</div>

        {success ? (
          /* ── Success state ── */
          <div className="withdraw-success">
            <div className="withdraw-success-icon" aria-hidden="true">✓</div>
            <div className="withdraw-success-title">Withdrawal confirmed!</div>
            {txHash && (
              <div className="withdraw-success-hash">
                {txLink ? (
                  <a
                    href={txLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="withdraw-tx-link"
                  >
                    {txHash.slice(0, 18)}…
                    <span className="withdraw-tx-link-arrow" aria-hidden="true">↗</span>
                  </a>
                ) : (
                  <span>{txHash.slice(0, 18)}…</span>
                )}
              </div>
            )}
            <div className="withdraw-success-note">
              Funds sent to {address ? shortAddr(address) : 'your authorized wallet'}.
            </div>
            <button className="btn-outline" onClick={resetForm}>
              Withdraw more
            </button>
          </div>

        ) : !isConnected ? (
          /* ── Not connected ── */
          <div className="withdraw-connect-section">
            <p className="withdraw-connect-hint">
              Connect the wallet that is authorized to withdraw on your behalf.
            </p>
            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) => (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={openConnectModal}
                  disabled={!mounted}
                >
                  Connect Wallet
                </button>
              )}
            </ConnectButton.Custom>
          </div>

        ) : (
          /* ── Main form ── */
          <>
            {/* Chain warning */}
            {wrongChain && (
              <div className="status-msg" role="alert">
                Wallet is on chain {walletChainId ?? 'unknown'}. Switch to{' '}
                {targetChainName} before withdrawing.
              </div>
            )}

            {/* Wrong-wallet warning */}
            {wrongWallet && operator && (
              <div className="status-msg status-error" role="alert">
                Connected as <strong>{shortAddr(address!)}</strong> but withdrawals
                require <strong>{shortAddr(operator)}</strong>. Connect that wallet
                or transfer authorization first.
              </div>
            )}

            {/* Balance info row */}
            <div className="withdraw-balance-row">
              <div className="withdraw-balance-item">
                <span className="withdraw-balance-label">Available</span>
                <span className="withdraw-balance-value">${formatUsd(availableAmount)}</span>
              </div>
              {reservedAmount > 0 && (
                <div className="withdraw-balance-item">
                  <span className="withdraw-balance-label">Reserved</span>
                  <span className="withdraw-balance-value withdraw-balance-value--muted">
                    ${formatUsd(reservedAmount)}
                  </span>
                </div>
              )}
              <div className="withdraw-balance-item">
                <span className="withdraw-balance-label">Destination</span>
                <span className="withdraw-balance-value withdraw-balance-value--mono">
                  {address ? shortAddr(address) : '—'}
                </span>
              </div>
            </div>

            {/* Amount field */}
            <div className="withdraw-amount-group">
              <div className="withdraw-amount-field-wrap">
                <span className="withdraw-amount-cur" aria-hidden="true">$</span>
                <input
                  className="withdraw-amount-input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={handleAmountChange}
                  disabled={running}
                  aria-label="Amount to withdraw in USDC"
                />
                <span className="withdraw-amount-unit" aria-hidden="true">USDC</span>
              </div>

              {/* Chips */}
              <div className="withdraw-chips" role="group" aria-label="Preset amounts">
                {CHIPS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`withdraw-chip${amountNum === v ? ' withdraw-chip--active' : ''}`}
                    onClick={() => handleChip(v)}
                    disabled={running || v > availableAmount}
                  >
                    ${v}
                  </button>
                ))}
                <button
                  type="button"
                  className={`withdraw-chip${amountNum === availableAmount && availableAmount > 0 ? ' withdraw-chip--active' : ''}`}
                  onClick={handleMax}
                  disabled={running || availableAmount <= 0}
                >
                  Max (${formatUsd(availableAmount)})
                </button>
              </div>
            </div>

            {/* Reserved-funds note */}
            {reservedAmount > 0 && (
              <div className="withdraw-reserved-note" role="note">
                Only available (unreserved) funds can be withdrawn. To free
                up the reserved ${formatUsd(reservedAmount)}, close a channel
                first.
              </div>
            )}

            {/* Submit button */}
            <button
              className="btn-primary"
              onClick={handleClick}
              disabled={
                running ||
                isSwitchingChain ||
                !validAmount ||
                !buyer ||
                wrongWallet ||
                !config
              }
            >
              {buttonLabel}
            </button>

            <div className="withdraw-meta">≈ one wallet confirmation</div>
          </>
        )}

        {/* Error panel with expandable detail */}
        {error && !success && (
          <div className="withdraw-error" role="alert">
            <div className="withdraw-error-head">
              <span className="withdraw-error-icon" aria-hidden="true">✕</span>
              <span className="withdraw-error-msg">Withdrawal failed</span>
              <button
                type="button"
                className="withdraw-error-toggle"
                onClick={() => setErrorExpanded((v) => !v)}
                aria-expanded={errorExpanded}
              >
                {errorExpanded ? 'Hide detail' : 'Show detail'}
              </button>
            </div>
            {errorExpanded && (
              <div className="withdraw-error-detail">
                {error}
                {txHash && (
                  <div className="withdraw-error-txhash">
                    Tx:{' '}
                    {txLink ? (
                      <a
                        href={txLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="withdraw-tx-link"
                      >
                        {txHash.slice(0, 18)}…
                        <span className="withdraw-tx-link-arrow" aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <span>{txHash}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
