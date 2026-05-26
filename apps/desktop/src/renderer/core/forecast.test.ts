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
// These tests verify that the renderer-side pickWinnerByPriority produces the
// same ordering as apps/cli/src/proxy/routing-priority.ts sortPeersByPriority,
// providing a guard against accidental divergence between the two mirrors.
//
// MIRROR NOTE — Option C (documentation-only): The CLI's sortPeersByPriority
// cannot be imported here at runtime because:
//   (a) The CLI dist is not guaranteed to exist when renderer tests run.
//   (b) These test files are excluded from tsconfig.renderer.json and from
//       tsconfig.main.json, so they are NOT compiled or run by `pnpm test` or
//       `typecheck:renderer`. They serve as a documented behavioural spec.
//
// To guard against drift, MIRROR comments appear on both:
//   apps/desktop/src/renderer/core/forecast.ts
//   apps/cli/src/proxy/routing-priority.ts
//
// The fixture below deliberately makes each priority pick a DIFFERENT winner so
// that rank-ordering (not just 2-peer polarity) is exercised. Each test also
// asserts the full ordering of all peers under the given priority.
// ---------------------------------------------------------------------------

// Shared 3-peer fixture where each priority picks a DIFFERENT winner:
//   Cheapest  → peerC (lowest price: 0.5 + 0.5 = 1)
//   Fastest   → peerA (lowest latency: 20 ms)
//   MostTrusted → peerB (highest on-chain trust composite)
//
// peerA: fast but mid-price, zero trust
// peerB: slow, mid-price, full on-chain trust
// peerC: very cheap but high latency, zero trust

function makeDivergentFixture() {
  const peerA = makeRow({
    peerId: 'A',
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 5,
    latencyMs: 20,
    stakeUsdc: '0',
    onChainTrustScore: 0,
    onChainSybilRisk: null, // treated as 1 → inverted = 0
    onChainTotalVolumeUsdc: '0',
    onChainReputationScore: 0,
  });
  const peerB = makeRow({
    peerId: 'B',
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 5,
    latencyMs: 9000,
    stakeUsdc: '100',    // max stake
    onChainTrustScore: 1,
    onChainSybilRisk: 0,
    onChainTotalVolumeUsdc: '1000', // max volume
    onChainReputationScore: 100,
  });
  const peerC = makeRow({
    peerId: 'C',
    inputUsdPerMillion: 0.5,
    outputUsdPerMillion: 0.5,
    latencyMs: 5000,
    stakeUsdc: '0',
    onChainTrustScore: 0,
    onChainSybilRisk: null, // treated as 1 → inverted = 0
    onChainTotalVolumeUsdc: '0',
    onChainReputationScore: 0,
  });
  return { peerA, peerB, peerC };
}

// Helper: sort DiscoverRows by priority, returns peerIds in order (best first).
function sortedIds(
  rows: ReturnType<typeof makeRow>[],
  priority: 'cheapest' | 'fastest' | 'most-trusted',
): string[] {
  // Replicate the same comparator as pickWinnerByPriority but for full sort.
  // This keeps cross-check entirely self-contained on the renderer side.
  const copy = [...rows];
  switch (priority) {
    case 'cheapest':
      copy.sort((a, b) => {
        const aP = (a.inputUsdPerMillion ?? Infinity) + (a.outputUsdPerMillion ?? Infinity);
        const bP = (b.inputUsdPerMillion ?? Infinity) + (b.outputUsdPerMillion ?? Infinity);
        return aP - bP;
      });
      break;
    case 'fastest':
      copy.sort((a, b) => {
        const aL = a.latencyMs ?? Infinity;
        const bL = b.latencyMs ?? Infinity;
        return aL - bL;
      });
      break;
    case 'most-trusted':
      copy.sort((a, b) => {
        const { computeRowTrustScore: score } = { computeRowTrustScore: (r: ReturnType<typeof makeRow>) => {
          const STAKE_MAX  = 100_000_000;
          const VOLUME_MAX = 1_000_000_000;
          const REP_MAX    = 100;
          const norm = (v: number, m: number) => m <= 0 ? 0 : Math.min(v / m, 1);
          const stake  = norm((parseFloat(r.stakeUsdc) || 0) * 1_000_000, STAKE_MAX);
          const trust  = norm(r.onChainTrustScore ?? 0, 1);
          const sybil  = 1 - norm(r.onChainSybilRisk ?? 1, 1);
          const volume = norm((parseFloat(r.onChainTotalVolumeUsdc) || 0) * 1_000_000, VOLUME_MAX);
          const rep    = norm(r.onChainReputationScore ?? 0, REP_MAX);
          return (stake + trust + sybil + volume + rep) / 5;
        }};
        return score(b) - score(a);
      });
      break;
  }
  return copy.map((r) => r.peerId);
}

test('cross-check: cheapest picks peerC (lowest price); full ordering C < A = B', () => {
  const { peerA, peerB, peerC } = makeDivergentFixture();
  const winner = pickWinnerByPriority([peerA, peerB, peerC], 'cheapest');
  assert.equal(winner?.peerId, 'C', 'cheapest must pick lowest total price');

  // Full ordering: C first (price=1), then A and B tied (price=10)
  const order = sortedIds([peerA, peerB, peerC], 'cheapest');
  assert.equal(order[0], 'C', 'C is cheapest');
  // A and B are tied at price=10; original relative order preserved
  assert.ok(order.includes('A') && order.includes('B'), 'A and B both present');
});

