import { Layers, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import type { MenuItemRecord } from '@/types/pos';
import { Badge, PreparationTimer } from '@/components/primitives/Badge';
import { PriceDisplay } from '@/components/primitives/PriceDisplay';
import { cn } from '@/utils/cn';
import { requiresModifierSelection } from '@/utils/modifiers';
import { formatCents } from '@/utils/financial';

export interface ProductTileProps {
  readonly item: MenuItemRecord;
  /** Rings the item with its default configuration (fast path). */
  readonly onPress: (item: MenuItemRecord) => void;
  /** Opens the modifier overlay for the item. */
  readonly onCustomize?: (item: MenuItemRecord) => void;
  /** Secondary caption, normally the category name. */
  readonly categoryName?: string;
  readonly className?: string;
  readonly testId?: string;
}

/**
 * Catalog tile.
 *
 * Layout contract (single full-width column, no docked side rail):
 * - header row : title on the left, prep timer and the 44x44 customize control
 *                on the right;
 * - footer row : category and modifier badge on the left, price on the right;
 * - tap surface: one `product-ring-*` button stretched across the whole card and
 *                sitting under the content layers, so no interactive element is
 *                nested and no control can ever be drawn on top of the price.
 *
 * The content rows are `pointer-events-none` and the customize control opts back
 * in, which keeps the whole card tappable (the title is the biggest target) while
 * the customize button stays independently clickable.
 *
 * Availability is communicated by more than colour: sold-out items are struck
 * through, labelled "86'd" and refuse to fire, so the state stays obvious under
 * glare or for a colour-blind cashier.
 */
export function ProductTile({
  item,
  onPress,
  onCustomize,
  categoryName,
  className,
  testId,
}: ProductTileProps) {
  const isSoldOut = !item.isAvailable;
  const hasModifiers = item.modifierGroups.length > 0;
  const requiresChoice = requiresModifierSelection(item);
  const showCustomize = hasModifiers && !isSoldOut && Boolean(onCustomize);

  return (
    <article
      data-testid={testId ?? `product-tile-${item.id}`}
      data-sku={item.sku}
      data-available={item.isAvailable}
      data-price-cents={item.priceInCents}
      className={cn(
        'relative isolate flex min-h-[115px] flex-col justify-between overflow-hidden rounded-panel border p-3',
        'transition-transform duration-75 sm:min-h-[120px]',
        isSoldOut
          ? 'border-line bg-surface/60 opacity-70'
          : 'border-line bg-surface',
        className,
      )}
    >
      {item.colorTag && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1"
          style={{ backgroundColor: item.colorTag }}
        />
      )}

      {/* Header row: title on the left, timer and inline customize control on the right. */}
      <div className="pointer-events-none relative z-10 flex items-start justify-between gap-2">
        <span
          className={cn(
            'line-clamp-2 text-sm font-semibold leading-snug sm:text-base',
            isSoldOut ? 'text-ink-subtle line-through' : 'text-ink',
          )}
        >
          {item.name}
        </span>

        <div className="flex shrink-0 items-center gap-1.5">
          {isSoldOut ? (
            <Badge label="86'd" tone="danger" pulse testId="tile-sold-out" />
          ) : (
            <PreparationTimer minutes={item.preparationMinutes} />
          )}

          {showCustomize && (
            <button
              type="button"
              onClick={(event) => {
                // Keep the tap from also reaching the ring surface underneath.
                event.stopPropagation();
                onCustomize?.(item);
              }}
              aria-label={`Customize ${item.name}`}
              data-testid={`product-customize-${item.id}`}
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-canvas-raised text-ink-muted transition-transform duration-75 active:scale-95 active:text-ink"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Main tap surface, stretched across the entire card. */}
      <button
        type="button"
        onClick={() => onPress(item)}
        aria-disabled={isSoldOut}
        aria-label={`Ring ${item.name}, ${formatCents(item.priceInCents)}`}
        data-testid={`product-ring-${item.id}`}
        className={cn(
          'absolute inset-0 z-0 h-full w-full text-left transition-transform duration-75 active:scale-[0.99]',
          isSoldOut ? 'cursor-not-allowed' : 'cursor-pointer active:bg-surface-raised/40',
        )}
      />

      {/* Footer row: category and modifier badge on the left, price on the right. */}
      <div className="pointer-events-none relative z-10 mt-2 flex items-end justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="truncate font-mono text-[10px] uppercase tracking-widest text-ink-subtle">
            {categoryName ?? item.sku}
          </span>
          {hasModifiers && !isSoldOut && (
            <Badge
              label={requiresChoice ? 'Required' : 'Options'}
              tone={requiresChoice ? 'info' : 'muted'}
              icon={<Layers className="h-3 w-3" aria-hidden="true" />}
              testId="tile-modifier-badge"
            />
          )}
        </div>

        <div className="shrink-0">
          <PriceDisplay
            amountInCents={item.priceInCents}
            size="lg"
            tone={isSoldOut ? 'muted' : 'primary'}
            testId={`product-price-${item.id}`}
          />
        </div>
      </div>

      {isSoldOut && (
        <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-2 bg-canvas/70 font-mono text-xs uppercase tracking-widest text-danger">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          Unavailable
        </span>
      )}
    </article>
  );
}
