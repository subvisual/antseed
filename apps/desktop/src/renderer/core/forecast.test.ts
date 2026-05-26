import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeForecast, computeRowTrustScore, pickWinnerByPriority } from './forecast.js';
import type { DiscoverRow } from './state.js';

// ---------------------------------------------------------------------------
// Test fixture helpers
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

// ---------------------------------------------------------------------------
// computeForecast — empty input
// ---------------------------------------------------------------------------

test('computeForecast: empty rows returns null price, null latency, count 0', () => {
  const result = computeForecast([], 'cheapest');
  assert.equal(result.pricePer1kUsd, null);
  assert.equal(result.latencyMs, null);
  assert.equal(result.providerCount, 0);
});

// ---------------------------------------------------------------------------
// computeForecast — no-data-yet (rows exist but fields are null)
// ---------------------------------------------------------------------------

test('computeForecast: rows with null pricing return null pricePer1kUsd', () => {
  const rows = [
    makeRow({ peerId: 'p1', inputUsdPerMillion: null, outputUsdPerMillion: null, latencyMs: 120 }),
    makeRow({ peerId: 'p2', inputUsdPerMillion: null, outputUsdPerMillion: null, latencyMs: 80 }),
  ];
  const result = computeForecast(rows, 'cheapest');
  assert.equal(result.pricePer1kUsd, null);
  assert.equal(result.providerCount, 2);
});

test('computeForecast: rows with null latency return null latencyMs', () => {
  const rows = [
    makeRow({ peerId: 'p1', inputUsdPerMillion: 1, outputUsdPerMillion: 3, latencyMs: null }),
  ];
  const result = computeForecast(rows, 'fastest');
  assert.equal(result.latencyMs, null);
});

// ---------------------------------------------------------------------------
// computeForecast — Cheapest priority
// ---------------------------------------------------------------------------

test('computeForecast Cheapest: picks lowest total price peer', () => {
  const rows = [
    makeRow({ peerId: 'expensive', inputUsdPerMillion: 10, outputUsdPerMillion: 30, latencyMs: 50 }),
    makeRow({ peerId: 'cheap', inputUsdPerMillion: 1, outputUsdPerMillion: 3, latencyMs: 200 }),
  ];
  const result = computeForecast(rows, 'cheapest');
  // cheap peer: midpoint(1, 3) / 1000 = 2/1000 = 0.002
  assert.ok(result.pricePer1kUsd !== null);
  assert.ok(Math.abs(result.pricePer1kUsd - 0.002) < 1e-9);
  assert.equal(result.latencyMs, 200); // cheap peer's latency
  assert.equal(result.providerCount, 2);
});

test('computeForecast Cheapest: treats missing price as +Infinity (loses to any priced peer)', () => {
  const rows = [
    makeRow({ peerId: 'no-price', inputUsdPerMillion: null, outputUsdPerMillion: null, latencyMs: 10 }),
    makeRow({ peerId: 'has-price', inputUsdPerMillion: 5, outputUsdPerMillion: 15, latencyMs: 100 }),
  ];
  const result = computeForecast(rows, 'cheapest');
  assert.equal(result.latencyMs, 100); // has-price wins
  // midpoint(5, 15) / 1000 = 10/1000 = 0.01
  assert.ok(result.pricePer1kUsd !== null);
  assert.ok(Math.abs(result.pricePer1kUsd - 0.01) < 1e-9);
});

// ---------------------------------------------------------------------------
// computeForecast — Fastest priority
// ---------------------------------------------------------------------------

test('computeForecast Fastest: picks lowest latency peer', () => {
  const rows = [
    makeRow({ peerId: 'slow', inputUsdPerMillion: 1, outputUsdPerMillion: 1, latencyMs: 300 }),
    makeRow({ peerId: 'fast', inputUsdPerMillion: 10, outputUsdPerMillion: 10, latencyMs: 40 }),
  ];
  const result = computeForecast(rows, 'fastest');
  assert.equal(result.latencyMs, 40);
  // fast peer: midpoint(10, 10) / 1000 = 0.01
  assert.ok(result.pricePer1kUsd !== null);
  assert.ok(Math.abs(result.pricePer1kUsd - 0.01) < 1e-9);
  assert.equal(result.providerCount, 2);
});

test('computeForecast Fastest: treats missing latency as +Infinity (loses to any measured peer)', () => {
  const rows = [
    makeRow({ peerId: 'no-lat', inputUsdPerMillion: 1, outputUsdPerMillion: 1, latencyMs: null }),
    makeRow({ peerId: 'has-lat', inputUsdPerMillion: 100, outputUsdPerMillion: 100, latencyMs: 999 }),
  ];
  const result = computeForecast(rows, 'fastest');
  assert.equal(result.latencyMs, 999); // has-lat wins
});

// ---------------------------------------------------------------------------
// computeForecast — Most-Trusted priority
// ---------------------------------------------------------------------------

test('computeForecast Most-Trusted: picks peer with highest on-chain trust composite', () => {
  const rows = [
    makeRow({
      peerId: 'trusted',
      stakeUsdc: '50', // 50 USDC → 50_000_000 micros → normalised to 0.5
      onChainTrustScore: 0.8,
      onChainSybilRisk: 0.1,
      onChainTotalVolumeUsdc: '500', // 500_000_000 micros → 0.5
      onChainReputationScore: 80,
      inputUsdPerMillion: 5,
      outputUsdPerMillion: 5,
      latencyMs: 200,
    }),
    makeRow({
      peerId: 'untrusted',
      stakeUsdc: '0',
      onChainTrustScore: 0,
      onChainSybilRisk: null, // defaults to 1 → inverted = 0
      onChainTotalVolumeUsdc: '0',
      onChainReputationScore: 0,
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 1,
      latencyMs: 50,
    }),
  ];
  const result = computeForecast(rows, 'most-trusted');
  assert.equal(result.latencyMs, 200); // trusted peer wins despite higher latency
  assert.equal(result.providerCount, 2);
});

