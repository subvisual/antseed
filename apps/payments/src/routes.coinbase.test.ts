import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes, sanitizeOnramp } from './routes.js';

// The mint route delegates to the pure, transport-agnostic mintOnrampSession()
// so it can lift into a hosted Worker/Lambda unchanged. Replace only that export
// with a spy — keep OnrampMintError / generateJwt real via importOriginal — so
// the Fastify wrapper's happy/error mapping is exercised without hitting CDP.
vi.mock('./coinbase-onramp.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./coinbase-onramp.js')>();
  return { ...actual, mintOnrampSession: vi.fn() };
});
import { mintOnrampSession, OnrampMintError } from './coinbase-onramp.js';

const mintMock = vi.mocked(mintOnrampSession);

function ctx(overrides: Partial<Parameters<typeof registerRoutes>[1]> = {}): Parameters<typeof registerRoutes>[1] {
  return {
    cryptoCtx: { evmAddress: '0x' + 'a'.repeat(40) } as any,
    cryptoConfig: {
      rpcUrl: 'http://localhost:8545',
      depositsContractAddress: '0x' + '0'.repeat(40),
      channelsContractAddress: '0x' + '1'.repeat(40),
      usdcContractAddress: '0x' + '2'.repeat(40),
    } as any,
    chainConfig: { chainId: 'base-local', evmChainId: 31337 } as any,
    proxyPort: 3000,
    coinbase: { apiKeyId: 'organizations/o/apiKeys/k', apiKeySecret: 'secret-b64', sandbox: true },
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('sanitizeOnramp — coinbase projection', () => {
  const moonpay = { publishableKey: 'pk_test_x', baseUrl: 'https://buy-sandbox.moonpay.com', currencyCode: 'usdc' };

  it('emits coinbase {enabled,sandbox} only when creds present', () => {
    const result = sanitizeOnramp({ coinbase: { sandbox: true } }, { coinbaseEnabled: true });
    expect(result).toEqual({ coinbase: { enabled: true, sandbox: true } });
  });

  it('defaults sandbox to false when config omits it', () => {
    const result = sanitizeOnramp({ coinbase: {} }, { coinbaseEnabled: true });
    expect(result).toEqual({ coinbase: { enabled: true, sandbox: false } });
  });

  it('enables coinbase even when config has no coinbase block (creds are the signal)', () => {
    const result = sanitizeOnramp({}, { coinbaseEnabled: true });
    expect(result).toEqual({ coinbase: { enabled: true, sandbox: false } });
  });

  it('omits coinbase when creds are absent, even if config asks for it', () => {
    expect(sanitizeOnramp({ coinbase: { sandbox: true } }, { coinbaseEnabled: false })).toBeNull();
    expect(sanitizeOnramp({ coinbase: { sandbox: true } })).toBeNull();
  });

  it('never leaks secret-shaped fields from the coinbase config block', () => {
    const result = sanitizeOnramp(
      { coinbase: { sandbox: true, apiKeyId: 'organizations/o/apiKeys/k', apiKeySecret: 'sk_leak' } },
      { coinbaseEnabled: true },
    );
    const flat = JSON.stringify(result);
    expect(flat).not.toContain('apiKeySecret');
    expect(flat).not.toContain('sk_leak');
    expect(flat).not.toContain('apiKeyId');
  });

  it('surfaces moonpay and coinbase side by side', () => {
    const result = sanitizeOnramp({ moonpay, coinbase: { sandbox: false } }, { coinbaseEnabled: true });
    expect(result).toEqual({ moonpay, coinbase: { enabled: true, sandbox: false } });
  });

  it('returns coinbase-only when moonpay is absent', () => {
    const result = sanitizeOnramp({ coinbase: { sandbox: true } }, { coinbaseEnabled: true });
    expect(result).toEqual({ coinbase: { enabled: true, sandbox: true } });
  });
});

describe('POST /api/onramp/coinbase/session', () => {
  it('mints a session token on the happy path', async () => {
    mintMock.mockResolvedValue({ sessionToken: 'ephemeral_abc' });
    const app = Fastify();
    registerRoutes(app, ctx());
    const res = await app.inject({ method: 'POST', url: '/api/onramp/coinbase/session', payload: { amount: 50 } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sessionToken: 'ephemeral_abc' });
    // address must come from the server identity wallet, never the client
    expect(mintMock).toHaveBeenCalledWith(
      expect.objectContaining({ address: '0x' + 'a'.repeat(40), apiKeyId: 'organizations/o/apiKeys/k', apiKeySecret: 'secret-b64' }),
    );
    await app.close();
  });

  it('returns 400 when coinbase creds are not configured', async () => {
    const app = Fastify();
    registerRoutes(app, ctx({ coinbase: null }));
    const res = await app.inject({ method: 'POST', url: '/api/onramp/coinbase/session', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(mintMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 400 when the identity wallet address is unavailable', async () => {
    const app = Fastify();
    registerRoutes(app, ctx({ cryptoCtx: null }));
    const res = await app.inject({ method: 'POST', url: '/api/onramp/coinbase/session', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(mintMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 502 with no secret leak when CDP minting fails', async () => {
    mintMock.mockRejectedValue(new OnrampMintError('CDP 401 organizations/o/apiKeys/k secret-b64'));
    const app = Fastify();
    registerRoutes(app, ctx());
    const res = await app.inject({ method: 'POST', url: '/api/onramp/coinbase/session', payload: {} });
    expect(res.statusCode).toBe(502);
    const flat = JSON.stringify(res.json());
    expect(flat).not.toContain('secret-b64');
    expect(flat).not.toContain('apiKeys/k');
    await app.close();
  });
});

describe('mintOnrampSession (pure)', () => {
  // signJwt is injected so the pure fn is testable without a real EC key.
  const signJwt = vi.fn(async () => 'signed.jwt.token');

  it('signs a JWT, POSTs the CDP token endpoint, returns the session token', async () => {
    const { mintOnrampSession: realMint } = await vi.importActual<
      typeof import('./coinbase-onramp.js')
    >('./coinbase-onramp.js');

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ token: 'ephemeral_xyz', channelId: 'ch_1' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await realMint({
      apiKeyId: 'organizations/o/apiKeys/k',
      apiKeySecret: 'secret-b64',
      address: '0x' + 'a'.repeat(40),
      signJwt,
    });
    expect(out).toEqual({ sessionToken: 'ephemeral_xyz' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.developer.coinbase.com/onramp/v1/token');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer signed.jwt.token');
    expect(JSON.parse(init.body as string)).toEqual({
      addresses: [{ address: '0x' + 'a'.repeat(40), blockchains: ['base'] }],
      assets: ['USDC'],
    });
  });

  it('throws OnrampMintError when CDP returns a non-2xx', async () => {
    const { mintOnrampSession: realMint } = await vi.importActual<
      typeof import('./coinbase-onramp.js')
    >('./coinbase-onramp.js');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })));

    await expect(
      realMint({ apiKeyId: 'id', apiKeySecret: 'secret-b64', address: '0x' + 'a'.repeat(40), signJwt }),
    ).rejects.toBeInstanceOf(OnrampMintError);
  });
});
