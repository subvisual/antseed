import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BASE_VARIANT,
  resolveLatestRoutingVariant,
} from './chat-routing-variant.js'

type Entry = { type?: string; customType?: string; data?: unknown }

describe('resolveLatestRoutingVariant', () => {
  it('returns Base for an empty entry list', () => {
    assert.equal(resolveLatestRoutingVariant([]), BASE_VARIANT)
  })

  it('returns Base when no routing-variant entry exists', () => {
    const entries: Entry[] = [
      { type: 'model', data: { modelId: 'claude-opus-4' } },
      { type: 'custom', customType: 'antseed:peer', data: { peerId: 'a'.repeat(40) } },
    ]
    assert.equal(resolveLatestRoutingVariant(entries), BASE_VARIANT)
  })

  it('returns the persisted variant', () => {
    const entries: Entry[] = [
      {
        type: 'custom',
        customType: 'antseed:routing-variant',
        data: { variant: 'tee-hardened' },
      },
    ]
    assert.equal(resolveLatestRoutingVariant(entries), 'tee-hardened')
  })

  it('returns the latest entry when multiple are present', () => {
    const entries: Entry[] = [
      {
        type: 'custom',
        customType: 'antseed:routing-variant',
        data: { variant: 'tee-hardened' },
      },
      {
        type: 'custom',
        customType: 'antseed:routing-variant',
        data: { variant: 'fine-tuned' },
      },
    ]
    assert.equal(resolveLatestRoutingVariant(entries), 'fine-tuned')
  })

  it('returns Base when persisted variant is empty string', () => {
    const entries: Entry[] = [
      {
        type: 'custom',
        customType: 'antseed:routing-variant',
        data: { variant: '' },
      },
    ]
    assert.equal(resolveLatestRoutingVariant(entries), BASE_VARIANT)
  })

  it('returns Base when persisted variant is not a string', () => {
    const entries: Entry[] = [
      {
        type: 'custom',
        customType: 'antseed:routing-variant',
        data: { variant: 42 },
      },
    ]
    assert.equal(resolveLatestRoutingVariant(entries), BASE_VARIANT)
  })

  it('returns Base for custom entry with wrong customType', () => {
    const entries: Entry[] = [
      {
        type: 'custom',
        customType: 'antseed:routing-priority',
        data: { variant: 'tee-hardened' },
      },
    ]
    assert.equal(resolveLatestRoutingVariant(entries), BASE_VARIANT)
  })

  it('returns Base persisted variant when followed by Base (last wins)', () => {
    const entries: Entry[] = [
      {
        type: 'custom',
        customType: 'antseed:routing-variant',
        data: { variant: 'tee-hardened' },
      },
      {
        type: 'custom',
        customType: 'antseed:routing-variant',
        data: { variant: BASE_VARIANT },
      },
    ]
    assert.equal(resolveLatestRoutingVariant(entries), BASE_VARIANT)
  })

  it('preserves arbitrary valid variant strings', () => {
    for (const variant of ['tee-hardened', 'fine-tuned', 'uncensored', 'my-variant-42']) {
      const entries: Entry[] = [
        {
          type: 'custom',
          customType: 'antseed:routing-variant',
          data: { variant },
        },
      ]
      assert.equal(resolveLatestRoutingVariant(entries), variant, `expected variant: ${variant}`)
    }
  })
})
