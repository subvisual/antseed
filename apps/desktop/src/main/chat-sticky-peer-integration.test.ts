/**
 * Integration tests for sticky-per-chat routing.
 *
 * These tests simulate the request path from pi-chat-engine.ts, verifying
 * that:
 *   - the sticky module is actually consulted on the second request
 *   - error-triggered re-selection works end-to-end
 *   - degradation-triggered re-selection works end-to-end
 *   - priority-chip change clears the sticky peer
 *
 * The simulated path mirrors the logic in runStreamingPrompt:
 *   1. Read getStickyPeer → reuse if present
 *   2. If absent, run selectPeerIdByPriority (simulated by a counter)
 *   3. On success: markPeerSuccess(chatId, peerId, latencyMs)
 *   4. On error:   markPeerFailed(chatId, peerId)
 *   5. On priority change: clearStickyState(chatId)
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  clearStickyState,
  deleteChatStickyState,
  getStickyPeer,
  markPeerFailed,
  markPeerSuccess,
  setStickyPeer,
} from './chat-sticky-peer.js';

/**
 * Simulates one request round-trip in runStreamingPrompt.
 *
 * Returns the peerId that was actually used, and calls the appropriate
 * sticky-peer hooks just as the real production code does.
 *
 * `selectCallCounter` is incremented each time peer selection runs (i.e. when
 * there is no valid sticky peer), so callers can assert re-selection happened.
 */
function simulateRequest(opts: {
  chatId: string;
  peers: string[];
  latencyMs: number;
  error?: boolean;
  selectCallCounter: { count: number };
}): string | null {
  const { chatId, peers, latencyMs, error, selectCallCounter } = opts;

  // ---- mirror of pi-chat-engine.ts peer-selection block ----
  let peerId = getStickyPeer(chatId);
  if (!peerId) {
    // Simulate selectPeerIdByPriority: pick first non-null peer
    selectCallCounter.count += 1;
    peerId = peers[0] ?? null;
    if (peerId) {
      setStickyPeer(chatId, peerId);
    }
  }
  // ----------------------------------------------------------

  if (!peerId) return null;

  // ---- mirror of success / error paths ----
  if (error) {
    markPeerFailed(chatId, peerId);
    // preferredPeerByConversationId.delete(conversationId) is also called;
    // that in-memory map lives in pi-chat-engine, not tested here.
  } else {
    markPeerSuccess(chatId, peerId, latencyMs);
  }
  // -----------------------------------------

  return peerId;
}

describe('integration: happy-path sticky reuse', () => {
  const chatId = 'integ-happy-1';

  beforeEach(() => {
    deleteChatStickyState(chatId);
  });

  it('second request reuses the sticky peer without re-running selection', () => {
    const counter = { count: 0 };
    const peers = ['peer-a', 'peer-b'];

    // First request: no sticky peer → selection runs
    const peer1 = simulateRequest({ chatId, peers, latencyMs: 100, selectCallCounter: counter });
    assert.equal(peer1, 'peer-a', 'first request picks peer-a');
    assert.equal(counter.count, 1, 'selection ran once');

    // Second request: sticky peer available → selection does NOT run
    const peer2 = simulateRequest({ chatId, peers, latencyMs: 120, selectCallCounter: counter });
    assert.equal(peer2, 'peer-a', 'second request reuses peer-a');
    assert.equal(counter.count, 1, 'selection did NOT run again');
  });
});

describe('integration: error-triggered re-selection', () => {
  const chatId = 'integ-error-1';

  beforeEach(() => {
    deleteChatStickyState(chatId);
  });

  it('errored request causes re-selection on next request', () => {
    const counter = { count: 0 };
    const peers = ['peer-a', 'peer-b'];

    // Request 1: selects peer-a
    simulateRequest({ chatId, peers, latencyMs: 100, selectCallCounter: counter });
    assert.equal(counter.count, 1);

    // Request 2: peer-a errors → re-selection needed
    simulateRequest({ chatId, peers, latencyMs: 0, error: true, selectCallCounter: counter });
    // error path marks peer-a failed; sticky = null

    // Request 3: no sticky → selection runs again, skips peer-a (now in skip-list)
    // In this simplified simulation, peers[0] is still 'peer-a'; in production
    // the catalog filter removes skip-listed peers. So we simulate that:
    const peersFiltered = peers.filter((p) => p !== 'peer-a'); // ['peer-b']
    const peer3 = simulateRequest({ chatId, peers: peersFiltered, latencyMs: 80, selectCallCounter: counter });
    assert.equal(peer3, 'peer-b', 're-selection picked peer-b');
    assert.equal(counter.count, 2, 'selection ran again after error');
  });
});

describe('integration: degradation-triggered re-selection', () => {
  const chatId = 'integ-degrade-1';

  beforeEach(() => {
    deleteChatStickyState(chatId);
  });

  it('slow response triggers re-selection on next request', () => {
    const counter = { count: 0 };
    const peers = ['peer-a', 'peer-b'];

    // Request 1: fast — establishes baseline of 100 ms
    simulateRequest({ chatId, peers, latencyMs: 100, selectCallCounter: counter });
    assert.equal(counter.count, 1);

    // Request 2: 3× baseline (300 ms) → degradation → peer-a marked failed
    const peer2 = simulateRequest({ chatId, peers, latencyMs: 300, selectCallCounter: counter });
    assert.equal(peer2, 'peer-a', 'peer-a was still used for this request');
    assert.equal(counter.count, 1, 'selection did not re-run mid-request');
    // But peer-a is now in the skip-list
    assert.equal(getStickyPeer(chatId), null, 'sticky cleared after degradation');

    // Request 3: no sticky → re-selection, skip peer-a
    const peersFiltered = peers.filter((p) => p !== 'peer-a');
    const peer3 = simulateRequest({ chatId, peers: peersFiltered, latencyMs: 80, selectCallCounter: counter });
    assert.equal(peer3, 'peer-b', 're-selection picked peer-b after degradation');
    assert.equal(counter.count, 2, 'selection ran again after degradation');
  });
});

describe('integration: priority change clears sticky', () => {
  const chatId = 'integ-priority-1';

  beforeEach(() => {
    deleteChatStickyState(chatId);
  });

  it('changing priority chip causes fresh selection on next prompt', () => {
    const counter = { count: 0 };
    const peers = ['peer-a', 'peer-b'];

    // Request 1: picks peer-a
    simulateRequest({ chatId, peers, latencyMs: 100, selectCallCounter: counter });
    assert.equal(counter.count, 1);
    assert.equal(getStickyPeer(chatId), 'peer-a');

    // Priority chip change (mirrors the setRoutingPriority IPC handler)
    clearStickyState(chatId);

    // After clear, getStickyPeer returns null
    assert.equal(getStickyPeer(chatId), null);

    // Request 2: fresh selection because sticky was cleared
    simulateRequest({ chatId, peers, latencyMs: 90, selectCallCounter: counter });
    assert.equal(counter.count, 2, 'selection ran again after priority change');
  });
});
