import type { PeerInfo } from '@antseed/node'

/**
 * Routing priority a buyer can attach to a chat session.
 *
 * - cheapest:    minimise cost; ranked by (input + output) USD/M price.
 * - fastest:     minimise latency; ranked by keepalive RTT.
 * - most-trusted: maximise on-chain trust signals; ranked by an even-weight
 *                 blend of five normalised on-chain signals (strawman weights —
 *                 tweak per-signal with empirical data once volume is available):
 *                   stakeUsdcMicros  (higher = better)
 *                   trustScore       (higher = better)
 *                   sybilRisk        (lower  = better, so we invert it)
 *                   totalVolumeUsdcMicros (higher = better)
 *                   reputationScore  (higher = better, 0-100 normalised to 0-1)
 *                 Each signal is normalised to [0, 1] against the field's
 *                 reference maximum, then averaged. Peers with no on-chain
 *                 data receive a score of 0.
 */
export type RoutingPriority = 'cheapest' | 'fastest' | 'most-trusted'

export const DEFAULT_ROUTING_PRIORITY: RoutingPriority = 'most-trusted'

// Reference maxima used for normalisation. These are intentionally generous so
// real-world values map into [0, 1] without clamping. Adjust as the network matures.
const STAKE_MAX    = 100_000_000   // 100 USDC in micros
const VOLUME_MAX   = 1_000_000_000 // 1000 USDC in micros
const REP_MAX      = 100           // reputation is already 0-100

function normalise(value: number, max: number): number {
  if (max <= 0) return 0
  return Math.min(value / max, 1)
}

/**
 * Compute a composite on-chain trust score in [0, 1].
 * All five signals are weighted equally (strawman; update coefficients once
 * empirical data is available).
 */
function computeTrustScore(peer: PeerInfo): number {
  const stake  = normalise(peer.onChainStakeUsdcMicros ?? 0, STAKE_MAX)
  const trust  = normalise(peer.onChainTrustScore ?? 0, 1)
  const sybil  = 1 - normalise(peer.onChainSybilRisk ?? 1, 1) // invert risk
  const volume = normalise(peer.onChainTotalVolumeUsdcMicros ?? 0, VOLUME_MAX)
  const rep    = normalise(peer.onChainReputationScore ?? 0, REP_MAX)
  return (stake + trust + sybil + volume + rep) / 5
}

/**
 * Sort a copy of `peers` according to `priority`, highest-ranked first.
 * The original array is not mutated.
 */
export function sortPeersByPriority(peers: PeerInfo[], priority: RoutingPriority): PeerInfo[] {
  const copy = [...peers]

  switch (priority) {
    case 'cheapest': {
      // Lower total price = better. Missing price treated as +Infinity.
      copy.sort((a, b) => {
        const aPrice = (a.defaultInputUsdPerMillion ?? Infinity) + (a.defaultOutputUsdPerMillion ?? Infinity)
        const bPrice = (b.defaultInputUsdPerMillion ?? Infinity) + (b.defaultOutputUsdPerMillion ?? Infinity)
        return aPrice - bPrice
      })
      break
    }

    case 'fastest': {
      // Lower latency = better. Missing latency treated as +Infinity.
      copy.sort((a, b) => {
        const aLat = a.keepaliveLatencyMs ?? Infinity
        const bLat = b.keepaliveLatencyMs ?? Infinity
        return aLat - bLat
      })
      break
    }

    case 'most-trusted': {
      // Higher composite trust score = better.
      copy.sort((a, b) => computeTrustScore(b) - computeTrustScore(a))
      break
    }
  }

  return copy
}
