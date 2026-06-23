import { useState } from 'react'
import { MoonPayBuyWidget } from '@moonpay/moonpay-react'

import { activeChain } from '../lib/chain'
import { signMoonpayUrlFn } from '../lib/moonpay-fn'

// The in-app buy flow. MoonPay hosts the entire purchase — card / Apple Pay /
// Google Pay, KYC, payment — and delivers USDC straight to the AntSeed address.
// We only pick the amount and sign the widget URL (server-side, so the pinned
// destination address can't be tampered with). No wallet, no deposit step.
//
// Lower bound is MoonPay's $20 minimum for a card purchase. We don't cap the
// upper end (the on-chain credit limit isn't enforced in deliver-to-address mode);
// MoonPay enforces its own per-transaction maximum and surfaces it in the widget.

// MoonPay's minimum card purchase. Their floor, not an on-chain value — confirm
// per currency via MoonPay's /v3/currencies if you ever need it dynamic.
const MOONPAY_MIN_USD = 20

interface AddFundsProps {
  /** Destination AntSeed address that receives the purchased USDC. */
  address: string
  /** Fired when MoonPay reports the purchase completed. */
  onCompleted?: () => void
}

export function AddFunds({ address, onCompleted }: AddFundsProps) {
  const chain = activeChain()
  const [amount, setAmount] = useState(String(MOONPAY_MIN_USD))
  const [visible, setVisible] = useState(false)

  const amountNum = Number(amount)
  const amountOk = Number.isFinite(amountNum) && amountNum >= MOONPAY_MIN_USD

  // Called by the SDK every time the widget URL changes. Sign it with the secret
  // key on the server and hand the signature back; the SDK appends it.
  async function signUrl(url: string): Promise<string> {
    const res = await signMoonpayUrlFn({ data: { url } })
    if (!res.ok) throw new Error(res.message)
    return res.signature
  }

  return (
    <div className="buy">
      <label className="field">
        <span>Amount (USD)</span>
        <input
          inputMode="decimal"
          min={MOONPAY_MIN_USD}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Amount in US dollars"
        />
      </label>

      <button className="primary" onClick={() => setVisible(true)} disabled={!amountOk}>
        Buy {amountOk ? `$${amountNum.toFixed(2)} ` : ''}USDC with card
      </button>

      {!amountOk && <p className="error">Enter at least ${MOONPAY_MIN_USD}.</p>}

      <MoonPayBuyWidget
        variant="overlay"
        baseCurrencyCode="usd"
        baseCurrencyAmount={amountOk ? amountNum.toFixed(2) : undefined}
        defaultCurrencyCode={chain.moonpayCurrencyCode}
        walletAddress={address}
        visible={visible}
        onUrlSignatureRequested={signUrl}
        onClose={async () => {
          setVisible(false)
        }}
        onTransactionCompleted={async () => {
          onCompleted?.()
        }}
      />

      <p className="muted small">
        ${MOONPAY_MIN_USD} minimum. Pay by card or Apple Pay / Google Pay through
        MoonPay; identity checks and payment are handled by MoonPay, and USDC is
        delivered straight to your AntSeed address.
      </p>
    </div>
  )
}
