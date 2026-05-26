import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { CSSProperties, MouseEvent, KeyboardEvent, RefObject } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Copy01Icon, Tick02Icon, ContractsIcon, InformationCircleIcon } from '@hugeicons/core-free-icons';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import type { ChatServiceOptionEntry, DiscoverRow } from '../../../core/state';
import { useUiSnapshot } from '../../hooks/useUiSnapshot';
import { useActions } from '../../hooks/useActions';
import { useDiscoverFilters } from '../../hooks/useDiscoverFilters';
import {
  type DiscoverSortKey,
  MAX_INPUT_PRICE_SLIDER_USD,
  MAX_OUTPUT_PRICE_SLIDER_USD,
  DEFAULT_MIN_REPUTATION_SCORE,
  formatCategoryLabel,
} from './discover-filter-util';
import { DiscoverFilters } from './DiscoverFilters';
import { getPeerGradient, getPeerDisplayName, getTagTint } from '../../../core/peer-utils';
import { getKnownProxy, type KnownProxy } from '../../../core/known-proxies';
import { InfoTooltip } from '../InfoTooltip';
import { groupByCanonical, canonicalizeModelId } from '../../../core/canonical-model';
import { computeForecast, type RoutingPriority } from '../../../core/forecast';
import { CATEGORIES, matchesCategory, type Category } from '../../../core/categories';
import styles from './DiscoverWelcome.module.scss';

/**
 * Cap the visible tag count on Discover cards to avoid wrapping onto a
 * second line when a service has 5+ categories (e.g. anon + chat + coding +
 * reasoning + multimodal). Overflow is shown as a single “+N” pill whose
 * tooltip lists the hidden tags.
 */
const MAX_VISIBLE_CARD_TAGS = 4;

const SORT_OPTIONS: Array<{ key: DiscoverSortKey; label: string }> = [
  { key: 'reputationDesc',  label: 'Best reputation' },
  { key: 'channelsDesc',    label: 'Most channels' },
  { key: 'recentlyUsed',    label: 'Recently used' },
  { key: 'serviceAsc',      label: 'Name A–Z' },
  { key: 'serviceDesc',     label: 'Name Z–A' },
  { key: 'priceAsc',        label: 'Price low to high' },
  { key: 'priceDesc',       label: 'Price high to low' },
  { key: 'latencyAsc',      label: 'Lowest latency' },
  { key: 'stakeDesc',       label: 'Most staked' },
  { key: 'lastSettledDesc', label: 'Recently settled' },
];

/* ── Card data type ──────────────────────────────────────────────────── */

type CardItem = {
  name: string;
  canonicalName: string;
  displayName: string;
  peerLabel: string;
  peerId: string;
  value: string;
  provider: string;
  tags: string[];
  gradient: string;
  description: string;
  /**
   * Identification (not verification) badge for known seller-proxy contracts
   * — e.g. the DIEM Staking Pool. `null` when the peer settles to its own
   * derived address or the proxy is not in our known registry.
   */
  knownProxy: KnownProxy | null;
  inputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
  cachedInputUsdPerMillion: number | null;
  /**
   * Retained for the issue-6 details drawer — not rendered on the card surface.
   */
  reputationScore: number | null; // 0-100 displayed score (sybil-attenuated)
  /** Retained for drawer. */
  channelCount: number;       // on-chain, from AntseedChannels.getAgentStats
  /** Retained for drawer. */
  volumeUsdc: number;         // settled on-chain USDC volume
  /** Retained for drawer. */
  sybilRisk: number | null;
  /** Retained for drawer. */
  sybilFlags: string[];
  /** Retained for drawer. */
  lifetimeRequests: number;   // network-wide (mainnet) or local buyer total (fallback)
  /** Retained for drawer. */
  lifetimeTokens: number;     // network-wide (mainnet) or local buyer total (fallback)
  latencyMs: number | null;
  /**
   * All DiscoverRows in this canonical-model group.
   * The issue-6 details drawer will iterate these to show per-provider stats.
   */
  groupedRows: DiscoverRow[];
};

/* ── Normalize service name for display (dashes → spaces) ─────────────── */

function normalizeServiceName(name: string): string {
  return name.replace(/[-_]+/g, ' ');
}

/* ── Generate description from service name ──────────────────────────── */

function generateDescription(serviceId: string, categories: string[], provider: string): string {
  const lower = serviceId.toLowerCase();
  const prov = provider || 'a network peer';

  if (lower.includes('claude')) return `Access to Anthropic's Claude model. Powered by ${prov}.`;
  if (lower.includes('gpt') || lower.includes('openai')) return `OpenAI model access through ${prov}.`;
  if (lower.includes('llama')) return `Meta's Llama open-weight model. Hosted by ${prov}.`;
  if (lower.includes('deepseek')) return `DeepSeek reasoning model. Served by ${prov}.`;
  if (lower.includes('mistral')) return `Mistral's flagship model. Strong multilingual and instruction following.`;
  if (lower.includes('kimi')) return `Moonshot's Kimi reasoning model. High-performance math and code.`;
  if (lower.includes('qwen')) return `Alibaba's Qwen model series. Multilingual and versatile.`;
  if (lower.includes('gemini') || lower.includes('gemma')) return `Google's model. Powered by ${prov}.`;
  if (lower.includes('flux') || lower.includes('sdxl')) return `Image generation model. Served by ${prov}.`;
  if (categories.length > 0) return `${categories.map(formatCategoryLabel).join(' & ')} service powered by ${prov}.`;
  return `AI service powered by ${prov}.`;
}

