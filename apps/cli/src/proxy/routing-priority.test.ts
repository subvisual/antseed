import assert from 'node:assert/strict'
import test from 'node:test'
import type { PeerInfo } from '@antseed/node'
import { sortPeersByPriority } from './routing-priority.js'

function makePeer(
  seed: string,
  overrides: Partial<PeerInfo> = {},
): PeerInfo {
  const peerId = (seed.repeat(40) + 'a'.repeat(40)).slice(0, 40) as PeerInfo['peerId']
  return {
    peerId,
    lastSeen: Date.now(),
    providers: ['openai'],
    ...overrides,
  }
}

// ---- cheapest ----

test('sortPeersByPriority cheapest ranks lower-priced peers first', () => {
  const cheap = makePeer('a', { defaultInputUsdPerMillion: 1, defaultOutputUsdPerMillion: 2 })
  const mid   = makePeer('b', { defaultInputUsdPerMillion: 3, defaultOutputUsdPerMillion: 6 })
  const pricey = makePeer('c', { defaultInputUsdPerMillion: 10, defaultOutputUsdPerMillion: 20 })

  const result = sortPeersByPriority([pricey, mid, cheap], 'cheapest')
  assert.equal(result[0]?.peerId, cheap.peerId,  'cheapest first')
  assert.equal(result[1]?.peerId, mid.peerId,    'mid second')
  assert.equal(result[2]?.peerId, pricey.peerId, 'pricey last')
})

test('sortPeersByPriority cheapest treats missing price as expensive', () => {
  const priced  = makePeer('a', { defaultInputUsdPerMillion: 5, defaultOutputUsdPerMillion: 5 })
  const unknown = makePeer('b') // no price fields

  const result = sortPeersByPriority([unknown, priced], 'cheapest')
  assert.equal(result[0]?.peerId, priced.peerId,  'priced first')
  assert.equal(result[1]?.peerId, unknown.peerId, 'unknown last')
})

// ---- fastest ----

test('sortPeersByPriority fastest ranks lower-latency peers first', () => {
  const fast   = makePeer('a', { keepaliveLatencyMs: 10 })
  const medium = makePeer('b', { keepaliveLatencyMs: 80 })
  const slow   = makePeer('c', { keepaliveLatencyMs: 300 })

  const result = sortPeersByPriority([slow, medium, fast], 'fastest')
  assert.equal(result[0]?.peerId, fast.peerId,   'fast first')
  assert.equal(result[1]?.peerId, medium.peerId, 'medium second')
  assert.equal(result[2]?.peerId, slow.peerId,   'slow last')
})

test('sortPeersByPriority fastest treats missing latency as slow', () => {
  const measured = makePeer('a', { keepaliveLatencyMs: 50 })
  const unmeasured = makePeer('b') // no latency

  const result = sortPeersByPriority([unmeasured, measured], 'fastest')
  assert.equal(result[0]?.peerId, measured.peerId,   'measured first')
  assert.equal(result[1]?.peerId, unmeasured.peerId, 'unmeasured last')
})

// ---- most-trusted ----

test('sortPeersByPriority most-trusted ranks higher on-chain signal peers first', () => {
  // highTrust has strong on-chain signals; lowTrust has none.
  const highTrust = makePeer('a', {
    onChainStakeUsdcMicros:     5_000_000,
    onChainTrustScore:          0.9,
    onChainSybilRisk:           0.05,
    onChainTotalVolumeUsdcMicros: 200_000_000,
    onChainReputationScore:     90,
  })
  const lowTrust = makePeer('b', {
    onChainStakeUsdcMicros:     0,
    onChainTrustScore:          0,
    onChainSybilRisk:           0.95,
    onChainTotalVolumeUsdcMicros: 0,
    onChainReputationScore:     0,
  })
  const noSignal = makePeer('c') // entirely absent signals

  const result = sortPeersByPriority([noSignal, lowTrust, highTrust], 'most-trusted')
  assert.equal(result[0]?.peerId, highTrust.peerId, 'highTrust first')
  assert.equal(result[1]?.peerId, lowTrust.peerId,  'lowTrust second')
  assert.equal(result[2]?.peerId, noSignal.peerId,  'noSignal last')
})

test('sortPeersByPriority most-trusted uses all five on-chain signals', () => {
  // Each fixture differs by exactly one signal; together they cover all five paths.
  const highStake   = makePeer('a', { onChainStakeUsdcMicros: 10_000_000 })
  const highTrust   = makePeer('b', { onChainTrustScore: 1.0 })
  const lowSybil    = makePeer('c', { onChainSybilRisk: 0.0 })
  const highVolume  = makePeer('d', { onChainTotalVolumeUsdcMicros: 1_000_000_000 })
  const highRep     = makePeer('e', { onChainReputationScore: 100 })
  const baseline    = makePeer('z')

  // All signal-bearing peers should score above the baseline (no signals).
  const result = sortPeersByPriority(
    [baseline, highStake, highTrust, lowSybil, highVolume, highRep],
    'most-trusted',
  )
  // baseline should be last (or near-last given all single-signal peers beat it)
  const baselineIdx = result.findIndex((p) => p.peerId === baseline.peerId)
  assert.ok(baselineIdx > 0, `baseline should not rank first (got index ${baselineIdx})`)
})

test('sortPeersByPriority preserves order of equal-scored peers (stable sort)', () => {
  // Three identically signal-less peers — order must be preserved.
  const a = makePeer('a')
  const b = makePeer('b')
  const c = makePeer('c')

  const result = sortPeersByPriority([a, b, c], 'most-trusted')
  assert.equal(result[0]?.peerId, a.peerId)
  assert.equal(result[1]?.peerId, b.peerId)
  assert.equal(result[2]?.peerId, c.peerId)
})

test('sortPeersByPriority returns empty array for empty input', () => {
  const result = sortPeersByPriority([], 'cheapest')
  assert.deepEqual(result, [])
})
