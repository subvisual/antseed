import { autoDepositPlugin } from '@antseed/auto-deposit'
import type { AntseedServicePlugin } from '@antseed/service-core'

/**
 * Service plugins the buyer process runs (host-driven background services such
 * as the gasless auto-deposit funder). Bundled as workspace deps and loaded at
 * runtime; the desktop discovers them live via the buyer's /_antseed/services
 * endpoint, so this list is the single runtime source of truth.
 */
export const SERVICE_PLUGINS: AntseedServicePlugin[] = [autoDepositPlugin]
