import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { signMoonpayUrl, MoonpayError } from './moonpay-server'

const config = { secretKey: 'sk_test_abc123' }

describe('signMoonpayUrl', () => {
  it('is the base64 HMAC-SHA256 of the query string', () => {
    const url =
      'https://buy-sandbox.moonpay.com?apiKey=pk_test_1&walletAddress=0xabc&currencyCode=usdc_base'
    const expected = createHmac('sha256', config.secretKey)
      .update(new URL(url).search)
      .digest('base64')
    expect(signMoonpayUrl(config, url)).toBe(expected)
  })

  it('is deterministic for the same URL', () => {
    const url = 'https://buy.moonpay.com?apiKey=pk_live_1&walletAddress=0xabc'
    expect(signMoonpayUrl(config, url)).toBe(signMoonpayUrl(config, url))
  })

  it('changes when the destination wallet changes', () => {
    const a = signMoonpayUrl(config, 'https://buy.moonpay.com?walletAddress=0xaaa')
    const b = signMoonpayUrl(config, 'https://buy.moonpay.com?walletAddress=0xbbb')
    expect(a).not.toBe(b)
  })

  it('changes with a different secret', () => {
    const url = 'https://buy.moonpay.com?walletAddress=0xaaa'
    expect(signMoonpayUrl({ secretKey: 'sk_test_one' }, url)).not.toBe(
      signMoonpayUrl({ secretKey: 'sk_test_two' }, url),
    )
  })

  it('throws when the URL has no query string', () => {
    expect(() => signMoonpayUrl(config, 'https://buy.moonpay.com')).toThrow(MoonpayError)
  })
})
