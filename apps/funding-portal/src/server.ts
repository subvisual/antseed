import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { assertMoonpayEnv } from './lib/moonpay-server'
import { assertCoinbaseEnv } from './lib/coinbase-server'

// Runs once at server startup: in production, throws (failing boot) if onramp
// secrets are misconfigured. No-op in development and during prerender.
assertMoonpayEnv()
assertCoinbaseEnv()

export default createServerEntry({
  fetch(request) {
    return handler.fetch(request)
  },
})