/* ── Build cards from network service options ──────────────────────────── */

function buildCards(options: ChatServiceOptionEntry[]): CardItem[] {
  return options.map((opt) => {
    const baseTags = opt.categories;
    const tags = baseTags.some((t) => t.toLowerCase() === 'anon')
      ? baseTags
      : ['anon', ...baseTags];
    const rawName = opt.label || opt.id;
    return {
      name: rawName,
      canonicalName: opt.id,
      displayName: normalizeServiceName(rawName),
      peerLabel: opt.peerLabel || '',
      peerId: opt.peerId || '',
      value: opt.value,
      provider: opt.provider,
      tags,
      gradient: getPeerGradient(opt.peerId || opt.peerLabel || opt.provider || opt.id),
      description: opt.description || generateDescription(opt.id, opt.categories, opt.peerLabel || opt.provider),
      // ChatServiceOptionEntry doesn't carry sellerContract — only the
      // DiscoverRow path (below) does. Cards built from the fallback options
      // list therefore never light up the badge, which is fine: as soon as
      // the daemon delivers DiscoverRows the proxy gets surfaced.
      knownProxy: null,
      inputUsdPerMillion: opt.inputUsdPerMillion,
      outputUsdPerMillion: opt.outputUsdPerMillion,
      cachedInputUsdPerMillion: opt.cachedInputUsdPerMillion ?? null,
      reputationScore: null,
      channelCount: 0,
      volumeUsdc: 0,
      sybilRisk: null,
      sybilFlags: [],
      lifetimeRequests: 0,
      lifetimeTokens: 0,
      latencyMs: null,
      groupedRows: [],
    };
  });
}

/* ── Build cards directly from rows (carries lifetime stats) ─────────── */

function pickRequests(row: DiscoverRow): number {
  if (row.networkRequests !== null) {
    const n = Number(row.networkRequests);
    if (Number.isFinite(n)) return n;
  }
  return row.lifetimeRequests;
}

function pickTokens(row: DiscoverRow): number {
  if (row.networkInputTokens !== null || row.networkOutputTokens !== null) {
    const inp = row.networkInputTokens !== null ? Number(row.networkInputTokens) : 0;
    const out = row.networkOutputTokens !== null ? Number(row.networkOutputTokens) : 0;
    if (Number.isFinite(inp) && Number.isFinite(out)) return inp + out;
  }
  return row.lifetimeInputTokens + row.lifetimeOutputTokens;
}

function buildCardsFromRows(rows: DiscoverRow[], priority: RoutingPriority): CardItem[] {
  // Group rows by canonical model key — one card per canonical model.
  const groups = groupByCanonical(rows);
  const out: CardItem[] = [];

  for (const [canonicalKey, groupRows] of groups) {
    // Representative row: first in group (used for display metadata).
    const rep = groupRows[0];
    const baseTags = rep.categories;
    const tags = baseTags.some((t) => t.toLowerCase() === 'anon')
      ? baseTags
      : ['anon', ...baseTags];

    // Use canonical key to produce a clean display name (e.g. "gpt-4o" not "openai/gpt-4o").
    const rawName = rep.serviceLabel && canonicalizeModelId(rep.serviceLabel) === canonicalKey
      ? rep.serviceLabel
      : canonicalKey;
    const peerLabel = rep.peerLabel || '';

    // Aggregate stats from all rows for drawer use.
    const totalVolumeUsdc = groupRows.reduce((sum, r) => sum + Number(r.onChainTotalVolumeUsdc) / 1_000_000, 0);
    const totalRequests = groupRows.reduce((sum, r) => sum + pickRequests(r), 0);
    const totalTokens = groupRows.reduce((sum, r) => sum + pickTokens(r), 0);
    const totalChannels = groupRows.reduce((sum, r) => sum + r.onChainActiveChannelCount, 0);

    // Pick a representative provider name for display in the footer.
    const providerNames = [...new Set(groupRows.map((r) => r.peerLabel || r.provider).filter(Boolean))];
    const representativeLabel = providerNames[0] ?? peerLabel;

    // Gradient based on representative peer.
    const gradient = getPeerGradient(rep.peerId || peerLabel || rep.provider || rep.serviceId);

    // forecast is computed at render time from groupedRows + priority; no need to cache it here.

    // Fire with no peerId so buyer-proxy routing applies the active priority naturally.
    out.push({
      name: rawName,
      canonicalName: canonicalKey,
      displayName: normalizeServiceName(rawName),
      peerLabel: representativeLabel,
      peerId: '', // let routing pick the winner under active priority
      value: rep.selectionValue,
      provider: rep.provider,
      tags,
      gradient,
      description: generateDescription(rep.serviceId, rep.categories, representativeLabel || rep.provider),
      knownProxy: getKnownProxy(rep.sellerContract),
      inputUsdPerMillion: rep.inputUsdPerMillion,
      outputUsdPerMillion: rep.outputUsdPerMillion,
      cachedInputUsdPerMillion: rep.cachedInputUsdPerMillion,
      // Drawer fields — retained but not rendered on card surface.
      reputationScore: rep.onChainReputationScore,
      channelCount: totalChannels,
      volumeUsdc: totalVolumeUsdc,
      sybilRisk: rep.onChainSybilRisk,
      sybilFlags: rep.onChainSybilFlags,
      lifetimeRequests: totalRequests,
      lifetimeTokens: totalTokens,
      latencyMs: rep.latencyMs,
      groupedRows: groupRows,
    });
  }
  return out;
}

/* ── Forecast string formatter ───────────────────────────────────────── */

