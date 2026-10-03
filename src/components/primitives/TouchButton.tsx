import { Loader2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { AudioFeedback } from '@/utils/audioFeedback';

export type TouchButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'tender' | 'quiet';
export type TouchButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export interface TouchButtonProps {
  /** Visible caption. Required so every control is labelled by text. */
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: TouchButtonVariant;
  readonly size?: TouchButtonSize;
  readonly disabled?: boolean;
  /** Renders a spinner, blocks presses and dims the surface. */
  readonly loading?: boolean;
  readonly fullWidth?: boolean;
  readonly icon?: LucideIcon;
  readonly trailingIcon?: LucideIcon;
  readonly iconOnly?: boolean;
  /** Accessible override, required when `iconOnly` hides the caption. */
  readonly ariaLabel?: string;
  readonly type?: 'button' | 'submit';
  /** Fires a 10ms haptic pulse on press (enabled by default). */
  readonly haptic?: boolean;
  readonly testId?: string;
  readonly className?: string;
  readonly children?: ReactNode;
}

const VARIANT_STYLES: Record<TouchButtonVariant, string> = {
  primary:
    'bg-primary text-primary-contrast active:bg-primary-strong shadow-tactical disabled:bg-primary/30',
  secondary:
    'bg-surface-raised text-ink border border-line-strong active:bg-zinc-700 disabled:text-ink-subtle',
  ghost:
    'bg-transparent text-ink-muted border border-transparent active:bg-surface-raised active:text-ink',
  danger: 'bg-danger text-white active:bg-danger-strong shadow-tactical disabled:bg-danger/30',
  tender: 'bg-tender text-zinc-950 active:bg-tender-strong shadow-tactical disabled:bg-tender/30',
  quiet: 'bg-surface text-ink-muted border border-line active:bg-surface-raised active:text-ink',
};

const SIZE_STYLES: Record<TouchButtonSize, string> = {
  sm: 'min-h-touch px-3 text-xs gap-1.5 rounded-lg',
  md: 'min-h-touch px-4 text-sm gap-2 rounded-xl',
  lg: 'min-h-touch-lg px-5 text-base gap-2.5 rounded-xl',
  xl: 'min-h-touch-xl px-6 text-lg gap-3 rounded-panel',
};

const ICON_SIZES: Record<TouchButtonSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-5 w-5',
  xl: 'h-6 w-6',
};

/**
 * Tactile register button.
 *
 * Every instance is at least 48px tall, reacts with `:active` state changes
 * instead of hover (nobody hovers in a restaurant), and pulses the haptic motor
 * when pressed.
 */
export function TouchButton({
  label,
  onPress,
  variant = 'secondary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  icon: Icon,
  trailingIcon: TrailingIcon,
  iconOnly = false,
  ariaLabel,
  type = 'button',
  haptic = true,
  testId,
  className,
  children,
}: TouchButtonProps) {
  const isInactive = disabled || loading;

  const handlePress = (): void => {
    if (isInactive) return;
    if (haptic) AudioFeedback.vibrate(10);
    onPress();
  };

  return (
    <button
      type={type}
      onClick={handlePress}
      disabled={isInactive}
      aria-label={ariaLabel ?? (iconOnly ? label : undefined)}
      aria-busy={loading || undefined}
      data-testid={testId}
      data-variant={variant}
      data-size={size}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold uppercase tracking-wide',
        'transition-transform duration-75 active:scale-95',
        'disabled:cursor-not-allowed disabled:active:scale-100',
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        iconOnly && 'aspect-square px-0',
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading ? (
        <Loader2 className={cn('animate-spin', ICON_SIZES[size])} aria-hidden="true" />
      ) : (
        Icon && <Icon className={cn('shrink-0', ICON_SIZES[size])} aria-hidden="true" />
      )}

      {children ?? (
        <span className={cn('truncate', iconOnly && 'sr-only')}>
          {loading ? 'Working' : label}
        </span>
      )}

      {!loading && TrailingIcon && (
        <TrailingIcon className={cn('shrink-0', ICON_SIZES[size])} aria-hidden="true" />
      )}
    </button>
  );
}