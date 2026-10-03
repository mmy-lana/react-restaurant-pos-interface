import { Layers, TriangleAlert } from 'lucide-react';
import type { MenuItemRecord } from '@/types/pos';
import { Badge, PreparationTimer } from '@/components/primitives/Badge';
import { PriceDisplay } from '@/components/primitives/PriceDisplay';
import { cn } from '@/utils/cn';
import { requiresModifierSelection } from '@/utils/modifiers';

export interface ProductTileProps {
  readonly item: MenuItemRecord;
  readonly onPress: (item: MenuItemRecord) => void;
  /** Secondary caption, normally the category name. */
  readonly categoryName?: string;
  readonly className?: string;
  readonly testId?: string;
}

/**
 * Catalog tile.
 *
 * Availability is communicated by more than colour: sold-out items are struck
 * through, labelled "86'd" and refuse to fire, so the state is still obvious
 * under glare or for a colour-blind cashier.
 */
export function ProductTile({ item, onPress, categoryName, className, testId }: ProductTileProps) {
  const isSoldOut = !item.isAvailable;
  const hasModifiers = requiresModifierSelection(item);

  return (
    <button
      type="button"
      onClick={() => onPress(item)}
      aria-disabled={isSoldOut}
      data-testid={testId ?? `product-tile-${item.id}`}
      data-sku={item.sku}
      data-available={item.isAvailable}
      data-price-cents={item.priceInCents}
      className={cn(
        'relative flex min-h-[110px] flex-col justify-between gap-2 overflow-hidden rounded-panel border p-3 text-left',
        'transition-transform duration-75 active:scale-[0.97] sm:min-h-[120px]',
        isSoldOut
          ? 'border-line bg-surface/60 opacity-70'
          : 'border-line bg-surface active:border-line-strong active:bg-surface-raised',
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
        <span className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-mono text-[10px] uppercase tracking-widest text-ink-subtle">
            {categoryName ?? item.sku}
          </span>
          {hasModifiers && !isSoldOut && (
            <Badge
              label="Options"
              tone="info"
              icon={<Layers className="h-3 w-3" aria-hidden="true" />}
              testId="tile-modifier-badge"
            />
          )}
        </span>

        <PriceDisplay amountInCents={item.priceInCents} size="lg" tone={isSoldOut ? 'muted' : 'primary'} />
      </span>

      {isSoldOut && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-canvas/70 font-mono text-xs uppercase tracking-widest text-danger">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          Unavailable
        </span>
      )}
    </button>
  );
}