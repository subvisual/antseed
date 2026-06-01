import type { ReactNode } from 'react';
import { useAuthorizedWallet } from '../context/AuthorizedWalletContext';

export type TabId = 'overview' | 'rewards' | 'activity' | 'settings';

interface SidebarProps {
  activeTab: TabId;
  onSelect: (tab: TabId) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  buyerAddress: string | null;
}

interface NavItem {
  id: TabId;
  label: string;
  icon: ReactNode;
}

function OverviewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 2.75L15.25 9L9 15.25L2.75 9L9 2.75Z" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" />
    </svg>
  );
}

function RewardsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 2.5L10.9 6.35L15.15 6.98L12.08 9.96L12.8 14.2L9 12.2L5.2 14.2L5.92 9.96L2.85 6.98L7.1 6.35L9 2.5Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M2.5 9H5.7L7.15 5.25L10.15 12.75L11.8 9H15.5" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="2.25" stroke="currentColor" strokeWidth="1.35" />
      <path d="M9 2.6V4.25M9 13.75V15.4M4.47 4.47L5.65 5.65M12.35 12.35L13.53 13.53M2.6 9H4.25M13.75 9H15.4M4.47 13.53L5.65 12.35M12.35 5.65L13.53 4.47" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.2"/><path d="M8 2V3.5M8 12.5V14M2 8H3.5M12.5 8H14M3.8 3.8L4.8 4.8M11.2 11.2L12.2 12.2M3.8 12.2L4.8 11.2M11.2 4.8L12.2 3.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.5 10A5.5 5.5 0 016 2.5 5.5 5.5 0 108 13.5a5.5 5.5 0 005.5-3.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: <OverviewIcon /> },
  { id: 'rewards',  label: 'Rewards',  icon: <RewardsIcon /> },
  { id: 'activity', label: 'Activity', icon: <ActivityIcon /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
];

function truncateAddress(address: string | null): string {
  if (!address) return 'No signer';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function Sidebar({ activeTab, onSelect, isDark, onToggleTheme, buyerAddress }: SidebarProps) {
  const { operatorSet } = useAuthorizedWallet();

  return (
    <aside className="dash-sidebar">
      <div className="dash-sidebar-brand">
        <span className="dash-sidebar-brand-mark" aria-hidden="true" />
        <span className="dash-sidebar-title">AntSeed Portal</span>
      </div>

      <nav className="dash-sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`dash-sidebar-item${activeTab === item.id ? ' dash-sidebar-item--active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <span className="dash-sidebar-item-icon">{item.icon}</span>
            <span className="dash-sidebar-item-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="dash-sidebar-footer">
        <button
          type="button"
          className="dash-sidebar-address"
          title={buyerAddress ?? undefined}
          disabled={!buyerAddress}
        >
          {truncateAddress(buyerAddress)}
        </button>
        <div className="dash-sidebar-footer-row">
          <div className="dash-sidebar-auth-state">
            <span className={operatorSet ? 'is-authorized' : ''} />
            {operatorSet ? 'authorized' : 'not authorized'}
          </div>
          <button
            type="button"
            className="dash-sidebar-theme-toggle"
            onClick={onToggleTheme}
            title={isDark ? 'Switch to light' : 'Switch to dark'}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
    </aside>
  );
}
