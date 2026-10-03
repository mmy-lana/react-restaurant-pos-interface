import { Banknote } from 'lucide-react';
import type { Cents } from '@/types/pos';
import { cn } from '@/utils/cn';
import { formatCents } from '@/utils/financial';

export interface QuickCashButtonsProps {
  /** Up to four pre-computed tender amounts, normally from `computeQuickCashOptions`. */
  readonly optionsInCents: readonly Cents[];
  /** Outstanding balance; used to show the change each button yields. */
  readonly balanceInCents: Cents;
  readonly onSelect: (amountInCents: Cents) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

/**
 * 2x2 grid of tactical quick-tender buttons.
 *
 * Every button shows both the cash the guest hands over and the change due, so
 * the cashier never has to compute in their head during a rush.
 */
export function QuickCashButtons({
  optionsInCents,
  balanceInCents,
  onSelect,
  disabled = false,
  className,
}: QuickCashButtonsProps) {
  const options = optionsInCents.slice(0, 4);

  // A settled balance has nothing to tender, so the grid collapses into an
  // explicit empty state instead of offering a misleading $0.00 button.
  if (balanceInCents <= 0 || options.length === 0) {
    return (
      <p
        data-testid="quick-cash-empty"
        className={cn(
          'rounded-xl border border-dashed border-line bg-surface/50 px-3 py-4 text-center font-mono text-xs uppercase tracking-widest text-ink-subtle',
          className,
        )}
      >
        {balanceInCents <= 0 ? 'Balance settled — no tender due' : 'No tender options available'}
      </p>
    );
  }

  return (
    <div
      role="group"
      aria-label="Quick cash tender options"
      data-testid="quick-cash-grid"
      data-option-count={options.length}
      className={cn('grid grid-cols-2 gap-2', className)}
    >
      {options.map((amountInCents, index) => {
        const changeInCents = Math.max(0, amountInCents - balanceInCents);
        const isExact = changeInCents === 0;

        return (
          <button
            key={`${amountInCents}-${index}`}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(amountInCents)}
            aria-label={`Tender ${formatCents(amountInCents)}, change ${formatCents(changeInCents)}`}
            data-testid={`quick-cash-option-${index}`}
            data-tender-cents={amountInCents}
            data-change-cents={changeInCents}
            className={cn(
              'flex min-h-touch-lg flex-col items-center justify-center gap-0.5 rounded-xl border px-3 py-2',
              'transition-transform duration-75 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40',
              isExact
                ? 'border-primary/50 bg-primary/15 text-primary'
                : 'border-line-strong bg-surface-raised text-ink active:bg-zinc-700',
            )}
          >
            <span className="flex items-center gap-1.5 font-mono text-lg font-bold tabular-nums">
              {isExact && <Banknote className="h-4 w-4" aria-hidden="true" />}
              {formatCents(amountInCents)}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest opacity-80">
              {isExact ? 'exact' : `change ${formatCents(changeInCents)}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}