import {
  CONNECT_VERSION,
  verifyConnectResponse,
  type ConnectRequest,
} from '@antseed/connect-core'

// The web-app side of AntSeed Connect: build the request link, then verify the
// signed response the client redirects back with. Trust is anchored entirely in
// our own origin (baked into `redirect`), so a response can only have been
// minted for us. All functions here touch browser APIs and must run client-side.

const PENDING_KEY = 'antseed.connect.pending'
const SCOPES = ['address'] as const

interface PendingRequest {
  redirect: string
  origin: string
  scopes: string[]
  challenge: string
}

function randomChallenge(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Stable redirect URL for this deployment: origin + path, no query or hash. */
export function redirectUrl(): string {
  return window.location.origin + window.location.pathname
}

/**
 * Build the `antseed://connect` deep link and persist the pending request so we
 * can verify the response when the client redirects back. Stored in
 * localStorage (not sessionStorage) so the response can be consumed even if the
 * client opens the redirect in a new tab of the same browser.
 */
export function buildConnectLink(): string {
  const redirect = redirectUrl()
  const challenge = randomChallenge()

  const pending: PendingRequest = {
    redirect,
    origin: new URL(redirect).origin,
    scopes: [...SCOPES],
    challenge,
  }
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending))

  const params = new URLSearchParams({
    version: String(CONNECT_VERSION),
    redirect,
    scopes: SCOPES.join(','),
    challenge,
  })
  return `antseed://connect?${params.toString()}`
}

function decodeFragment(encoded: string): unknown {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

function loadPending(): PendingRequest | null {
  const raw = localStorage.getItem(PENDING_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PendingRequest
  } catch {
    return null
  }
}

/**
 * If the page was loaded as a Connect redirect (`#result=...`), decode and
 * verify the response against the pending request. Returns the recovered
 * account address (lowercase) or null when there is nothing to consume.
 *
 * @throws {Error} when a result is present but fails verification.
 */
export function consumeConnectResult(): string | null {
  const hash = window.location.hash
  const match = /[#&]result=([^&]+)/.exec(hash)
  if (!match || !match[1]) return null

  const pending = loadPending()
  // Always clear the fragment so a reload doesn't re-process a stale result.
  history.replaceState(null, '', window.location.pathname + window.location.search)
  localStorage.removeItem(PENDING_KEY)

  if (!pending) {
    throw new Error('Received a response but no pending request was found.')
  }

  const req: ConnectRequest = {
    version: CONNECT_VERSION,
    redirect: pending.redirect,
    origin: pending.origin,
    scopes: pending.scopes as ConnectRequest['scopes'],
    challenge: pending.challenge,
  }

  const response = decodeFragment(match[1])
  return verifyConnectResponse(response, req)
}
