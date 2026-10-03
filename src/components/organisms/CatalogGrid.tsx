import { PackageOpen, SearchX } from 'lucide-react';
import { useMemo } from 'react';
import { CategoryPillRail } from '@/components/molecules/CategoryPill';
import { ProductTile } from '@/components/molecules/ProductTile';
import { SearchInput } from '@/components/primitives/SearchInput';
import { TouchButton } from '@/components/primitives/TouchButton';
import type { MenuItemRecord, OrderCategoryRecord, UUID } from '@/types/pos';

export interface CatalogGridProps {
  readonly categories: readonly OrderCategoryRecord[];
  readonly items: readonly MenuItemRecord[];
  readonly selectedCategory: UUID | 'all';
  readonly searchQuery: string;
  readonly onSelectCategory: (categoryId: UUID | 'all') => void;
  readonly onSearchChange: (query: string) => void;
  readonly onOpenItem: (item: MenuItemRecord) => void;
  readonly isLoading?: boolean;
  /** Fired by the empty-state CTA to reset both filters at once. */
  readonly onResetFilters?: () => void;
}

/**
 * Responsive product surface: search + category rail on top, adaptive tile grid
 * below. Column counts follow the blueprint breakpoint matrix — 2 columns on
 * handhelds, up to 5 on a desktop POS station.
 */
export function CatalogGrid({
  categories,
  items,
  selectedCategory,
  searchQuery,
  onSelectCategory,
  onSearchChange,
  onOpenItem,
  isLoading = false,
  onResetFilters,
}: CatalogGridProps) {
  const categoryNameById = useMemo(() => {
    const lookup: Record<string, string> = {};
    for (const category of categories) lookup[category.id] = category.name;
    return lookup;
  }, [categories]);

  const itemCounts = useMemo(() => {
    const counts: Record<UUID, number> = {};
    for (const item of items) counts[item.categoryId] = (counts[item.categoryId] ?? 0) + 1;
    return counts;
  }, [items]);

  const hasActiveFilters = searchQuery.trim().length > 0 || selectedCategory !== 'all';

  return (
    <section
      data-testid="catalog-grid"
      data-item-count={items.length}
      data-selected-category={selectedCategory}
      className="flex min-h-0 flex-1 flex-col bg-canvas"
    >
      <div className="shrink-0 space-y-3 border-b border-line bg-surface/40 p-3">
        <SearchInput value={searchQuery} onChange={onSearchChange} />

        <CategoryPillRail
          categories={categories}
          selectedCategory={selectedCategory}
          onSelect={onSelectCategory}
          itemCounts={itemCounts}
          totalItemCount={items.length}
        />
      </div>

      <div className="scrollbar-tactical min-h-0 flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div
            data-testid="catalog-skeleton"
            aria-busy="true"
            aria-label="Loading catalog"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            {Array.from({ length: 10 }, (_, index) => (
              <div
                key={index}
                className="min-h-[110px] animate-pulse rounded-panel border border-line bg-surface/60 sm:min-h-[120px]"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div
            data-testid="catalog-empty"
            className="flex h-full min-h-[240px] flex-col items-center justify-center gap-4 rounded-panel border border-dashed border-line px-6 text-center"
          >
            {hasActiveFilters ? (
              <SearchX className="h-10 w-10 text-ink-subtle" aria-hidden="true" />
            ) : (
              <PackageOpen className="h-10 w-10 text-ink-subtle" aria-hidden="true" />
            )}

            <div>
              <p className="text-base font-semibold uppercase tracking-wide text-ink">
                {hasActiveFilters ? 'No menu items match' : 'Catalog is empty'}
              </p>
              <p className="mt-1 max-w-sm font-mono text-xs text-ink-subtle">
                {hasActiveFilters
                  ? `Nothing matched "${searchQuery || 'the selected category'}". Adjust the search or choose another category.`
                  : 'No menu items were loaded into the register database.'}
              </p>
            </div>

            {hasActiveFilters && onResetFilters && (
              <TouchButton
                label="Reset filters"
                variant="secondary"
                onPress={onResetFilters}
                testId="catalog-reset-filters"
              />
            )}
          </div>
        ) : (
          <div
            data-testid="catalog-tiles"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            {items.map((item) => (
              <ProductTile
                key={item.id}
                item={item}
                categoryName={categoryNameById[item.categoryId]}
                onPress={onOpenItem}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}