/**
 * Skeleton — token-driven loading placeholder components.
 *
 * Each variant matches the shape of a specific view region.
 * All sizing uses CSS variable tokens (--sp-*, --radius-*) — no raw px/hex.
 */
import './Skeleton.scss';

interface SkeletonBoxProps {
  /** Width as a CSS value string — MUST use token or %, e.g. "var(--sp-7)" or "60%". */
  width?: string;
  /** Height as a CSS value string — MUST use token or rem, e.g. "1.5rem". */
  height?: string;
  className?: string;
}

/** Primitive animated shimmer box. */
export function SkeletonBox({ width = '100%', height = '1rem', className }: SkeletonBoxProps) {
  return (
    <span
      className={`skeleton-box${className ? ` ${className}` : ''}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

/** Hero balance block skeleton (large number + sub-text + action row). */
export function SkeletonHero() {
  return (
    <div className="skeleton-hero" aria-hidden="true" aria-label="Loading balance">
      <SkeletonBox width="40%" height="0.625rem" />
      <SkeletonBox width="55%" height="2.5rem" className="skeleton-hero__value" />
      <SkeletonBox width="70%" height="0.75rem" className="skeleton-hero__note" />
      <div className="skeleton-hero__actions">
        <SkeletonBox width="6.5rem" height="2.125rem" className="skeleton-hero__btn" />
        <SkeletonBox width="5.5rem" height="2.125rem" className="skeleton-hero__btn" />
      </div>
    </div>
  );
}

/** Stat row skeleton — matches the 4-stat .portal-stats layout. */
export function SkeletonStatRow({ count = 4 }: { count?: number }) {
  return (
    <div className="skeleton-stat-row" aria-hidden="true" aria-label="Loading stats">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-stat">
          <SkeletonBox width="50%" height="0.625rem" />
          <SkeletonBox width="65%" height="1.4375rem" className="skeleton-stat__num" />
        </div>
      ))}
    </div>
  );
}

/** List skeleton — matches .portal-list-row items (e.g. recent activity). */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-list" aria-hidden="true" aria-label="Loading list">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-list__row">
          <SkeletonBox width="55%" height="0.75rem" />
          <SkeletonBox width="20%" height="0.75rem" />
        </div>
      ))}
    </div>
  );
}

/** Chart skeleton — matches the UsageChart column bars layout. */
export function SkeletonChart({ bars = 14 }: { bars?: number }) {
  return (
    <div className="skeleton-chart" aria-hidden="true" aria-label="Loading chart">
      {Array.from({ length: bars }).map((_, i) => {
        // Pseudo-random heights so the skeleton feels like a real chart
        const heightPct = 20 + ((i * 37 + 11) % 70);
        return (
          <div key={i} className="skeleton-chart__col">
            <span
              className="skeleton-box skeleton-chart__bar"
              style={{ height: `${heightPct}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
