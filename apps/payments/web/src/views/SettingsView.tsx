import { useMemo } from 'react';
import type { PaymentConfig } from '../types';
import { useAuthorizedWallet } from '../context/AuthorizedWalletContext';

interface SettingsViewProps {
  config: PaymentConfig | null;
  isDark: boolean;
  onToggleTheme: () => void;
}

function truncateAddress(address: string | null | undefined): string {
  if (!address) return 'Not configured';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function SettingsView({ config, isDark, onToggleTheme }: SettingsViewProps) {
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
