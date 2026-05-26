/**
 * forecast.ts — pure helper to compute per-model forecast display data.
 *
 * Given a canonical model's candidate peers and the user's current routing
 * priority, returns the stats of the single peer that would win under that
 * priority — identical tie-break rules to the CLI's sortPeersByPriority in
 * apps/cli/src/proxy/routing-priority.ts.
 *
 * Import boundary: this file lives in the renderer and cannot import the CLI
 * (Node.js side). The comparators below are a renderer-side mirror of the CLI
 * logic. A cross-check test in forecast.test.ts verifies they agree on a
 * shared fixture to catch any divergence.
 */

import type { DiscoverRow } from './state.js';

// Re-export RoutingPriority from state so callers have one import point.
// The state module declares it inline as a string union on RendererUiState;
// we derive the type from there rather than redeclaring it.
export type RoutingPriority = 'cheapest' | 'fastest' | 'most-trusted';

// ---------------------------------------------------------------------------
// Forecast result
// ---------------------------------------------------------------------------

export type ForecastResult = {
  /**
   * Blended per-1k-token price in USD, or null when no candidate has pricing.
   *
   * Blending formula: midpoint of input and output USD/M rates, then scaled
   * to per-1k. Using the midpoint is a fast strawman — callers rendering the
   * value should label it "~$X/1k" to communicate the approximation.
   */
  pricePer1kUsd: number | null;

  /** Latency of the winning peer in ms, or null when not yet measured. */
  latencyMs: number | null;

  /** Number of candidate peers for this model (the full set, not just those with data). */
  providerCount: number;
};

// ---------------------------------------------------------------------------
// On-chain trust scoring (mirrors CLI's computeTrustScore exactly)
// ---------------------------------------------------------------------------

// Reference maxima — keep in sync with apps/cli/src/proxy/routing-priority.ts.
const STAKE_MAX = 100_000_000; // 100 USDC in micros
const VOLUME_MAX = 1_000_000_000; // 1000 USDC in micros
const REP_MAX = 100; // reputation is already 0-100

function normalise(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(value / max, 1);
}

/**
 * Derive a stake value in micros from DiscoverRow.
 *
 * DiscoverRow.stakeUsdc is a bigint-string of 6-decimal USDC, so
 * "1.000000" = 1 USDC = 1_000_000 micros. We parse it as a float and
 * multiply by 1e6 to get micros, matching PeerInfo.onChainStakeUsdcMicros.
 */
function stakeUsdcMicros(row: DiscoverRow): number {
  const v = parseFloat(row.stakeUsdc);
  return isNaN(v) ? 0 : v * 1_000_000;
}

/**
 * Derive total volume in micros from DiscoverRow.
 *
 * DiscoverRow.onChainTotalVolumeUsdc is a bigint-string of 6-decimal USDC.
 */
function totalVolumeUsdcMicros(row: DiscoverRow): number {
  const v = parseFloat(row.onChainTotalVolumeUsdc);
  return isNaN(v) ? 0 : v * 1_000_000;
}

/**
 * Compute a composite on-chain trust score in [0, 1].
 *
 * Mirrors apps/cli/src/proxy/routing-priority.ts computeTrustScore, adapted
 * for DiscoverRow field names. Five signals, equal weight:
 *   stakeUsdcMicros    (higher = better)
 *   trustScore         (higher = better)
 *   sybilRisk          (lower  = better → inverted)
 *   totalVolumeUsdc    (higher = better)
 *   reputationScore    (higher = better, 0-100 normalised to 0-1)
 */
export function computeRowTrustScore(row: DiscoverRow): number {
  const stake = normalise(stakeUsdcMicros(row), STAKE_MAX);
  const trust = normalise(row.onChainTrustScore ?? 0, 1);
  const sybil = 1 - normalise(row.onChainSybilRisk ?? 1, 1); // invert risk
  const volume = normalise(totalVolumeUsdcMicros(row), VOLUME_MAX);
  const rep = normalise(row.onChainReputationScore ?? 0, REP_MAX);
  return (stake + trust + sybil + volume + rep) / 5;
}

// ---------------------------------------------------------------------------
// Renderer-side comparator — mirrors sortPeersByPriority from the CLI
// ---------------------------------------------------------------------------

/**
 * Pick the single winning DiscoverRow under `priority`.
 *
 * Uses the same tie-break rules as the CLI:
 *   cheapest    — lowest (input + output) USD/M; missing price = +Infinity
 *   fastest     — lowest latencyMs; missing = +Infinity
 *   most-trusted — highest composite on-chain trust score
 *
 * Returns null when `rows` is empty.
 */
export function pickWinnerByPriority(
  rows: DiscoverRow[],
  priority: RoutingPriority,
): DiscoverRow | null {
  if (rows.length === 0) return null;

  switch (priority) {
    case 'cheapest': {
      return rows.reduce((best, row) => {
        const bPrice =
          (best.inputUsdPerMillion ?? Infinity) +
          (best.outputUsdPerMillion ?? Infinity);
        const rPrice =
          (row.inputUsdPerMillion ?? Infinity) +
          (row.outputUsdPerMillion ?? Infinity);
        return rPrice < bPrice ? row : best;
      });
    }
    case 'fastest': {
      return rows.reduce((best, row) => {
        const bLat = best.latencyMs ?? Infinity;
        const rLat = row.latencyMs ?? Infinity;
        return rLat < bLat ? row : best;
      });
    }
    case 'most-trusted': {
      return rows.reduce((best, row) => {
        return computeRowTrustScore(row) > computeRowTrustScore(best)
          ? row
          : best;
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute forecast display components for a canonical model.
 *
 * @param rows     All candidate DiscoverRows for a single canonical model.
 * @param priority The user's active routing priority.
 * @returns        Stats of the peer that would win the routing election, plus
 *                 providerCount = total candidates regardless of data completeness.
 */
export function computeForecast(
  rows: DiscoverRow[],
  priority: RoutingPriority,
): ForecastResult {
  const providerCount = rows.length;
  const winner = pickWinnerByPriority(rows, priority);

  if (winner === null) {
    return { pricePer1kUsd: null, latencyMs: null, providerCount };
  }

  // Blended price: midpoint of input and output rates, scaled from per-million
  // to per-1k. Returns null if either rate is missing.
  const inputRate = winner.inputUsdPerMillion;
  const outputRate = winner.outputUsdPerMillion;
  const pricePer1kUsd =
    inputRate !== null && outputRate !== null
      ? ((inputRate + outputRate) / 2 / 1_000) // midpoint, /M → /1k
      : null;

  return {
    pricePer1kUsd,
    latencyMs: winner.latencyMs,
    providerCount,
  };
}
