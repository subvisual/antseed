import assert from 'node:assert'
import { createPrivateKey, randomBytes } from 'node:crypto'
import { SignJWT, importJWK, importPKCS8, type KeyLike } from 'jose'

// Server-only: the CDP secret is account-level and must never reach the client.
// Docs: https://docs.cdp.coinbase.com/onramp/headless-onramp/overview

export interface CoinbaseConfig {
  apiKeyId: string
  apiKeySecret: string
  sandbox: boolean
}

export class CoinbaseOnrampError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CoinbaseOnrampError'
  }
}

export function assertCoinbaseEnv(): void {
  if (import.meta.env.DEV || process.env['TSS_PRERENDERING']) return
  const id = process.env['COINBASE_CDP_API_KEY_ID']
  const secret = process.env['COINBASE_CDP_API_KEY_SECRET']
  assert(
    Boolean(id) === Boolean(secret),
    '[funding-portal] COINBASE_CDP_API_KEY_ID and COINBASE_CDP_API_KEY_SECRET must be set together.',
  )
  // Apple/Google Pay iframe won't load unless the domain matches the CDP allowlist.
  if (id && secret) {
    assert(
      Boolean(process.env['COINBASE_ONRAMP_DOMAIN']),
      '[funding-portal] COINBASE_ONRAMP_DOMAIN must be set when Coinbase onramp is configured.',
    )
  }
}

export function coinbaseConfigFromEnv(): CoinbaseConfig | null {
  const apiKeyId = process.env['COINBASE_CDP_API_KEY_ID']
  const apiKeySecret = process.env['COINBASE_CDP_API_KEY_SECRET']
  if (!apiKeyId || !apiKeySecret) return null
  const sandbox = process.env['COINBASE_CDP_SANDBOX'] !== 'false'
  return { apiKeyId, apiKeySecret, sandbox }
}

type SigningKey = KeyLike | Uint8Array

export interface GenerateJwtParams {
  apiKeyId: string
  apiKeySecret: string
  requestMethod: string
  requestHost: string
  requestPath: string
}

// CDP secrets arrive as Ed25519 (base64 of 64 bytes) or legacy EC P-256 (PKCS#8),
// detected by shape.
async function loadSigningKey(apiKeySecret: string): Promise<{ key: SigningKey; alg: string }> {
  if (apiKeySecret.includes('BEGIN')) {
    return { key: await importPKCS8(apiKeySecret, 'ES256'), alg: 'ES256' }
  }
  const raw = Buffer.from(apiKeySecret, 'base64')
  if (raw.length === 64) {
    // Ed25519: first 32 bytes seed, last 32 public key.
    const seed = raw.subarray(0, 32)
    const pub = raw.subarray(32)
    const key = await importJWK(
      { kty: 'OKP', crv: 'Ed25519', d: seed.toString('base64url'), x: pub.toString('base64url') },
      'EdDSA',
    )
    return { key, alg: 'EdDSA' }
  }
  const key = createPrivateKey({ key: raw, format: 'der', type: 'pkcs8' })
  return { key, alg: 'ES256' }
}

// CDP REST auth recipe: uri = "<METHOD> <HOST><PATH>" (no query), 120s validity.
export async function generateJwt(params: GenerateJwtParams): Promise<string> {
  const { key, alg } = await loadSigningKey(params.apiKeySecret)
  const now = Math.floor(Date.now() / 1000)
  const uri = `${params.requestMethod} ${params.requestHost}${params.requestPath}`
  return new SignJWT({ iss: 'cdp', sub: params.apiKeyId, aud: ['cdp_service'], uri })
    .setProtectedHeader({ alg, kid: params.apiKeyId, typ: 'JWT', nonce: randomBytes(16).toString('hex') })
    .setNotBefore(now)
    .setExpirationTime(now + 120)
    .sign(key)
}

const ONRAMP_API_HOST = 'api.developer.coinbase.com'
const CDP_API_HOST = 'api.cdp.coinbase.com'
const CDP_TIMEOUT_MS = 10_000

export type SignJwtFn = (params: GenerateJwtParams) => Promise<string>

interface CdpRequest {
  method: 'GET' | 'POST'
  host: string
  path: string
  query?: Record<string, string>
  body?: unknown
  signJwt?: SignJwtFn
}