// ---------------------------------------------------------------------------
// computeForecast — Single provider
// ---------------------------------------------------------------------------

test('computeForecast: single provider is always the winner', () => {
  const rows = [
    makeRow({
      peerId: 'solo',
      inputUsdPerMillion: 2,
      outputUsdPerMillion: 6,
      latencyMs: 120,
    }),
  ];
  for (const priority of ['cheapest', 'fastest', 'most-trusted'] as const) {
    const result = computeForecast(rows, priority);
    assert.equal(result.providerCount, 1);
    assert.equal(result.latencyMs, 120);
    // midpoint(2, 6) / 1000 = 4/1000 = 0.004
    assert.ok(result.pricePer1kUsd !== null);
    assert.ok(Math.abs(result.pricePer1kUsd - 0.004) < 1e-9, `priority=${priority}`);
  }
});

// ---------------------------------------------------------------------------
// pricePer1kUsd formula verification
// ---------------------------------------------------------------------------

test('pricePer1kUsd formula: midpoint of input+output USD/M, scaled to per-1k', () => {
  const rows = [makeRow({ inputUsdPerMillion: 3, outputUsdPerMillion: 15, latencyMs: 100 })];
  const result = computeForecast(rows, 'cheapest');
  // midpoint(3, 15) = 9; 9 / 1000 = 0.009
  assert.ok(result.pricePer1kUsd !== null);
  assert.ok(Math.abs(result.pricePer1kUsd - 0.009) < 1e-9);
});

// ---------------------------------------------------------------------------
// Cross-check: renderer comparator agrees with CLI tie-break rules.
//
// This test verifies that the renderer-side pickWinnerByPriority matches the
// expected winner on a shared fixture, providing a guard against accidental
// divergence from apps/cli/src/proxy/routing-priority.ts.
// ---------------------------------------------------------------------------

test('cross-check: renderer most-trusted uses only on-chain signals (not price/latency)', () => {
  // Peer A: very cheap and fast, but zero on-chain trust.
  // Peer B: expensive and slow, but strong on-chain signals.
  // Under most-trusted, B must win — just like the CLI.
  const peerA = makeRow({
    peerId: 'A',
    stakeUsdc: '0',
    onChainTrustScore: 0,
    onChainSybilRisk: null, // treated as 1 → inverted = 0
    onChainTotalVolumeUsdc: '0',
    onChainReputationScore: 0,
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.1,
    latencyMs: 5,
  });
  const peerB = makeRow({
    peerId: 'B',
    stakeUsdc: '100', // max stake
    onChainTrustScore: 1,
    onChainSybilRisk: 0,
    onChainTotalVolumeUsdc: '1000', // max volume
    onChainReputationScore: 100,
    inputUsdPerMillion: 1000,
    outputUsdPerMillion: 1000,
    latencyMs: 9999,
  });

  const winner = pickWinnerByPriority([peerA, peerB], 'most-trusted');
  assert.equal(winner?.peerId, 'B', 'most-trusted must pick highest on-chain trust, ignoring price/latency');
});

test('cross-check: renderer cheapest ignores latency and trust, picks lowest price', () => {
  const peerA = makeRow({
    peerId: 'A',
    inputUsdPerMillion: 0.5,
    outputUsdPerMillion: 0.5,
    latencyMs: 9999,
    stakeUsdc: '0',
    onChainTrustScore: 0,
  });
  const peerB = makeRow({
    peerId: 'B',
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 5,
    latencyMs: 1,
    stakeUsdc: '100',
    onChainTrustScore: 1,
  });
  const winner = pickWinnerByPriority([peerA, peerB], 'cheapest');
  assert.equal(winner?.peerId, 'A', 'cheapest must pick lowest total price, ignoring latency/trust');
});

test('cross-check: renderer fastest ignores price and trust, picks lowest latency', () => {
  const peerA = makeRow({
    peerId: 'A',
    inputUsdPerMillion: 1000,
    outputUsdPerMillion: 1000,
    latencyMs: 20,
    stakeUsdc: '0',
    onChainTrustScore: 0,
  });
  const peerB = makeRow({
    peerId: 'B',
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.1,
    latencyMs: 500,
    stakeUsdc: '100',
    onChainTrustScore: 1,
  });
  const winner = pickWinnerByPriority([peerA, peerB], 'fastest');
  assert.equal(winner?.peerId, 'A', 'fastest must pick lowest latency, ignoring price/trust');
});

// ---------------------------------------------------------------------------
// computeRowTrustScore internals
// ---------------------------------------------------------------------------

test('computeRowTrustScore: all-zero inputs return low score (sybilRisk default inverted)', () => {
  // stakeUsdc=0, trustScore=0, sybilRisk=null→1 (inverted=0), volume=0, rep=0
  // score = (0 + 0 + 0 + 0 + 0) / 5 = 0
  const row = makeRow({});
  assert.equal(computeRowTrustScore(row), 0);
});

test('computeRowTrustScore: perfect signals return 1', () => {
  const row = makeRow({
    stakeUsdc: '100',        // 100 USDC → 100_000_000 micros → normalised to 1.0
    onChainTrustScore: 1,
    onChainSybilRisk: 0,     // inverted = 1
    onChainTotalVolumeUsdc: '1000', // 1_000_000_000 micros → 1.0
    onChainReputationScore: 100,
  });
  assert.ok(Math.abs(computeRowTrustScore(row) - 1) < 1e-9);
});
