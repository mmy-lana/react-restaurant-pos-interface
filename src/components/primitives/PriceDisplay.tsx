import type { Cents } from '@/types/pos';
import { cn } from '@/utils/cn';
import { formatCentsPlain } from '@/utils/financial';

export type PriceTone = 'default' | 'primary' | 'muted' | 'danger' | 'tender' | 'success';
export type PriceSize = 'sm' | 'md' | 'lg' | 'xl' | 'display';

export interface PriceDisplayProps {
  readonly amountInCents: Cents;
  readonly tone?: PriceTone;
  readonly size?: PriceSize;
  /** Prefix rendered before the figure, e.g. `−` for a discount row. */
  readonly prefix?: string;
  readonly suffix?: string;
  /** Accessible caption rendered before the figure, e.g. "Subtotal". */
  readonly label?: string;
  /** Renders the cents in a smaller, muted face for scannable totals. */
  readonly emphasizeCents?: boolean;
  readonly className?: string;
  readonly testId?: string;
}

const TONE_STYLES: Record<PriceTone, string> = {
  default: 'text-ink',
  primary: 'text-primary',
  muted: 'text-ink-muted',
  danger: 'text-danger',
  tender: 'text-tender',
  success: 'text-success',
};

const SIZE_STYLES: Record<PriceSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
  xl: 'text-3xl',
  display: 'text-5xl',
};

const CENTS_SIZE_STYLES: Record<PriceSize, string> = {
  sm: 'text-[0.7em]',
  md: 'text-[0.75em]',
  lg: 'text-[0.6em]',
  xl: 'text-[0.5em]',
  display: 'text-[0.4em]',
};

/**
 * Monetary figure rendered with tabular numerals so columns of amounts stay
 * pixel-aligned while the cashier scans a ticket.
 */
export function PriceDisplay({
  amountInCents,
  tone = 'default',
  size = 'md',
  prefix,
  suffix,
  label,
  emphasizeCents = true,
  className,
  testId,
}: PriceDisplayProps) {
  const safeAmount = Number.isFinite(amountInCents) ? Math.round(amountInCents) : 0;
  const isNegative = safeAmount < 0;
  const plain = formatCentsPlain(Math.abs(safeAmount));
  const [whole, cents] = plain.split('.');

  return (
    <span
      data-testid={testId}
      data-amount-cents={safeAmount}
      data-tone={tone}
      className={cn(
        'inline-flex items-baseline font-mono font-semibold tabular-nums leading-none whitespace-nowrap',
        TONE_STYLES[tone],
        SIZE_STYLES[size],
        isNegative && 'text-danger',
        className,
      )}
    >
      {label ? <span className="sr-only">{label}: </span> : null}
      {prefix ? <span>{prefix}</span> : null}
      {isNegative ? <span aria-hidden="true">−</span> : null}
      <span>${whole}</span>
      {emphasizeCents ? (
        <span className={cn('font-medium opacity-70', CENTS_SIZE_STYLES[size])}>.{cents}</span>
      ) : (
        <span>.{cents}</span>
      )}
      {suffix ? <span>{suffix}</span> : null}
    </span>
  );
}