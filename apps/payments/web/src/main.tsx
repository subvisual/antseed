import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider } from '@privy-io/wagmi';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { base } from 'wagmi/chains';
import { wagmiConfig } from './wagmi-config';
import { App } from './App';
import { getConfig } from './api';
import '@rainbow-me/rainbowkit/styles.css';
import './styles/global.scss';

const queryClient = new QueryClient();

function PaymentsRoot() {
  const [privyAppId, setPrivyAppId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getConfig()
      .then((config) => {
        if (cancelled) return;
        const appId = config.privyAppId?.trim();
        if (!appId) {
          setLoadError('Privy app ID is not configured.');
          return;
        }
        setPrivyAppId(appId);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <div className="session-expired-overlay" role="alert">
        <div className="session-expired-card">
          <h2 className="session-expired-title">Payments portal unavailable</h2>
          <p className="session-expired-subtitle">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!privyAppId) {
    return <div className="deposit-loading">Loading payments portal...</div>;
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['email'],
        supportedChains: [base],
        defaultChain: base,
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'off',
          },
        },
        appearance: {
          landingHeader: 'Buy AntSeed credits',
          loginMessage: 'Use email to create a wallet and fund your AntSeed account.',
          showWalletLoginFirst: false,
          walletChainType: 'ethereum-only',
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <RainbowKitProvider>
            <App />
          </RainbowKitProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

const root = document.getElementById('root')!;
createRoot(root).render(<PaymentsRoot />);