/**
 * Format `~$X/1k · ~Xms · N providers`, suppressing segments that are null.
 * `providerCount=1` suppresses the providers segment (single provider is implicit).
 */
function formatForecastLine(
  pricePer1kUsd: number | null,
  latencyMs: number | null,
  providerCount: number,
): string {
  const segments: string[] = [];
  if (pricePer1kUsd !== null && Number.isFinite(pricePer1kUsd)) {
    // Show 3 significant digits: format as e.g. ~$0.003/1k or ~$1.50/1k
    segments.push(`~$${pricePer1kUsd < 0.01 ? pricePer1kUsd.toFixed(4) : pricePer1kUsd.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}/1k`);
  }
  if (latencyMs !== null && Number.isFinite(latencyMs)) {
    segments.push(`~${Math.max(0, Math.round(latencyMs))}ms`);
  }
  if (providerCount > 1) {
    segments.push(`${providerCount} providers`);
  }
  return segments.join(' · ');
}

/* ── Search matcher ──────────────────────────────────────────────────── */

function matchesSearch(item: CardItem, query: string): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (item.name.toLowerCase().includes(q)) return true;
  if (item.displayName.toLowerCase().includes(q)) return true;
  if (item.peerLabel.toLowerCase().includes(q)) return true;
  if (item.tags.some((t) => t.toLowerCase().includes(q))) return true;
  return false;
}

/* ── Skeleton card ───────────────────────────────────────────────────── */

const skeletonBaseColor = 'rgba(0,0,0,0.04)';
const skeletonHighlightColor = 'rgba(0,0,0,0.07)';

function SkeletonCard() {
  return (
    <div className={styles.card}>
      <div className={styles.cardBody}>
        {/* Tags row */}
        <div className={styles.cardTags}>
          <Skeleton width={52} height={18} borderRadius={24} baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
          <Skeleton width={42} height={18} borderRadius={24} baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
        </div>
        {/* Model name */}
        <Skeleton width="65%" height={16} baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
        {/* Description */}
        <Skeleton width="90%" height={12} baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
        <Skeleton width="55%" height={12} baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
      </div>
      <div className={styles.cardFooter}>
        {/* Provider row */}
        <Skeleton width={110} height={12} baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
        {/* Forecast line */}
        <Skeleton width={150} height={11} baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
      </div>
    </div>
  );
}

/* ── Provider avatar ─────────────────────────────────────────────────── */

function ProviderAvatar({ name, gradient }: { name: string; gradient: string }) {
  const letter = (name || '?').charAt(0).toUpperCase();
  return (
    <span className={styles.providerAvatar} style={{ background: gradient }}>
      {letter}
    </span>
  );
}

/* ── Stats helpers (drawer) ──────────────────────────────────────────── */

