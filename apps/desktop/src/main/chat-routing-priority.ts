/**
 * Per-conversation routing priority, stored as a custom SessionManager entry.
 *
 * Pattern mirrors chat-peer-selection.ts: a typed custom entry is appended to
 * the session log, and the latest entry wins when the conversation is loaded.
 */

export type RoutingPriority = 'cheapest' | 'fastest' | 'most-trusted'

export const DEFAULT_ROUTING_PRIORITY: RoutingPriority = 'most-trusted'

export const ANTSEED_ROUTING_PRIORITY_CUSTOM_TYPE = 'antseed:routing-priority'

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
