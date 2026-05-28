/**
 * BudgetSection — monthly budget meter, low-balance nudge, and credit-limit context.
 *
 * Wires to:
 *   - useActivity()  → spend-this-month aggregation (pure, tested math in budgetMath.ts)
 *   - useBalance()   → available balance + creditLimit
 *   - localStorage   → budget cap, low-balance threshold, pause-at-cap toggle
 *     (keys: antseed-payments-budget-cap, antseed-payments-budget-threshold,
 *            antseed-payments-budget-pause)
 *   - onOpenDeposit  → one-click top-up when balance < threshold
 *
 * The "pause routing at cap" toggle is UI-only. Actual enforcement requires
 * cross-process wiring to the buyer-proxy that is not available from the Portal.
 * The toggle state is persisted so the desktop/CLI can read it in a future release.
 * TODO(follow-up): wire antseed-payments-budget-pause to buyer-proxy routing config.
 */
import { useState, useCallback, useEffect, useId } from 'react';
import { useActivity } from '../hooks/useActivity';
import { useBalance } from '../hooks/useBalance';
import {
  spendThisMonth,
  budgetFraction,
  budgetWarningLevel,
  formatUsd,
} from '../utils/budgetMath';
import './BudgetSection.scss';

// ── localStorage keys ─────────────────────────────────────────────────────────

const LS_CAP       = 'antseed-payments-budget-cap';
const LS_THRESHOLD = 'antseed-payments-budget-threshold';
const LS_PAUSE     = 'antseed-payments-budget-pause';

function readNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  const n = parseFloat(raw);
  return isFinite(n) && n >= 0 ? n : fallback;
}

