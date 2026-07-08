import { createPrivateKey, randomBytes, type KeyObject } from 'node:crypto';
import { SignJWT, importJWK, importPKCS8 } from 'jose';

type SigningKey = CryptoKey | KeyObject | Uint8Array;

// The CDP secret key is account-level and must never reach the browser: this
// module is server-side only, minting a single-use 2-minute session token.
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

// CDP secrets come as new Ed25519 keys (base64 of 64 bytes) or legacy EC P-256
// keys (PKCS#8 PEM), selected by shape below.
async function loadSigningKey(apiKeySecret: string): Promise<{ key: SigningKey; alg: string }> {
  if (apiKeySecret.includes('BEGIN')) {
    return { key: await importPKCS8(apiKeySecret, 'ES256'), alg: 'ES256' };
  }
  const raw = Buffer.from(apiKeySecret, 'base64');
  if (raw.length === 64) {
    // Ed25519 key material: first 32 bytes are the seed, last 32 the public key.
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
  // Otherwise a base64 PKCS#8 DER EC key.
  const key = createPrivateKey({ key: raw, format: 'der', type: 'pkcs8' });
  return { key, alg: 'ES256' };
}

// Per the CDP REST auth recipe: uri = "<METHOD> <HOST><PATH>", 120s validity.
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

const CDP_TOKEN_TIMEOUT_MS = 10_000;

export interface MintOnrampSessionParams {
  apiKeyId: string;
  apiKeySecret: string;
  /** Destination wallet — always the server identity wallet, never client-supplied. */
  address: string;
  signJwt?: SignJwtFn;
}

// Transport-agnostic so it can lift into a hosted mint endpoint unchanged.
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CDP_TOKEN_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(CDP_TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        addresses: [{ address: params.address, blockchains: ['base'] }],
        assets: ['USDC'],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new OnrampMintError('CDP token request timed out');
    }
    // Generic message — raw error could echo request internals.
    throw new OnrampMintError(`CDP token request failed: ${err instanceof Error ? err.name : 'network error'}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new OnrampMintError(`CDP token endpoint returned ${res.status}`);
  }

  const body = (await res.json().catch(() => null)) as { token?: unknown } | null;
  if (typeof body?.token !== 'string' || !body.token) {
    throw new OnrampMintError('CDP token response missing token');
  }
  return { sessionToken: body.token };
}
