/**
 * Per-conversation routing priority, stored as a custom SessionManager entry.
 *
 * Pattern mirrors chat-peer-selection.ts: a typed custom entry is appended to
 * the session log, and the latest entry wins when the conversation is loaded.
 *
 * Buyer-scoped defaults (global default priority + tooltip-dismissed flag) are
 * stored in config.json under `buyer.defaultRoutingPriority` and
 * `buyer.routingPriorityTooltipDismissed` via the mergeConfig helper.
 */

import { mergeConfig, readConfig } from './config-io.js'

export type RoutingPriority = 'cheapest' | 'fastest' | 'most-trusted'

export const DEFAULT_ROUTING_PRIORITY: RoutingPriority = 'most-trusted'

export const ANTSEED_ROUTING_PRIORITY_CUSTOM_TYPE = 'antseed:routing-priority'

export type BuyerRoutingDefaults = {
  /** Buyer's last explicit priority choice; null means never picked. */
  defaultPriority: RoutingPriority | null
  /** True once the one-time tooltip has been dismissed or a pick has been made. */
  tooltipDismissed: boolean
}

type PersistedRoutingEntry = {
  type?: string
  customType?: string
  data?: unknown
}

function isValidPriority(value: unknown): value is RoutingPriority {
  return value === 'cheapest' || value === 'fastest' || value === 'most-trusted'
}

/**
 * Read the latest routing priority from a session's custom entries.
 * Returns the default if no entry has been recorded yet.
 */
export function resolveLatestRoutingPriority(
  entries: PersistedRoutingEntry[],
): RoutingPriority {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]
    if (
      !entry
      || entry.type !== 'custom'
      || entry.customType !== ANTSEED_ROUTING_PRIORITY_CUSTOM_TYPE
    ) {
      continue
    }
    const data = entry.data as Record<string, unknown> | undefined
    const priority = data?.priority
    if (isValidPriority(priority)) {
      return priority
    }
  }
  return DEFAULT_ROUTING_PRIORITY
}

/**
 * Read buyer-scoped routing defaults from config.json.
 * Returns safe zero-values if the fields are absent (first-run scenario).
 */
export async function readBuyerRoutingDefaults(
  configPath?: string,
): Promise<BuyerRoutingDefaults> {
  const config = await readConfig(configPath)
  const buyer =
    config.buyer && typeof config.buyer === 'object' && !Array.isArray(config.buyer)
      ? (config.buyer as Record<string, unknown>)
      : {}
  const rawPriority = buyer['defaultRoutingPriority']
  const defaultPriority = isValidPriority(rawPriority) ? rawPriority : null
  const tooltipDismissed = buyer['routingPriorityTooltipDismissed'] === true
  return { defaultPriority, tooltipDismissed }
}

/**
 * Persist buyer-scoped routing defaults into config.json.
 * Partial updates are accepted — omitted fields are left unchanged.
 */
export async function writeBuyerRoutingDefaults(
  patch: Partial<BuyerRoutingDefaults>,
  configPath?: string,
): Promise<void> {
  const buyerPatch: Record<string, unknown> = {}
  if ('defaultPriority' in patch) {
    buyerPatch['defaultRoutingPriority'] = patch.defaultPriority ?? null
  }
  if ('tooltipDismissed' in patch) {
    buyerPatch['routingPriorityTooltipDismissed'] = patch.tooltipDismissed === true
  }
  if (Object.keys(buyerPatch).length > 0) {
    await mergeConfig({ buyer: buyerPatch }, configPath)
  }
}
