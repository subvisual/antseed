import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeModelId, groupByCanonical, resolveCanonicalKey, CURATED_CANONICAL_TABLE } from './canonical-model.js';
import type { DiscoverRow } from './state.js';

// ---------------------------------------------------------------------------
// canonicalizeModelId
// ---------------------------------------------------------------------------

test('canonicalizeModelId: lowercases and trims whitespace', () => {
  assert.equal(canonicalizeModelId('  GPT-4o  '), 'gpt-4o');
});

test('canonicalizeModelId: strips openai/ prefix', () => {
  assert.equal(canonicalizeModelId('openai/gpt-4o'), 'gpt-4o');
});

test('canonicalizeModelId: strips anthropic/ prefix', () => {
  assert.equal(canonicalizeModelId('anthropic/claude-3-5-sonnet-20241022'), 'claude-3-5-sonnet-20241022');
});

test('canonicalizeModelId: strips together/ prefix', () => {
  assert.equal(canonicalizeModelId('together/mistral-7b-instruct'), 'mistral-7b-instruct');
});

test('canonicalizeModelId: strips openrouter/ prefix', () => {
  assert.equal(canonicalizeModelId('openrouter/meta-llama/llama-3.1-8b-instruct'), 'meta-llama/llama-3.1-8b-instruct');
});

test('canonicalizeModelId: strips huggingface/ prefix', () => {
  assert.equal(canonicalizeModelId('huggingface/mistralai/mistral-7b-v0.1'), 'mistralai/mistral-7b-v0.1');
});

test('canonicalizeModelId: strips meta-llama/ prefix', () => {
  assert.equal(canonicalizeModelId('meta-llama/llama-3.1-8b-instruct'), 'llama-3.1-8b-instruct');
});

test('canonicalizeModelId: no prefix is a no-op beyond lowercase/trim', () => {
  assert.equal(canonicalizeModelId('gpt-4o'), 'gpt-4o');
});

test('canonicalizeModelId: empty string returns empty string', () => {
  assert.equal(canonicalizeModelId(''), '');
});

test('canonicalizeModelId: accepts optional provider hint (unused in v1)', () => {
  // provider hint does not affect output — it is reserved for v1.5 canonical field
  assert.equal(canonicalizeModelId('openai/gpt-4o', 'openai'), 'gpt-4o');
});

// ---------------------------------------------------------------------------
// True-positive collapse: same canonical key
// ---------------------------------------------------------------------------

test('canonicalizeModelId TRUE-POSITIVE: openai/gpt-4o and gpt-4o merge', () => {
  assert.equal(canonicalizeModelId('openai/gpt-4o'), canonicalizeModelId('gpt-4o'));
});

test('canonicalizeModelId TRUE-POSITIVE: Anthropic/Claude-3-5-Sonnet collapses with bare id', () => {
  assert.equal(
    canonicalizeModelId('anthropic/claude-3-5-sonnet-20241022'),
    canonicalizeModelId('claude-3-5-sonnet-20241022'),
  );
});

// ---------------------------------------------------------------------------
// False-negative tolerance: distinct models stay distinct
// ---------------------------------------------------------------------------

test('canonicalizeModelId FALSE-NEGATIVE: r1-distilled stays separate from r1', () => {
  assert.notEqual(canonicalizeModelId('r1-distilled'), canonicalizeModelId('r1'));
});

test('canonicalizeModelId FALSE-NEGATIVE: gpt-4o-mini stays separate from gpt-4o', () => {
  assert.notEqual(canonicalizeModelId('gpt-4o-mini'), canonicalizeModelId('gpt-4o'));
});

test('canonicalizeModelId FALSE-NEGATIVE: claude-3-haiku stays separate from claude-3-sonnet', () => {
  assert.notEqual(
    canonicalizeModelId('claude-3-haiku-20240307'),
    canonicalizeModelId('claude-3-sonnet-20240229'),
  );
});

