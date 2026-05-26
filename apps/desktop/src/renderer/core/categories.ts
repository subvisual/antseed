import type { DiscoverRow } from './state';

/**
 * A single user-facing category entry.
 *
 * `tagMatchers` is a plain string array of serviceCategories tags that qualify
 * a peer for this category. An empty array (combined with `emptyState: true`)
 * means the category is a placeholder — it will light up once providers with
 * matching tags join the network.
 *
 * The 7-category list is locked. Do not add new categories here; that change
 * belongs in the protocol-level whitelist (planned for v1.5).
 */
export type Category = {
  /** User-facing display label. */
  label: string;
  /** Stable machine-readable key used for filter state and analytics. */
  key: string;
  /**
   * Wild tags from the peer's `serviceCategories` field that qualify the peer
   * for this category. Plain strings — no regex.
   */
  tagMatchers: string[];
  /**
   * When true the category has no current matchers and should render an
   * empty-state indicator instead of a count.
   */
  emptyState?: true;
};

/**
 * Ordered list of all 7 curated user-facing categories.
 * Order matches the design spec (Code → Research → Writing → Vision →
 * Audio → Images → Uncensored).
 */
export const CATEGORIES: readonly Category[] = [
  {
    label: 'Code',
    key: 'code',
    tagMatchers: ['code', 'coding', 'agent-tools', 'builder-tools'],
  },
  {
    label: 'Research',
    key: 'research',
    tagMatchers: ['research', 'reasoning', 'web-search', 'analysis'],
  },
  {
    label: 'Writing',
    key: 'writing',
    tagMatchers: ['chat', 'writing', 'creative', 'translate', 'roleplay'],
  },
  {
    label: 'Vision',
    key: 'vision',
    tagMatchers: ['vision', 'multimodal', 'video'],
  },
  {
    label: 'Audio',
    key: 'audio',
    tagMatchers: ['audio'],
  },
  {
    label: 'Images',
    key: 'images',
    tagMatchers: [],
    emptyState: true,
  },
  {
    label: 'Uncensored',
    key: 'uncensored',
    tagMatchers: ['uncensored'],
  },
];

/**
 * Returns true when the given DiscoverRow's `categories` tags qualify it for
 * the provided category.
 *
 * A row qualifies when at least one of the category's `tagMatchers` is present
 * in the row's `categories` array (case-sensitive exact match). Categories with
 * an empty `tagMatchers` list (i.e. `emptyState: true`) never match.
 */
export function matchesCategory(category: Category, row: DiscoverRow): boolean {
  if (category.tagMatchers.length === 0) {
    return false;
  }
  return category.tagMatchers.some((tag) => row.categories.includes(tag));
}
