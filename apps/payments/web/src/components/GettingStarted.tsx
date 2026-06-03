import { useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useBalance } from '../hooks/useBalance';
import { useUsage } from '../hooks/useUsage';
import { useAuthorizedWallet } from '../context/AuthorizedWalletContext';

// Persisted only for the "all set" confirmation (hide it for good once seen).
// The pending reminder is NOT persisted — it returns on the next visit while
// setup is incomplete, so skipped steps keep nudging.
const DONE_ACK_KEY = 'antseed.gettingStarted.doneAck';

type StepStatus = 'done' | 'todo';

interface Step {
  id: 'connect' | 'deposit' | 'authorize' | 'request';
  /** Banner headline when this is the next step. */
  prompt: string;
  status: StepStatus;
  action?: { label: string; onClick: () => void };
}

interface GettingStartedProps {
  onOpenDeposit: () => void;
  onOpenHowItWorks: () => void;
}

function readFlag(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
  } catch {
    // localStorage unavailable — ignore
  }
}

function CloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" fill="currentColor" />
      <path d="M5 8.2L7.2 10.4L11.2 6" stroke="var(--accent-text)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Minimal first-run nudge: a single slim banner that surfaces only the *next*
 * step (with tiny per-step progress dots) and advances as steps complete.
 * When funded-but-unauthorized it locks onto the Authorize step, goes amber,
 * and can't be dismissed (the one unrecoverable-funds risk).
 */
export function GettingStarted({ onOpenDeposit, onOpenHowItWorks }: GettingStartedProps) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { data: balance = null } = useBalance();
  const { data: usage = null } = useUsage();
  const { operatorSet, requireAuthorization } = useAuthorizedWallet();

  // Persisted ack for the "all set" row; session-only hide for the pending row.
  const [doneAck, setDoneAck] = useState<boolean>(() => readFlag(DONE_ACK_KEY));
  const [hidden, setHidden] = useState(false);

  const steps = useMemo<Step[]>(() => {
    const hasBalance = balance !== null && parseFloat(balance.total) > 0;
    const hasRequest = (usage?.totalRequests ?? 0) > 0;
    return [
      {
        id: 'connect',
        prompt: 'Connect your wallet',
        status: isConnected ? 'done' : 'todo',
        action: isConnected ? undefined : { label: 'Connect wallet', onClick: () => openConnectModal?.() },
      },
      {
        id: 'deposit',
        prompt: 'Make your first deposit',
        status: hasBalance ? 'done' : 'todo',
        action: hasBalance ? undefined : { label: 'Deposit USDC', onClick: onOpenDeposit },
      },
      {
        id: 'authorize',
        prompt: 'Authorize a recovery wallet',
        status: operatorSet === true ? 'done' : 'todo',
        action:
          operatorSet === false ? { label: 'Authorize wallet', onClick: () => requireAuthorization() } : undefined,
      },
      {
        id: 'request',
        prompt: 'Route your first request',
        status: hasRequest ? 'done' : 'todo',
        action: hasRequest ? undefined : { label: 'Show me how', onClick: onOpenHowItWorks },
      },
    ];
  }, [isConnected, balance, usage, operatorSet, requireAuthorization, openConnectModal, onOpenDeposit, onOpenHowItWorks]);

  const completed = steps.filter((s) => s.status === 'done').length;
  const total = steps.length;
  const allDone = completed === total;

  // Funded but unauthorized = the one unrecoverable-funds risk. Lock the banner
  // onto Authorize, make it amber, and don't allow dismissal while it's live.
  const hasBalance = balance !== null && parseFloat(balance.total) > 0;
  const atRisk = operatorSet === false && hasBalance;

  const firstTodo = steps.find((s) => s.status === 'todo') ?? null;
  const authorizeStep = steps.find((s) => s.id === 'authorize') ?? null;
  const nextStep = atRisk ? authorizeStep : firstTodo;
  const nextIndex = nextStep ? steps.findIndex((s) => s.id === nextStep.id) + 1 : total;

  function ackDone() {
    setDoneAck(true);
    writeFlag(DONE_ACK_KEY, true);
  }

  // ── All set: a slim confirmation row, permanently dismissable ──
  if (allDone) {
    if (doneAck) return null;
    return (
      <div className="gs-banner gs-banner--done" role="status">
        <span className="gs-banner-check" aria-hidden="true"><CheckIcon /></span>
        <span className="gs-banner-text">
          <strong className="gs-banner-title">You're all set</strong>
          <span className="gs-banner-sub">Your account is funded, authorized, and routing.</span>
        </span>
        <button type="button" className="gs-banner-x" onClick={ackDone} aria-label="Dismiss">
          <CloseIcon />
        </button>
      </div>
    );
  }

  // Pending reminder: dismissal is session-only, so it returns on the next visit
  // while setup is incomplete. (At-risk can't be dismissed at all.)
  if (hidden && !atRisk) return null;
  if (!nextStep) return null;

  const subText = atRisk
    ? "Your deposited funds aren't recoverable until you do."
    : `Step ${nextIndex} of ${total} to start routing requests.`;

  return (
    <div className={`gs-banner${atRisk ? ' gs-banner--risk' : ''}`} role="status">
      <span className="gs-banner-lead">
        <span className="gs-banner-eyebrow">Get started</span>
        <span className="gs-banner-dots" aria-hidden="true">
          {/* Progress meter tied to the step number: "step N of 4" fills N dots
              left-to-right (not per-step status, which can complete out of order). */}
          {steps.map((s, i) => (
            <span key={s.id} className={`gs-bdot${i < nextIndex ? ' gs-bdot--done' : ''}`} />
          ))}
        </span>
      </span>

      <span className="gs-banner-text">
        <strong className="gs-banner-title">{nextStep.prompt}</strong>
        <span className="gs-banner-sub">{subText}</span>
      </span>

      <span className="gs-banner-actions">
        {nextStep.action && (
          <button type="button" className="gs-banner-btn" onClick={nextStep.action.onClick}>
            {nextStep.action.label}
          </button>
        )}
        {!atRisk && (
          <button type="button" className="gs-banner-x" onClick={() => setHidden(true)} aria-label="Hide for now">
            <CloseIcon />
          </button>
        )}
      </span>
    </div>
  );
}
