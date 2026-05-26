/**
 * Buyer-scoped onboarding banner preferences, stored in config.json.
 *
 * Pattern mirrors chat-routing-priority.ts: two new fields under `buyer`:
 *   - `onboardingBannerDismissed: boolean`
 *   - `recommendedCategories: string[]`
 *
 * These are buyer-scoped (global) and do NOT collide with the routing-priority
 * fields (`defaultRoutingPriority`, `routingPriorityTooltipDismissed`).
 */

import { mergeConfig, readConfig } from './config-io.js'

export type OnboardingPrefs = {
  /** True once the user has dismissed the banner. */
  bannerDismissed: boolean
  /** Category keys the user selected in the banner chips. */
  selectedCategories: string[]
}

/**
 * Read buyer-scoped onboarding prefs from config.json.
 * Returns safe zero-values on first run (file absent or fields missing).
 */
export async function readOnboardingPrefs(
  configPath?: string,
): Promise<OnboardingPrefs> {
  const config = await readConfig(configPath)
  const buyer =
    config.buyer && typeof config.buyer === 'object' && !Array.isArray(config.buyer)
      ? (config.buyer as Record<string, unknown>)
      : {}
  const bannerDismissed = buyer['onboardingBannerDismissed'] === true
  const raw = buyer['recommendedCategories']
  const selectedCategories =
    Array.isArray(raw) && raw.every((v) => typeof v === 'string')
      ? (raw as string[])
      : []
  return { bannerDismissed, selectedCategories }
}

/**
 * Persist buyer-scoped onboarding prefs into config.json.
 * Partial updates accepted — omitted fields are left unchanged.
 */
export async function writeOnboardingPrefs(
  patch: Partial<OnboardingPrefs>,
  configPath?: string,
): Promise<void> {
  const buyerPatch: Record<string, unknown> = {}
  if ('bannerDismissed' in patch) {
    buyerPatch['onboardingBannerDismissed'] = patch.bannerDismissed === true
  }
  if ('selectedCategories' in patch) {
    buyerPatch['recommendedCategories'] = Array.isArray(patch.selectedCategories)
      ? patch.selectedCategories
      : []
  }
  if (Object.keys(buyerPatch).length > 0) {
    await mergeConfig({ buyer: buyerPatch }, configPath)
  }
}
