import { useState, useRef, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon } from '@hugeicons/core-free-icons';
import styles from './VariantChip.module.scss';

export const BASE_VARIANT = 'Base';

type VariantChipProps = {
  /** The currently selected variant. 'Base' means no variant filter. */
  value: string;
  /** Unique variant names declared by the current model's candidate peers. */
  variants: string[];
  disabled?: boolean;
  onChange: (variant: string) => void;
};

/**
 * Dropdown chip that lets the user select a routing variant for the current
 * chat. Only rendered when the current model has ≥1 declared variant in its
 * candidate peer set. Mirrors RoutingPriorityChip in structure and styling.
 */
export function VariantChip({ value, variants, disabled, onChange }: VariantChipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // All options: 'Base' first, then unique variants in lexicographic order.
  const uniqueVariants = Array.from(new Set(variants)).sort((a, b) => a.localeCompare(b));
  const options = [BASE_VARIANT, ...uniqueVariants];

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

  function handleOptionClick(variant: string) {
    onChange(variant);
    setOpen(false);
  }

  const triggerLabel = value === BASE_VARIANT ? 'Base' : value;
  const ariaLabel = `Routing variant: ${triggerLabel}`;

  return (
    <div className={styles.chip} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title={`Variant: ${triggerLabel}`}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={styles.label}>{triggerLabel}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.5} />
      </button>

      {open && (
        <div className={styles.menu} role="listbox" aria-label="Select routing variant">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={opt === value}
              className={`${styles.item}${opt === value ? ` ${styles.active}` : ''}`}
              onClick={() => handleOptionClick(opt)}
            >
              <span className={styles.itemLabel}>{opt}</span>
              {opt === BASE_VARIANT && (
                <span className={styles.itemDesc}>Standard peers — no variant filter</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
