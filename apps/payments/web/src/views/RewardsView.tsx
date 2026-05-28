/**
 * Rewards view — stub. Full implementation in a future issue.
 * Shows emissions + DIEM staking rewards; claim flows wired to on-chain contracts.
 */
import type { PaymentConfig } from '../types';

interface RewardsViewProps {
  config: PaymentConfig | null;
}

export function RewardsView({ config: _config }: RewardsViewProps) {
  return (
    <div>
      <div className="page-h1">Rewards</div>
      <div className="page-subtitle">$ANTS earned from network usage and DIEM staking</div>
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
        Full rewards view coming in a future update.
      </div>
    </div>
  );
}
