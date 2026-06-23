# @antseed/funding-portal

Hosted funding gateway for AntSeed, built with **TanStack Start**. A user links
their AntSeed account via the Connect protocol, then buys USDC by card through
**MoonPay**, which delivers the USDC straight to their AntSeed account address on
Base. No wallet to manage, no seed phrase, no Coinbase account.

## Flow

1. **Connect** — the page builds an `antseed://connect?...&scopes=address` deep
   link. The user's AntSeed client (desktop/CLI) shows a consent prompt, signs
   the response with the local identity, and redirects back with the result in
   the URL fragment. The page verifies the signature with `@antseed/connect-core`
   and recovers the account address to fund.
2. **Buy (MoonPay)** — the `MoonPayBuyWidget` opens with the AntSeed address
   pinned as the destination. MoonPay handles everything — card / Apple Pay /
   Google Pay, KYC/AML, and payment — as the regulated merchant of record, then
   delivers USDC to the address. The page polls the address's on-chain USDC
   balance so delivery shows up without a reload.

That's it. The portal never holds funds and runs no wallet: MoonPay delivers
USDC directly to the user's AntSeed address.

## Architecture

- **SPA mode** (`tanstackStart({ spa: { enabled: true } })`) — routes render on
  the client; only a static shell is prerendered. Server functions still run on
  the server.
- `src/components/FundingApp.tsx` — the client-only app: Connect → buy. Wraps the
  tree in `MoonPayProvider`.
- `src/components/AddFunds.tsx` — the buy step: amount + `MoonPayBuyWidget`.
- `src/lib/moonpay-fn.ts` — `signMoonpayUrlFn` **server function**. Server-only;
  holds the MoonPay secret. The SDK calls it via `onUrlSignatureRequested`.
- `src/lib/moonpay-server.ts` — the URL signer (HMAC-SHA256 of the widget URL's
  query string with the secret key).
- `src/lib/connect.ts` — client Connect helpers (build link, verify response).
- `src/lib/chain.ts` — vendored chain constants + the USDC balance read.

## Why a backend at all

Only one reason: MoonPay requires the widget URL to be **signed with the secret
key** when a `walletAddress` is pinned, and the secret must stay server-side.
That single server function is the entire backend. Everything else (Connect,
balance polling, the widget) is client-side.

## Prerequisites (MoonPay side)

- **Sandbox is self-serve.** Sign up at <https://dashboard.moonpay.com>, grab the
  test keys (`pk_test_` / `sk_test_`) from the Developers page, and you can build
  and test the full flow immediately — no approval. Sandbox runs no real KYC
  (only phone verification) and delivers test USDC on a test network.
- **Going live needs approval.** Submit project details and pass MoonPay's
  Account Review + Business Verification (KYB) to get production keys
  (`pk_live_` / `sk_live_`).

## Configuration

See `.env.example`:
- `VITE_MOONPAY_PUBLISHABLE_KEY` — public, initializes the widget (`pk_test_` →
  sandbox, `pk_live_` → production).
- `MOONPAY_SECRET_KEY` — server-only, signs widget URLs.
- `VITE_ANTSEED_CHAIN` — `base-sepolia` (default) or `base-mainnet`.

## Local testing

```bash
pnpm --filter @antseed/funding-portal dev      # vite dev on :3120
pnpm --filter @antseed/funding-portal build    # vite build (client + server fn + shell)
pnpm --filter @antseed/funding-portal start    # vite preview on :3120
pnpm --filter @antseed/funding-portal test     # vitest
```

With a `pk_test_` key the widget runs in sandbox: use made-up data, keep the
amount under $200, and "Pay" delivers test USDC. The currency code is set per
chain in `chain.ts` (`usdc_base`).

## Known remaining work

- **Currency code:** `usdc_base` is accepted by the sandbox widget (validated with
  a signed URL — keys + HMAC signature + currency all pass). Still worth a final
  check against MoonPay's `/v3/currencies` list before going live.
- **Region:** MoonPay geolocates by IP. Datacenter/VPS IPs (e.g. CI, the dev VM)
  hit a "Coming soon to your region!" screen even though the keys/signature are
  valid — test the buy UI from a residential connection in a supported country.
- **Crediting AntseedDeposits:** this build delivers USDC to the AntSeed *address*
  only. Crediting the on-chain `AntseedDeposits` contract (the spend balance) is
  intentionally out of scope here and handled separately.
