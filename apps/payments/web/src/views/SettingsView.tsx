import { useMemo, useState } from 'react';
import type { BalanceData, PaymentConfig } from '../types';
import { useAuthorizedWallet } from '../context/AuthorizedWalletContext';

interface SettingsViewProps {
  config: PaymentConfig | null;
  balance: BalanceData | null;
  isDark: boolean;
  onToggleTheme: () => void;
}

function formatUsd(value: string | null | undefined): string {
  const n = Number(value ?? 0);
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function truncateAddress(address: string | null | undefined): string {
  if (!address) return 'Not configured';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function SettingsView({ config, balance, isDark, onToggleTheme }: SettingsViewProps) {
  const [monthlyBudget, setMonthlyBudget] = useState('');
  const [lowBalanceNudge, setLowBalanceNudge] = useState('');
  const [pauseAtCap, setPauseAtCap] = useState(false);
  const { operatorSet, operator, requireAuthorization } = useAuthorizedWallet();

  const operatorLabel = useMemo(() => {
    if (operatorSet === null) return 'Checking…';
    if (operatorSet === false) return 'Not authorized';
    return truncateAddress(operator);
  }, [operator, operatorSet]);

  return (
    <div className="settings-view">
      <section className="portal-section-head">
        <h1>Settings</h1>
        <p>Wallet, network, and appearance</p>
      </section>

      <section className="settings-section">
        <div className="portal-kicker">Budget</div>
        <div className="settings-card">
          <div className="settings-row settings-row--split">
            <div>
              <h2>Monthly budget</h2>
              <p>Cap how much you spend per calendar month. A meter tracks progress; we warn as you approach the limit.</p>
            </div>
            <div className="settings-inline-control">
              <span>{monthlyBudget ? `$${monthlyBudget}` : 'No cap set'}</span>
              <label>
                $
                <input
                  value={monthlyBudget}
                  inputMode="decimal"
                  placeholder="e.g. 50"
                  onChange={(event) => setMonthlyBudget(event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="settings-row settings-row--split">
            <div>
              <h2>Pause routing at cap</h2>
              <p>When monthly spend reaches the cap, pause new requests. Enforcement is local to this portal.</p>
            </div>
            <button
              type="button"
              className={`settings-switch${pauseAtCap ? ' settings-switch--on' : ''}`}
              aria-pressed={pauseAtCap}
              onClick={() => setPauseAtCap((value) => !value)}
            >
              <span />
            </button>
          </div>

          <div className="settings-row settings-row--split">
            <div>
              <h2>Low-balance nudge</h2>
              <p>When available balance drops below this amount, we&apos;ll prompt a one-click top-up.</p>
            </div>
            <div className="settings-inline-control">
              <label>
                $
                <input
                  value={lowBalanceNudge}
                  inputMode="decimal"
                  placeholder="e.g. 20"
                  onChange={(event) => setLowBalanceNudge(event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="settings-row settings-row--split">
            <div>
              <h2>Credit limit</h2>
              <p>Maximum balance you can hold on-chain. Set by the protocol.</p>
            </div>
            <strong>${formatUsd(balance?.creditLimit)}</strong>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="portal-kicker">Wallet</div>
        <div className="settings-card">
          <div className="settings-row settings-row--split">
            <div>
              <h2>Authorized wallet</h2>
              <p>Your AntSeed node signs spending requests but never holds USDC or ANTS. This external wallet can recover funds and claim rewards.</p>
            </div>
            <button
              type="button"
              className="portal-secondary-btn"
              disabled={operatorSet === null}
              onClick={() => requireAuthorization()}
            >
              {operatorSet === false ? 'Authorize wallet…' : operatorLabel}
            </button>
          </div>
          <div className="settings-row settings-row--split">
            <div>
              <h2>Transfer authorization</h2>
              <p>Move signing rights to a different wallet you control. Use this if you want to change which external wallet has operator access.</p>
            </div>
            <button type="button" className="portal-secondary-btn" disabled>Transfer…</button>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="portal-kicker">Network</div>
        <div className="settings-card">
          <div className="settings-row settings-row--split">
            <div>
              <h2>Chain</h2>
              <p>Network the AntSeed protocol contracts live on.</p>
            </div>
            <div className="settings-chain-pill">
              {config?.chainId ?? 'Unknown'}
              <span>online</span>
            </div>
          </div>
          <div className="settings-row settings-row--split">
            <div>
              <h2>RPC endpoint</h2>
              <p>Configured by the active AntSeed node. Change it in node config, then reopen the portal.</p>
            </div>
            <div className="settings-inline-control">
              <input
                value={config?.rpcUrl ?? ''}
                readOnly
                placeholder="http://127.0.0.1:8545"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="portal-kicker">Appearance</div>
        <div className="settings-card">
          <div className="settings-row settings-row--split">
            <div>
              <h2>Dark theme</h2>
              <p>Match AntStation&apos;s appearance. Your preference is saved locally.</p>
            </div>
            <button
              type="button"
              className={`settings-switch${isDark ? ' settings-switch--on' : ''}`}
              aria-pressed={isDark}
              onClick={onToggleTheme}
            >
              <span />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
