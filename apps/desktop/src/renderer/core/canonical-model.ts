/**
 * canonical-model.ts — pure helper for normalising model identifiers.
 *
 * v1.5: `resolveCanonicalKey` uses a precedence ladder:
 *   1. Declared `canonical` from the provider's v9+ metadata (highest).
 *   2. CURATED_CANONICAL_TABLE lookup (issue 2 fills this in).
 *   3. `canonicalizeModelId` fuzzy heuristic (v1 fallback).
 */

import type { DiscoverRow } from './state.js';

/**
 * Placeholder for the curated canonical table.
 * Issue 2 populates this with well-known model name normalizations.
 * Exported so tests can verify the table is reachable.
 */
export const CURATED_CANONICAL_TABLE: Record<string, string> = {};

/**
 * Known provider prefixes to strip. Keep the list short and obvious.
 * Order matters: longer/more-specific prefixes must come first so that
 * e.g. "openrouter/meta-llama/..." strips "openrouter/" and not nothing.
 */
const PROVIDER_PREFIXES = [
  'openrouter/',
  'huggingface/',
  'meta-llama/',
  'anthropic/',
  'together/',
  'mistralai/',
  'openai/',
] as const;

/**
 * Return the canonical form of a model identifier using the fuzzy heuristic.
 *
 * Steps:
 *  1. Lowercase + trim.
 *  2. Strip the first matching known-provider prefix (at most one).
 *
 * The optional `provider` hint is accepted for forward-compatibility with
 * the protocol's canonical field but is not used in v1.
 */
export function canonicalizeModelId(serviceId: string, _provider?: string): string {
  let id = serviceId.toLowerCase().trim();
  for (const prefix of PROVIDER_PREFIXES) {
    if (id.startsWith(prefix)) {
      id = id.slice(prefix.length);
      break; // strip at most one prefix
    }
  }
  return id;
}

/**
 * Resolve the canonical key for a DiscoverRow using the precedence ladder:
 *   1. Declared `canonical` field from the provider's v9+ metadata.
 *   2. CURATED_CANONICAL_TABLE lookup by serviceId.
 *   3. `canonicalizeModelId` fuzzy heuristic (v1 fallback).
 */
export function resolveCanonicalKey(row: DiscoverRow): string {
  // 1. Provider-declared canonical (highest priority)
  if (typeof row.canonical === 'string' && row.canonical.length > 0) {
    return row.canonical;
  }
  // 2. Curated table lookup
  const curated = CURATED_CANONICAL_TABLE[row.serviceId.toLowerCase().trim()];
  if (curated) {
    return curated;
  }
  // 3. Fuzzy heuristic fallback
  return canonicalizeModelId(row.serviceId, row.provider);
}

/**
 * Group discover rows by their canonical model key.
 *
 * Uses `resolveCanonicalKey` (precedence: declared > curated > fuzzy)
 * so that display-only label differences never affect deduplication.
 */
export function groupByCanonical(rows: DiscoverRow[]): Map<string, DiscoverRow[]> {
  const groups = new Map<string, DiscoverRow[]>();
  for (const row of rows) {
    const key = resolveCanonicalKey(row);
    const bucket = groups.get(key);
    if (bucket !== undefined) {
      bucket.push(row);
    } else {
      groups.set(key, [row]);
    }
  }
  return groups;
}
