import assert from 'node:assert'
import { createHmac } from 'node:crypto'

// MoonPay widget URL signing. The buy widget loads client-side with the public
// publishable key (pk_*). When the URL pins a `walletAddress`, MoonPay requires
// the URL to be signed with the SECRET key (sk_*) so the destination can't be
// tampered with in the browser. The secret lives only on the server — this
// module is imported solely by the signing server function.
// Docs: https://dev.moonpay.com/docs/enhanced-widget-security-url-signing

// Placeholder so the app boots in development without a real secret. It produces
// a signature MoonPay will reject, but the rest of the flow is exercisable.
const DEV_SECRET = 'sk_test_placeholder'

export interface MoonpayConfig {
  secretKey: string
}

export class MoonpayError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoonpayError'
  }
}

/**
 * In production, fail fast at startup if the MoonPay secret is missing — the
 * portal can't sign widget URLs without it. No-op in development (placeholder)
 * and during the build's prerender step.
 */
export function assertMoonpayEnv(): void {
  if (import.meta.env.DEV || process.env['TSS_PRERENDERING']) return
  assert(
    process.env['MOONPAY_SECRET_KEY'],
    '[funding-portal] MOONPAY_SECRET_KEY must be set in production.',
  )
}

/** Read the MoonPay secret from the environment. Null when not configured. */
export function moonpayConfigFromEnv(): MoonpayConfig | null {
  const secretKey =
    process.env['MOONPAY_SECRET_KEY'] || (import.meta.env.DEV ? DEV_SECRET : undefined)
  if (!secretKey) return null
  return { secretKey }
}

/**
 * Sign a MoonPay widget URL: HMAC-SHA256 of the query string (everything from
 * the leading "?" onward) with the secret key, base64-encoded. MoonPay appends
 * the result as the `signature` param to lock the URL — most importantly the
 * destination `walletAddress`.
 */
export function signMoonpayUrl(config: MoonpayConfig, url: string): string {
  const { search } = new URL(url)
  if (!search) throw new MoonpayError('Cannot sign a MoonPay URL with no query string.')
  return createHmac('sha256', config.secretKey).update(search).digest('base64')
}
