import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes, sanitizeOnramp } from './routes.js';

function mockCtx(overrides: Partial<Parameters<typeof registerRoutes>[1]> = {}): Parameters<typeof registerRoutes>[1] {
  return {
    cryptoCtx: null,
    cryptoConfig: {
      rpcUrl: 'http://localhost:8545',
      depositsContractAddress: '0x' + '0'.repeat(40),
      channelsContractAddress: '0x' + '1'.repeat(40),
      usdcContractAddress: '0x' + '2'.repeat(40),
    } as any,
    chainConfig: {
      chainId: 'base-local',
      evmChainId: 31337,
      emissionsContractAddress: '0x' + '3'.repeat(40),
    } as any,
    proxyPort: 3000,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/config', () => {
  it('includes emissionsContractAddress', async () => {
    const app = Fastify();
    registerRoutes(app, mockCtx());
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    const body = res.json();
    expect(body).toHaveProperty('emissionsContractAddress');
    expect(body.emissionsContractAddress).toBe('0x' + '3'.repeat(40));
    await app.close();
  });

  it('includes networkStatsUrl when the chain config has it', async () => {
    const app = Fastify();
    registerRoutes(app, mockCtx({
      chainConfig: {
        chainId: 'base-mainnet',
        evmChainId: 8453,
        networkStatsUrl: 'https://network.antseed.com',
      } as any,
    }));
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.json().networkStatsUrl).toBe('https://network.antseed.com');
    await app.close();
  });

  it('returns networkStatsUrl: null when the chain config has none', async () => {
    const app = Fastify();
    registerRoutes(app, mockCtx({
      chainConfig: {
        chainId: 'base-local',
        evmChainId: 31337,
      } as any,
    }));
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.json().networkStatsUrl).toBeNull();
    await app.close();
  });

  it('returns onramp: null by default', async () => {
    const app = Fastify();
    registerRoutes(app, mockCtx());
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.json().onramp).toBeNull();
    await app.close();
  });

  it('returns the onramp config the context carries', async () => {
    const app = Fastify();
    const onramp = { moonpay: { publishableKey: 'pk_test_x', baseUrl: 'https://buy-sandbox.moonpay.com', currencyCode: 'usdc' } };
    registerRoutes(app, mockCtx({ onramp }));
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.json().onramp).toEqual(onramp);
    await app.close();
  });
});

describe('sanitizeOnramp', () => {
  const valid = { publishableKey: 'pk_test_x', baseUrl: 'https://buy-sandbox.moonpay.com', currencyCode: 'usdc' };

  it('whitelists exactly pk/baseUrl/currencyCode, dropping extra fields', () => {
    const result = sanitizeOnramp({ moonpay: { ...valid, secretKey: 'sk_test_leak', extra: 1 } });
    expect(result).toEqual({ moonpay: valid });
    expect((result!.moonpay as Record<string, unknown>).secretKey).toBeUndefined();
  });

  it.each([
    ['null', null],
    ['non-object', 'nope'],
    ['empty object', {}],
    ['missing moonpay fields', { moonpay: {} }],
    ['partial moonpay', { moonpay: { publishableKey: 'pk_test_x' } }],
    ['empty-string field', { moonpay: { ...valid, publishableKey: '' } }],
    ['non-string field', { moonpay: { ...valid, publishableKey: 123 } }],
    ['secret key in publishableKey', { moonpay: { ...valid, publishableKey: 'sk_test_leak' } }],
    ['non-pk publishableKey', { moonpay: { ...valid, publishableKey: 'test_x' } }],
    ['malformed baseUrl', { moonpay: { ...valid, baseUrl: 'not a url' } }],
    ['http baseUrl', { moonpay: { ...valid, baseUrl: 'http://buy-sandbox.moonpay.com' } }],
    ['non-moonpay host', { moonpay: { ...valid, baseUrl: 'https://evil.example.com' } }],
  ])('returns null for %s', (_label, input) => {
    expect(sanitizeOnramp(input)).toBeNull();
  });
});

describe('GET /api/rpc-health', () => {
  it('returns the latest RPC block number', async () => {
    const app = Fastify();
    registerRoutes(app, mockCtx());
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: '0x2a',
    }), { status: 200 })));

    const res = await app.inject({ method: 'GET', url: '/api/rpc-health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, blockNumber: 42 });
    await app.close();
  });

  it('returns 502 when the RPC read fails', async () => {
    const app = Fastify();
    registerRoutes(app, mockCtx());
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      error: { message: 'bad rpc' },
    }), { status: 200 })));

    const res = await app.inject({ method: 'GET', url: '/api/rpc-health' });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ ok: false, error: 'bad rpc' });
    await app.close();
  });
});

describe('GET /api/emissions/pending', () => {
  it('rejects malformed addresses with 400', async () => {
    const app = Fastify();
    registerRoutes(app, mockCtx());
    const res = await app.inject({ method: 'GET', url: '/api/emissions/pending?address=not-an-address' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 503 when emissions contract is not configured', async () => {
    const app = Fastify();
    registerRoutes(app, mockCtx({
      chainConfig: { chainId: 'base-local', evmChainId: 31337 } as any,
    }));
    const res = await app.inject({ method: 'GET', url: '/api/emissions/pending?address=0x' + '4'.repeat(40) });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('GET /api/emissions/transfers-enabled', () => {
  it('returns configured:false when ANTS token address is missing', async () => {
    const app = Fastify();
    registerRoutes(app, mockCtx());
    const res = await app.inject({ method: 'GET', url: '/api/emissions/transfers-enabled' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.enabled).toBe(false);
    expect(body.configured).toBe(false);
    await app.close();
  });
});
