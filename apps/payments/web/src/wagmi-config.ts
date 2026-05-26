import { connectorsForWallets, getDefaultWallets } from '@rainbow-me/rainbowkit';
import { createConfig } from '@privy-io/wagmi';
import { base } from 'wagmi/chains';
import { http, fallback } from 'viem';

const walletConnectProjectId = '9a1851410cb5589bc351a6dabf17140e';
const { wallets } = getDefaultWallets({
  appName: 'AntSeed Payments',
  projectId: walletConnectProjectId,
});

const connectors = connectorsForWallets(wallets, {
  appName: 'AntSeed Payments',
  projectId: walletConnectProjectId,
});

// Fallback order was picked via a benchmark of the 3-concurrent-eth_call
// pattern that broke the desktop credits pill (getBuyerBalance +
// getBuyerCreditLimit + getOperator in parallel):
//   publicnode              — 153ms, 3/3 reliable (primary)
//   tenderly public gateway — 161ms, 3/3 reliable
//   nodies public           — 163ms, 3/3 reliable
//
// Explicitly NOT in this list:
//   llamarpc            — 0/3 (missing revert data — the original bug)
//   mainnet.base.org    — 1/3 flaky under concurrent reads
//
// Users with production traffic should override via an Alchemy/Infura
// endpoint. Mirrors the @antseed/node default primary.
export const wagmiConfig = createConfig({
  chains: [base],
  connectors,
  transports: {
    [base.id]: fallback([
      http('https://base-rpc.publicnode.com'),
      http('https://base.gateway.tenderly.co'),
      http('https://base-public.nodies.app'),
    ]),
  },
});
