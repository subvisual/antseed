import { autoDepositPlugin, type AntseedFundingPlugin } from '@antseed/auto-deposit'

/**
 * Funding plugins the buyer process runs. Bundled as workspace deps and loaded
 * at runtime; the desktop discovers them live via the buyer's /_antseed/funding
 * endpoint, so this list is the single runtime source of truth.
 */
export const FUNDING_PLUGINS: AntseedFundingPlugin[] = [autoDepositPlugin]
