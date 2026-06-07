import { useState, useEffect, useCallback } from 'react';
import type { BalanceData, PaymentConfig } from './types';
import { getBalance, getConfig } from './api';
import { Sidebar, type TabId } from './layout/Sidebar';
import { TopBar } from './layout/TopBar';
import { WalletDrawer } from './layout/WalletDrawer';
import { EmptyStateOverlay } from './layout/EmptyStateOverlay';
import { LoaderOverlay } from './layout/LoaderOverlay';
import { ActionModal } from './layout/ActionModal';
import { DepositView } from './components/DepositView';
import { WithdrawView } from './components/WithdrawView';
import { HowItWorksModal } from './components/HowItWorksModal';
import { OverviewView } from './views/OverviewView';
import { RewardsView } from './views/RewardsView';
import { ActivityView } from './views/ActivityView';
import { SettingsView } from './views/SettingsView';
import { ChannelsStubView } from './views/ChannelsStubView';
// EmissionsView and DiemRewardsView removed — merged into RewardsView
import { AuthorizedWalletProvider } from './context/AuthorizedWalletContext';
import { useAuthorizedWallet } from './context/AuthorizedWalletContext';

export type OverlayPhase = 'success' | null;

// Shown once to brand-new users (no balance yet); dismissal persisted here.
const HIW_SEEN_KEY = 'antseed-payments-hiw-seen';

// New 4-item portal nav + legacy sub-pages for backwards compat
const VALID_TABS = new Set<TabId>([
  'overview', 'rewards', 'activity', 'settings',
  // legacy
  'dashboard', 'channels', 'emissions', 'diem-rewards',
]);

function parseTabFromUrl(): TabId {
  const raw = new URLSearchParams(window.location.search).get('tab');
  if (!raw) return 'overview';
  // Legacy compat: 'dashboard' → 'overview'
  if (raw === 'dashboard') return 'overview';
  if (raw === 'deposit' || raw === 'deposits') return 'overview';
  return VALID_TABS.has(raw as TabId) ? (raw as TabId) : 'overview';
}

function shouldOpenDepositFromUrl(): boolean {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action') ?? params.get('modal');
  const tab = params.get('tab');
  return action === 'deposit' || tab === 'deposit' || tab === 'deposits';
}

/**
 * `?welcome` (or `?welcome=1`) force-opens the "How AntSeed works" modal,
 * regardless of balance or the one-time seen flag. Handy for previewing /
 * deep-linking to the onboarding explainer in any browser.
 */
function shouldOpenWelcomeFromUrl(): boolean {
  return new URLSearchParams(window.location.search).has('welcome');
}

function writeTabToUrl(tab: TabId) {
  const url = new URL(window.location.href);
  url.searchParams.set('tab', tab);
  window.history.replaceState({}, '', url.toString());
}

function clearDepositActionFromUrl() {
  const url = new URL(window.location.href);
  if (url.searchParams.get('action') === 'deposit') url.searchParams.delete('action');
  if (url.searchParams.get('modal') === 'deposit')  url.searchParams.delete('modal');
  window.history.replaceState({}, '', url.toString());
}

