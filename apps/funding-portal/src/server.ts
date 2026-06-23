import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { assertMoonpayEnv } from './lib/moonpay-server'

// Runs once at server startup: in production, throws (failing boot) if the
// MoonPay secret is missing. No-op in development (placeholder) and during the
// build's prerender step.
assertMoonpayEnv()

export default createServerEntry({
  fetch(request) {
    return handler.fetch(request)
  },
})
