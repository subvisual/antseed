import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_ROUTING_PRIORITY,
  resolveLatestRoutingPriority,
} from './chat-routing-priority.js'

type Entry = { type?: string; customType?: string; data?: unknown }

describe('resolveLatestRoutingPriority', () => {
  it('returns the default for an empty entry list', () => {
    assert.equal(resolveLatestRoutingPriority([]), DEFAULT_ROUTING_PRIORITY)
  })

  it('returns the default when no routing-priority entry exists', () => {
    const entries: Entry[] = [
      { type: 'model', data: { modelId: 'claude-opus-4' } },
      { type: 'custom', customType: 'antseed:peer', data: { peerId: 'a'.repeat(40) } },
    ]
    assert.equal(resolveLatestRoutingPriority(entries), DEFAULT_ROUTING_PRIORITY)
  })

  it('returns the persisted priority', () => {
    const entries: Entry[] = [
      {
        type: 'custom',
        customType: 'antseed:routing-priority',
        data: { priority: 'cheapest' },
      },
    ]
    assert.equal(resolveLatestRoutingPriority(entries), 'cheapest')
  })

  it('returns the latest entry when multiple are present', () => {
    const entries: Entry[] = [
      {
        type: 'custom',
        customType: 'antseed:routing-priority',
        data: { priority: 'cheapest' },
      },
      {
        type: 'custom',
        customType: 'antseed:routing-priority',
        data: { priority: 'fastest' },
      },
    ]
    assert.equal(resolveLatestRoutingPriority(entries), 'fastest')
  })

  it('falls back to the default when the persisted value is unknown', () => {
    const entries: Entry[] = [
      {
        type: 'custom',
        customType: 'antseed:routing-priority',
        data: { priority: 'unknown-value' },
      },
    ]
    assert.equal(resolveLatestRoutingPriority(entries), DEFAULT_ROUTING_PRIORITY)
  })

  it('recognises all three valid priority values', () => {
    for (const priority of ['cheapest', 'fastest', 'most-trusted'] as const) {
      const entries: Entry[] = [
        {
          type: 'custom',
          customType: 'antseed:routing-priority',
          data: { priority },
        },
      ]
      assert.equal(resolveLatestRoutingPriority(entries), priority, `expected ${priority}`)
    }
  })
})
