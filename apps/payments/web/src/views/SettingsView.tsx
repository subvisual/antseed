/**
 * Settings view — Budget · Wallet · Network
 *
 * Two-column masonry layout:
 *   Left  — Budget (monthly cap meter, pause-at-cap, low-balance nudge, credit limit)
 *   Right — Wallet (connected wallet + disconnect, authorized wallet, transfer)
 *           Network (chain + health, RPC override, block explorer)
 *
 * Theme/appearance lives in the top bar now, so it's no longer a Settings section.
 *
 * Wires to:
 *   - BudgetSection for budget/spend-control
 *   - AuthorizedWalletContext for operator state and the authorize flow
 *   - wagmi useAccount/useDisconnect + RainbowKit for the connected wallet
 *   - useTransferOperator for the transfer-auth flow
 */
import { useCallback, useEffect, useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAuthorizedWallet } from '../context/AuthorizedWalletContext';
import { useTransferOperator } from '../hooks/useSetOperator';
import { ActionModal } from '../layout/ActionModal';
import { BudgetSection } from '../components/BudgetSection';
import type { PaymentConfig } from '../types';
import './SettingsView.scss';

function truncateAddr(addr: string | null): string {
  if (!addr || addr.length < 10) return addr ?? '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ── Sub-component: Transfer-authorization modal ───────────────────────────────

interface TransferModalProps {
  isOpen: boolean;
  config: PaymentConfig | null;
  buyerAddress: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

function TransferAuthModal({
  isOpen,
  config,
  buyerAddress,
  onClose,
  onSuccess,
}: TransferModalProps) {
  const [newAddr, setNewAddr] = useState('');
  const { run, running, success, error, reset } = useTransferOperator(config, onSuccess);

  useEffect(() => {
    if (success) {
      onSuccess();
      reset();
      setNewAddr('');
    }
  }, [success, onSuccess, reset]);

  useEffect(() => {
    if (!isOpen) {
      reset();
      setNewAddr('');
    }
  }, [isOpen, reset]);

  const handleSubmit = () => {
    if (!buyerAddress) return;
    void run(buyerAddress, newAddr.trim());
  };

  const addrValid = /^0x[0-9a-fA-F]{40}$/.test(newAddr.trim());

  return (
    <ActionModal
      isOpen={isOpen}
      onClose={onClose}
      title="Transfer authorization"
      subtitle="Move signing rights to a different wallet. The new wallet becomes the authorized operator."
    >
      <div className="set-transfer-overlay">
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          The <strong style={{ color: 'var(--text-primary)' }}>authorized wallet</strong> is the
          external address that can withdraw funds, claim ANTS rewards, and close channels on your
          behalf. Your AntSeed node signs spending requests, but never holds USDC or ANTS — only
          the authorized wallet can move them. If you lose access to this node, the authorized
          wallet is your recovery path.
        </p>

        <div className="set-transfer-field">
          <label htmlFor="transfer-addr">New operator wallet address</label>
          <input
            id="transfer-addr"
            className="set-input"
            type="text"
            placeholder="0x…"
            value={newAddr}
            onChange={(e) => setNewAddr(e.target.value)}
            disabled={running}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!addrValid || running || !buyerAddress}
          >
            {running ? 'Transferring…' : 'Transfer'}
          </button>
          <button
            type="button"
            className="btn-link"
            onClick={onClose}
            disabled={running}
          >
            Cancel
          </button>
        </div>

        {error && <div className="set-msg set-msg--error">{error}</div>}
      </div>
    </ActionModal>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

interface SettingsViewProps {
  config: PaymentConfig | null;
  onOpenDeposit: () => void;
}

export function SettingsView({ config, onOpenDeposit }: SettingsViewProps) {
  const { operator, operatorSet, requireAuthorization, refetch } = useAuthorizedWallet();
  const { address: connectedAddress, isConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();

  const [transferOpen, setTransferOpen] = useState(false);
  const [rpcValue, setRpcValue] = useState<string>(() => config?.rpcUrl ?? '');
  const [rpcSaved, setRpcSaved] = useState(false);

  // Keep rpcValue in sync if config loads after mount
  useEffect(() => {
    if (config?.rpcUrl) setRpcValue(config.rpcUrl);
  }, [config?.rpcUrl]);

  const handleAuthorize = useCallback(() => {
    requireAuthorization();
  }, [requireAuthorization]);

  const handleTransferSuccess = useCallback(async () => {
    setTransferOpen(false);
    await refetch();
  }, [refetch]);

  const handleRpcSave = useCallback(() => {
    // RPC override is stored locally — the server picks it up on next reload.
    localStorage.setItem('antseed-rpc-override', rpcValue.trim());
    setRpcSaved(true);
    setTimeout(() => setRpcSaved(false), 2500);
  }, [rpcValue]);

  const chainLabel = config ? `${config.chainId}` : '—';
  const operatorDisplay = operator ? truncateAddr(operator) : null;
  const walletAuthorized = operatorSet === true;

  // Chain health: "online" when the server responded with config, else "unknown".
  const chainHealthy = config !== null;

  // Block explorer — Base mainnet only (no explorer for local/anvil chains).
  const explorerUrl =
    config?.evmAddress && config.chainId === 'base'
      ? `https://basescan.org/address/${config.evmAddress}`
      : null;

  const chainItem = (
    <div className="set-item">
      <div className="set-copy">
        <h4>Chain</h4>
        <p>Network the AntSeed protocol contracts live on.</p>
      </div>
      <div className="set-ctrl">
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
          {chainLabel}
        </span>
        <span className={`set-pill${chainHealthy ? ' set-pill--ok' : ' set-pill--warn'}`}>
          <span className="set-pill--dot" aria-hidden="true" />
          {chainHealthy ? 'online' : 'unknown'}
        </span>
      </div>
    </div>
  );

  return (
    <div className="settings-view">
      <div className="settings-grid">
        {/* ── Budget (equal-height with Wallet) ────────────────────── */}
        <div className="settings-cell">
          <BudgetSection onOpenDeposit={onOpenDeposit} />
        </div>

        {/* ── Wallet (equal-height with Budget) ────────────────────── */}
        <div className="settings-cell">
          {/* ── Wallet ─────────────────────────────────────────────── */}
          <div className="settings-section-label">Wallet</div>
          <div className="settings-card">
            {/* Connected wallet row */}
            <div className="set-item">
              <div className="set-copy">
                <h4>Connected wallet</h4>
                <p>
                  The external wallet used to sign and submit on-chain actions
                  (withdrawals, claims, channel closes).
                </p>
              </div>
              <div className="set-ctrl set-wallet-ctrl">
                {isConnected && connectedAddress ? (
                  <>
                    <span className="set-wallet-addr">{truncateAddr(connectedAddress)}</span>
                    {connector?.name && (
                      <span className="set-wallet-provider">{connector.name}</span>
                    )}
                    <button
                      type="button"
                      className="set-btn-ghost"
                      onClick={() => disconnect()}
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <ConnectButton.Custom>
                    {({ openConnectModal, mounted }) => (
                      <button
                        type="button"
                        className="set-btn-ghost"
                        onClick={openConnectModal}
                        disabled={!mounted}
                      >
                        Connect wallet
                      </button>
                    )}
                  </ConnectButton.Custom>
                )}
              </div>
            </div>

            {/* Authorized wallet row */}
            <div className="set-item">
              <div className="set-copy">
                <h4>Authorized wallet</h4>
                <p>
                  Your AntSeed node signs spending requests but never holds USDC or ANTS.
                  This external wallet can withdraw funds, claim rewards, and close channels
                  on your behalf — and is your recovery path if you lose access to this node.
                </p>
              </div>
              <div className="set-ctrl">
                {walletAuthorized && operatorDisplay ? (
                  <>
                    <span className="set-wallet-addr">{operatorDisplay}</span>
                    <span className="set-pill set-pill--ok">
                      <span className="set-pill--dot" aria-hidden="true" />
                      authorized
                    </span>
                  </>
                ) : operatorSet === false ? (
                  <button
                    type="button"
                    className="set-btn-ghost"
                    onClick={handleAuthorize}
                  >
                    Authorize wallet
                  </button>
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Loading…</span>
                )}
              </div>
            </div>

            {/* Transfer authorization row */}
            <div className="set-item">
              <div className="set-copy">
                <h4>Transfer authorization</h4>
                <p>
                  Move signing rights to a different wallet you control. Use this if you
                  want to change which external wallet has operator access.
                </p>
              </div>
              <div className="set-ctrl">
                <button
                  type="button"
                  className="set-btn-ghost"
                  onClick={() => setTransferOpen(true)}
                  disabled={!walletAuthorized || !config}
                  title={
                    !walletAuthorized
                      ? 'Authorize a wallet first'
                      : !config
                      ? 'Config not loaded'
                      : 'Transfer authorization to a new wallet'
                  }
                >
                  Transfer
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Network (full width) ─────────────────────────────────── */}
        <div className="settings-cell settings-cell--full">
          <div className="settings-section-label">Network</div>
          <div className="settings-card">
            {/* Chain + Block explorer, side by side */}
            {explorerUrl ? (
              <div className="set-row-2up">
                {chainItem}
                <div className="set-item">
                  <div className="set-copy">
                    <h4>Block explorer</h4>
                    <p>View your account and protocol contracts on Basescan.</p>
                  </div>
                  <div className="set-ctrl">
                    <a
                      className="set-btn-ghost set-btn-link"
                      href={explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on Basescan ↗
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              chainItem
            )}

            {/* RPC override — full width with a wide input */}
            <div className="set-item-stack">
              <div className="set-copy">
                <h4>RPC endpoint</h4>
                <p>
                  Override the default RPC URL. Changes take effect after reloading the portal.
                </p>
              </div>
              <div className="set-input-row">
                <input
                  className="set-input"
                  type="url"
                  placeholder={config?.rpcUrl ?? 'https://…'}
                  value={rpcValue}
                  onChange={(e) => { setRpcValue(e.target.value); setRpcSaved(false); }}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="set-btn-ghost"
                  onClick={handleRpcSave}
                  disabled={!rpcValue.trim()}
                >
                  {rpcSaved ? 'Saved' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transfer authorization modal */}
      <TransferAuthModal
        isOpen={transferOpen}
        config={config}
        buyerAddress={config?.evmAddress ?? null}
        onClose={() => setTransferOpen(false)}
        onSuccess={handleTransferSuccess}
      />
    </div>
  );
}
