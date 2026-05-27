import type { AntseedProviderPlugin, Provider } from '@antseed/node';
import { BaseProvider, buildCanonicalMap, buildServiceApiProtocols, parseNonNegativeNumber } from '@antseed/provider-core';
import { ClaudeCodeTokenProvider } from './claude-code-token.js';

const plugin: AntseedProviderPlugin = {
  name: 'claude-code',
  displayName: 'Claude Code',
  version: '0.1.0',
  type: 'provider',
  description: 'Claude Code keychain provider (testing and development only)',
  configSchema: [
    { key: 'ANTSEED_INPUT_USD_PER_MILLION', label: 'Input Price', type: 'number', required: false, default: 10, description: 'Input price in USD per 1M tokens' },
    { key: 'ANTSEED_OUTPUT_USD_PER_MILLION', label: 'Output Price', type: 'number', required: false, default: 10, description: 'Output price in USD per 1M tokens' },
    { key: 'ANTSEED_CACHED_INPUT_USD_PER_MILLION', label: 'Cached Input Price', type: 'number', required: false, description: 'Cached input price in USD per 1M tokens (defaults to input price)' },
    { key: 'ANTSEED_MAX_CONCURRENCY', label: 'Max Concurrency', type: 'number', required: false, default: 10, description: 'Max concurrent requests' },
    { key: 'ANTSEED_ALLOWED_SERVICES', label: 'Allowed Services', type: 'string[]', required: false, description: 'Service allow-list' },
  ],

  createProvider(config: Record<string, string>): Provider {
    const pricing: Provider['pricing'] = {
      defaults: {
        inputUsdPerMillion: parseNonNegativeNumber(config['ANTSEED_INPUT_USD_PER_MILLION'], 'ANTSEED_INPUT_USD_PER_MILLION', 10),
        outputUsdPerMillion: parseNonNegativeNumber(config['ANTSEED_OUTPUT_USD_PER_MILLION'], 'ANTSEED_OUTPUT_USD_PER_MILLION', 10),
        ...(config['ANTSEED_CACHED_INPUT_USD_PER_MILLION'] ? { cachedInputUsdPerMillion: parseNonNegativeNumber(config['ANTSEED_CACHED_INPUT_USD_PER_MILLION'], 'ANTSEED_CACHED_INPUT_USD_PER_MILLION', 0) } : {}),
      },
    };

    const maxConcurrency = parseInt(config['ANTSEED_MAX_CONCURRENCY'] ?? '10', 10);
    if (Number.isNaN(maxConcurrency)) {
      throw new Error('ANTSEED_MAX_CONCURRENCY must be a valid number');
    }

    const allowedServices = config['ANTSEED_ALLOWED_SERVICES']
      ? config['ANTSEED_ALLOWED_SERVICES'].split(',').map((s: string) => s.trim())
      : [];

    const tokenProvider = new ClaudeCodeTokenProvider();
    const serviceApiProtocols = buildServiceApiProtocols(allowedServices, 'anthropic-messages');
    const canonical = buildCanonicalMap(allowedServices);

    return new BaseProvider({
      name: 'claude-code',
      services: allowedServices,
      pricing,
      ...(serviceApiProtocols ? { serviceApiProtocols } : {}),
      ...(canonical ? { canonical } : {}),
      relay: {
        baseUrl: 'https://api.anthropic.com',
        authHeaderName: 'authorization',
        authHeaderValue: '',
        tokenProvider,
        maxConcurrency,
        allowedServices,
        extraHeaders: { 'anthropic-beta': 'oauth-2025-04-20' },
      },
    });
  },
};

export default plugin;
