/**
 * Sticky-peer routing state for per-chat request reuse and auto-fallback.
 *
 * Each chat is assigned a sticky peer after the first successful peer
 * selection. Subsequent requests reuse that peer. On error, or when the
 * observed request latency exceeds 2× the rolling baseline, the peer is
 * added to an in-memory skip-list and the next request re-selects from
 * scratch (under the active routing priority, skipping failed peers).
 *
 * The skip-list is per-chat and in-memory only; it does NOT survive process
 * restart. The sticky peer itself IS persisted (via the existing
 * `store.setPeer` / `preferredPeerByConversationId` mechanism in
 * pi-chat-engine.ts) and survives restarts.
 *
 * Priority-chip changes call `clearStickyState` to force a fresh selection
 * on the next prompt.
 */

/** Per-chat mutable state. */
type ChatStickyState = {
  /** Currently chosen sticky peer ID. */
  stickyPeerId: string | null;
  /**
   * Peers that have failed or degraded; skipped during peer re-selection
   * for the rest of this chat's lifetime in this process.
   */
  skipSet: Set<string>;
  /**
   * Rolling latency baseline (exponential moving average, α = 0.3).
   * Null until the first successful measured request.
   */
  latencyBaseline: number | null;
};

const EMA_ALPHA = 0.3;
/** Ratio above which a request is considered degraded. */
const DEGRADATION_FACTOR = 2;

const state = new Map<string, ChatStickyState>();

function getOrCreate(chatId: string): ChatStickyState {
  let s = state.get(chatId);
  if (!s) {
    s = { stickyPeerId: null, skipSet: new Set(), latencyBaseline: null };
    state.set(chatId, s);
  }
  return s;
}

/**
 * Returns the current sticky peer for `chatId` if it is not in the skip-list,
 * otherwise returns `null` (triggering re-selection).
 */
export function getStickyPeer(chatId: string): string | null {
  const s = state.get(chatId);
  if (!s || !s.stickyPeerId) return null;
  if (s.skipSet.has(s.stickyPeerId)) return null;
  return s.stickyPeerId;
}

/**
 * Records the sticky peer for `chatId`.
 *
 * Does NOT persist to disk — the caller (`pi-chat-engine.ts`) already
 * writes to `preferredPeerByConversationId` + `store.setPeer`.
 */
export function setStickyPeer(chatId: string, peerId: string): void {
  const s = getOrCreate(chatId);
  s.stickyPeerId = peerId;
}

/**
 * Removes the sticky peer and clears the skip-list for `chatId`.
 * Called when the routing-priority chip changes so the next prompt
 * picks a fresh peer from scratch.
 */
export function clearStickyState(chatId: string): void {
  state.delete(chatId);
}

/**
 * Returns the full set of peer IDs that must be skipped during
 * re-selection for `chatId`.
 */
export function getSkipSet(chatId: string): ReadonlySet<string> {
  return state.get(chatId)?.skipSet ?? new Set();
}

/**
 * Marks `peerId` as failed for `chatId`.
 *
 * - Adds the peer to the skip-list.
 * - Clears the sticky peer if it matches (so the next request re-selects).
 */
export function markPeerFailed(chatId: string, peerId: string): void {
  const s = getOrCreate(chatId);
  s.skipSet.add(peerId);
  if (s.stickyPeerId === peerId) {
    s.stickyPeerId = null;
  }
}

/**
 * Updates the rolling latency baseline and checks for degradation.
 *
 * If `latencyMs` is >= DEGRADATION_FACTOR × the existing baseline,
 * the peer is treated as degraded and `markPeerFailed` is called
 * automatically.
 *
 * Returns `true` when the peer was marked degraded (caller may want to
 * log this), `false` otherwise.
 */
export function markPeerSuccess(
  chatId: string,
  peerId: string,
  latencyMs: number,
): boolean {
  const s = getOrCreate(chatId);
  const baseline = s.latencyBaseline;

  // Check degradation BEFORE updating baseline so a slow response does
  // not inflate the reference it is compared against.
  if (baseline !== null && latencyMs >= DEGRADATION_FACTOR * baseline) {
    markPeerFailed(chatId, peerId);
    // Still update the baseline with an EMA so future baselines after
    // re-selection reflect the chat's history.
    s.latencyBaseline = baseline + EMA_ALPHA * (latencyMs - baseline);
    return true;
  }

  // Update rolling baseline.
  s.latencyBaseline = baseline === null
    ? latencyMs
    : baseline + EMA_ALPHA * (latencyMs - baseline);
  return false;
}

/**
 * Removes all state for `chatId`.  Call when a conversation is deleted.
 */
export function deleteChatStickyState(chatId: string): void {
  state.delete(chatId);
}
