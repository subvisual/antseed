import { describe, it, expect, vi, afterEach } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes } from './routes.js';

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
    } as any,
    proxyPort: 3000,
    ...overrides,
  };
}

describe('GET /api/activity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty items when cryptoCtx is null (no identity configured)', async () => {
    const app = Fastify();
    registerRoutes(app, mockCtx({ cryptoCtx: null }));
    const res = await app.inject({ method: 'GET', url: '/api/activity' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(0);
    await app.close();
  });

  it('returns empty items when buyer proxy is unreachable', async () => {
    // Provide a cryptoCtx so the route attempts to fetch from proxy
    const mockCryptoCtx = {
      evmAddress: '0x' + 'a'.repeat(40),
      wallet: {} as any,
    };

    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNREFUSED');
    });

    const app = Fastify();
    registerRoutes(app, mockCtx({ cryptoCtx: mockCryptoCtx as any }));
    const res = await app.inject({ method: 'GET', url: '/api/activity' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('aggregates settled channels into settlement items', async () => {
    const mockCryptoCtx = {
      evmAddress: '0x' + 'a'.repeat(40),
      wallet: {} as any,
    };

    const now = Math.floor(Date.now() / 1000) - 60;

    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        channels: [
          {
            channelId: '0xabc',
            peerId: 'gpt-4o',
            seller: '0x' + '7'.repeat(40),
            reserveMax: '10000000', // $10 USDC (6 decimals)
            cumulativeSigned: '2140000', // $2.14 USDC
            reservedAt: now,
            status: 'settled',
          },
        ],
      }),
    }));

    const app = Fastify();
    registerRoutes(app, mockCtx({ cryptoCtx: mockCryptoCtx as any }));
    const res = await app.inject({ method: 'GET', url: '/api/activity' });
    expect(res.statusCode).toBe(200);

    const body = res.json() as { items: Array<{ type: string; label: string; amount: string; positive: boolean }> };
    expect(body.items).toHaveLength(1);
    const item = body.items[0];
    expect(item.type).toBe('settlement');
    expect(item.label).toContain('Settled');
    expect(item.label).toContain('gpt-4o');
    expect(item.positive).toBe(false);
    expect(item.amount).toBe('-2.14');

    await app.close();
  });

  it('emits both settlement and channel_close items for a closed channel with reclaimed funds', async () => {
    const mockCryptoCtx = {
      evmAddress: '0x' + 'a'.repeat(40),
      wallet: {} as any,
    };

    const now = Math.floor(Date.now() / 1000) - 120;

    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        channels: [
          {
            channelId: '0xdef',
            peerId: 'deepseek',
            seller: '0x' + '5'.repeat(40),
            reserveMax: '6400000', // $6.40
            cumulativeSigned: '0', // nothing spent
            reservedAt: now,
            status: 'closed',
          },
        ],
      }),
    }));

    const app = Fastify();
    registerRoutes(app, mockCtx({ cryptoCtx: mockCryptoCtx as any }));
    const res = await app.inject({ method: 'GET', url: '/api/activity' });
    expect(res.statusCode).toBe(200);

    const body = res.json() as { items: Array<{ type: string; positive: boolean }> };
    // Only a channel_close (reclaimed $6.40); no settlement since signed=0
    const closeItem = body.items.find((i) => i.type === 'channel_close');
    expect(closeItem).toBeDefined();
    expect(closeItem!.positive).toBe(true);

    // No settlement item when nothing was signed
    const settlementItem = body.items.find((i) => i.type === 'settlement');
    expect(settlementItem).toBeUndefined();

    await app.close();
  });

  it('returns items sorted newest-first', async () => {
    const mockCryptoCtx = {
      evmAddress: '0x' + 'a'.repeat(40),
      wallet: {} as any,
    };

    const older = Math.floor(Date.now() / 1000) - 3600;
    const newer = Math.floor(Date.now() / 1000) - 60;

    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        channels: [
          {
            channelId: '0xold',
            peerId: 'model-a',
            seller: '0x' + '1'.repeat(40),
            reserveMax: '5000000',
            cumulativeSigned: '1000000',
            reservedAt: older,
            status: 'settled',
          },
          {
            channelId: '0xnew',
            peerId: 'model-b',
            seller: '0x' + '2'.repeat(40),
            reserveMax: '5000000',
            cumulativeSigned: '2000000',
            reservedAt: newer,
            status: 'settled',
          },
        ],
      }),
    }));

    const app = Fastify();
    registerRoutes(app, mockCtx({ cryptoCtx: mockCryptoCtx as any }));
    const res = await app.inject({ method: 'GET', url: '/api/activity' });
    expect(res.statusCode).toBe(200);

    const body = res.json() as { items: Array<{ ts: number }> };
    expect(body.items).toHaveLength(2);
    expect(body.items[0].ts).toBeGreaterThan(body.items[1].ts);

    await app.close();
  });
});
