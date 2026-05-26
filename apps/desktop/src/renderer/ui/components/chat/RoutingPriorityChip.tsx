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

type RoutingPriorityChipProps = {
  value: RoutingPriority;
  disabled?: boolean;
  onChange: (value: RoutingPriority) => void;
};

export function RoutingPriorityChip({ value, disabled, onChange }: RoutingPriorityChipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0]!;

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

  return (
    <div className={styles.chip} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title={selected.description}
        aria-label={`Routing priority: ${selected.label}`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={styles.label}>{selected.label}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.5} />
      </button>
      {open && (
        <div className={styles.menu} role="listbox" aria-label="Select routing priority">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={`${styles.item}${opt.value === value ? ` ${styles.active}` : ''}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
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
