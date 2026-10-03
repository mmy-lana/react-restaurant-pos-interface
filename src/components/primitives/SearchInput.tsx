import { Search, X } from 'lucide-react';
import { useCallback, useRef, type ChangeEvent, type KeyboardEvent } from 'react';
import { cn } from '@/utils/cn';
import { AudioFeedback } from '@/utils/audioFeedback';

export interface SearchInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  /** Fired on Enter; typically opens the first catalog match. */
  readonly onSubmit?: (value: string) => void;
  readonly autoFocus?: boolean;
  readonly label?: string;
  readonly testId?: string;
  readonly className?: string;
}

/**
 * Oversized catalog search field.
 *
 * The clear affordance is a full 48px tap target that sits inside the field, so
 * a cashier never has to aim at a 12px icon.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search menu, SKU or scan a barcode…',
  onSubmit,
  autoFocus = false,
  label = 'Search catalog',
  testId = 'catalog-search',
  className,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange(event.target.value);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        onSubmit?.(value);
      }
    },
    [onSubmit, value],
  );

  const handleClear = useCallback(() => {
    onChange('');
    AudioFeedback.playTick();
    inputRef.current?.focus();
  }, [onChange]);

  return (
    <div
      className={cn(
        'flex min-h-touch items-center gap-2 rounded-xl border border-line bg-surface px-3',
        'focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/25',
        className,
      )}
    >
      <Search className="h-5 w-5 shrink-0 text-ink-subtle" aria-hidden="true" />

      <input
        ref={inputRef}
        type="search"
        inputMode="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="search"
        aria-label={label}
        data-testid={`${testId}-input`}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="min-h-touch w-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-muted [&::-webkit-search-cancel-button]:appearance-none"
      />

      {value.length > 0 && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          data-testid={`${testId}-clear`}
          className="flex h-touch w-touch shrink-0 items-center justify-center rounded-lg text-ink-muted transition-transform duration-75 active:scale-95 active:bg-surface-raised active:text-ink"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}