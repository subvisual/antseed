/**
 * Settings view — Budget · Wallet · Network · Appearance
 *
 * Sections:
 *   Budget  — monthly spend cap meter, low-balance nudge, credit-limit context
 *   Wallet  — authorized wallet + status, transfer-authorization
 *   Network — chain + health pill + RPC override
 *   Appearance — dark theme toggle
 *
 * Wires to:
 *   - BudgetSection for budget/spend-control (issue 9)
 *   - AuthorizedWalletContext for wallet/operator state and authorize flow
 *   - AuthorizeWalletModal (via requireAuthorization)
 *   - useTransferOperator for the transfer-auth flow
 *   - localStorage 'antseed-payments-theme' + data-theme on <html>
 */
import { useCallback, useEffect, useId, useState } from 'react';
import { useAuthorizedWallet } from '../context/AuthorizedWalletContext';
import { useTransferOperator } from '../hooks/useSetOperator';
import { ActionModal } from '../layout/ActionModal';
import { BudgetSection } from '../components/BudgetSection';
import type { PaymentConfig } from '../types';
import './SettingsView.scss';

const THEME_KEY = 'antseed-payments-theme';

function truncateAddr(addr: string | null): string {
  if (!addr || addr.length < 10) return addr ?? '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Read the current persisted theme choice. */
function readTheme(): boolean {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) return saved === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Persist + apply theme to the document root. */
function applyTheme(dark: boolean) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
}

// ── Sub-component: Toggle switch ──────────────────────────────────────────────

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
  label: string;
}

function Toggle({ checked, onChange, id, label }: ToggleProps) {
  return (
    <label
      className={`set-toggle${checked ? ' set-toggle--on' : ''}`}
      title={label}
      aria-label={label}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="set-toggle-track" />
      <span className="set-toggle-thumb" />
    </label>
  );
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
  const [isDark, setIsDark] = useState<boolean>(readTheme);
  const [transferOpen, setTransferOpen] = useState(false);
  const [rpcValue, setRpcValue] = useState<string>(() => config?.rpcUrl ?? '');
  const [rpcSaved, setRpcSaved] = useState(false);

  const toggleId = useId();

  // Keep local toggle in sync with external theme changes (e.g. sidebar toggle)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY && e.newValue) {
        setIsDark(e.newValue === 'dark');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Keep rpcValue in sync if config loads after mount
  useEffect(() => {
    if (config?.rpcUrl) setRpcValue(config.rpcUrl);
  }, [config?.rpcUrl]);

  const handleThemeToggle = useCallback((dark: boolean) => {
    setIsDark(dark);
    applyTheme(dark);
  }, []);

  const handleAuthorize = useCallback(() => {
    requireAuthorization();
  }, [requireAuthorization]);

  const handleTransferSuccess = useCallback(async () => {
    setTransferOpen(false);
    await refetch();
  }, [refetch]);

  const handleRpcSave = useCallback(() => {
    // RPC override is stored locally — the server picks it up on next reload.
    // For now we persist it in localStorage so the note is surfaced to the user.
    localStorage.setItem('antseed-rpc-override', rpcValue.trim());
    setRpcSaved(true);
    setTimeout(() => setRpcSaved(false), 2500);
  }, [rpcValue]);

  const chainLabel = config
    ? `${config.chainId}` // e.g. "base" or "base-local"
    : '—';

  const operatorDisplay = operator ? truncateAddr(operator) : null;
  const walletAuthorized = operatorSet === true;

  // Determine chain health. We don't have a live health endpoint here,
  // so we show "online" when we have config (server responded) and "unknown" otherwise.
  const chainHealthy = config !== null;

  return (
    <div className="settings-view">
      <div className="settings-header">
        <div className="page-h1">Settings</div>
        <div className="page-subtitle">Wallet, network, and appearance</div>
      </div>

      {/* ── Budget — monthly spend cap, low-balance nudge, credit-limit context ── */}
      <BudgetSection onOpenDeposit={onOpenDeposit} />

      {/* ── Wallet ─────────────────────────────────────────────────── */}
      <div className="settings-section-label">Wallet</div>
      <div className="settings-card">
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
                Authorize wallet…
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
              Transfer…
            </button>
          </div>
        </div>
      </div>

      {/* ── Network ────────────────────────────────────────────────── */}
      <div className="settings-section-label">Network</div>
      <div className="settings-card">
        {/* Chain row */}
        <div className="set-item">
          <div className="set-copy">
            <h4>Chain</h4>
            <p>Network the AntSeed protocol contracts live on.</p>
          </div>
          <div className="set-ctrl">
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
              {chainLabel}
            </span>
            <span
              className={`set-pill${chainHealthy ? ' set-pill--ok' : ' set-pill--warn'}`}
            >
              <span className="set-pill--dot" aria-hidden="true" />
              {chainHealthy ? 'online' : 'unknown'}
            </span>
          </div>
        </div>

        {/* RPC override row */}
        <div className="set-item">
          <div className="set-copy">
            <h4>RPC endpoint</h4>
            <p>
              Override the default RPC URL. Changes take effect after reloading the portal.
            </p>
          </div>
          <div className="set-ctrl" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--sp-2)' }}>
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

      {/* ── Appearance ─────────────────────────────────────────────── */}
      <div className="settings-section-label">Appearance</div>
      <div className="settings-card">
        <div className="set-item">
          <div className="set-copy">
            <h4>Dark theme</h4>
            <p>Match AntStation's appearance. Your preference is saved locally.</p>
          </div>
          <div className="set-ctrl">
            <Toggle
              id={toggleId}
              checked={isDark}
              onChange={handleThemeToggle}
              label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            />
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
