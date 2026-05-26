import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  getStickyPeer,
  setStickyPeer,
  clearStickyState,
  getSkipSet,
  markPeerFailed,
  markPeerSuccess,
  deleteChatStickyState,
} from './chat-sticky-peer.js';

// Reset state between tests by deleting chat IDs used in each test.
// Each describe block uses a unique chatId prefix to avoid collisions.

describe('getStickyPeer', () => {
  const chatId = 'test-get-sticky-1';

  beforeEach(() => {
    deleteChatStickyState(chatId);
  });

  it('returns null for an unknown chat', () => {
    assert.equal(getStickyPeer(chatId), null);
  });

  it('returns the set peer', () => {
    setStickyPeer(chatId, 'peer-a');
    assert.equal(getStickyPeer(chatId), 'peer-a');
  });

  it('returns null after the peer is added to the skip-list', () => {
    setStickyPeer(chatId, 'peer-a');
    markPeerFailed(chatId, 'peer-a');
    assert.equal(getStickyPeer(chatId), null);
  });
});

describe('setStickyPeer', () => {
  const chatId = 'test-set-sticky-1';

  beforeEach(() => {
    deleteChatStickyState(chatId);
  });

  it('overwrites a previous sticky peer', () => {
    setStickyPeer(chatId, 'peer-a');
    setStickyPeer(chatId, 'peer-b');
    assert.equal(getStickyPeer(chatId), 'peer-b');
  });
});

describe('clearStickyState', () => {
  const chatId = 'test-clear-sticky-1';

  beforeEach(() => {
    deleteChatStickyState(chatId);
  });

  it('clears the sticky peer', () => {
    setStickyPeer(chatId, 'peer-a');
    clearStickyState(chatId);
    assert.equal(getStickyPeer(chatId), null);
  });

  it('clears the skip-list', () => {
    markPeerFailed(chatId, 'peer-a');
    clearStickyState(chatId);
    const skip = getSkipSet(chatId);
    assert.equal(skip.size, 0);
  });

  it('is idempotent on unknown chat', () => {
    assert.doesNotThrow(() => clearStickyState('non-existent-chat'));
  });
});

describe('markPeerFailed', () => {
  const chatId = 'test-fail-1';

  beforeEach(() => {
    deleteChatStickyState(chatId);
  });

  it('adds the peer to the skip-list', () => {
    markPeerFailed(chatId, 'peer-a');
    assert.equal(getSkipSet(chatId).has('peer-a'), true);
  });

  it('clears the sticky peer when the failed peer matches', () => {
    setStickyPeer(chatId, 'peer-a');
    markPeerFailed(chatId, 'peer-a');
    assert.equal(getStickyPeer(chatId), null);
  });

  it('does not clear the sticky peer when a different peer fails', () => {
    setStickyPeer(chatId, 'peer-a');
    markPeerFailed(chatId, 'peer-b');
    assert.equal(getStickyPeer(chatId), 'peer-a');
  });

  it('accumulates multiple failed peers in the skip-list', () => {
    markPeerFailed(chatId, 'peer-a');
    markPeerFailed(chatId, 'peer-b');
    assert.equal(getSkipSet(chatId).size, 2);
  });
});

describe('markPeerSuccess – happy-path reuse', () => {
  const chatId = 'test-success-happy-1';

  beforeEach(() => {
    deleteChatStickyState(chatId);
  });

  it('returns false and keeps the peer when latency is within baseline', () => {
    setStickyPeer(chatId, 'peer-a');
    // Seed the baseline with a fast request
    const degraded1 = markPeerSuccess(chatId, 'peer-a', 100);
    assert.equal(degraded1, false);
    // Second request is fast — should not degrade
    const degraded2 = markPeerSuccess(chatId, 'peer-a', 120);
    assert.equal(degraded2, false);
    assert.equal(getStickyPeer(chatId), 'peer-a');
  });

  it('does not degrade when there is no baseline yet', () => {
    setStickyPeer(chatId, 'peer-a');
    const degraded = markPeerSuccess(chatId, 'peer-a', 9999);
    assert.equal(degraded, false);
    assert.equal(getStickyPeer(chatId), 'peer-a');
  });
});

describe('markPeerSuccess – degradation-triggered re-selection', () => {
  const chatId = 'test-success-degrade-1';

  beforeEach(() => {
    deleteChatStickyState(chatId);
  });

  it('returns true and marks the peer failed when latency >= 2× baseline', () => {
    setStickyPeer(chatId, 'peer-a');
    // Baseline: 100 ms
    markPeerSuccess(chatId, 'peer-a', 100);
    // Next request is 3× baseline (300 ms) — should degrade
    const degraded = markPeerSuccess(chatId, 'peer-a', 300);
    assert.equal(degraded, true);
    assert.equal(getStickyPeer(chatId), null);
    assert.equal(getSkipSet(chatId).has('peer-a'), true);
  });

  it('does not degrade when latency is exactly 2× baseline', () => {
    setStickyPeer(chatId, 'peer-a');
    markPeerSuccess(chatId, 'peer-a', 100);
    // Exactly 2× — threshold is >=, so this DOES degrade
    const degraded = markPeerSuccess(chatId, 'peer-a', 200);
    assert.equal(degraded, true);
  });

  it('does not degrade when latency is just below 2× baseline', () => {
    setStickyPeer(chatId, 'peer-a');
    markPeerSuccess(chatId, 'peer-a', 100);
    // 199 ms < 200 ms threshold — no degradation
    const degraded = markPeerSuccess(chatId, 'peer-a', 199);
    assert.equal(degraded, false);
    assert.equal(getStickyPeer(chatId), 'peer-a');
  });
});

describe('priority change clears sticky', () => {
  const chatId = 'test-priority-change-1';

  beforeEach(() => {
    deleteChatStickyState(chatId);
  });

  it('clears the sticky peer so the next prompt re-picks from scratch', () => {
    setStickyPeer(chatId, 'peer-a');
    markPeerSuccess(chatId, 'peer-a', 100);
    // Simulate priority chip change
    clearStickyState(chatId);
    assert.equal(getStickyPeer(chatId), null);
    assert.equal(getSkipSet(chatId).size, 0);
  });
});

describe('error-triggered re-selection', () => {
  const chatId = 'test-error-reselect-1';

  beforeEach(() => {
    deleteChatStickyState(chatId);
  });

  it('marks peer failed on error, clears sticky so next request re-selects', () => {
    setStickyPeer(chatId, 'peer-a');
    markPeerFailed(chatId, 'peer-a');
    assert.equal(getStickyPeer(chatId), null);
    assert.equal(getSkipSet(chatId).has('peer-a'), true);
  });

  it('re-selection picks a non-failed peer', () => {
    // After peer-a fails, set peer-b as the new sticky
    setStickyPeer(chatId, 'peer-a');
    markPeerFailed(chatId, 'peer-a');
    // Simulate re-selection choosing peer-b
    setStickyPeer(chatId, 'peer-b');
    assert.equal(getStickyPeer(chatId), 'peer-b');
    // peer-a is still in the skip-list
    assert.equal(getSkipSet(chatId).has('peer-a'), true);
  });
});
