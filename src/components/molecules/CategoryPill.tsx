import type { OrderCategoryRecord, UUID } from '@/types/pos';
import { cn } from '@/utils/cn';
import { resolveCategoryIcon } from '@/utils/icons';

export interface CategoryPillProps {
  readonly label: string;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
  readonly iconIdentifier?: string;
  /** Optional item counter rendered on the trailing edge of the pill. */
  readonly count?: number;
  readonly testId?: string;
}

/**
 * Single category pill. Never wraps, never shrinks, and always keeps the
 * 48px touch minimum so it survives a 3am rush on a sticky bar.
 */
export function CategoryPill({
  label,
  isSelected,
  onSelect,
  iconIdentifier,
  count,
  testId,
}: CategoryPillProps) {
  const Icon = iconIdentifier ? resolveCategoryIcon(iconIdentifier) : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      data-testid={testId}
      data-selected={isSelected}
      className={cn(
        'inline-flex min-h-touch shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2',
        'text-sm font-semibold uppercase tracking-wide transition-transform duration-75 active:scale-95',
        isSelected
          ? 'border-primary bg-primary text-primary-contrast shadow-tactical'
          : 'border-line bg-surface text-ink-muted active:bg-surface-raised active:text-ink',
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span>{label}</span>
      {typeof count === 'number' && (
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 font-mono text-[10px] leading-none',
            isSelected ? 'bg-primary-contrast/15 text-primary-contrast' : 'bg-surface-raised text-ink-subtle',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export interface CategoryPillRailProps {
  readonly categories: readonly OrderCategoryRecord[];
  readonly selectedCategory: UUID | 'all';
  readonly onSelect: (categoryId: UUID | 'all') => void;
  /** Per-category item counts keyed by category id. */
  readonly itemCounts?: Readonly<Record<UUID, number>>;
  readonly totalItemCount?: number;
  readonly className?: string;
}

/**
 * Horizontally scrollable category rail with a leading "All" pill.
 *
 * The scroller intentionally hides its scrollbar: on a touch terminal the
 * gesture is the affordance, not the indicator.
 */
export function CategoryPillRail({
  categories,
  selectedCategory,
  onSelect,
  itemCounts,
  totalItemCount,
  className,
}: CategoryPillRailProps) {
  return (
    <div
      role="tablist"
      aria-label="Menu categories"
      data-testid="category-rail"
      className={cn('overflow-x-auto scrollbar-hide flex gap-2 pb-1', className)}
    >
      <CategoryPill
        label="All Items"
        isSelected={selectedCategory === 'all'}
        onSelect={() => onSelect('all')}
        count={totalItemCount}
        testId="category-pill-all"
      />

      {categories.map((category) => (
        <CategoryPill
          key={category.id}
          label={category.name}
          iconIdentifier={category.iconIdentifier}
          isSelected={selectedCategory === category.id}
          onSelect={() => onSelect(category.id)}
          count={itemCounts?.[category.id]}
          testId={`category-pill-${category.id}`}
        />
      ))}
    </div>
  );
}