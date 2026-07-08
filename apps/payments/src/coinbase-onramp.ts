import { createPrivateKey, randomBytes, type KeyObject } from 'node:crypto';
import { SignJWT, importJWK, importPKCS8 } from 'jose';

type SigningKey = CryptoKey | KeyObject | Uint8Array;

// Coinbase CDP onramp session-token endpoint. The CDP Secret API key is
// account-level (authenticates ALL CDP APIs) — it must never reach the browser.
// This module runs server-side only: it signs a short-lived JWT with that secret
// and exchanges it for a single-use, 2-minute onramp session token the client
// can safely open in the Coinbase widget.
const CDP_TOKEN_URL = 'https://api.developer.coinbase.com/onramp/v1/token';
const CDP_TOKEN_HOST = 'api.developer.coinbase.com';
const CDP_TOKEN_PATH = '/onramp/v1/token';

export class OnrampMintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OnrampMintError';
  }
}

export interface GenerateJwtParams {
  apiKeyId: string;
  apiKeySecret: string;
  requestMethod: string;
  requestHost: string;
  requestPath: string;
}

export type SignJwtFn = (params: GenerateJwtParams) => Promise<string>;

// Build the private key + JWS alg from a CDP secret. New CDP keys are Ed25519
// (base64 of 64 bytes = 32 seed + 32 public); legacy keys are EC P-256 supplied
// as a PKCS#8 PEM. Decode accordingly per the CDP auth spec.
async function loadSigningKey(apiKeySecret: string): Promise<{ key: SigningKey; alg: string }> {
  if (apiKeySecret.includes('BEGIN')) {
    // Legacy EC P-256 key in PEM form.
    return { key: await importPKCS8(apiKeySecret, 'ES256'), alg: 'ES256' };
  }
  const raw = Buffer.from(apiKeySecret, 'base64');
  if (raw.length === 64) {
    // Ed25519: first 32 bytes are the seed, last 32 the public key.
    const seed = raw.subarray(0, 32);
    const pub = raw.subarray(32);
    const key = await importJWK(
      {
        kty: 'OKP',
        crv: 'Ed25519',
        d: seed.toString('base64url'),
        x: pub.toString('base64url'),
      },
      'EdDSA',
    );
    return { key, alg: 'EdDSA' };
  }
  // Otherwise assume a base64-encoded PKCS#8 DER EC key.
  const key = createPrivateKey({ key: raw, format: 'der', type: 'pkcs8' });
  return { key, alg: 'ES256' };
}

// Sign a per-request CDP bearer JWT. Claims/headers follow the CDP REST auth
// recipe: kid+sub=key id, iss="cdp", aud=["cdp_service"], nbf..exp = 120s window,
// uri = "<METHOD> <HOST><PATH>", random nonce in the header.
export const generateJwt: SignJwtFn = async ({ apiKeyId, apiKeySecret, requestMethod, requestHost, requestPath }) => {
  const { key, alg } = await loadSigningKey(apiKeySecret);
  const now = Math.floor(Date.now() / 1000);
  const uri = `${requestMethod} ${requestHost}${requestPath}`;
  return new SignJWT({ iss: 'cdp', sub: apiKeyId, aud: ['cdp_service'], uri })
    .setProtectedHeader({ alg, kid: apiKeyId, typ: 'JWT', nonce: randomBytes(16).toString('hex') })
    .setNotBefore(now)
    .setExpirationTime(now + 120)
    .sign(key);
};

export interface MintOnrampSessionParams {
  apiKeyId: string;
  apiKeySecret: string;
  /** Destination wallet — always the server identity wallet, never client-supplied. */
  address: string;
  /** Optional fiat amount; carried to the widget URL client-side, not part of the mint. */
  amount?: number;
  /** Injectable signer (defaults to generateJwt); overridden in tests. */
  signJwt?: SignJwtFn;
}

// Mint a single-use Coinbase onramp session token for `address`. Pure and
// transport-agnostic so it can lift into a hosted mint endpoint unchanged.
export async function mintOnrampSession(
  params: MintOnrampSessionParams,
): Promise<{ sessionToken: string }> {
  const sign = params.signJwt ?? generateJwt;
  const jwt = await sign({
    apiKeyId: params.apiKeyId,
    apiKeySecret: params.apiKeySecret,
    requestMethod: 'POST',
    requestHost: CDP_TOKEN_HOST,
    requestPath: CDP_TOKEN_PATH,
  });

  let res: Response;
  try {
    res = await fetch(CDP_TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        addresses: [{ address: params.address, blockchains: ['base'] }],
        assets: ['USDC'],
      }),
    });
  } catch (err) {
    // Never surface the raw error (could echo request internals); keep it generic.
    throw new OnrampMintError(`CDP token request failed: ${err instanceof Error ? err.name : 'network error'}`);
  }

  if (!res.ok) {
    throw new OnrampMintError(`CDP token endpoint returned ${res.status}`);
  }

  const body = (await res.json().catch(() => null)) as { token?: string } | null;
  if (!body?.token) {
    throw new OnrampMintError('CDP token response missing token');
  }
  return { sessionToken: body.token };
}
