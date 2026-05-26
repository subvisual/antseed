import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, matchesCategory } from './categories';
import type { DiscoverRow } from './state';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function mkRow(overrides: Partial<DiscoverRow> = {}): DiscoverRow {
  return {
    rowKey: 'p:s',
    serviceId: 's',
    serviceLabel: 'Service',
    categories: [],
    provider: 'openai',
    protocol: 'openai-chat-completions',
    peerId: 'p',
    peerEvmAddress: '0xp',
    sellerContract: null,
    peerDisplayName: null,
    peerLabel: 'Peer',
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 2,
    cachedInputUsdPerMillion: null,
    lifetimeSessions: 0,
    lifetimeRequests: 0,
    lifetimeInputTokens: 0,
    lifetimeOutputTokens: 0,
    lifetimeFirstSessionAt: null,
    lifetimeLastSessionAt: null,
    onChainChannelCount: null,
    agentId: 1,
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

// ---------------------------------------------------------------------------
// CATEGORIES list shape
// ---------------------------------------------------------------------------

test('CATEGORIES contains exactly 7 entries', () => {
  assert.equal(CATEGORIES.length, 7);
});

test('CATEGORIES keys are unique', () => {
  const keys = CATEGORIES.map((c) => c.key);
  assert.equal(new Set(keys).size, 7);
});

test('CATEGORIES has exactly the 7 locked keys in order', () => {
  const keys = CATEGORIES.map((c) => c.key);
  assert.deepEqual(keys, [
    'code',
    'research',
    'writing',
    'vision',
    'audio',
    'images',
    'uncensored',
  ]);
});

test('Images category is marked emptyState and has no tagMatchers', () => {
  const images = CATEGORIES.find((c) => c.key === 'images');
  assert.ok(images, 'images category must exist');
  assert.equal(images.emptyState, true);
  assert.deepEqual(images.tagMatchers, []);
});

test('Non-images categories do not carry the emptyState flag', () => {
  for (const cat of CATEGORIES) {
    if (cat.key !== 'images') {
      assert.equal(cat.emptyState, undefined, `${cat.key} should not have emptyState`);
    }
  }
});

// ---------------------------------------------------------------------------
// matchesCategory — Code
// ---------------------------------------------------------------------------

test('matchesCategory Code: matches "code" tag', () => {
  const cat = CATEGORIES.find((c) => c.key === 'code')!;
  assert.ok(matchesCategory(cat, mkRow({ categories: ['code'] })));
});

test('matchesCategory Code: matches "coding" tag', () => {
  const cat = CATEGORIES.find((c) => c.key === 'code')!;
  assert.ok(matchesCategory(cat, mkRow({ categories: ['coding'] })));
});

test('matchesCategory Code: matches "agent-tools" tag', () => {
  const cat = CATEGORIES.find((c) => c.key === 'code')!;
  assert.ok(matchesCategory(cat, mkRow({ categories: ['agent-tools'] })));
});

test('matchesCategory Code: matches "builder-tools" tag', () => {
  const cat = CATEGORIES.find((c) => c.key === 'code')!;
  assert.ok(matchesCategory(cat, mkRow({ categories: ['builder-tools'] })));
});

test('matchesCategory Code: no match on unrelated tags', () => {
  const cat = CATEGORIES.find((c) => c.key === 'code')!;
  assert.equal(matchesCategory(cat, mkRow({ categories: ['audio', 'chat'] })), false);
});

// ---------------------------------------------------------------------------
// matchesCategory — Research
// ---------------------------------------------------------------------------

test('matchesCategory Research: matches "research" tag', () => {
  const cat = CATEGORIES.find((c) => c.key === 'research')!;
  assert.ok(matchesCategory(cat, mkRow({ categories: ['research'] })));
});

test('matchesCategory Research: matches "reasoning" tag', () => {
  const cat = CATEGORIES.find((c) => c.key === 'research')!;
  assert.ok(matchesCategory(cat, mkRow({ categories: ['reasoning'] })));
});

test('matchesCategory Research: matches "web-search" tag', () => {
  const cat = CATEGORIES.find((c) => c.key === 'research')!;
  assert.ok(matchesCategory(cat, mkRow({ categories: ['web-search'] })));
});

test('matchesCategory Research: matches "analysis" tag', () => {
  const cat = CATEGORIES.find((c) => c.key === 'research')!;
  assert.ok(matchesCategory(cat, mkRow({ categories: ['analysis'] })));
});

// ---------------------------------------------------------------------------
// matchesCategory — Writing
// ---------------------------------------------------------------------------

test('matchesCategory Writing: matches "chat" tag', () => {
  const cat = CATEGORIES.find((c) => c.key === 'writing')!;
  assert.ok(matchesCategory(cat, mkRow({ categories: ['chat'] })));
});

test('matchesCategory Writing: matches "writing" tag', () => {
  const cat = CATEGORIES.find((c) => c.key === 'writing')!;
  assert.ok(matchesCategory(cat, mkRow({ categories: ['writing'] })));
});

test('matchesCategory Writing: matches "creative" tag', () => {
  const cat = CATEGORIES.find((c) => c.key === 'writing')!;
  assert.ok(matchesCategory(cat, mkRow({ categories: ['creative'] })));
});

test('matchesCategory Writing: matches "translate" tag', () => {
  const cat = CATEGORIES.find((c) => c.key === 'writing')!;
  assert.ok(matchesCategory(cat, mkRow({ categories: ['translate'] })));
});

test('matchesCategory Writing: matches "roleplay" tag', () => {
  const cat = CATEGORIES.find((c) => c.key === 'writing')!;
  assert.ok(matchesCategory(cat, mkRow({ categories: ['roleplay'] })));
});

// ---------------------------------------------------------------------------
// matchesCategory — Vision
// ---------------------------------------------------------------------------

test('matchesCategory Vision: matches "vision" tag', () => {
  const cat = CATEGORIES.find((c) => c.key === 'vision')!;
  assert.ok(matchesCategory(cat, mkRow({ categories: ['vision'] })));
});

test('matchesCategory Vision: matches "multimodal" tag', () => {
  const cat = CATEGORIES.find((c) => c.key === 'vision')!;
  assert.ok(matchesCategory(cat, mkRow({ categories: ['multimodal'] })));
});

test('matchesCategory Vision: matches "video" tag', () => {
  const cat = CATEGORIES.find((c) => c.key === 'vision')!;
  assert.ok(matchesCategory(cat, mkRow({ categories: ['video'] })));
});

// ---------------------------------------------------------------------------
// matchesCategory — Audio
// ---------------------------------------------------------------------------

test('matchesCategory Audio: matches "audio" tag', () => {
  const cat = CATEGORIES.find((c) => c.key === 'audio')!;
  assert.ok(matchesCategory(cat, mkRow({ categories: ['audio'] })));
});

test('matchesCategory Audio: no match on empty categories', () => {
  const cat = CATEGORIES.find((c) => c.key === 'audio')!;
  assert.equal(matchesCategory(cat, mkRow({ categories: [] })), false);
});

// ---------------------------------------------------------------------------
// matchesCategory — Images (empty-state placeholder)
// ---------------------------------------------------------------------------

test('matchesCategory Images: never matches (empty-state placeholder)', () => {
  const cat = CATEGORIES.find((c) => c.key === 'images')!;
  // Even if a future peer somehow adds "images" to their tags, the matcher
  // list is intentionally empty and must return false.
  assert.equal(matchesCategory(cat, mkRow({ categories: ['images', 'vision'] })), false);
  assert.equal(matchesCategory(cat, mkRow({ categories: [] })), false);
});

// ---------------------------------------------------------------------------
// matchesCategory — Uncensored
// ---------------------------------------------------------------------------

test('matchesCategory Uncensored: matches "uncensored" tag', () => {
  const cat = CATEGORIES.find((c) => c.key === 'uncensored')!;
  assert.ok(matchesCategory(cat, mkRow({ categories: ['uncensored'] })));
});

test('matchesCategory Uncensored: no match on empty categories', () => {
  const cat = CATEGORIES.find((c) => c.key === 'uncensored')!;
  assert.equal(matchesCategory(cat, mkRow({ categories: [] })), false);
});

// ---------------------------------------------------------------------------
// General matchesCategory behaviour
// ---------------------------------------------------------------------------

test('matchesCategory returns false for empty categories array', () => {
  for (const cat of CATEGORIES) {
    assert.equal(
      matchesCategory(cat, mkRow({ categories: [] })),
      false,
      `${cat.key} should not match an empty categories array`,
    );
  }
});

test('matchesCategory matching is case-sensitive (no partial or case-fold match)', () => {
  const cat = CATEGORIES.find((c) => c.key === 'code')!;
  assert.equal(matchesCategory(cat, mkRow({ categories: ['Code'] })), false);
  assert.equal(matchesCategory(cat, mkRow({ categories: ['CODE'] })), false);
});

test('matchesCategory passes when one of several tags matches', () => {
  const cat = CATEGORIES.find((c) => c.key === 'vision')!;
  // Peer advertises a mix; "multimodal" is in Vision tagMatchers.
  assert.ok(matchesCategory(cat, mkRow({ categories: ['chat', 'multimodal', 'audio'] })));
});

test('matchesCategory: realistic multi-capability peer hits multiple categories', () => {
  // A peer that advertises code + research + vision capabilities.
  const row = mkRow({ categories: ['coding', 'reasoning', 'vision', 'multimodal'] });

  const code = CATEGORIES.find((c) => c.key === 'code')!;
  const research = CATEGORIES.find((c) => c.key === 'research')!;
  const vision = CATEGORIES.find((c) => c.key === 'vision')!;
  const audio = CATEGORIES.find((c) => c.key === 'audio')!;

  assert.ok(matchesCategory(code, row));
  assert.ok(matchesCategory(research, row));
  assert.ok(matchesCategory(vision, row));
  assert.equal(matchesCategory(audio, row), false);
});
