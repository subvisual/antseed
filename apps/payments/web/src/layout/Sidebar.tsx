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
}

interface NavItem {
  id: TabId;
  label: string;
  icon: ReactNode;
}

/* ── SVG icons ── */

function OverviewIcon() {
  // Grid / dashboard — "account at a glance"
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <rect x="2.5" y="2.5" width="4.6" height="4.6" rx="1.2" />
      <rect x="8.9" y="2.5" width="4.6" height="4.6" rx="1.2" />
      <rect x="2.5" y="8.9" width="4.6" height="4.6" rx="1.2" />
      <rect x="8.9" y="8.9" width="4.6" height="4.6" rx="1.2" />
    </svg>
  );
}

function RewardsIcon() {
  // Gift — earned $ANTS rewards
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.7" y="6.7" width="10.6" height="6.7" rx="1" />
      <path d="M2.1 6.7h11.8" />
      <path d="M8 6.7v6.7" />
      <path d="M8 6.7S6.7 6.7 6.1 5.9c-.5-.7.1-1.7 1-1.4.9.3.9 2.2.9 2.2zM8 6.7s1.3 0 1.9-.8c.5-.7-.1-1.7-1-1.4-.9.3-.9 2.2-.9 2.2z" />
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
  // Sliders — configuration / adjustments
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M2.6 5h6M11.6 5h1.8M2.6 11h1.8M7.4 11h6" />
      <circle cx="9.6" cy="5" r="1.7" />
      <circle cx="5.8" cy="11" r="1.7" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview',  label: 'Overview',  icon: <OverviewIcon /> },
  { id: 'rewards',   label: 'Rewards',   icon: <RewardsIcon /> },
  { id: 'activity',  label: 'Activity',  icon: <ActivityIcon /> },
  { id: 'settings',  label: 'Settings',  icon: <SettingsIcon /> },
];

export function Sidebar({ activeTab, onSelect }: SidebarProps) {
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
    </aside>
  );
}
