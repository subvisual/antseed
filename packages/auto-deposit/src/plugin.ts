import type { AntseedFundingPlugin } from './funding-plugin.js';
import { createAutoDepositFundingService } from './factory.js';

export const autoDepositPlugin: AntseedFundingPlugin = {
  type: 'funding',
  name: 'auto-deposit',
  displayName: 'Auto-deposit',
  version: '0.1.0',
  description: 'Automatically move USDC sent to your wallet into the network so it can buy services. Gas is paid in USDC, no ETH needed. Your wallet is upgraded once (EIP-7702) on the first deposit.',
  createFundingService(host) {
    return createAutoDepositFundingService(host);
  },
};

export default autoDepositPlugin;