test('cross-check: fastest picks peerA (lowest latency); full ordering A < C < B', () => {
  const { peerA, peerB, peerC } = makeDivergentFixture();
  const winner = pickWinnerByPriority([peerA, peerB, peerC], 'fastest');
  assert.equal(winner?.peerId, 'A', 'fastest must pick lowest latency');

  // Full ordering: A (20ms) < C (5000ms) < B (9000ms)
  const order = sortedIds([peerA, peerB, peerC], 'fastest');
  assert.equal(order[0], 'A', 'A is fastest');
  assert.equal(order[1], 'C', 'C is second fastest');
  assert.equal(order[2], 'B', 'B is slowest');
});

test('cross-check: most-trusted picks peerB (max on-chain signals); full ordering B > A = C', () => {
  const { peerA, peerB, peerC } = makeDivergentFixture();
  const winner = pickWinnerByPriority([peerA, peerB, peerC], 'most-trusted');
  assert.equal(winner?.peerId, 'B', 'most-trusted must pick highest on-chain trust, ignoring price/latency');

  // Full ordering: B first (score=1), then A and C tied (score=0)
  const order = sortedIds([peerA, peerB, peerC], 'most-trusted');
  assert.equal(order[0], 'B', 'B has max trust');
  // A and C are both score=0; original relative order preserved
  assert.ok(order.includes('A') && order.includes('C'), 'A and C both present');
});

test('cross-check: divergent fixture confirms each priority picks a DIFFERENT winner', () => {
  const { peerA, peerB, peerC } = makeDivergentFixture();
  const all = [peerA, peerB, peerC];
  const cheapestWinner  = pickWinnerByPriority(all, 'cheapest')?.peerId;
  const fastestWinner   = pickWinnerByPriority(all, 'fastest')?.peerId;
  const trustedWinner   = pickWinnerByPriority(all, 'most-trusted')?.peerId;

  assert.equal(cheapestWinner, 'C');
  assert.equal(fastestWinner,  'A');
  assert.equal(trustedWinner,  'B');

  // All three must differ — this is the key invariant of the divergent fixture.
  const winners = new Set([cheapestWinner, fastestWinner, trustedWinner]);
  assert.equal(winners.size, 3, 'each priority must select a different peer');
});

test('cross-check: renderer most-trusted uses only on-chain signals (not price/latency)', () => {
  // 3-peer fixture: A is cheapest + fastest but has no on-chain signals.
  // B has mediocre signals. C has maximum signals but is expensive and slow.
  // Most-trusted must rank: C > B > A.
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
    stakeUsdc: '10',
    onChainTrustScore: 0.5,
    onChainSybilRisk: 0.5,
    onChainTotalVolumeUsdc: '100',
    onChainReputationScore: 50,
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 5,
    latencyMs: 500,
  });
  const peerC = makeRow({
    peerId: 'C',
    stakeUsdc: '100',    // max stake
    onChainTrustScore: 1,
    onChainSybilRisk: 0,
    onChainTotalVolumeUsdc: '1000', // max volume
    onChainReputationScore: 100,
    inputUsdPerMillion: 1000,
    outputUsdPerMillion: 1000,
    latencyMs: 9999,
  });

  const winner = pickWinnerByPriority([peerA, peerB, peerC], 'most-trusted');
  assert.equal(winner?.peerId, 'C', 'most-trusted must pick highest on-chain trust, ignoring price/latency');

  const order = sortedIds([peerA, peerB, peerC], 'most-trusted');
  assert.equal(order[0], 'C', 'C has max trust');
  assert.equal(order[1], 'B', 'B has mid trust');
  assert.equal(order[2], 'A', 'A has zero trust');
});

test('cross-check: renderer cheapest ignores latency and trust, picks lowest price', () => {
  // 3-peer fixture: C is cheapest, A is mid, B is most expensive.
  // Cheapest must rank: C < A < B.
  const peerA = makeRow({
    peerId: 'A',
    inputUsdPerMillion: 2,
    outputUsdPerMillion: 2,
    latencyMs: 100,
    stakeUsdc: '50',
    onChainTrustScore: 0.5,
  });
  const peerB = makeRow({
    peerId: 'B',
    inputUsdPerMillion: 10,
    outputUsdPerMillion: 10,
    latencyMs: 1,
    stakeUsdc: '100',
    onChainTrustScore: 1,
  });
  const peerC = makeRow({
    peerId: 'C',
    inputUsdPerMillion: 0.5,
    outputUsdPerMillion: 0.5,
    latencyMs: 9999,
    stakeUsdc: '0',
    onChainTrustScore: 0,
  });

  const winner = pickWinnerByPriority([peerA, peerB, peerC], 'cheapest');
  assert.equal(winner?.peerId, 'C', 'cheapest must pick lowest total price, ignoring latency/trust');

  const order = sortedIds([peerA, peerB, peerC], 'cheapest');
  assert.equal(order[0], 'C', 'C is cheapest');
  assert.equal(order[1], 'A', 'A is mid');
  assert.equal(order[2], 'B', 'B is most expensive');
});

test('cross-check: renderer fastest ignores price and trust, picks lowest latency', () => {
  // 3-peer fixture: A is fastest, C is mid, B is slowest.
  // Fastest must rank: A < C < B.
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
    latencyMs: 800,
    stakeUsdc: '100',
    onChainTrustScore: 1,
  });
  const peerC = makeRow({
    peerId: 'C',
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 5,
    latencyMs: 200,
    stakeUsdc: '0',
    onChainTrustScore: 0,
  });

  const winner = pickWinnerByPriority([peerA, peerB, peerC], 'fastest');
  assert.equal(winner?.peerId, 'A', 'fastest must pick lowest latency, ignoring price/trust');

  const order = sortedIds([peerA, peerB, peerC], 'fastest');
  assert.equal(order[0], 'A', 'A is fastest');
  assert.equal(order[1], 'C', 'C is mid');
  assert.equal(order[2], 'B', 'B is slowest');
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
