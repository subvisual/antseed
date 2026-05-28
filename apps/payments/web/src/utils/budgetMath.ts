/**
 * Budget math utilities — pure, no React, fully testable.
 *
 * Aggregates spend-this-month from ActivityItems and computes
 * budget meter values (percent of cap, warning thresholds).
 */
import type { ActivityItem } from '../api';

// ── Calendar helpers ──────────────────────────────────────────────────────────

/** Returns true iff the Unix timestamp (seconds) falls within the current
 *  calendar month (local time). */
export function isCurrentMonth(tsSecs: number): boolean {
  const d = new Date(tsSecs * 1000);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

// ── Spend aggregation ─────────────────────────────────────────────────────────

/**
 * Sum of spend (negative/outgoing) items in the current calendar month.
 *
 * ActivityItem.amount is a formatted USDC string (e.g. "$14.20" or "14.200000").
 * Only items where positive === false are counted (i.e. settlements / closes).
 *
 * Returns a non-negative number (dollars, 6-decimal precision).
 */
export function spendThisMonth(items: ActivityItem[]): number {
  let total = 0;
  for (const item of items) {
    if (item.positive) continue;
    if (!isCurrentMonth(item.ts)) continue;
    // Strip leading "$", currency symbols, commas, then parse
    const raw = item.amount.replace(/[$,]/g, '').trim();
    const n = parseFloat(raw);
    if (isFinite(n) && n > 0) total += n;
  }
  return total;
}

// ── Meter helpers ─────────────────────────────────────────────────────────────

/** Clamp to [0, 1]. */
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Returns the fraction of the budget cap used (0–1).
 * Returns 0 when cap is 0 or invalid.
 */
export function budgetFraction(spend: number, cap: number): number {
  if (!cap || cap <= 0) return 0;
  return clamp01(spend / cap);
}

/**
 * Warning level:
 *   'none'    — spend < 80 % of cap (or no cap set)
 *   'warning' — spend >= 80 % of cap
 *   'critical' — spend >= 100 % of cap
 */
export type BudgetWarningLevel = 'none' | 'warning' | 'critical';

export function budgetWarningLevel(spend: number, cap: number): BudgetWarningLevel {
  if (!cap || cap <= 0) return 'none';
  const frac = spend / cap;
  if (frac >= 1) return 'critical';
  if (frac >= 0.8) return 'warning';
  return 'none';
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** Format a USDC dollar amount: "$14.20" (2 decimal places). */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