function formatVolumeUsdc(value: number): string {
  if (value <= 0) return '$0';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}k`;
  return `$${value.toFixed(2)}`;
}

function formatReputationScore(score: number | null): string {
  if (score === null) return '—';
  return score.toFixed(1);
}

function formatLatencyMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  return `${Math.max(0, Math.round(ms))}ms`;
}

function formatCount(n: number): string {
  if (n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function sybilHasSignals(flags: string[]): boolean {
  return flags.length > 0;
}

/* ── Main component ──────────────────────────────────────────────────── */

type DiscoverWelcomeProps = {
  serviceOptions: ChatServiceOptionEntry[];
  onStartChatting: (serviceValue: string, peerId?: string) => void;
};

const MIN_CARD_WIDTH_PX = 280;
const GRID_GAP_PX = 12;
const CARD_ESTIMATED_HEIGHT_PX = 208;
const DEFAULT_PAGE_SIZE = 9;

type PaginationToken = number | 'ellipsis';

function estimatePageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let columns = 1;
  if (viewportWidth > 520) columns = 2;
  if (viewportWidth > 780) {
    const estimatedColumns = Math.floor((viewportWidth + GRID_GAP_PX) / (MIN_CARD_WIDTH_PX + GRID_GAP_PX));
    columns = Math.max(3, estimatedColumns);
  }

  const usableHeight = Math.max(360, viewportHeight - 320);
  const rows = Math.max(1, Math.floor((usableHeight + GRID_GAP_PX) / (CARD_ESTIMATED_HEIGHT_PX + GRID_GAP_PX)));
  const estimatedPageSize = Math.max(columns, columns * rows);

  if (viewportWidth > 780) {
    return Math.max(DEFAULT_PAGE_SIZE, estimatedPageSize);
  }

  return estimatedPageSize;
}

function buildPaginationTokens(page: number, totalPages: number): PaginationToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  // All branches below produce exactly 7 tokens so the pagination
  // container keeps a stable width when navigating between pages.
  if (page <= 3) {
    return [1, 2, 3, 4, 'ellipsis', totalPages - 1, totalPages];
  }

  if (page >= totalPages - 2) {
    return [1, 2, 'ellipsis', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', totalPages];
}

export function DiscoverWelcome({ serviceOptions, onStartChatting }: DiscoverWelcomeProps) {
  const snap = useUiSnapshot();
  const actions = useActions();
  const rows = snap.discoverRows;
  // When the routing priority is unset, default to 'most-trusted' for forecast computation.
  const routingPriority: RoutingPriority = snap.chatRoutingPriorityIsUnset
    ? 'most-trusted'
    : snap.chatRoutingPriority;

  // Onboarding prefs from persisted buyer state.
  const bannerDismissed = snap.onboardingBannerDismissed;
  const prefsLoaded = snap.onboardingPrefsLoaded;
  const selectedCategoryKeys = snap.onboardingSelectedCategories;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => estimatePageSize());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);

  // Stats drawer — separate from filter drawer; tracks which card is open.
  const [statsCard, setStatsCard] = useState<CardItem | null>(null);
  const [statsDrawerClosing, setStatsDrawerClosing] = useState(false);
  const statsDrawerRef = useRef<HTMLElement>(null);
  // Tracks the button that opened the stats drawer so focus can be restored on close.
  const statsDrawerOpenerRef = useRef<HTMLElement | null>(null);

  const openStatsDrawer = useCallback((item: CardItem) => {
    // Capture the currently focused element so we can restore focus on close.
    statsDrawerOpenerRef.current = document.activeElement as HTMLElement | null;
    setStatsCard(item);
  }, []);

  const closeStatsDrawer = useCallback(() => {
    setStatsDrawerClosing(true);
    window.setTimeout(() => {
      setStatsCard(null);
      setStatsDrawerClosing(false);
      // Restore focus to the affordance that opened the drawer.
      statsDrawerOpenerRef.current?.focus();
      statsDrawerOpenerRef.current = null;
    }, 200);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerClosing(true);
    window.setTimeout(() => {
      setDrawerOpen(false);
      setDrawerClosing(false);
    }, 200);
  }, []);

  const filterState = useDiscoverFilters(rows);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const updatePageSize = () => {
      setPageSize((prev) => {
        const next = estimatePageSize();
        return prev === next ? prev : next;
      });
    };

    updatePageSize();
    window.addEventListener('resize', updatePageSize);
    return () => window.removeEventListener('resize', updatePageSize);
  }, []);

  const hasActiveFilters =
    filterState.categorySet.size > 0 ||
    filterState.peerSet.size > 0 ||
    filterState.maxInputPrice < MAX_INPUT_PRICE_SLIDER_USD ||
    filterState.maxOutputPrice < MAX_OUTPUT_PRICE_SLIDER_USD ||
    filterState.minStakeUsdc > 0 ||
    filterState.minReputationScore !== DEFAULT_MIN_REPUTATION_SCORE;

  const hasNetworkData = serviceOptions.length > 0 || rows.length > 0;

  // All cards (unfiltered by search/drawer filters) — used for Recommended section.
  const allCards = useMemo(() => {
    if (rows.length > 0) {
      return buildCardsFromRows(rows, routingPriority);
    }
    return serviceOptions.length > 0 ? buildCards(serviceOptions) : [];
  }, [rows, serviceOptions, routingPriority]);

  const cards = useMemo(() => {
    if (rows.length > 0) {
      return buildCardsFromRows(filterState.sortedRows, routingPriority);
    }
    return serviceOptions.length > 0 ? buildCards(serviceOptions) : [];
  }, [rows.length, filterState.sortedRows, serviceOptions, routingPriority]);

  const filtered = useMemo(
    () => cards.filter((c) => matchesSearch(c, filterState.search)),
    [cards, filterState.search],
  );

  // Recommended cards: cards whose groupedRows contain at least one row
  // matching any of the user's selected category keys.
  const selectedCategories = useMemo(
    () => CATEGORIES.filter((cat) => selectedCategoryKeys.includes(cat.key)),
    [selectedCategoryKeys],
  );

  const recommendedCards = useMemo(() => {
    if (selectedCategories.length === 0) return [];
    return allCards.filter((card) =>
      selectedCategories.some((cat) =>
        card.groupedRows.length > 0
          ? card.groupedRows.some((r) => matchesCategory(cat, r))
          // fallback for cards built from serviceOptions (no groupedRows)
          : cat.tagMatchers.some((tag) => card.tags.includes(tag)),
      ),
    );
  }, [allCards, selectedCategories]);

  useEffect(() => { setPage(1); }, [
    filterState.search,
    filterState.categorySet,
    filterState.peerSet,
    filterState.maxInputPrice,
    filterState.maxOutputPrice,
    filterState.minStakeUsdc,
    filterState.minReputationScore,
    filterState.sortKey,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const paged = filtered.slice(pageStart, pageStart + pageSize);
  const rangeStart = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = pageStart + paged.length;
  const statusText = `${rangeStart}-${rangeEnd} of ${filtered.length} total service${filtered.length === 1 ? '' : 's'}`;

  const handleClick = useCallback(
    (value: string, peerId: string) => {
      if (value) onStartChatting(value, peerId || undefined);
    },
    [onStartChatting],
  );

  return (
    <div className={styles.discover}>
      <div className={styles.cardsScroll}>
        <div className={styles.cardsInner}>

          <div className={styles.header}>
            <h1 className={styles.heading}>
              The open market for <span className={styles.headingAccent}>AI</span> inference. No gatekeepers.
            </h1>
            <p className={styles.subtitle}>
              Pick a service to start chatting and building. Filter by what you need.
              Everything is anonymous — no account required.
            </p>
          </div>

          {/* ── Onboarding banner ────────────────────────────────────── */}
          {prefsLoaded && !bannerDismissed && (
            <OnboardingBanner
              selectedKeys={selectedCategoryKeys}
              onToggle={(key) => {
                const next = selectedCategoryKeys.includes(key)
                  ? selectedCategoryKeys.filter((k) => k !== key)
                  : [...selectedCategoryKeys, key];
                actions.setOnboardingCategories(next);
              }}
              onDismiss={() => actions.dismissOnboardingBanner()}
            />
          )}

          <div className={styles.controlsRow}>
            <div className={styles.searchBox}>
              <svg
                className={styles.searchIcon}
                width="14" height="14" viewBox="0 0 16 16" fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <circle cx="7" cy="7" r="5.25" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                className={styles.searchInput}
                value={filterState.search}
                onChange={(e) => filterState.setSearch(e.target.value)}
                placeholder="Search services, peers, categories…"
                aria-label="Search services"
              />
            </div>
            <button
              type="button"
              className={`${styles.filterTrigger}${drawerOpen && !drawerClosing ? ` ${styles.filterTriggerActive}` : ''}`}
              onClick={() => {
                if (drawerOpen && !drawerClosing) closeDrawer();
                else setDrawerOpen(true);
              }}
              aria-expanded={drawerOpen && !drawerClosing}
              aria-label={drawerOpen && !drawerClosing ? 'Close filters' : 'Open filters'}
              title="Filters"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M2.5 5.83325H5M2.5 14.1666H7.5M15 14.1666H17.5M12.5 5.83325H17.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 5.83325C5 5.05659 5 4.66825 5.12667 4.36242C5.21043 4.16007 5.33325 3.97621 5.4881 3.82135C5.64296 3.6665 5.82682 3.54368 6.02917 3.45992C6.335 3.33325 6.72333 3.33325 7.5 3.33325C8.27667 3.33325 8.665 3.33325 8.97083 3.45992C9.17318 3.54368 9.35704 3.6665 9.5119 3.82135C9.66675 3.97621 9.78957 4.16007 9.87333 4.36242C10 4.66825 10 5.05659 10 5.83325C10 6.60992 10 6.99825 9.87333 7.30409C9.78957 7.50643 9.66675 7.69029 9.5119 7.84515C9.35704 8.00001 9.17318 8.12282 8.97083 8.20658C8.665 8.33325 8.27667 8.33325 7.5 8.33325C6.72333 8.33325 6.335 8.33325 6.02917 8.20658C5.82682 8.12282 5.64296 8.00001 5.4881 7.84515C5.33325 7.69029 5.21043 7.50643 5.12667 7.30409C5 6.99825 5 6.60992 5 5.83325ZM10 14.1666C10 13.3899 10 13.0016 10.1267 12.6958C10.2104 12.4934 10.3332 12.3095 10.4881 12.1547C10.643 11.9998 10.8268 11.877 11.0292 11.7933C11.335 11.6666 11.7233 11.6666 12.5 11.6666C13.2767 11.6666 13.665 11.6666 13.9708 11.7933C14.1732 11.877 14.357 11.9998 14.5119 12.1547C14.6668 12.3095 14.7896 12.4934 14.8733 12.6958C15 13.0016 15 13.3899 15 14.1666C15 14.9433 15 15.3316 14.8733 15.6374C14.7896 15.8398 14.6668 16.0236 14.5119 16.1785C14.357 16.3333 14.1732 16.4562 13.9708 16.5399C13.665 16.6666 13.2767 16.6666 12.5 16.6666C11.7233 16.6666 11.335 16.6666 11.0292 16.5399C10.8268 16.4562 10.643 16.3333 10.4881 16.1785C10.3332 16.0236 10.2104 15.8398 10.1267 15.6374C10 15.3316 10 14.9433 10 14.1666Z" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              {hasActiveFilters && <span className={styles.filterTriggerDot} aria-hidden="true" />}
            </button>
            <select
              className={styles.sortSelect}
              value={filterState.sortKey}
              onChange={(e) => filterState.setSortKey(e.target.value as DiscoverSortKey)}
              aria-label="Sort services"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>
          {!hasNetworkData && (
            <div className={styles.loadingHint}>
              Connecting to network...
            </div>
          )}

          {/* ── Recommended section ──────────────────────────────────── */}
          {selectedCategories.length > 0 && hasNetworkData && (
            <RecommendedSection
              cards={recommendedCards}
              selectedCategories={selectedCategories}
              priority={routingPriority}
              onCardClick={handleClick}
              onOpenStats={openStatsDrawer}
              columnsStyle={Math.max(1, Math.ceil(Math.sqrt(pageSize)))}
            />
          )}

          <div className={styles.resultsArea}>
            {!hasNetworkData ? (
              <div className={styles.cardGrid} style={{ '--discover-columns': Math.max(1, Math.ceil(Math.sqrt(pageSize))) } as CSSProperties}>
                {Array.from({ length: pageSize }, (_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : filtered.length > 0 ? (
              <div className={styles.cardGrid} style={{ '--discover-columns': Math.max(1, Math.ceil(Math.sqrt(pageSize))) } as CSSProperties}>
                {paged.map((item) => (
                  <Card
                    key={item.canonicalName || item.value || item.name}
                    item={item}
                    priority={routingPriority}
                    onClick={handleClick}
                    onOpenStats={openStatsDrawer}
                  />
                ))}
              </div>
            ) : (
              <div className={styles.emptyFilter}>No services match this filter.</div>
            )}
            {hasNetworkData && filtered.length > 0 && (
              <div className={styles.paginationBar}>
                <span className={styles.statusText}>{statusText}</span>
                {totalPages > 1 && (
                  <Pagination
                    page={currentPage}
                    totalPages={totalPages}
                    onPageChange={setPage}
                  />
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {drawerOpen && (
        <aside
          className={`${styles.drawer}${drawerClosing ? ` ${styles.drawerClosing}` : ''}`}
          role="dialog"
          aria-label="Filters"
        >
          <div className={styles.drawerHeader}>
            <span className={styles.drawerTitle}>Filters</span>
            <button
              type="button"
              className={styles.drawerClose}
              onClick={closeDrawer}
              aria-label="Close filters"
            >
              ×
            </button>
          </div>
          <div className={styles.drawerBody}>
            <DiscoverFilters filters={filterState} />
            {bannerDismissed && (
              <div className={styles.drawerReopenSection}>
                <button
                  type="button"
                  className={styles.drawerReopenBtn}
                  onClick={() => {
                    actions.reopenOnboardingBanner();
                    closeDrawer();
                  }}
                >
                  Show category recommendations
                </button>
              </div>
            )}
          </div>
        </aside>
      )}

      {(statsCard !== null || statsDrawerClosing) && statsCard && (
        <StatsDrawer
          item={statsCard}
          closing={statsDrawerClosing}
          onClose={closeStatsDrawer}
          drawerRef={statsDrawerRef}
        />
      )}
    </div>
  );
}

/* ── Pagination ──────────────────────────────────────────────────────── */

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  const tokens = buildPaginationTokens(page, totalPages);
  return (
    <nav className={styles.pagination} aria-label="Pagination">
      <button
        className={styles.pageBtn}
        disabled={page === 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        aria-label="Previous page"
      >
        ‹
      </button>
      {tokens.map((token, index) => {
        if (token === 'ellipsis') {
          return (
            <span key={`ellipsis-${index}`} className={styles.pageEllipsis} aria-hidden="true">
              …
            </span>
          );
        }

        return (
          <button
            key={token}
            className={`${styles.pageBtn}${token === page ? ` ${styles.pageBtnActive}` : ''}`}
            onClick={() => onPageChange(token)}
            aria-current={token === page ? 'page' : undefined}
          >
            {token}
          </button>
        );
      })}
      <button
        className={styles.pageBtn}
        disabled={page === totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        aria-label="Next page"
      >
        ›
      </button>
    </nav>
  );
}

/* ── Card ─────────────────────────────────────────────────────────────── */

function Card({
  item,
  priority,
  onClick,
  onOpenStats,
}: {
  item: CardItem;
  priority: RoutingPriority;
  onClick: (v: string, peerId: string) => void;
  onOpenStats: (item: CardItem) => void;
}) {
  const [copied, setCopied] = useState(false);

  // Compute forecast from the full grouped rows so providerCount is accurate.
  const forecast = useMemo(
    () => computeForecast(item.groupedRows.length > 0 ? item.groupedRows : [], priority),
    [item.groupedRows, priority],
  );

  const providerCount = forecast.providerCount;
  const forecastLine = formatForecastLine(forecast.pricePer1kUsd, forecast.latencyMs, providerCount);

  // Provider display: single representative or "N providers".
  const providerName = (item.peerLabel ? getPeerDisplayName(item.peerLabel) : '') || item.provider || 'Peer';
  const providerDisplay = providerCount > 1
    ? `${providerName} +${providerCount - 1}`
    : providerName;

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const serviceKey = item.canonicalName || item.name;
  // For copy: use canonical key (peerId is empty for grouped cards).
  const copyValue = serviceKey.trim();

  const handleCopyIdentifiers = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!copyValue) return;
    navigator.clipboard.writeText(copyValue).then(() => {
      setCopied(true);
    }).catch(() => {
      // Clipboard permission can be denied; keep the card interaction unchanged.
    });
  }, [copyValue]);

  const handleOpenStats = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenStats(item);
  }, [onOpenStats, item]);

  const handleOpenStatsKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  }, []);

  return (
    <div
      className={styles.card}
      onClick={() => onClick(item.value, item.peerId)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(item.value, item.peerId); } }}
    >
      <div className={styles.cardBody}>
        {/* Tags */}
        <div className={styles.cardTags}>
          {item.tags.slice(0, MAX_VISIBLE_CARD_TAGS).map((t) => (
            <span key={t} className={styles.tag} style={getTagTint(t)}>{formatCategoryLabel(t)}</span>
          ))}
          {item.tags.length > MAX_VISIBLE_CARD_TAGS && (
            <span
              className={`${styles.tag} ${styles.tagMore}`}
              tabIndex={0}
              aria-label={`${item.tags.length - MAX_VISIBLE_CARD_TAGS} more categories: `
                + item.tags.slice(MAX_VISIBLE_CARD_TAGS).map(formatCategoryLabel).join(', ')}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              +{item.tags.length - MAX_VISIBLE_CARD_TAGS}
              <span role="tooltip" className={styles.tagMoreTooltip}>
                {item.tags.slice(MAX_VISIBLE_CARD_TAGS).map(formatCategoryLabel).join(', ')}
              </span>
            </span>
          )}
        </div>

        {/* Model name (canonical key, nicely formatted) */}
        <div className={styles.cardNameRow}>
          <div className={styles.cardName} title={serviceKey}>{item.displayName}</div>
          <button
            type="button"
            className={`${styles.copyIconButton}${copied ? ` ${styles.copyIconButtonCopied}` : ''}`}
            onClick={handleCopyIdentifiers}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label={copied ? `Copied ${copyValue}` : `Copy service key ${copyValue}`}
            title={copied ? 'Copied service key' : `Copy service key: ${copyValue}`}
          >
            <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={13} strokeWidth={1.7} />
          </button>
        </div>

        {/* Optional one-line description */}
        {item.description && (
          <div className={styles.cardDesc}>{item.description}</div>
        )}
      </div>

      {/* Footer: provider attribution + forecast */}
      <div className={styles.cardFooter}>
        <div className={styles.cardFooterMain}>
          <div className={styles.cardProvider}>
            <span className={styles.cardProviderBy}>By</span>
            <ProviderAvatar name={providerName} gradient={item.gradient} />
            <span className={styles.cardProviderName}>{providerDisplay}</span>
            {item.knownProxy && (
              <InfoTooltip
                align="left"
                content={(
                  <>
                    <strong>{item.knownProxy.label}</strong>
                    <span>{item.knownProxy.description}</span>
                  </>
                )}
              >
                <span
                  className={styles.proxyBadge}
                  tabIndex={0}
                  role="button"
                  aria-label={`${item.knownProxy.label} — ${item.knownProxy.description}`}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <HugeiconsIcon icon={ContractsIcon} size={11} strokeWidth={1.8} />
                </span>
              </InfoTooltip>
            )}
          </div>
          {forecastLine && (
            <div className={styles.cardForecast} aria-label={`Forecast: ${forecastLine}`}>
              {forecastLine}
            </div>
          )}
        </div>
        <button
          type="button"
          className={styles.cardDetailsBtn}
          onClick={handleOpenStats}
          onKeyDown={handleOpenStatsKeyDown}
          aria-label={`Show stats details for ${item.displayName}`}
          title="Show details"
        >
          <HugeiconsIcon icon={InformationCircleIcon} size={14} strokeWidth={1.7} />
        </button>
      </div>
    </div>
  );
}

/* ── StatsDrawer ─────────────────────────────────────────────────────── */

function StatsDrawer({
  item,
  closing,
  onClose,
  drawerRef,
}: {
  item: CardItem;
  closing: boolean;
  onClose: () => void;
  drawerRef: RefObject<HTMLElement>;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus management: focus first element inside when drawer opens.
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Escape key closes.
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Focus trap: keep Tab/Shift+Tab inside the drawer.
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Tab') return;
    const el = e.currentTarget;
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  // Click-outside closes.
  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const hasSybil = sybilHasSignals(item.sybilFlags);
  const anyKnownProxy = item.knownProxy !== null
    || item.groupedRows.some((r) => getKnownProxy(r.sellerContract) !== null);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`${styles.statsDrawerBackdrop}${closing ? ` ${styles.statsDrawerBackdropClosing}` : ''}`}
        onClick={handleBackdropClick}
        aria-hidden="true"
      />
      <aside
        ref={drawerRef as RefObject<HTMLElement>}
        className={`${styles.statsDrawer}${closing ? ` ${styles.statsDrawerClosing}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Stats for ${item.displayName}`}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className={styles.drawerHeader}>
          <span className={styles.drawerTitle}>{item.displayName}</span>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.drawerClose}
            onClick={onClose}
            aria-label="Close details"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className={styles.drawerBody}>
          {/* Aggregate stats section */}
          <div className={styles.statsSection}>
            <div className={styles.statsSectionTitle}>Overview</div>
            <dl className={styles.statsList}>
              <div className={styles.statsRow}>
                <dt className={styles.statsLabel}>Reputation</dt>
                <dd className={`${styles.statsValue}${item.reputationScore !== null && item.reputationScore < 40 ? ` ${styles.statsValueWarn}` : ''}`}>
                  {formatReputationScore(item.reputationScore)}
                </dd>
              </div>
              {item.sybilRisk !== null && (
                <div className={styles.statsRow}>
                  <dt className={styles.statsLabel}>Sybil risk</dt>
                  <dd className={`${styles.statsValue}${hasSybil ? ` ${styles.statsValueWarn}` : ''}`}>
                    {item.sybilRisk.toFixed(2)}
                    {hasSybil && (
                      <span className={styles.statsFlags} title={item.sybilFlags.join(', ')}>
                        {' '}({item.sybilFlags.join(', ')})
                      </span>
                    )}
                  </dd>
                </div>
              )}
              <div className={styles.statsRow}>
                <dt className={styles.statsLabel}>Channels</dt>
                <dd className={styles.statsValue}>{item.channelCount > 0 ? item.channelCount : '—'}</dd>
              </div>
              <div className={styles.statsRow}>
                <dt className={styles.statsLabel}>USDC volume</dt>
                <dd className={styles.statsValue}>{item.volumeUsdc > 0 ? formatVolumeUsdc(item.volumeUsdc) : '—'}</dd>
              </div>
              <div className={styles.statsRow}>
                <dt className={styles.statsLabel}>Requests</dt>
                <dd className={styles.statsValue}>{item.lifetimeRequests > 0 ? formatCount(item.lifetimeRequests) : '—'}</dd>
              </div>
              <div className={styles.statsRow}>
                <dt className={styles.statsLabel}>Tokens</dt>
                <dd className={styles.statsValue}>{item.lifetimeTokens > 0 ? formatCount(item.lifetimeTokens) : '—'}</dd>
              </div>
              <div className={styles.statsRow}>
                <dt className={styles.statsLabel}>Latency</dt>
                <dd className={styles.statsValue}>{formatLatencyMs(item.latencyMs)}</dd>
              </div>
              {anyKnownProxy && (
                <div className={styles.statsRow}>
                  <dt className={styles.statsLabel}>Proxy</dt>
                  <dd className={styles.statsValue}>
                    <span className={styles.statsProxyBadge}>
                      <HugeiconsIcon icon={ContractsIcon} size={11} strokeWidth={1.8} />
                      {item.knownProxy?.label ?? 'Known pool'}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Per-provider rows */}
          {item.groupedRows.length > 0 && (
            <div className={styles.statsSection}>
              <div className={styles.statsSectionTitle}>
                Providers ({item.groupedRows.length})
              </div>
              <div className={styles.providerList}>
                {item.groupedRows.map((row) => {
                  const rowProxy = getKnownProxy(row.sellerContract);
                  const rowRequests = pickRequests(row);
                  const rowTokens = pickTokens(row);
                  const rowVolumeUsdc = Number(row.onChainTotalVolumeUsdc) / 1_000_000;
                  return (
                    <div key={row.rowKey} className={styles.providerRow}>
                      <div className={styles.providerRowHeader}>
                        <ProviderAvatar
                          name={row.peerLabel || row.provider || row.peerId}
                          gradient={getPeerGradient(row.peerId || row.peerLabel || row.provider || row.serviceId)}
                        />
                        <span className={styles.providerRowName}>
                          {getPeerDisplayName(row.peerLabel) || row.provider || row.peerId.slice(0, 8)}
                        </span>
                        {rowProxy && (
                          <span
                            className={styles.providerRowProxy}
                            title={`${rowProxy.label} — ${rowProxy.description}`}
                          >
                            <HugeiconsIcon icon={ContractsIcon} size={10} strokeWidth={1.8} />
                          </span>
                        )}
                      </div>
                      <dl className={styles.providerRowStats}>
                        {row.onChainReputationScore !== null && (
                          <div className={styles.providerStatItem}>
                            <dt>Rep</dt>
                            <dd>{formatReputationScore(row.onChainReputationScore)}</dd>
                          </div>
                        )}
                        <div className={styles.providerStatItem}>
                          <dt>Ch</dt>
                          <dd>{row.onChainActiveChannelCount > 0 ? row.onChainActiveChannelCount : '—'}</dd>
                        </div>
                        {rowVolumeUsdc > 0 && (
                          <div className={styles.providerStatItem}>
                            <dt>Vol</dt>
                            <dd>{formatVolumeUsdc(rowVolumeUsdc)}</dd>
                          </div>
                        )}
                        {rowRequests > 0 && (
                          <div className={styles.providerStatItem}>
                            <dt>Req</dt>
                            <dd>{formatCount(rowRequests)}</dd>
                          </div>
                        )}
                        {rowTokens > 0 && (
                          <div className={styles.providerStatItem}>
                            <dt>Tok</dt>
                            <dd>{formatCount(rowTokens)}</dd>
                          </div>
                        )}
                        {row.latencyMs !== null && (
                          <div className={styles.providerStatItem}>
                            <dt>Lat</dt>
                            <dd>{formatLatencyMs(row.latencyMs)}</dd>
                          </div>
                        )}
                        {row.onChainSybilFlags.length > 0 && (
                          <div className={`${styles.providerStatItem} ${styles.providerStatWarn}`}>
                            <dt>Sybil</dt>
                            <dd title={row.onChainSybilFlags.join(', ')}>
                              {row.onChainSybilFlags.length} flag{row.onChainSybilFlags.length !== 1 ? 's' : ''}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

/* ── Onboarding Banner ────────────────────────────────────────────────── */

function OnboardingBanner({
  selectedKeys,
  onToggle,
  onDismiss,
}: {
  selectedKeys: string[];
  onToggle: (key: string) => void;
  onDismiss: () => void;
}) {
  return (
    <section className={styles.onboardingBanner} aria-label="Category recommendations setup">
      <div className={styles.onboardingBannerContent}>
        <h2 className={styles.onboardingBannerHeading}>What would you like to work on?</h2>
        <p className={styles.onboardingBannerSubtitle}>
          Select categories to get a personalised "Recommended for you" section at the top of the network.
        </p>
        <div className={styles.onboardingChips} role="group" aria-label="Select categories">
          {CATEGORIES.map((cat) => {
            const selected = selectedKeys.includes(cat.key);
            return (
              <button
                key={cat.key}
                type="button"
                className={`${styles.onboardingChip}${selected ? ` ${styles.onboardingChipSelected}` : ''}`}
                aria-pressed={selected}
                onClick={() => onToggle(cat.key)}
              >
                {cat.label}
                {cat.emptyState && (
                  <span className={styles.onboardingChipComingSoon} aria-label="coming soon">soon</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        className={styles.onboardingBannerDismiss}
        onClick={onDismiss}
        aria-label="Dismiss category recommendations banner"
        title="Dismiss"
      >
        ×
      </button>
    </section>
  );
}

/* ── Recommended Section ─────────────────────────────────────────────── */

function RecommendedSection({
  cards,
  selectedCategories,
  priority,
  onCardClick,
  onOpenStats,
  columnsStyle,
}: {
  cards: CardItem[];
  selectedCategories: Category[];
  priority: RoutingPriority;
  onCardClick: (v: string, peerId: string) => void;
  onOpenStats: (item: CardItem) => void;
  columnsStyle: number;
}) {
  const tagLabel = selectedCategories.map((c) => c.label).join(', ');
  return (
    <section className={styles.recommendedSection} aria-label={`Recommended for ${tagLabel}`}>
      <h2 className={styles.recommendedHeading}>
        Recommended for <span className={styles.recommendedTags}>{tagLabel}</span>
      </h2>
      {cards.length === 0 ? (
        <p className={styles.recommendedEmpty}>
          No services in your selected categories yet — check back as the network grows.
        </p>
      ) : (
        <div
          className={styles.cardGrid}
          style={{ '--discover-columns': columnsStyle } as CSSProperties}
        >
          {cards.map((item) => (
            <Card
              key={item.canonicalName || item.value || item.name}
              item={item}
              priority={priority}
              onClick={onCardClick}
              onOpenStats={onOpenStats}
            />
          ))}
        </div>
      )}
    </section>
  );
}
