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
 * Layout contract: the primary "ring it" target owns the whole card through a
 * stretched `after` pseudo-element, while the customize control is a real
 * sibling sitting in its own flex column. Nothing is absolutely positioned over
 * the price, and there is no nested interactive element inside the primary
 * button.
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
        'relative isolate flex min-h-[110px] flex-row items-stretch gap-2 overflow-hidden rounded-panel border p-3',
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

      <button
        type="button"
        onClick={() => onPress(item)}
        aria-disabled={isSoldOut}
        aria-label={`Ring ${item.name}, ${formatCents(item.priceInCents)}`}
        data-testid={`product-ring-${item.id}`}
        className={cn(
          'flex min-w-0 flex-1 flex-col justify-between gap-2 text-left',
          // Stretches the tap target across the full card without nesting a
          // second interactive element inside this button.
          'after:absolute after:inset-0 after:content-[""]',
          'transition-transform duration-75 active:scale-[0.99]',
          isSoldOut ? 'cursor-not-allowed' : 'active:bg-surface-raised/40',
        )}
      >
        <span className="flex flex-wrap items-start justify-between gap-2">
          <span
            className={cn(
              'line-clamp-2 text-sm font-semibold leading-snug sm:text-base',
              isSoldOut ? 'text-ink-subtle line-through' : 'text-ink',
            )}
          >
            {item.name}
          </span>

          {isSoldOut ? (
            <Badge label="86'd" tone="danger" pulse testId="tile-sold-out" />
          ) : (
            <PreparationTimer minutes={item.preparationMinutes} />
          )}
        </span>

        <span className="flex items-end justify-between gap-2">
          <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
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
          </span>

          <span className="shrink-0">
            <PriceDisplay
              amountInCents={item.priceInCents}
              size="lg"
              tone={isSoldOut ? 'muted' : 'primary'}
              testId={`product-price-${item.id}`}
            />
          </span>
        </span>
      </button>

      {showCustomize && (
        <button
          type="button"
          onClick={() => onCustomize?.(item)}
          aria-label={`Customize ${item.name}`}
          data-testid={`product-customize-${item.id}`}
          className="relative z-10 flex w-touch shrink-0 flex-col items-center justify-center gap-1 self-stretch rounded-lg border border-line bg-canvas-raised text-ink-muted transition-transform duration-75 active:scale-95 active:text-ink"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          <span className="font-mono text-[8px] uppercase leading-none tracking-widest">Edit</span>
        </button>
      )}

      {isSoldOut && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-canvas/70 font-mono text-xs uppercase tracking-widest text-danger">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          Unavailable
        </span>
      )}
    </article>
  );
}
