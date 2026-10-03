import { Delete } from 'lucide-react';
import { cn } from '@/utils/cn';
import { AudioFeedback } from '@/utils/audioFeedback';

export interface NumpadGridProps {
  readonly onDigit: (digit: string) => void;
  readonly onBackspace: () => void;
  readonly onClear: () => void;
  readonly disabled?: boolean;
  /** Appends a full-width decimal key for money entry workflows. */
  readonly allowDecimal?: boolean;
  readonly className?: string;
}

interface NumpadKey {
  readonly value: string;
  readonly label: string;
  readonly kind: 'digit' | 'decimal' | 'clear' | 'backspace';
}

const DIGIT_KEYS: readonly NumpadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((value) => ({
  value,
  label: value,
  kind: 'digit',
}));

/**
 * Twelve-key tactile keypad (0-9, clear, backspace).
 *
 * Keys are physical buttons, not a div grid, so they work with gloves, screen
 * readers and hardware barcode wedges that emit Enter to commit.
 */
export function NumpadGrid({
  onDigit,
  onBackspace,
  onClear,
  disabled = false,
  allowDecimal = false,
  className,
}: NumpadGridProps) {
  const trailingKeys: readonly NumpadKey[] = [
    { value: 'clear', label: 'Clear', kind: 'clear' },
    { value: '0', label: '0', kind: 'digit' },
    { value: 'backspace', label: 'Delete', kind: 'backspace' },
  ];

  // Twelve keys always (1-9, clear, 0, backspace). Money entry appends a single
  // full-width decimal key so the 4x3 tactical grid is never broken up.
  const keys: readonly NumpadKey[] = [...DIGIT_KEYS, ...trailingKeys];

  const handleKeyPress = (key: NumpadKey): void => {
    if (disabled) return;
    AudioFeedback.vibrate(8);

    if (key.kind === 'digit' || key.kind === 'decimal') onDigit(key.value);
    if (key.kind === 'clear') onClear();
    if (key.kind === 'backspace') onBackspace();
  };

  return (
    <div
      role="group"
      aria-label="Numeric keypad"
      data-testid="numpad-grid"
      data-key-count={allowDecimal ? keys.length + 1 : keys.length}
      className={cn('grid grid-cols-3 gap-2', className)}
    >
      {keys.map((key) => {
        const isAction = key.kind === 'clear' || key.kind === 'backspace';

        return (
          <button
            key={key.value}
            type="button"
            disabled={disabled}
            onClick={() => handleKeyPress(key)}
            aria-label={key.label}
            data-testid={`numpad-key-${key.value}`}
            data-key-kind={key.kind}
            className={cn(
              'flex min-h-touch-lg items-center justify-center rounded-xl border font-mono text-2xl font-semibold tabular-nums',
              'transition-transform duration-75 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40',
              isAction
                ? 'border-line bg-surface text-ink-muted active:bg-surface-raised active:text-ink'
                : 'border-line-strong bg-surface-raised text-ink active:bg-zinc-700',
            )}
          >
            {key.kind === 'backspace' ? <Delete className="h-6 w-6" aria-hidden="true" /> : key.label}
          </button>
        );
      })}

      {allowDecimal && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleKeyPress({ value: '.', label: 'Decimal point', kind: 'decimal' })}
          aria-label="Decimal point"
          data-testid="numpad-key-."
          data-key-kind="decimal"
          className="col-span-3 flex min-h-touch items-center justify-center rounded-xl border border-line-strong bg-surface-raised font-mono text-2xl font-semibold text-ink transition-transform duration-75 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          .
        </button>
      )}
    </div>
  );
}