// ---------------------------------------------------------------------------
// groupByCanonical
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<DiscoverRow>): DiscoverRow {
  return {
    rowKey: 'peer:svc',
    serviceId: 'gpt-4o',
    serviceLabel: 'GPT-4o',
    categories: [],
    provider: 'openai',
    protocol: 'openai-chat-completions',
    peerId: 'peer1',
    peerEvmAddress: '',
    sellerContract: null,
    peerDisplayName: null,
    peerLabel: 'Peer 1',
    inputUsdPerMillion: null,
    outputUsdPerMillion: null,
    cachedInputUsdPerMillion: null,
    lifetimeSessions: 0,
    lifetimeRequests: 0,
    lifetimeInputTokens: 0,
    lifetimeOutputTokens: 0,
    lifetimeFirstSessionAt: null,
    lifetimeLastSessionAt: null,
    onChainChannelCount: null,
    agentId: 0,
    stakeUsdc: '0',
    onChainActiveChannelCount: 0,
    onChainGhostCount: 0,
    onChainTotalVolumeUsdc: '0',
    onChainLastSettledAt: 0,
    onChainReputationScore: null,
    onChainTrustScore: null,
    onChainSybilRisk: null,
    onChainSybilFlags: [],
    networkRequests: null,
    networkInputTokens: null,
    networkOutputTokens: null,
    latencyMs: null,
    selectionValue: '',
    ...overrides,
  };
}

test('groupByCanonical: collapses openai/gpt-4o and gpt-4o into one group', () => {
  const rows: DiscoverRow[] = [
    makeRow({ serviceId: 'openai/gpt-4o', rowKey: 'p1:openai/gpt-4o' }),
    makeRow({ serviceId: 'gpt-4o', rowKey: 'p2:gpt-4o', peerId: 'peer2' }),
  ];
  const groups = groupByCanonical(rows);
  assert.equal(groups.size, 1);
  const key = groups.keys().next().value as string;
  assert.equal(key, 'gpt-4o');
  assert.equal(groups.get(key)!.length, 2);
});

test('groupByCanonical: keeps r1-distilled and r1 in separate groups', () => {
  const rows: DiscoverRow[] = [
    makeRow({ serviceId: 'r1-distilled', rowKey: 'p1:r1-distilled' }),
    makeRow({ serviceId: 'r1', rowKey: 'p2:r1', peerId: 'peer2' }),
  ];
  const groups = groupByCanonical(rows);
  assert.equal(groups.size, 2);
});

test('groupByCanonical: returns empty map for empty input', () => {
  assert.equal(groupByCanonical([]).size, 0);
});

test('groupByCanonical: single row ends up in its own group', () => {
  const rows: DiscoverRow[] = [makeRow({ serviceId: 'claude-3-opus-20240229' })];
  const groups = groupByCanonical(rows);
  assert.equal(groups.size, 1);
  assert.equal(groups.get('claude-3-opus-20240229')!.length, 1);
});

test('groupByCanonical: uses serviceId, not serviceLabel, for grouping', () => {
  // Two rows with the same serviceId but different labels collapse
  const rows: DiscoverRow[] = [
    makeRow({ serviceId: 'gpt-4o', serviceLabel: 'GPT-4o', rowKey: 'p1:gpt-4o' }),
    makeRow({ serviceId: 'gpt-4o', serviceLabel: 'GPT-4o Latest', rowKey: 'p2:gpt-4o', peerId: 'peer2' }),
  ];
  const groups = groupByCanonical(rows);
  assert.equal(groups.size, 1);
  assert.equal(groups.get('gpt-4o')!.length, 2);
});

// ---------------------------------------------------------------------------
// resolveCanonicalKey — precedence ladder
// ---------------------------------------------------------------------------

test('resolveCanonicalKey: declared canonical takes highest priority', () => {
  const row = makeRow({
    serviceId: 'claude-sonnet-4-5-20250929',
    canonical: 'claude-sonnet-4-5',
  });
  assert.equal(resolveCanonicalKey(row), 'claude-sonnet-4-5');
});

test('resolveCanonicalKey: null canonical falls through to fuzzy heuristic', () => {
  const row = makeRow({
    serviceId: 'anthropic/claude-3-opus-20240229',
    canonical: null,
  });
  // fuzzy heuristic strips the "anthropic/" prefix
  assert.equal(resolveCanonicalKey(row), 'claude-3-opus-20240229');
});

test('resolveCanonicalKey: undefined canonical falls through to fuzzy heuristic', () => {
  const row = makeRow({
    serviceId: 'openai/gpt-4o',
    canonical: undefined,
  });
  assert.equal(resolveCanonicalKey(row), 'gpt-4o');
});

test('resolveCanonicalKey: empty string canonical falls through to fuzzy heuristic', () => {
  const row = makeRow({
    serviceId: 'gpt-4o-mini',
    canonical: '',
  });
  assert.equal(resolveCanonicalKey(row), 'gpt-4o-mini');
});

// ---------------------------------------------------------------------------
// CURATED_CANONICAL_TABLE — content and precedence
// ---------------------------------------------------------------------------

