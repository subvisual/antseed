import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import type { OverlayPhase } from '../App';

interface EmptyStateOverlayProps {
  phase: OverlayPhase;
  onContinue: () => void;
}

function BigCheckIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="30" fill="var(--accent-dim)" stroke="var(--accent)" strokeWidth="2" />
      <path d="M20 33L28.5 41.5L44.5 23" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Post-deposit success celebration. First-run funding is handled inline by the
 * Overview "Get started" checklist, so this overlay only renders the 'success'
 * phase after a deposit completes.
 */
export function EmptyStateOverlay({ phase, onContinue }: EmptyStateOverlayProps) {
  const isVisible = phase !== null;

  useBodyScrollLock(isVisible);

  if (!isVisible) return null;

  return (
    <div className="empty-state-overlay" role="dialog" aria-label="Deposit complete">
      <div className="empty-state-card">
        <div className="empty-state-success">
          <div className="empty-state-success-icon">
            <BigCheckIcon />
          </div>
          <h2 className="empty-state-title">You're all set</h2>
          <p className="empty-state-subtitle">
            Your deposit is in. AntSeed will now route requests across the network —
            you only pay for what you use.
          </p>
          <div className="empty-state-success-actions">
            <button type="button" className="btn-primary" onClick={onContinue}>
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
