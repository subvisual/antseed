import { describe, expect, it } from 'vitest'
import { activeChain } from './chain'

describe('chain — coinbase fields', () => {
  it('exposes a coinbase network + purchase currency', () => {
    const c = activeChain()
    expect(c.coinbaseNetwork).toBe('base')
    expect(c.coinbasePurchaseCurrency).toBe('USDC')
  })
})