async function cdpFetch<T>(config: CoinbaseConfig, req: CdpRequest): Promise<T> {
  const sign = req.signJwt ?? generateJwt
  const jwt = await sign({
    apiKeyId: config.apiKeyId,
    apiKeySecret: config.apiKeySecret,
    requestMethod: req.method,
    requestHost: req.host,
    requestPath: req.path,
  })

  const url = new URL(`https://${req.host}${req.path}`)
  if (req.query) for (const [k, v] of Object.entries(req.query)) url.searchParams.set(k, v)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CDP_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url.toString(), {
      method: req.method,
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {}),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new CoinbaseOnrampError('Coinbase request timed out')
    }
    throw new CoinbaseOnrampError(`Coinbase request failed: ${err instanceof Error ? err.name : 'network error'}`)
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    // Server-log the CDP error body (never surface it to the client).
    const detail = await res.text().catch(() => '')
    console.error(`[coinbase] ${req.method} ${req.host}${req.path} → ${res.status}: ${detail}`)
    throw new CoinbaseOnrampError(`Coinbase API returned ${res.status}`)
  }
  return (await res.json().catch(() => null)) as T
}

export interface BuyConfig {
  countries: Array<{ id: string; paymentMethods: Array<{ id: string }>; subdivisions: string[] }>
}

export function getBuyConfig(
  config: CoinbaseConfig,
  params: { signJwt?: SignJwtFn } = {},
): Promise<BuyConfig> {
  return cdpFetch<BuyConfig>(config, {
    method: 'GET', host: ONRAMP_API_HOST, path: '/onramp/v1/buy/config',
    ...(params.signJwt ? { signJwt: params.signJwt } : {}),
  })
}

export interface BuyOptions {
  paymentCurrencies: Array<{ id: string; limits: Array<{ id: string; min: string; max: string }> }>
  purchaseCurrencies: Array<{
    id: string; name: string; symbol: string; iconUrl?: string
    networks: Array<{ name: string; chainId?: number; displayName?: string; contractAddress?: string }>
  }>
}

export function getBuyOptions(
  config: CoinbaseConfig,
  params: { country: string; subdivision?: string; networks?: string; signJwt?: SignJwtFn },
): Promise<BuyOptions> {
  const query: Record<string, string> = { country: params.country }
  if (params.subdivision) query.subdivision = params.subdivision
  if (params.networks) query.networks = params.networks
  return cdpFetch<BuyOptions>(config, {
    method: 'GET', host: ONRAMP_API_HOST, path: '/onramp/v1/buy/options', query,
    ...(params.signJwt ? { signJwt: params.signJwt } : {}),
  })
}

export interface InitiateVerificationResult { verificationId: string; otpExpiresAt: string }

export function initiateVerification(
  config: CoinbaseConfig,
  params: { channel: 'sms' | 'email'; destination: string; signJwt?: SignJwtFn },
): Promise<InitiateVerificationResult> {
  return cdpFetch<InitiateVerificationResult>(config, {
    method: 'POST', host: CDP_API_HOST, path: '/platform/v2/onramp/verifications',
    body: { channel: params.channel, destination: params.destination },
    ...(params.signJwt ? { signJwt: params.signJwt } : {}),
  })
}

export interface SubmitVerificationResult { verificationId: string; verificationExpiresAt: string }

export function submitVerification(
  config: CoinbaseConfig,
  params: { verificationId: string; otpCode: string; signJwt?: SignJwtFn },
): Promise<SubmitVerificationResult> {
  return cdpFetch<SubmitVerificationResult>(config, {
    method: 'POST', host: CDP_API_HOST,
    path: `/platform/v2/onramp/verifications/${encodeURIComponent(params.verificationId)}/submit`,
    body: { otpCode: params.otpCode },
    ...(params.signJwt ? { signJwt: params.signJwt } : {}),
  })
}

export type CoinbasePaymentMethod = 'GUEST_CHECKOUT_APPLE_PAY' | 'GUEST_CHECKOUT_GOOGLE_PAY'

export interface CreateOrderParams {
  paymentAmount?: string
  purchaseAmount?: string
  paymentCurrency: string
  purchaseCurrency: string
  paymentMethod: CoinbasePaymentMethod
  destinationAddress: string
  destinationNetwork: string
  email: string
  phoneNumber: string
  phoneNumberVerifiedAt: string
  agreementAcceptedAt: string
  emailVerificationId?: string
  smsVerificationId?: string
  partnerUserRef: string
  domain: string
  signJwt?: SignJwtFn
}

export interface CreateOrderResult {
  order: { orderId: string; status: string; purchaseAmount: string; purchaseCurrency: string }
  paymentLink: { url: string; paymentLinkType: string }
}

export function createOrder(config: CoinbaseConfig, params: CreateOrderParams): Promise<CreateOrderResult> {
  const { signJwt, ...body } = params
  return cdpFetch<CreateOrderResult>(config, {
    method: 'POST', host: CDP_API_HOST, path: '/platform/v2/onramp/orders', body,
    ...(signJwt ? { signJwt } : {}),
  })
}
