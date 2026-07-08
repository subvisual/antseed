import { useCallback, useEffect, useRef, useState } from 'react'

import {
  coinbaseBuyConfigFn,
  coinbaseBuyOptionsFn,
  coinbaseInitVerificationFn,
  coinbaseSubmitVerificationFn,
  coinbaseCreateOrderFn,
} from '../lib/coinbase-fn'

// Coinbase CDP Headless Onramp: collect + verify email and phone (managed OTP),
// create an order, then render the Apple/Google-Pay link in an iframe. US-only.

const MIN_USD = 5 // UI floor; buy-options limits[].min is authoritative per region.

function detectPaymentMethod(): 'GUEST_CHECKOUT_APPLE_PAY' | 'GUEST_CHECKOUT_GOOGLE_PAY' {
  const hasApplePay = typeof window !== 'undefined' && 'ApplePaySession' in window
  return hasApplePay ? 'GUEST_CHECKOUT_APPLE_PAY' : 'GUEST_CHECKOUT_GOOGLE_PAY'
}

type Stage = 'amount' | 'email' | 'phone' | 'pay'

interface CoinbaseFundsProps {
  address: string
  onCompleted?: () => void
}

export function CoinbaseFunds({ address, onCompleted }: CoinbaseFundsProps) {
  const [stage, setStage] = useState<Stage>('amount')
  const [amount, setAmount] = useState(String(MIN_USD))
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [subdivision, setSubdivision] = useState('')
  const [subdivisions, setSubdivisions] = useState<string[]>([])
  // Surface a buy-config failure instead of an infinite "Loading…" on the dropdown.
  const [configError, setConfigError] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [emailVid, setEmailVid] = useState('')
  const [smsVid, setSmsVid] = useState('')
  const [otp, setOtp] = useState('')
  const [payUrl, setPayUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Per-state buy-options: USD min/max + whether USDC-on-Base is sold there.
  const [offer, setOffer] = useState<{ min: number; max: number; usdcAvailable: boolean } | null>(null)

  const amountNum = Number(amount)
  const min = offer?.min ?? MIN_USD
  const max = offer?.max ?? Number.POSITIVE_INFINITY
  const usdcAvailable = offer?.usdcAvailable ?? true // assume yes until buy-options answers
  const amountOk = Number.isFinite(amountNum) && amountNum >= min && amountNum <= max

  const run = useCallback(async <T,>(p: Promise<T>): Promise<T | null> => {
    setBusy(true)
    setError(null)
    try {
      return await p
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      return null
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void coinbaseBuyConfigFn()
      .then((res) => {
        if (res.ok) setSubdivisions(res.subdivisions)
        else setConfigError(res.message)
      })
      .catch(() => setConfigError('Could not reach Coinbase.'))
  }, [])

  // Fetch buy-options per state so an unsupported state blocks early, not at order.
  useEffect(() => {
    if (!subdivision) { setOffer(null); return }
    let cancelled = false
    void coinbaseBuyOptionsFn({ data: { country: 'US', subdivision } })
      .then((res) => {
        if (cancelled) return
        if (!res.ok) { setOffer(null); setError(res.message); return }
        const usd = res.options.paymentCurrencies.find((c) => c.id === 'USD')
        // limits[].id is payment-method-keyed or "UNSPECIFIED"; prefer our method, else first.
        const limit = usd?.limits.find((l) => l.id === detectPaymentMethod()) ?? usd?.limits[0]
        const usdc = res.options.purchaseCurrencies.find(
          (c) => c.symbol === 'USDC' && c.networks.some((n) => n.name.startsWith('base')),
        )
        setOffer({
          min: limit ? Number(limit.min) : MIN_USD,
          max: limit ? Number(limit.max) : Number.POSITIVE_INFINITY,
          usdcAvailable: Boolean(usdc),
        })
      })
      .catch(() => { if (!cancelled) setOffer(null) })
    return () => { cancelled = true }
  }, [subdivision])

  async function startEmail() {
    const res = await run(coinbaseInitVerificationFn({ data: { channel: 'email', destination: email } }))
    if (res?.ok) { setEmailVid(res.verificationId); setOtp(''); setStage('email') }
    else if (res) setError(res.message)
  }

  // Verify email OTP, then send the phone OTP.
  async function confirmEmail() {
    const sub = await run(coinbaseSubmitVerificationFn({ data: { verificationId: emailVid, otpCode: otp } }))
    if (!sub) return
    if (!sub.ok) { setError(sub.message); return }
    const init = await run(coinbaseInitVerificationFn({ data: { channel: 'sms', destination: phone } }))
    if (init?.ok) { setSmsVid(init.verificationId); setOtp(''); setStage('phone') }
    else if (init) setError(init.message)
  }

  // Verify phone OTP, then create the order and reveal the payment iframe.
  async function confirmPhone() {
    const sub = await run(coinbaseSubmitVerificationFn({ data: { verificationId: smsVid, otpCode: otp } }))
    if (!sub) return
    if (!sub.ok) { setError(sub.message); return }
    const order = await run(coinbaseCreateOrderFn({ data: {
      amountUsd: amountNum.toFixed(2), email, phoneNumber: phone,
      paymentMethod: detectPaymentMethod(),
      agreementAcceptedAt: new Date().toISOString(),
      emailVerificationId: emailVid, smsVerificationId: smsVid, address,
    } }))
    if (order?.ok) { setPayUrl(order.paymentLink.url); setStage('pay') }
    else if (order) setError(order.message)
  }

  return (
    <div className="buy">
      {stage === 'amount' && (
        <>
          <label className="field">
            <span>Amount (USD)</span>
            <input inputMode="decimal" min={min}
              {...(Number.isFinite(max) ? { max } : {})} value={amount}
              onChange={(e) => setAmount(e.target.value)} aria-label="Amount in US dollars" />
            {offer && (
              <span className="muted small">
                Min ${offer.min}{Number.isFinite(offer.max) ? ` · Max $${offer.max}` : ''}
              </span>
            )}
          </label>
          <label className="field">
            <span>State</span>
            <select value={subdivision} onChange={(e) => setSubdivision(e.target.value)}
              disabled={subdivisions.length === 0} aria-label="US state">
              <option value="" disabled>
                {subdivisions.length ? 'Select your state' : configError ? 'Unavailable' : 'Loading…'}
              </option>
              {subdivisions.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
          {configError && <p className="error">{configError}</p>}
          {subdivision && !usdcAvailable && (
            <p className="error">
              Coinbase doesn't offer USDC on Base in {subdivision}. Use MoonPay instead.
            </p>
          )}
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>US mobile (e.g. +12025550100)</span>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="terms">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>I agree to Coinbase's terms of service.</span>
          </label>
          <button className="primary"
            disabled={!amountOk || !usdcAvailable || !email || !phone || !subdivision || !agreed || busy}
            onClick={() => void startEmail()}>
            {busy ? 'Sending code…' : 'Continue'}
          </button>
          <p className="muted small">US only. Pay with Apple Pay or Google Pay through Coinbase.</p>
        </>
      )}

      {(stage === 'email' || stage === 'phone') && (
        <>
          <p className="muted small">
            Enter the 6-digit code sent to your {stage === 'email' ? 'email' : 'phone'}.
          </p>
          <div className="otp-row">
            <input inputMode="numeric" maxLength={6} value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} aria-label="Verification code" />
            <button className="primary" disabled={otp.length !== 6 || busy}
              onClick={() => void (stage === 'email' ? confirmEmail() : confirmPhone())}>
              {busy ? 'Verifying…' : 'Verify'}
            </button>
          </div>
        </>
      )}

      {stage === 'pay' && payUrl && (
        <CoinbasePayFrame url={payUrl} onCompleted={onCompleted} onError={setError} />
      )}

      {error && <p className="error">{error}</p>}
    </div>
  )
}

// Renders the payment link in an iframe and tracks the CDP onramp postMessage
// events (onramp_api.*). Docs: https://docs.cdp.coinbase.com/onramp/headless-onramp/overview
function CoinbasePayFrame({
  url, onCompleted, onError,
}: {
  url: string
  onCompleted?: () => void
  onError: (m: string) => void
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      // Only trust messages from our own iframe, and only from the Coinbase origin.
      if (frameRef.current && ev.source !== frameRef.current.contentWindow) return
      let host: string
      try { host = new URL(ev.origin).hostname } catch { return }
      if (!/(^|\.)coinbase\.com$/.test(host)) return
      const data = ev.data as { eventName?: string; data?: { errorMessage?: string } }
      switch (data.eventName) {
        case 'onramp_api.commit_success':
        case 'onramp_api.polling_success':
          onCompleted?.()
          break
        case 'onramp_api.load_error':
        case 'onramp_api.commit_error':
        case 'onramp_api.polling_error':
          onError(data.data?.errorMessage ?? 'Coinbase payment failed.')
          break
        case 'onramp_api.cancel':
          onError('Payment cancelled.')
          break
        default:
          // load_pending / load_success / polling_start — transient, no action.
          break
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onCompleted, onError])

  return (
    <iframe
      ref={frameRef}
      className="onramp-frame"
      src={url}
      title="Coinbase payment"
      allow="payment"
    />
  )
}
