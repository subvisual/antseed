import { createServerFn } from '@tanstack/react-start'
import { getAddress } from 'ethers'
import { z } from 'zod'

import {
  coinbaseConfigFromEnv,
  getBuyConfig,
  getBuyOptions,
  initiateVerification,
  submitVerification,
  createOrder,
  CoinbaseOnrampError,
} from './coinbase-server'
import { activeChain } from './chain'

// Server functions (RPC): TanStack Start strips the handler + CDP secret from the
// client bundle. The destination address is client-supplied, so it is checksum-
// validated before it can pin an order.

const addressSchema = z
  .string()
  .transform((v, ctx) => {
    try {
      return getAddress(v)
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid address' })
      return z.NEVER
    }
  })

type Fail = { ok: false; message: string }
function toFail(err: unknown): Fail {
  return { ok: false, message: err instanceof CoinbaseOnrampError ? err.message : 'Coinbase request failed.' }
}

export const coinbaseBuyConfigFn = createServerFn({ method: 'POST' })
  .handler(async () => {
    const config = coinbaseConfigFromEnv()
    if (!config) return { ok: false as const, message: 'Coinbase is not configured.' }
    try {
      const cfg = await getBuyConfig(config)
      const us = cfg.countries.find((c) => c.id === 'US')
      return { ok: true as const, subdivisions: us?.subdivisions ?? [] }
    } catch (err) {
      return toFail(err)
    }
  })

const optionsInput = z.object({ country: z.string().length(2), subdivision: z.string().optional() })

export const coinbaseBuyOptionsFn = createServerFn({ method: 'POST' })
  .validator((d: z.infer<typeof optionsInput>) => optionsInput.parse(d))
  .handler(async ({ data }) => {
    const config = coinbaseConfigFromEnv()
    if (!config) return { ok: false as const, message: 'Coinbase is not configured.' }
    try {
      const opts = await getBuyOptions(config, data)
      return { ok: true as const, options: opts }
    } catch (err) {
      return toFail(err)
    }
  })

const initInput = z.object({
  channel: z.enum(['sms', 'email']),
  destination: z.string().min(3),
})

export const coinbaseInitVerificationFn = createServerFn({ method: 'POST' })
  .validator((d: z.infer<typeof initInput>) => initInput.parse(d))
  .handler(async ({ data }) => {
    const config = coinbaseConfigFromEnv()
    if (!config) return { ok: false as const, message: 'Coinbase is not configured.' }
    try {
      const res = await initiateVerification(config, data)
      return { ok: true as const, ...res }
    } catch (err) {
      return toFail(err)
    }
  })

const submitInput = z.object({
  verificationId: z.string().min(1),
  otpCode: z.string().regex(/^\d{6}$/),
})

export const coinbaseSubmitVerificationFn = createServerFn({ method: 'POST' })
  .validator((d: z.infer<typeof submitInput>) => submitInput.parse(d))
  .handler(async ({ data }) => {
    const config = coinbaseConfigFromEnv()
    if (!config) return { ok: false as const, message: 'Coinbase is not configured.' }
    try {
      const res = await submitVerification(config, data)
      return { ok: true as const, ...res }
    } catch (err) {
      return toFail(err)
    }
  })

// `subdivision` only feeds buy-options, so it is absent from the order.
export const orderInput = z.object({
  amountUsd: z.string().regex(/^\d+(\.\d{1,2})?$/),
  email: z.string().email(),
  phoneNumber: z.string().regex(/^\+[1-9]\d{6,14}$/), // E.164
  paymentMethod: z.enum(['GUEST_CHECKOUT_APPLE_PAY', 'GUEST_CHECKOUT_GOOGLE_PAY']),
  agreementAcceptedAt: z.string().datetime(),
  emailVerificationId: z.string().min(1),
  smsVerificationId: z.string().min(1),
  address: addressSchema,
})

export const coinbaseCreateOrderFn = createServerFn({ method: 'POST' })
  .validator((d: z.infer<typeof orderInput>) => orderInput.parse(d))
  .handler(async ({ data }) => {
    const config = coinbaseConfigFromEnv()
    if (!config) return { ok: false as const, message: 'Coinbase is not configured.' }
    const chain = activeChain()
    const domain = process.env['COINBASE_ONRAMP_DOMAIN'] ?? ''
    const partnerUserRef = `${config.sandbox ? 'sandbox-' : ''}${data.address.toLowerCase()}`
    try {
      const res = await createOrder(config, {
        // Fiat: user pays USD, Coinbase delivers USDC net of fees.
        paymentAmount: data.amountUsd,
        paymentCurrency: 'USD',
        purchaseCurrency: chain.coinbasePurchaseCurrency,
        paymentMethod: data.paymentMethod,
        destinationAddress: data.address,
        destinationNetwork: chain.coinbaseNetwork,
        email: data.email,
        phoneNumber: data.phoneNumber,
        phoneNumberVerifiedAt: new Date().toISOString(),
        agreementAcceptedAt: data.agreementAcceptedAt,
        emailVerificationId: data.emailVerificationId,
        smsVerificationId: data.smsVerificationId,
        partnerUserRef,
        domain,
      })
      return { ok: true as const, ...res }
    } catch (err) {
      return toFail(err)
    }
  })
