/**
 * Settings view — stub. Full implementation in a future issue.
 * Budget caps, wallet config, network/RPC override, appearance.
 */
import type { PaymentConfig } from '../types';

interface SettingsViewProps {
  config: PaymentConfig | null;
}

export function SettingsView({ config: _config }: SettingsViewProps) {
  return (
    <div>
      <div className="page-h1">Settings</div>
      <div className="page-subtitle">Budget, wallet, network, and appearance</div>
      <div
        style={{
          marginTop: 'var(--sp-6)',
          padding: 'var(--sp-6)',
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          color: 'var(--muted)',
          fontSize: '0.8125rem',
          textAlign: 'center',
        }}
      >
        Full settings view coming in a future update.
      </div>
    </div>
  );
}
