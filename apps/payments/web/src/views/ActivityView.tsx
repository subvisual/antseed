/**
 * Activity view — stub. Full implementation in a future issue.
 * Shows every deposit, withdrawal, claim, and settlement with filters.
 */
import type { PaymentConfig } from '../types';

interface ActivityViewProps {
  config: PaymentConfig | null;
}

export function ActivityView({ config: _config }: ActivityViewProps) {
  return (
    <div>
      <div className="page-h1">Activity</div>
      <div className="page-subtitle">Every deposit, withdrawal, claim, and settlement</div>
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
        Full activity log coming in a future update.
      </div>
    </div>
  );
}
