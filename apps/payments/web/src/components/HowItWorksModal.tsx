import { useCallback, type ReactNode } from 'react';
import { ActionModal } from '../layout/ActionModal';

interface HowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDeposit: () => void;
}

/**
 * Educational "How AntSeed works" explainer — Fund / Route / Settle.
 * Ported from the PR #502 redesign, adapted to our ActionModal + design
 * tokens, with the routing copy corrected to match today's behaviour
 * (no "auto-picks the best peer" / "fan-out" — that isn't built yet).
 */
export function HowItWorksModal({ isOpen, onClose, onOpenDeposit }: HowItWorksModalProps) {
  const handleStart = useCallback(() => {
    onClose();
    onOpenDeposit();
  }, [onClose, onOpenDeposit]);

  return (
    <ActionModal
      isOpen={isOpen}
      onClose={onClose}
      variant="wide"
      title="How AntSeed works"
      subtitle="A peer-to-peer network for AI services — fund once, route anywhere, pay per request."
    >
      <div className="hiw">
        <ol className="hiw-steps" aria-label="How AntSeed works">
          <HiwStep
            index={1}
            eyebrow="Fund"
            title="Deposit USDC, once."
            body="Top up with USDC on Base. The smart contract holds the balance — nothing leaves it without your signature."
            glyph={<DepositGlyph />}
          />
          <HiwStep
            index={2}
            eyebrow="Route"
            title="Reach many providers, one balance."
            body="Point your tools at AntSeed and reach providers across the network from a single balance — no juggling API keys."
            glyph={<RouteGlyph />}
          />
          <HiwStep
            index={3}
            eyebrow="Settle"
            title="Pay only for what you use."
            body="Each request streams a tiny payment. Stop any time and withdraw the unused balance — your USDC, your keys."
            glyph={<StreamGlyph />}
          />
        </ol>

        <div className="hiw-foot">
          <p className="hiw-note">
            Your signer never holds funds — it authorizes spending from a balance that always belongs to you.
          </p>
          <button type="button" className="btn primary hiw-cta" onClick={handleStart}>
            Start with a deposit
          </button>
        </div>
      </div>
    </ActionModal>
  );
}

interface HiwStepProps {
  index: number;
  eyebrow: string;
  title: string;
  body: string;
  glyph: ReactNode;
}

function HiwStep({ index, eyebrow, title, body, glyph }: HiwStepProps) {
  return (
    <li className="hiw-step" style={{ '--hiw-delay': `${index * 70}ms` } as React.CSSProperties}>
      <div className="hiw-step-glyph" aria-hidden="true">{glyph}</div>
      <div className="hiw-step-eyebrow">
        <span className="hiw-step-num">{String(index).padStart(2, '0')}</span>
        {eyebrow}
      </div>
      <h3 className="hiw-step-title">{title}</h3>
      <p className="hiw-step-text">{body}</p>
    </li>
  );
}

/* ── Bespoke glyphs (inline SVG, theme-aware via currentColor + tokens) ── */

function DepositGlyph() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hiw-coin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <rect x="10" y="38" width="52" height="22" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 44 H62" stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" opacity="0.55" />
      <circle cx="36" cy="20" r="9" fill="url(#hiw-coin)" stroke="currentColor" strokeWidth="1.2" />
      <text x="36" y="24" textAnchor="middle" fontSize="9" fontFamily="Geist, system-ui" fontWeight="700" fill="var(--on-accent)">$</text>
      <path d="M36 30 V37.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M33 35 L36 38 L39 35" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 52 L20.5 49.5 L23 52 L20.5 54.5 Z" fill="currentColor" opacity="0.18" />
      <path d="M49 50 L51.5 47.5 L54 50 L51.5 52.5 Z" fill="currentColor" opacity="0.12" />
    </svg>
  );
}

function RouteGlyph() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="36" r="5" fill="var(--accent)" />
      <circle cx="14" cy="36" r="9" stroke="var(--accent)" strokeWidth="1" opacity="0.35" />
      <path d="M19 36 Q34 16 56 16" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M19 36 Q34 28 56 30" stroke="currentColor" strokeWidth="1.4" fill="none" opacity="0.7" />
      <path d="M19 36 Q34 36 56 44" stroke="currentColor" strokeWidth="1.4" fill="none" opacity="0.55" />
      <path d="M19 36 Q34 50 56 58" stroke="currentColor" strokeWidth="1.4" fill="none" opacity="0.4" />
      <circle cx="58" cy="16" r="3.2" fill="var(--page-bg)" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="58" cy="30" r="3.2" fill="var(--page-bg)" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="58" cy="44" r="3.2" fill="var(--page-bg)" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="58" cy="58" r="3.2" fill="var(--page-bg)" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function StreamGlyph() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="18" width="52" height="36" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 26 H62" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <path d="M16 33 H44" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
      <path d="M16 39 H38" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
      <path d="M16 45 H50" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.35" />
      <circle cx="54" cy="33" r="2.4" fill="var(--accent)" />
      <circle cx="48" cy="39" r="2.4" fill="var(--accent)" opacity="0.7" />
      <circle cx="56" cy="45" r="2.4" fill="var(--accent)" opacity="0.45" />
      <path d="M22 22 L22 18 M30 22 L30 18 M38 22 L38 18" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}