export function App() {
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [balanceLoaded, setBalanceLoaded] = useState(false);
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>(() => parseTabFromUrl());
  const [walletDrawerOpen, setWalletDrawerOpen] = useState(false);
  const [actionModal, setActionModal] = useState<'deposit' | 'withdraw' | null>(
    () => shouldOpenDepositFromUrl() ? 'deposit' : null,
  );
  const [sessionExpired, setSessionExpired] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('antseed-payments-theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const handler = () => setSessionExpired(true);
    window.addEventListener('antseed:session-expired', handler);
    return () => window.removeEventListener('antseed:session-expired', handler);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('antseed-payments-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const fetchBalance = useCallback(async () => {
    try {
      const data = await getBalance();
      setBalance(data);
      setBalanceLoaded(true);
    } catch {
      // Balance not available yet — keep loading state until a fetch succeeds.
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    await fetchBalance();
    setTimeout(fetchBalance, 3000);
  }, [fetchBalance]);

  useEffect(() => {
    void fetchBalance();
    void getConfig().then(setConfig).catch(() => {});
  }, [fetchBalance]);

  const handleSelectTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    writeTabToUrl(tab);
  }, []);

  const openDeposit  = useCallback(() => setActionModal('deposit'), []);
  const openWithdraw = useCallback(() => setActionModal('withdraw'), []);
  const closeActionModal = useCallback(() => {
    setActionModal(null);
    clearDepositActionFromUrl();
  }, []);

  const buyerEvmAddress = config?.evmAddress ?? balance?.evmAddress ?? null;

  return (
    <AuthorizedWalletProvider config={config}>
      <AppShell
        balance={balance}
        balanceLoaded={balanceLoaded}
        config={config}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        isDark={isDark}
        onToggleTheme={() => setIsDark((d) => !d)}
        walletDrawerOpen={walletDrawerOpen}
        onOpenWalletDrawer={() => setWalletDrawerOpen(true)}
        onCloseWalletDrawer={() => setWalletDrawerOpen(false)}
        actionModal={actionModal}
        onOpenDeposit={openDeposit}
        onOpenWithdraw={openWithdraw}
        onCloseActionModal={closeActionModal}
        buyerEvmAddress={buyerEvmAddress}
        refreshBalance={refreshBalance}
      />
      {sessionExpired && (
        <div className="session-expired-overlay" role="alert">
          <div className="session-expired-card">
            <div className="session-expired-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                <circle cx="24" cy="24" r="22" stroke="var(--text-muted)" strokeWidth="2" strokeDasharray="4 3" />
                <path d="M24 14V26" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="24" cy="33" r="1.5" fill="var(--text-muted)" />
              </svg>
            </div>
            <h2 className="session-expired-title">Session expired</h2>
            <p className="session-expired-subtitle">
              The payments server was restarted. Please reopen this portal from the desktop app or CLI to get a new session.
            </p>
          </div>
        </div>
      )}
    </AuthorizedWalletProvider>
  );
}

interface AppShellProps {
  balance: BalanceData | null;
  balanceLoaded: boolean;
  config: PaymentConfig | null;
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  walletDrawerOpen: boolean;
  onOpenWalletDrawer: () => void;
  onCloseWalletDrawer: () => void;
  actionModal: 'deposit' | 'withdraw' | null;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onCloseActionModal: () => void;
  buyerEvmAddress: string | null;
  refreshBalance: () => Promise<void>;
}