test('CURATED_CANONICAL_TABLE: is exported and non-empty', () => {
  assert.equal(typeof CURATED_CANONICAL_TABLE, 'object');
  assert.ok(Object.keys(CURATED_CANONICAL_TABLE).length > 0, 'table must be populated');
});

test('CURATED_CANONICAL_TABLE: dated claude sonnet variant maps to base name', () => {
  assert.equal(CURATED_CANONICAL_TABLE['claude-sonnet-4-5-20250929'], 'claude-sonnet-4-5');
});

test('CURATED_CANONICAL_TABLE: claude-3-5-sonnet-20241022 maps to claude-3-5-sonnet', () => {
  assert.equal(CURATED_CANONICAL_TABLE['claude-3-5-sonnet-20241022'], 'claude-3-5-sonnet');
});

test('CURATED_CANONICAL_TABLE: codex maps to codex (openai-responses canonical)', () => {
  assert.equal(CURATED_CANONICAL_TABLE['codex'], 'codex');
});

test('CURATED_CANONICAL_TABLE: qwen alias maps to canonical qwen3 key', () => {
  // Both "qwen-3-coder-480b" (alternate spelling) and "qwen3-coder-480b" must
  // resolve to the same canonical so providers advertising either spelling
  // collapse into one group.
  assert.equal(
    CURATED_CANONICAL_TABLE['qwen-3-coder-480b'],
    CURATED_CANONICAL_TABLE['qwen3-coder-480b'],
  );
});

test('resolveCanonicalKey: declared canonical wins over curated table entry', () => {
  // Even though "claude-sonnet-4-5-20250929" is in the curated table,
  // an explicit declared canonical takes precedence.
  const row = makeRow({
    serviceId: 'claude-sonnet-4-5-20250929',
    canonical: 'claude-sonnet-4-5-custom',
  });
  assert.equal(resolveCanonicalKey(row), 'claude-sonnet-4-5-custom');
});

test('resolveCanonicalKey: curated table entry used when no declared canonical', () => {
  const row = makeRow({
    serviceId: 'claude-sonnet-4-5-20250929',
    canonical: null,
  });
  // table maps this dated variant to 'claude-sonnet-4-5'
  assert.equal(resolveCanonicalKey(row), 'claude-sonnet-4-5');
});

test('resolveCanonicalKey: falls through to fuzzy heuristic when not in table', () => {
  const row = makeRow({
    serviceId: 'anthropic/claude-3-haiku-20240307',
    canonical: null,
  });
  // not in curated table → fuzzy strips 'anthropic/' prefix
  assert.equal(resolveCanonicalKey(row), 'claude-3-haiku-20240307');
});

test('groupByCanonical: two providers advertising dated/base sonnet collapse via table', () => {
  const rows: DiscoverRow[] = [
    makeRow({
      serviceId: 'claude-sonnet-4-5-20250929',
      canonical: null,
      rowKey: 'peer1:dated',
    }),
    makeRow({
      serviceId: 'claude-sonnet-4-5',
      canonical: null,
      rowKey: 'peer2:base',
      peerId: 'peer2',
    }),
  ];
  const groups = groupByCanonical(rows);
  assert.equal(groups.size, 1, 'dated and base variants must collapse into one group');
  assert.ok(groups.has('claude-sonnet-4-5'), 'group key should be the canonical base name');
});

test('groupByCanonical: declared canonical collapses dated and base service into one group', () => {
  const rows: DiscoverRow[] = [
    makeRow({
      serviceId: 'claude-sonnet-4-5-20250929',
      canonical: 'claude-sonnet-4-5',
      rowKey: 'peer1:dated',
    }),
    makeRow({
      serviceId: 'claude-sonnet-4-5',
      canonical: 'claude-sonnet-4-5',
      rowKey: 'peer2:base',
      peerId: 'peer2',
    }),
  ];
  const groups = groupByCanonical(rows);
  assert.equal(groups.size, 1);
  assert.equal(groups.get('claude-sonnet-4-5')!.length, 2);
});

test('groupByCanonical: declared canonical is preferred over fuzzy heuristic', () => {
  // Without canonical, "anthropic/claude-3-opus" → "claude-3-opus" (fuzzy strips prefix)
  // With canonical "claude-3-opus-stable", the group key should be the declared value
  const rows: DiscoverRow[] = [
    makeRow({
      serviceId: 'anthropic/claude-3-opus',
      canonical: 'claude-3-opus-stable',
      rowKey: 'peer1:svc',
    }),
  ];
  const groups = groupByCanonical(rows);
  assert.equal(groups.size, 1);
  assert.ok(groups.has('claude-3-opus-stable'), 'should use declared canonical as key');
});