function readBool(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

// ── Sub-component: BudgetMeter ────────────────────────────────────────────────

interface BudgetMeterProps {
  spend: number;
  cap: number;
  loading: boolean;
  onChangeCap: (v: number) => void;
  pauseAtCap: boolean;
  onChangePause: (v: boolean) => void;
  pauseToggleId: string;
}

function BudgetMeter({
  spend,
  cap,
  loading,
  onChangeCap,
  pauseAtCap,
  onChangePause,
  pauseToggleId,
}: BudgetMeterProps) {
  const fraction = budgetFraction(spend, cap);
  const warnLevel = budgetWarningLevel(spend, cap);
  const pct = Math.round(fraction * 100);

  // Local draft for the cap input so we don't save on every keystroke
  const [capDraft, setCapDraft] = useState<string>(() => cap > 0 ? String(cap) : '');
  const [capSaved, setCapSaved] = useState(false);

  // Keep draft in sync if parent changes cap (e.g. initial load)
  useEffect(() => {
    setCapDraft(cap > 0 ? String(cap) : '');
  }, [cap]);

  const handleCapSave = useCallback(() => {
    const n = parseFloat(capDraft);
    if (isFinite(n) && n >= 0) {
      onChangeCap(n);
      setCapSaved(true);
      setTimeout(() => setCapSaved(false), 2000);
    }
  }, [capDraft, onChangeCap]);

  const handleCapKey = useCallback(
    (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleCapSave(); },
    [handleCapSave],
  );

  const meterClass = warnLevel === 'critical'
    ? 'budget-meter__bar budget-meter__bar--critical'
    : warnLevel === 'warning'
    ? 'budget-meter__bar budget-meter__bar--warning'
    : 'budget-meter__bar';

  return (
    <>
      {/* ── Monthly budget meter row ── */}
      <div className="set-item">
        <div className="set-copy">
          <h4>Monthly budget</h4>
          <p>Cap how much you spend per calendar month. A meter tracks progress; we warn as you approach the limit.</p>
        </div>
        <div className="set-ctrl budget-meter-ctrl">
          {loading ? (
            <span className="budget-loading">Loading…</span>
          ) : cap > 0 ? (
            <>
              <div className="budget-meter__label">
                <span className={warnLevel !== 'none' ? `budget-meter__spent--${warnLevel}` : 'budget-meter__spent'}>
                  {formatUsd(spend)}
                </span>
                <span className="budget-meter__of"> of {formatUsd(cap)} this month</span>
                {warnLevel === 'warning'  && <span className="budget-badge budget-badge--warn">  {pct}%</span>}
                {warnLevel === 'critical' && <span className="budget-badge budget-badge--critical">At cap</span>}
              </div>
              <div className="budget-meter__track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Monthly spend vs budget cap">
                <div className={meterClass} style={{ width: `${pct}%` }} />
              </div>
            </>
          ) : (
            <span className="budget-unset">No cap set</span>
          )}

          {/* Cap input */}
          <div className="budget-cap-row">
            <span className="budget-cap-prefix">$</span>
            <input
              className="set-input budget-cap-input"
              type="number"
              min="0"
              step="1"
              placeholder="e.g. 50"
              value={capDraft}
              onChange={(e) => { setCapDraft(e.target.value); setCapSaved(false); }}
              onKeyDown={handleCapKey}
              aria-label="Monthly budget cap in USD"
            />
            <button
              type="button"
              className="set-btn-ghost"
              onClick={handleCapSave}
              disabled={!capDraft}
            >
              {capSaved ? 'Saved' : 'Set'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Pause routing at cap row ── */}
      <div className="set-item">
        <div className="set-copy">
          <h4>Pause routing at cap</h4>
          <p>
            When monthly spend reaches the cap, pause new requests.{' '}
            <span className="budget-note">
              Toggle is saved; enforcement is coming in a future desktop update.
            </span>
          </p>
        </div>
        <div className="set-ctrl">
          <label
            className={`set-toggle${pauseAtCap ? ' set-toggle--on' : ''}`}
            title={pauseAtCap ? 'Pause routing at cap: on' : 'Pause routing at cap: off'}
            aria-label={pauseAtCap ? 'Pause routing at cap: on' : 'Pause routing at cap: off'}
          >
            <input
              id={pauseToggleId}
              type="checkbox"
              checked={pauseAtCap}
              onChange={(e) => onChangePause(e.target.checked)}
            />
            <span className="set-toggle-track" />
            <span className="set-toggle-thumb" />
          </label>
        </div>
      </div>
    </>
  );
}

// ── Sub-component: LowBalanceRow ──────────────────────────────────────────────

interface LowBalanceRowProps {
  available: number;
  threshold: number;
  onChangeThreshold: (v: number) => void;
  onOpenDeposit: () => void;
}

function LowBalanceRow({
  available,
  threshold,
  onChangeThreshold,
  onOpenDeposit,
}: LowBalanceRowProps) {
  const [draft, setDraft] = useState<string>(() => threshold > 0 ? String(threshold) : '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(threshold > 0 ? String(threshold) : '');
  }, [threshold]);

  const handleSave = useCallback(() => {
    const n = parseFloat(draft);
    if (isFinite(n) && n >= 0) {
      onChangeThreshold(n);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }, [draft, onChangeThreshold]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSave(); },
    [handleSave],
  );

  const belowThreshold = threshold > 0 && available < threshold;

  return (
    <div className="set-item">
      <div className="set-copy">
        <h4>Low-balance nudge</h4>
        <p>When available balance drops below this amount, we'll prompt a one-click top-up.</p>
      </div>
      <div className="set-ctrl budget-threshold-ctrl">
        {belowThreshold && (
          <div className="budget-low-balance-alert">
            <span className="budget-low-balance-msg">
              Balance is below {formatUsd(threshold)}
            </span>
            <button
              type="button"
              className="btn-primary budget-topup-btn"
              onClick={onOpenDeposit}
            >
              Top up
            </button>
          </div>
        )}
        <div className="budget-cap-row">
          <span className="budget-cap-prefix">$</span>
          <input
            className="set-input budget-cap-input"
            type="number"
            min="0"
            step="1"
            placeholder="e.g. 20"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setSaved(false); }}
            onKeyDown={handleKey}
            aria-label="Low-balance nudge threshold in USD"
          />
          <button
            type="button"
            className="set-btn-ghost"
            onClick={handleSave}
            disabled={!draft}
          >
            {saved ? 'Saved' : 'Set'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-component: CreditLimitRow ─────────────────────────────────────────────

function CreditLimitRow({ creditLimit }: { creditLimit: string | null }) {
  const n = creditLimit ? parseFloat(creditLimit) : null;
  const display = n !== null && isFinite(n) ? formatUsd(n) : '—';

  return (
    <div className="set-item">
      <div className="set-copy">
        <h4>Credit limit</h4>
        <p>Maximum balance you can hold on-chain. Set by the protocol.</p>
      </div>
      <div className="set-ctrl">
        <span className="budget-credit-limit">{display}</span>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface BudgetSectionProps {
  onOpenDeposit: () => void;
}

export function BudgetSection({ onOpenDeposit }: BudgetSectionProps) {
  const { activity, isLoading: activityLoading } = useActivity();
  const { data: balanceData } = useBalance();

  // Persisted budget settings
  const [cap, setCap] = useState<number>(() => readNumber(LS_CAP, 0));
  const [threshold, setThreshold] = useState<number>(() => readNumber(LS_THRESHOLD, 0));
  const [pauseAtCap, setPauseAtCap] = useState<boolean>(() => readBool(LS_PAUSE, false));

  const pauseToggleId = useId();

  const handleChangeCap = useCallback((v: number) => {
    setCap(v);
    localStorage.setItem(LS_CAP, String(v));
  }, []);

  const handleChangeThreshold = useCallback((v: number) => {
    setThreshold(v);
    localStorage.setItem(LS_THRESHOLD, String(v));
  }, []);

  const handleChangePause = useCallback((v: boolean) => {
    setPauseAtCap(v);
    localStorage.setItem(LS_PAUSE, String(v));
  }, []);

  // Compute spend from activity data
  const spend = spendThisMonth(activity);

  const available = balanceData ? parseFloat(balanceData.available) : 0;
  const creditLimit = balanceData?.creditLimit ?? null;

  return (
    <>
      <div className="settings-section-label">Budget</div>
      <div className="settings-card">
        <BudgetMeter
          spend={spend}
          cap={cap}
          loading={activityLoading && activity.length === 0}
          onChangeCap={handleChangeCap}
          pauseAtCap={pauseAtCap}
          onChangePause={handleChangePause}
          pauseToggleId={pauseToggleId}
        />
        <LowBalanceRow
          available={available}
          threshold={threshold}
          onChangeThreshold={handleChangeThreshold}
          onOpenDeposit={onOpenDeposit}
        />
        <CreditLimitRow creditLimit={creditLimit} />
      </div>
    </>
  );
}