function AppShell({
  balance,
  balanceLoaded,
  config,
  activeTab,
  onSelectTab,
  isDark,
  onToggleTheme,
  walletDrawerOpen,
  onOpenWalletDrawer,
  onCloseWalletDrawer,
  actionModal,
  onOpenDeposit,
  onOpenWithdraw,
  onCloseActionModal,
  buyerEvmAddress,
  refreshBalance,
}: AppShellProps) {
  const [justDeposited, setJustDeposited] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(shouldOpenWelcomeFromUrl);
  const authorizedWallet = useAuthorizedWallet();

  const isLoading = !balanceLoaded;
  const isEmptyBuyer =
    balanceLoaded &&
    balance !== null &&
    parseFloat(balance.total) === 0 &&
    parseFloat(balance.reserved) === 0;

  // First-run: greet brand-new users (no balance yet) with the "How AntSeed
  // works" explainer, exactly once, then hand off to the Overview checklist.
  // Dismissal is persisted, so it never nags.
  useEffect(() => {
    if (!isEmptyBuyer) return;
    if (localStorage.getItem(HIW_SEEN_KEY) === '1') return;
    localStorage.setItem(HIW_SEEN_KEY, '1');
    setHowItWorksOpen(true);
  }, [isEmptyBuyer]);

  // The only blocking overlay is the post-deposit success celebration. First-run
  // funding is handled inline by the Overview checklist (no separate overlay).
  const overlayPhase: OverlayPhase = justDeposited ? 'success' : null;

  const shellBlurred = isLoading || overlayPhase !== null;

  const handleDeposited = useCallback(async () => {
    setJustDeposited(true);
    onCloseActionModal();
    await refreshBalance();
  }, [refreshBalance, onCloseActionModal]);

  const dismissSuccess = useCallback(() => setJustDeposited(false), []);

  // Navigate to channels sub-page
  const goToChannels = useCallback(() => onSelectTab('channels'), [onSelectTab]);
  const goToActivity = useCallback(() => onSelectTab('activity'), [onSelectTab]);
  const goToRewards  = useCallback(() => onSelectTab('rewards'),  [onSelectTab]);

  // Safety state: the user has funds on-chain but no authorized recovery wallet.
  // This is the only unrecoverable-funds risk, so it's surfaced on every tab via
  // the account pill (and emphasized in the Overview checklist).
  const fundedTotal = balance ? parseFloat(balance.total) : 0;
  const unauthorizedAtRisk = authorizedWallet.operatorSet === false && fundedTotal > 0;

  return (
    <>
      <div className={`dash-shell${shellBlurred ? ' dash-shell--blurred' : ''}`}>
        <Sidebar activeTab={activeTab} onSelect={onSelectTab} />
        <div className="dash-main">
          <TopBar
            activeTab={activeTab}
            balance={balance}
            buyerEvmAddress={buyerEvmAddress}
            atRisk={unauthorizedAtRisk}
            isDark={isDark}
            onToggleTheme={onToggleTheme}
            onOpenWallet={onOpenWalletDrawer}
          />
          <main className="dash-content">
            {/* New 4-item portal nav */}
            {(activeTab === 'overview' || activeTab === 'dashboard') && (
              <OverviewView
                balance={balance}
                config={config}
                onOpenDeposit={onOpenDeposit}
                onOpenWithdraw={onOpenWithdraw}
                onOpenHowItWorks={() => setHowItWorksOpen(true)}
                onGoToChannels={goToChannels}
                onGoToActivity={goToActivity}
                onGoToRewards={goToRewards}
              />
            )}
            {activeTab === 'rewards'  && <RewardsView  config={config} />}
            {activeTab === 'activity' && <ActivityView config={config} />}
            {activeTab === 'settings' && <SettingsView config={config} onOpenDeposit={onOpenDeposit} />}
            {/* Channels: reachable via Overview "details" link or direct URL */}
            {activeTab === 'channels' && (
              <ChannelsStubView
                config={config}
                onBack={() => onSelectTab('overview')}
              />
            )}
            {/* Legacy tabs redirect to rewards */}
            {(activeTab === 'emissions' || activeTab === 'diem-rewards') && <RewardsView config={config} />}
          </main>
        </div>
        <WalletDrawer
          isOpen={walletDrawerOpen}
          onClose={onCloseWalletDrawer}
          balance={balance}
          config={config}
          buyerEvmAddress={buyerEvmAddress}
        />
      </div>
      <LoaderOverlay isVisible={isLoading} />
      <EmptyStateOverlay phase={overlayPhase} onContinue={dismissSuccess} />
      <ActionModal
        isOpen={actionModal === 'deposit'}
        onClose={onCloseActionModal}
        title="Deposit USDC"
        subtitle="Add credits to your AntSeed account with a guided two-step flow."
        variant="deposit"
      >
        <DepositView
          config={config}
          balance={balance}
          buyerAddress={buyerEvmAddress}
          onDeposited={handleDeposited}
        />
      </ActionModal>
      <ActionModal
        isOpen={actionModal === 'withdraw'}
        onClose={onCloseActionModal}
        title="Withdraw USDC"
        subtitle="Send funds to your authorized wallet."
      >
        <WithdrawView config={config} balance={balance} onAction={refreshBalance} />
      </ActionModal>
      <HowItWorksModal
        isOpen={howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
        onOpenDeposit={onOpenDeposit}
      />
    </>
  );
}
