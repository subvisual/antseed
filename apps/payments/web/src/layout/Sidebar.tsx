import type { ReactNode } from 'react';

// The 4 portal nav items defined by the redesign.
// Legacy tab IDs kept for compatibility in ChannelsView / Emissions / DiemRewards
// which are still served as sub-pages via the old routing.
export type TabId =
  | 'overview'
  | 'rewards'
  | 'activity'
  | 'settings'
  // legacy IDs kept so existing code that references them doesn't break
  | 'dashboard'
  | 'channels'
  | 'emissions'
  | 'diem-rewards';

interface SidebarProps {
  activeTab: TabId;
  onSelect: (tab: TabId) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  /** Short-form wallet address, e.g. "0x3f9a…c2a1" */
  walletAddress?: string | null;
  /** Whether the wallet is authorized */
  walletAuthorized?: boolean;
  onOpenWallet?: () => void;
}

interface NavItem {
  id: TabId;
  label: string;
  icon: ReactNode;
}

/* ── SVG icons ── */

function OverviewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 1L13 7L7 13L1 7L7 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function RewardsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 1.5L8.5 5H12.5L9.5 7.5L10.5 11.5L7 9L3.5 11.5L4.5 7.5L1.5 5H5.5L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1.5 7H3.5L5 3L7 11L9 5L10.5 7H12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.9 2.9l1.1 1.1M10 10l1.1 1.1M2.9 11.1L4 10M10 4l1.1-1.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 2V3.5M8 12.5V14M2 8H3.5M12.5 8H14M3.8 3.8L4.8 4.8M11.2 11.2L12.2 12.2M3.8 12.2L4.8 11.2M11.2 4.8L12.2 3.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13.5 10A5.5 5.5 0 016 2.5 5.5 5.5 0 108 13.5a5.5 5.5 0 005.5-3.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview',  label: 'Overview',  icon: <OverviewIcon /> },
  { id: 'rewards',   label: 'Rewards',   icon: <RewardsIcon /> },
  { id: 'activity',  label: 'Activity',  icon: <ActivityIcon /> },
  { id: 'settings',  label: 'Settings',  icon: <SettingsIcon /> },
];

export function Sidebar({
  activeTab,
  onSelect,
  isDark,
  onToggleTheme,
  walletAddress,
  walletAuthorized,
  onOpenWallet,
}: SidebarProps) {
  // Treat 'dashboard' as alias for 'overview' when highlighting
  const effectiveActive =
    activeTab === 'dashboard' ? 'overview' : activeTab;

  return (
    <aside className="portal-side">
      <div className="portal-brand">
        <span className="portal-brand-dot">◆</span>
        AntSeed Portal
      </div>

      <nav className="portal-nav-wrap" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`portal-nav-item${effectiveActive === item.id ? ' active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <span className="portal-nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="portal-wallet-footer">
        {walletAddress ? (
          <>
            <button
              type="button"
              className="portal-wallet-addr"
              onClick={onOpenWallet}
              title="Open wallet"
            >
              {walletAddress}
            </button>
            <div className="portal-wallet-status">
              <span className="portal-wallet-dot" aria-hidden="true" />
              <span className={walletAuthorized ? 'portal-wallet-ok' : ''}>
                {walletAuthorized ? 'authorized' : 'not authorized'}
              </span>
              <button
                type="button"
                className="portal-wallet-theme-toggle"
                onClick={onToggleTheme}
                title={isDark ? 'Switch to light' : 'Switch to dark'}
              >
                {isDark ? <SunIcon /> : <MoonIcon />}
              </button>
            </div>
          </>
        ) : (
          <div className="portal-wallet-status">
            <span style={{ color: 'var(--muted)' }}>No wallet</span>
            <button
              type="button"
              className="portal-wallet-theme-toggle"
              onClick={onToggleTheme}
              title={isDark ? 'Switch to light' : 'Switch to dark'}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
