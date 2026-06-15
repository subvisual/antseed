import { useCallback, useEffect, useState } from 'react'
import { formatUnits } from 'ethers'
import { MoonPayProvider } from '@moonpay/moonpay-react'

import { buildConnectLink, consumeConnectResult } from '../lib/connect'
import { AddFunds } from './AddFunds'
import { activeChain, makeProvider, readUsdcBalance, readDelegated, USDC_DECIMALS } from '../lib/chain'

// The client-only app: Connect an AntSeed account, then buy USDC straight to its
// address through MoonPay. Loaded as a lazy client chunk (see routes/index.tsx)
// so the MoonPay SDK never enters the SSR / shell-prerender module graph.

const POLL_MS = 8000

// MoonPay publishable key (public — pk_test_/pk_live_). The pk_test_ prefix puts
// the widget in sandbox; a placeholder lets the app boot without real creds.
const MOONPAY_PK =
  (import.meta.env['VITE_MOONPAY_PUBLISHABLE_KEY'] as string | undefined) ?? 'pk_test_placeholder'
const MOONPAY_SANDBOX = MOONPAY_PK.startsWith('pk_test')

function fmtUsdc(v: bigint): string {
  return Number(formatUnits(v, USDC_DECIMALS)).toFixed(2)
}

export default function FundingApp() {
  return (
    <MoonPayProvider apiKey={MOONPAY_PK} debug={MOONPAY_SANDBOX}>
      <Funding />
    </MoonPayProvider>
  )
}

const STEP_LABELS = ['Connect', 'Fund'] as const

// The two-step journey hint. `current` marks the active step; earlier steps
// render as done.
function Steps({ current }: { current: number }) {
  return (
    <nav className="steps" aria-label="Progress">
      {STEP_LABELS.map((label, i) => (
        <span key={label} style={{ display: 'contents' }}>
          {i > 0 && <span className="step-sep">·</span>}
          <span className={`step ${i === current ? 'active' : i < current ? 'done' : ''}`.trim()}>
            {i + 1} {label}
          </span>
        </span>
      ))}
    </nav>
  )
}

// Step 1 — the front door. Connect an AntSeed account to get the address to fund.
function ConnectScreen({
  onConnect,
  error,
}: {
  onConnect: () => void
  error: string | null
}) {
  return (
    <main className="login">
      <img className="login-logo" src="/logo.svg" alt="AntSeed" width={48} height={48} />
      <h1 className="login-title">AntSeed Funding</h1>
      <p className="login-sub">Connect your AntSeed account, then add USDC by card.</p>
      <button className="primary" onClick={onConnect}>
        Connect AntSeed account
      </button>
      {error && <p className="error">{error}</p>}
      <Steps current={0} />
    </main>
  )
}

function Funding() {
  const chain = activeChain()

  // The AntSeed account address to fund (recovered + verified from Connect).
  const [buyer, setBuyer] = useState<string | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [usdc, setUsdc] = useState<bigint | null>(null)
  const [delegated, setDelegated] = useState<boolean | null>(null)

  // Consume a Connect redirect on load (client-only — touches window).
  useEffect(() => {
    try {
      const recovered = consumeConnectResult()
      if (recovered) setBuyer(recovered)
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  // Poll the AntSeed address's USDC balance so funds delivered by MoonPay show up
  // without a reload.
  const refresh = useCallback(async () => {
    if (!buyer) return
    const provider = makeProvider()
    const [bal, deleg] = await Promise.all([
      readUsdcBalance(provider, buyer),
      readDelegated(provider, buyer),
    ])
    setUsdc(bal)
    setDelegated(deleg)
  }, [buyer])

  useEffect(() => {
    if (!buyer) return
    void refresh()
    const id = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(id)
  }, [buyer, refresh])

  function startConnect() {
    setConnectError(null)
    window.location.href = buildConnectLink()
  }

  if (!buyer) return <ConnectScreen onConnect={startConnect} error={connectError} />

  return (
    <main className="shell">
      <header className="brand">
        <img src="/logo.svg" alt="" width={24} height={24} />
        <h1>AntSeed Funding</h1>
      </header>

      <section className="card">
        <h2>Add funds</h2>
        <p className="muted">Buying USDC for your AntSeed account on {chain.chainId}:</p>
        <code className="address">{buyer}</code>

        <p className="muted small">
          Delivered balance: {usdc === null ? '…' : `${fmtUsdc(usdc)} USDC`}
        </p>

        <p className="muted small">
          {delegated === null
            ? 'Auto-deposit: …'
            : delegated
              ? '✓ Auto-deposit active — funds move into the network automatically'
              : 'Tip: enable auto-deposit in your AntSeed app to move funds into the network automatically (no ETH needed).'}
        </p>

        <AddFunds address={buyer} onCompleted={() => void refresh()} />

        <button
          className="link"
          onClick={() => {
            setBuyer(null)
            setUsdc(null)
          }}
        >
          Use a different account
        </button>
      </section>

      <Steps current={1} />

      <footer className="muted small">
        USDC is purchased through MoonPay and delivered straight to your AntSeed
        account address on Base.
      </footer>
    </main>
  )
}
