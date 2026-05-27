/**
 * Per-conversation routing variant, stored as a custom SessionManager entry.
 *
 * Pattern mirrors chat-routing-priority.ts: a typed custom entry is appended
 * to the session log, and the latest entry wins when the conversation is loaded.
 *
 * Unlike routing priority, variants are model-specific — each canonical model
 * has its own variant set. There is no buyer-scoped global default for variants.
 * New chats default to 'Base' (no customization filter applied).
 */

export const ANTSEED_ROUTING_VARIANT_CUSTOM_TYPE = 'antseed:routing-variant'

/** The sentinel value meaning "no variant selected / use Base routing". */
export const BASE_VARIANT = 'Base'

type PersistedVariantEntry = {
  type?: string
  customType?: string
  data?: unknown
}

function isValidVariant(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Read the latest routing variant from a session's custom entries.
 * Returns 'Base' (no variant) if no entry has been recorded yet.
 */
export function resolveLatestRoutingVariant(
  entries: PersistedVariantEntry[],
): string {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]
    if (
      !entry
      || entry.type !== 'custom'
      || entry.customType !== ANTSEED_ROUTING_VARIANT_CUSTOM_TYPE
    ) {
      continue
    }
    const data = entry.data as Record<string, unknown> | undefined
    const variant = data?.variant
    if (isValidVariant(variant)) {
      return variant
    }
  }
  return BASE_VARIANT
}
