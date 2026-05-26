import { useState, useRef, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon } from '@hugeicons/core-free-icons';
import styles from './RoutingPriorityChip.module.scss';

export type RoutingPriority = 'cheapest' | 'fastest' | 'most-trusted';

type RoutingPriorityOption = {
  value: RoutingPriority;
  label: string;
  description: string;
};

const OPTIONS: RoutingPriorityOption[] = [
  {
    value: 'most-trusted',
    label: 'Most Trusted',
    description: 'Prefer peers with strong on-chain reputation',
  },
  {
    value: 'fastest',
    label: 'Fastest',
    description: 'Prefer peers with lowest measured latency',
  },
  {
    value: 'cheapest',
    label: 'Cheapest',
    description: 'Prefer peers with the lowest token price',
  },
];

const TOOLTIP_COPY =
  'Pick how AntStation routes this chat. ' +
  'Cheapest minimizes cost. Fastest minimizes latency. ' +
  'Most Trusted picks providers with the strongest on-chain stake and reputation.';

type RoutingPriorityChipProps = {
  /** Pass `undefined` for brand-new chats — renders the ? state with a tooltip. */
  value: RoutingPriority | undefined;
  disabled?: boolean;
  /** Whether the one-time tooltip has already been dismissed by this buyer. */
  tooltipDismissed?: boolean;
  onChange: (value: RoutingPriority) => void;
  /** Called when the tooltip is dismissed without picking (defaults to Most Trusted). */
  onTooltipDismiss?: () => void;
};

export function RoutingPriorityChip({
  value,
  disabled,
  tooltipDismissed,
  onChange,
  onTooltipDismiss,
}: RoutingPriorityChipProps) {
  const isUnset = value === undefined;
  const [open, setOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(isUnset && !tooltipDismissed);
  const ref = useRef<HTMLDivElement>(null);

  // Re-open tooltip when transitioning from a set state to unset (new chat).
  useEffect(() => {
    if (isUnset && !tooltipDismissed) {
      setTooltipOpen(true);
    } else {
      setTooltipOpen(false);
    }
  }, [isUnset, tooltipDismissed]);

  const selected = OPTIONS.find((o) => o.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close tooltip when clicking outside.
  useEffect(() => {
    if (!tooltipOpen) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setTooltipOpen(false);
        onTooltipDismiss?.();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [tooltipOpen, onTooltipDismiss]);

  function handleTriggerClick() {
    if (isUnset) {
      // Toggle the tooltip (and open the menu so user can pick).
      setTooltipOpen((prev) => !prev);
      setOpen((prev) => !prev);
    } else {
      setOpen((o) => !o);
    }
  }

  function handleOptionClick(priority: RoutingPriority) {
    onChange(priority);
    setOpen(false);
    setTooltipOpen(false);
  }

  const triggerLabel = isUnset ? '?' : selected?.label ?? '?';
  const triggerTitle = isUnset
    ? 'Pick routing priority for this chat'
    : (selected?.description ?? '');
  const ariaLabel = isUnset
    ? 'Routing priority: not set — click to choose'
    : `Routing priority: ${selected?.label ?? ''}`;

  return (
    <div
      className={`${styles.chip}${isUnset ? ` ${styles.unset}` : ''}`}
      ref={ref}
    >
      <button
        type="button"
        className={styles.trigger}
        disabled={disabled}
        onClick={handleTriggerClick}
        title={triggerTitle}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={`${styles.label}${isUnset ? ` ${styles.labelUnset}` : ''}`}>
          {triggerLabel}
        </span>
        {!isUnset && (
          <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.5} />
        )}
      </button>

      {tooltipOpen && !open && (
        <div className={styles.tooltip} role="tooltip">
          <p className={styles.tooltipText}>{TOOLTIP_COPY}</p>
          <button
            type="button"
            className={styles.tooltipDismiss}
            onClick={() => {
              setTooltipOpen(false);
              onTooltipDismiss?.();
            }}
          >
            Got it
          </button>
        </div>
      )}

      {open && (
        <div className={styles.menu} role="listbox" aria-label="Select routing priority">
          {isUnset && (
            <p className={styles.menuTooltipHint}>{TOOLTIP_COPY}</p>
          )}
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={`${styles.item}${opt.value === value ? ` ${styles.active}` : ''}`}
              onClick={() => handleOptionClick(opt.value)}
            >
              <span className={styles.itemLabel}>{opt.label}</span>
              <span className={styles.itemDesc}>{opt.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
