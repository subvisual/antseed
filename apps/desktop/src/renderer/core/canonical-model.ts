/**
 * canonical-model.ts — pure helper for normalising model identifiers.
 *
 * Conservative heuristic: better to miss a collapse than to wrongly merge
 * two distinct models. A v1.5 protocol `canonical` field will supplant this.
 */

import type { DiscoverRow } from './state.js';

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
 * Return the canonical form of a model identifier.
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
 * Group discover rows by their canonical model key.
 *
 * Uses `serviceId` (not `serviceLabel`) as the grouping key so that
 * display-only label differences never affect deduplication.
 */
export function groupByCanonical(rows: DiscoverRow[]): Map<string, DiscoverRow[]> {
  const groups = new Map<string, DiscoverRow[]>();
  for (const row of rows) {
    const key = canonicalizeModelId(row.serviceId, row.provider);
    const bucket = groups.get(key);
    if (bucket !== undefined) {
      bucket.push(row);
    } else {
      groups.set(key, [row]);
    }
  }
  return groups;
}
