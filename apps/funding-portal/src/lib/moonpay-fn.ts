import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { moonpayConfigFromEnv, signMoonpayUrl, MoonpayError } from './moonpay-server'

// Server function (RPC). Runs only on the server — TanStack Start strips the
// handler and the MoonPay secret from the client bundle. The MoonPay React SDK
// calls this through `onUrlSignatureRequested` whenever the widget URL changes.

const signInput = z.object({
  // The full MoonPay widget URL the SDK wants signed.
  url: z.string().url(),
})

export type SignMoonpayInput = z.infer<typeof signInput>

export type SignMoonpayResult =
  | { ok: true; signature: string }
  | { ok: false; message: string }

/** HMAC-sign a MoonPay widget URL with the server-side secret key. */
export const signMoonpayUrlFn = createServerFn({ method: 'POST' })
  .validator((data: SignMoonpayInput) => signInput.parse(data))
  .handler(async ({ data }): Promise<SignMoonpayResult> => {
    const config = moonpayConfigFromEnv()
    if (!config) {
      return { ok: false, message: 'MoonPay is not configured (set MOONPAY_SECRET_KEY).' }
    }
    try {
      return { ok: true, signature: signMoonpayUrl(config, data.url) }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof MoonpayError ? err.message : 'Failed to sign the MoonPay URL.',
      }
    }
  })
