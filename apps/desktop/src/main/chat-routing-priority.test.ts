import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  DEFAULT_ROUTING_PRIORITY,
  resolveLatestRoutingPriority,
  readBuyerRoutingDefaults,
  writeBuyerRoutingDefaults,
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

describe('buyer routing defaults (global default + tooltip flag)', () => {
  async function withTmpConfig(fn: (configPath: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(path.join(tmpdir(), 'antseed-test-'))
    const configPath = path.join(dir, 'config.json')
    try {
      await fn(configPath)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  it('returns null defaultPriority and false tooltipDismissed when config is absent', async () => {
    await withTmpConfig(async (configPath) => {
      const defaults = await readBuyerRoutingDefaults(configPath)
      assert.equal(defaults.defaultPriority, null)
      assert.equal(defaults.tooltipDismissed, false)
    })
  })

  it('persists and reads back a defaultPriority', async () => {
    await withTmpConfig(async (configPath) => {
      await writeBuyerRoutingDefaults({ defaultPriority: 'cheapest' }, configPath)
      const defaults = await readBuyerRoutingDefaults(configPath)
      assert.equal(defaults.defaultPriority, 'cheapest')
    })
  })

  it('persists and reads back tooltipDismissed = true', async () => {
    await withTmpConfig(async (configPath) => {
      await writeBuyerRoutingDefaults({ tooltipDismissed: true }, configPath)
      const defaults = await readBuyerRoutingDefaults(configPath)
      assert.equal(defaults.tooltipDismissed, true)
    })
  })

  it('seeding a global default from a pick also sets tooltipDismissed', async () => {
    // This test mirrors the real flow: the user picks a priority from the ? chip,
    // which should both (a) set defaultPriority and (b) set tooltipDismissed = true.
    await withTmpConfig(async (configPath) => {
      await writeBuyerRoutingDefaults(
        { defaultPriority: 'fastest', tooltipDismissed: true },
        configPath,
      )
      const defaults = await readBuyerRoutingDefaults(configPath)
      assert.equal(defaults.defaultPriority, 'fastest', 'global default should be seeded')
      assert.equal(defaults.tooltipDismissed, true, 'tooltip should be dismissed after pick')
    })
  })

  it('future new chats use the seeded global default', async () => {
    // After the user picks 'fastest', subsequent reads should return 'fastest'
    // so future new chats can default to it instead of showing ?.
    await withTmpConfig(async (configPath) => {
      await writeBuyerRoutingDefaults({ defaultPriority: 'fastest', tooltipDismissed: true }, configPath)
      // Simulate reopening the app: read defaults fresh.
      const defaults = await readBuyerRoutingDefaults(configPath)
      assert.equal(defaults.defaultPriority, 'fastest')
      assert.equal(defaults.tooltipDismissed, true)
      // A brand-new chat should NOT show ? because tooltipDismissed is true.
      // (The UI layer checks tooltipDismissed; here we verify the data contract.)
    })
  })

  it('partial write preserves existing fields', async () => {
    await withTmpConfig(async (configPath) => {
      await writeBuyerRoutingDefaults({ defaultPriority: 'cheapest', tooltipDismissed: true }, configPath)
      // Only update the priority, tooltip flag should remain true.
      await writeBuyerRoutingDefaults({ defaultPriority: 'most-trusted' }, configPath)
      const defaults = await readBuyerRoutingDefaults(configPath)
      assert.equal(defaults.defaultPriority, 'most-trusted')
      assert.equal(defaults.tooltipDismissed, true, 'tooltipDismissed should not be reset')
    })
  })

  it('does not accept invalid priority values', async () => {
    await withTmpConfig(async (configPath) => {
      // Write an invalid value directly; read should return null.
      const { mergeConfig } = await import('./config-io.js')
      await mergeConfig(
        { buyer: { defaultRoutingPriority: 'invalid-value' } },
        configPath,
      )
      const defaults = await readBuyerRoutingDefaults(configPath)
      assert.equal(defaults.defaultPriority, null, 'invalid value should yield null')
    })
  })
})
