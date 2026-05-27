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
 * Hand-curated canonical fallback table seeded from the 7 official in-repo
 * plugins (provider-anthropic, provider-claude-code, provider-claude-oauth,
 * provider-openai, provider-openai-responses, provider-local-llm,
 * router-local). Keys are lowercased serviceIds. Values are the stable base
 * name that dedup logic should group under.
 *
 * This table is consulted after the provider-declared `canonical` field but
 * before the v1 fuzzy heuristic, giving day-1 dedup coverage for external
 * providers that emit the same well-known strings without migrating to
 * declare `canonical` themselves.
 *
 * Keep this list small and focused — only what the official plugins actually
 * ship. The declared `canonical` field in v9+ metadata is the long-term
 * source of truth.
 */
export const CURATED_CANONICAL_TABLE: Record<string, string> = {
  // ---- Anthropic models (provider-anthropic, provider-claude-code,
  //      provider-claude-oauth) — dated suffixes collapse to base name ------
  // Claude 4 generation
  'claude-opus-4-7': 'claude-opus-4-7',
  'claude-opus-4-6': 'claude-opus-4-6',
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  'claude-sonnet-4-5': 'claude-sonnet-4-5',
  'claude-sonnet-4-5-20250929': 'claude-sonnet-4-5',
  'claude-haiku-4-5': 'claude-haiku-4-5',
  // Claude 3.x generation
  'claude-3-5-sonnet-20241022': 'claude-3-5-sonnet',
  'claude-3-5-sonnet-20240620': 'claude-3-5-sonnet',
  'claude-3-5-haiku-20241022': 'claude-3-5-haiku',
  'claude-3-opus-20240229': 'claude-3-opus',
  'claude-3-sonnet-20240229': 'claude-3-sonnet',
  'claude-3-haiku-20240307': 'claude-3-haiku',

  // ---- OpenAI models (provider-openai) ------------------------------------
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
  'gpt-4.1': 'gpt-4.1',
  'gpt-4.1-mini': 'gpt-4.1-mini',
  'gpt-oss-120b': 'gpt-oss-120b',
  'o1': 'o1',
  'o1-mini': 'o1-mini',
  'o3': 'o3',
  'o3-mini': 'o3-mini',
  'o4-mini': 'o4-mini',

  // ---- OpenAI Responses (provider-openai-responses) -----------------------
  // "codex" is the well-known service used in setup-local-test.sh
  'codex': 'codex',

  // ---- Third-party models typically served via provider-openai ------------
  'deepseek-v4-flash': 'deepseek-v4-flash',
  'deepseek-v3.1': 'deepseek-v3.1',
  'qwen3-coder-480b': 'qwen3-coder-480b',
  'qwen-3-coder-480b': 'qwen3-coder-480b',
  'kimi-k2.5': 'kimi-k2.5',
  'minimax-m2.7': 'minimax-m2.7',
};

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
