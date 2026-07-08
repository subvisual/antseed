import { describe, expect, it } from 'vitest'
import { orderInput } from './coinbase-fn'

const base = {
  amountUsd: '20', email: 'a@b.co', phoneNumber: '+12025550100',
  paymentMethod: 'GUEST_CHECKOUT_APPLE_PAY', agreementAcceptedAt: '2026-07-08T00:00:00.000Z',
  emailVerificationId: 'e', smsVerificationId: 's',
}

describe('orderInput validator', () => {
  it('rejects a malformed destination address', () => {
    expect(() => orderInput.parse({ ...base, address: '0xnothex' })).toThrow()
  })

  it('rejects an unknown payment method', () => {
    expect(() => orderInput.parse({
      ...base, paymentMethod: 'CARD', address: '0x' + 'a'.repeat(40),
    })).toThrow()
  })

  it('accepts and checksums a valid address', () => {
    const parsed = orderInput.parse({ ...base, address: '0x' + 'ab'.repeat(20) })
    expect(parsed.address.startsWith('0x')).toBe(true)
    expect(parsed.address.length).toBe(42)
  })
})
