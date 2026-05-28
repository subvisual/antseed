/**
 * Channels stub — referenced from the Overview "details" link.
 * Full channel management lives in ChannelsView (used from the legacy tabs).
 */
import type { PaymentConfig } from '../types';
import { ChannelsView } from '../components/ChannelsView';

interface ChannelsStubViewProps {
  config: PaymentConfig | null;
  onBack: () => void;
}

export function ChannelsStubView({ config, onBack }: ChannelsStubViewProps) {
  return (
    <div>
      <button type="button" className="portal-link" onClick={onBack} style={{ marginBottom: 'var(--sp-3)' }}>
        ← Overview
      </button>
      <ChannelsView config={config} />
    </div>
  );
}
