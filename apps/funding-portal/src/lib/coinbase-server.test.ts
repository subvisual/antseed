import { afterEach, describe, expect, it, vi } from 'vitest'

import { coinbaseConfigFromEnv, generateJwt } from './coinbase-server'
import { generateKeyPairSync } from 'node:crypto'
import {
  getBuyConfig,
  getBuyOptions,
  initiateVerification,
  submitVerification,
  createOrder,
  CoinbaseOnrampError,
} from './coinbase-server'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('coinbaseConfigFromEnv', () => {
  it('returns null when creds are absent', () => {
    vi.stubEnv('COINBASE_CDP_API_KEY_ID', '')
    vi.stubEnv('COINBASE_CDP_API_KEY_SECRET', '')
    expect(coinbaseConfigFromEnv()).toBeNull()
  })

  it('reads id + secret and defaults sandbox true', () => {
    vi.stubEnv('COINBASE_CDP_API_KEY_ID', 'org/apiKeys/k')
    vi.stubEnv('COINBASE_CDP_API_KEY_SECRET', 'secret')
    vi.stubEnv('COINBASE_CDP_SANDBOX', '')
    expect(coinbaseConfigFromEnv()).toEqual({
      apiKeyId: 'org/apiKeys/k',
      apiKeySecret: 'secret',
      sandbox: true,
    })
  })

  it('honors COINBASE_CDP_SANDBOX=false', () => {
    vi.stubEnv('COINBASE_CDP_API_KEY_ID', 'org/apiKeys/k')
    vi.stubEnv('COINBASE_CDP_API_KEY_SECRET', 'secret')
    vi.stubEnv('COINBASE_CDP_SANDBOX', 'false')
    expect(coinbaseConfigFromEnv()?.sandbox).toBe(false)
  })
})

describe('generateJwt', () => {
  it('mints an ES256 JWT for a PKCS#8 EC secret with the CDP uri claim', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
    const jwt = await generateJwt({
      apiKeyId: 'org/apiKeys/k',
      apiKeySecret: pem,
      requestMethod: 'POST',
      requestHost: 'api.cdp.coinbase.com',
      requestPath: '/platform/v2/onramp/orders',
    })
    const [header, payload] = jwt.split('.').slice(0, 2).map((p: string) =>
      JSON.parse(Buffer.from(p, 'base64url').toString()),
    )
    expect(header.alg).toBe('ES256')
    expect(header.kid).toBe('org/apiKeys/k')
    expect(header.nonce).toMatch(/^[0-9a-f]{32}$/)
    expect(payload.uri).toBe('POST api.cdp.coinbase.com/platform/v2/onramp/orders')
    expect(payload.sub).toBe('org/apiKeys/k')
    expect(payload.aud).toEqual(['cdp_service'])
  })

  it('mints an EdDSA JWT for a CDP-format Ed25519 secret (base64 of seed‖pub)', async () => {
    const { privateKey } = generateKeyPairSync('ed25519')
    const jwk = privateKey.export({ format: 'jwk' }) as { d: string; x: string }
    // CDP Ed25519 secret = base64 of the 64-byte (32 seed + 32 public) key material.
    const secret = Buffer.concat([
      Buffer.from(jwk.d, 'base64url'),
      Buffer.from(jwk.x, 'base64url'),
    ]).toString('base64')
    const jwt = await generateJwt({
      apiKeyId: 'org/apiKeys/k',
      apiKeySecret: secret,
      requestMethod: 'GET',
      requestHost: 'api.developer.coinbase.com',
      requestPath: '/onramp/v1/buy/config',
    })
    const [header, payload] = jwt.split('.').slice(0, 2).map((p: string) =>
      JSON.parse(Buffer.from(p, 'base64url').toString()),
    )
    expect(header.alg).toBe('EdDSA')
    expect(header.kid).toBe('org/apiKeys/k')
    expect(payload.uri).toBe('GET api.developer.coinbase.com/onramp/v1/buy/config')
  })
})

const cfg = { apiKeyId: 'org/apiKeys/k', apiKeySecret: 'c2VjcmV0', sandbox: true }
const jwt = async () => 'jwt' // injected signer — avoids ESM spy brittleness

function mockFetchOnce(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('CDP API client', () => {
  afterEach(() => vi.restoreAllMocks())

  it('getBuyConfig GETs buy/config on the onramp host', async () => {
    const fetchMock = mockFetchOnce(200, { countries: [{ id: 'US', paymentMethods: [], subdivisions: ['NY', 'CA'] }] })
    const res = await getBuyConfig(cfg, { signJwt: jwt })
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.host).toBe('api.developer.coinbase.com')
    expect(url.pathname).toBe('/onramp/v1/buy/config')
    expect(res.countries[0].subdivisions).toEqual(['NY', 'CA'])
  })

  it('getBuyOptions GETs buy/options with country + subdivision', async () => {
    const fetchMock = mockFetchOnce(200, { paymentCurrencies: [], purchaseCurrencies: [] })
    const res = await getBuyOptions(cfg, { country: 'US', subdivision: 'NY', signJwt: jwt })
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.host).toBe('api.developer.coinbase.com')
    expect(url.pathname).toBe('/onramp/v1/buy/options')
    expect(url.searchParams.get('country')).toBe('US')
    expect(url.searchParams.get('subdivision')).toBe('NY')
    expect(res.purchaseCurrencies).toEqual([])
  })

  it('initiateVerification POSTs channel + destination', async () => {
    const fetchMock = mockFetchOnce(200, { verificationId: 'onramp_verification_x', otpExpiresAt: 't' })
    const res = await initiateVerification(cfg, { channel: 'email', destination: 'a@b.co', signJwt: jwt })
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ channel: 'email', destination: 'a@b.co' })
    expect(res.verificationId).toBe('onramp_verification_x')
  })

  it('submitVerification POSTs the otp to the {id}/submit path', async () => {
    const fetchMock = mockFetchOnce(200, { verificationId: 'v', verificationExpiresAt: 't' })
    await submitVerification(cfg, { verificationId: 'v1', otpCode: '123456', signJwt: jwt })
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/platform/v2/onramp/verifications/v1/submit')
  })

  it('throws CoinbaseOnrampError on a non-2xx status without leaking the body', async () => {
    mockFetchOnce(502, { error: 'x' })
    await expect(createOrder(cfg, {
      paymentAmount: '20', paymentCurrency: 'USD', purchaseCurrency: 'USDC',
      paymentMethod: 'GUEST_CHECKOUT_APPLE_PAY', destinationAddress: '0x' + 'a'.repeat(40),
      destinationNetwork: 'base', email: 'a@b.co', phoneNumber: '+12025550100',
      phoneNumberVerifiedAt: 't', agreementAcceptedAt: 't', partnerUserRef: 'sandbox-x',
      domain: 'https://f.example', signJwt: jwt,
    })).rejects.toThrow(CoinbaseOnrampError)
  })
})
