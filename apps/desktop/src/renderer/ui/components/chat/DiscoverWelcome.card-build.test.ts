/**
 * DiscoverWelcome.card-build.test.ts
 *
 * Fixture-based tests for the buildCardsFromRows logic after the card
 * hierarchy redesign (issue: Discover card hierarchy redesign).
 *
 * NOTE: renderer tests use node:test and are not compiled by tsconfig.main.json
 * or run by `pnpm test`. They serve as a documented behavioural spec and are
 * checked at code-review/typecheck time. See forecast.test.ts for the same
 * pattern.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByCanonical } from '../../../core/canonical-model.js';
import { computeForecast } from '../../../core/forecast.js';
import type { DiscoverRow } from '../../../core/state.js';

// ---------------------------------------------------------------------------
// Fixture helper
// ---------------------------------------------------------------------------

let rowCounter = 0;
function makeRow(overrides: Partial<DiscoverRow> = {}): DiscoverRow {
  rowCounter++;
  return {
    rowKey: `peer${rowCounter}:svc`,
    serviceId: 'gpt-4o',
    serviceLabel: 'GPT-4o',
    categories: ['chat'],
    provider: 'openai',
    protocol: 'openai-chat-completions',
    peerId: `peer${rowCounter}`,
    peerEvmAddress: '',
    sellerContract: null,
    peerDisplayName: null,
    peerLabel: `Peer ${rowCounter}`,
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
    selectionValue: `peer${rowCounter}::openai::gpt-4o`,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: groupByCanonical dedup
// ---------------------------------------------------------------------------

test('five rows with two canonical models → 2 groups', () => {
  // 3 rows for gpt-4o (different peers / provider prefixes)
  const rows: DiscoverRow[] = [
    makeRow({ serviceId: 'gpt-4o', provider: 'openai' }),
    makeRow({ serviceId: 'openai/gpt-4o', provider: 'openrouter' }),
    makeRow({ serviceId: 'gpt-4o', provider: 'together' }),
    // 2 rows for claude-3-5-sonnet
    makeRow({ serviceId: 'claude-3-5-sonnet-20241022', provider: 'anthropic' }),
    makeRow({ serviceId: 'anthropic/claude-3-5-sonnet-20241022', provider: 'openrouter' }),
  ];

  const groups = groupByCanonical(rows);
  assert.equal(groups.size, 2, 'should produce exactly 2 canonical groups');

  const gptGroup = groups.get('gpt-4o');
  assert.ok(gptGroup, 'gpt-4o group must exist');
  assert.equal(gptGroup.length, 3, 'gpt-4o group must have 3 rows');

  const claudeGroup = groups.get('claude-3-5-sonnet-20241022');
  assert.ok(claudeGroup, 'claude group must exist');
  assert.equal(claudeGroup.length, 2, 'claude group must have 2 rows');
});

// ---------------------------------------------------------------------------
// Tests: computeForecast providerCount from grouped rows
// ---------------------------------------------------------------------------

test('computeForecast returns providerCount = group size', () => {
  const rows: DiscoverRow[] = [
    makeRow({ serviceId: 'llama-3.1-70b', latencyMs: 100, inputUsdPerMillion: 0.5, outputUsdPerMillion: 0.8 }),
    makeRow({ serviceId: 'llama-3.1-70b', latencyMs: 80,  inputUsdPerMillion: 0.4, outputUsdPerMillion: 0.7 }),
    makeRow({ serviceId: 'llama-3.1-70b', latencyMs: 120, inputUsdPerMillion: 0.6, outputUsdPerMillion: 0.9 }),
  ];

  const result = computeForecast(rows, 'cheapest');
  assert.equal(result.providerCount, 3, 'providerCount must equal the number of rows');
});

test('computeForecast picks cheapest winner', () => {
  const expensive = makeRow({ serviceId: 'gpt-4o', inputUsdPerMillion: 5.0, outputUsdPerMillion: 15.0, latencyMs: 50 });
  const cheap     = makeRow({ serviceId: 'gpt-4o', inputUsdPerMillion: 0.5, outputUsdPerMillion: 1.5,  latencyMs: 200 });

  const result = computeForecast([expensive, cheap], 'cheapest');
  // cheap winner: midpoint((0.5 + 1.5) / 2) / 1000 = 0.001
  assert.ok(result.pricePer1kUsd !== null, 'pricePer1kUsd should not be null');
  assert.ok(result.pricePer1kUsd! < 0.002, 'should pick the cheaper provider');
  assert.equal(result.providerCount, 2);
});

test('computeForecast picks fastest winner', () => {
  const slow  = makeRow({ serviceId: 'gpt-4o', latencyMs: 500, inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.1 });
  const fast  = makeRow({ serviceId: 'gpt-4o', latencyMs: 50,  inputUsdPerMillion: 5.0, outputUsdPerMillion: 5.0 });

  const result = computeForecast([slow, fast], 'fastest');
  assert.equal(result.latencyMs, 50, 'should pick the fastest peer');
  assert.equal(result.providerCount, 2);
});

// ---------------------------------------------------------------------------
// Tests: forecast string format simulation (pure logic, no React)
// ---------------------------------------------------------------------------

test('forecast segments are suppressed when null', () => {
  // Helper that mirrors the formatForecast logic in the component
  function formatForecast(pricePer1kUsd: number | null, latencyMs: number | null, providerCount: number): string {
    const segments: string[] = [];
    if (pricePer1kUsd !== null) segments.push(`~$${pricePer1kUsd.toFixed(3)}/1k`);
    if (latencyMs !== null) segments.push(`~${Math.round(latencyMs)}ms`);
    if (providerCount > 1) segments.push(`${providerCount} providers`);
    return segments.join(' · ');
  }

  assert.equal(formatForecast(0.002, 100, 3), '~$0.002/1k · ~100ms · 3 providers');
  assert.equal(formatForecast(null, 100, 1), '~100ms');
  assert.equal(formatForecast(0.002, null, 2), '~$0.002/1k · 2 providers');
  assert.equal(formatForecast(null, null, 1), '');
});
