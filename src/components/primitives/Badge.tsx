import { Clock, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { OrderStatus, TableStatus } from '@/types/pos';
import { cn } from '@/utils/cn';

export type BadgeTone = 'neutral' | 'primary' | 'tender' | 'danger' | 'info' | 'muted' | 'success';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  readonly label: string;
  readonly tone?: BadgeTone;
  readonly size?: BadgeSize;
  readonly icon?: ReactNode;
  /** Adds a live pulsing ring for states the cashier must notice immediately. */
  readonly pulse?: boolean;
  readonly title?: string;
  readonly className?: string;
  readonly testId?: string;
}

const TONE_STYLES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-raised text-ink border-line-strong',
  primary: 'bg-primary/15 text-primary border-primary/40',
  tender: 'bg-tender/15 text-tender border-tender/40',
  danger: 'bg-danger/15 text-danger border-danger/40',
  info: 'bg-info/15 text-info border-info/40',
  muted: 'bg-surface text-ink-subtle border-line',
  success: 'bg-success/15 text-success border-success/40',
};

const SIZE_STYLES: Record<BadgeSize, string> = {
  sm: 'min-h-6 px-2 text-[10px] gap-1',
  md: 'min-h-8 px-2.5 text-xs gap-1.5',
};

/** Compact status/count chip used across the ticket, tiles and header. */
export function Badge({
  label,
  tone = 'neutral',
  size = 'sm',
  icon,
  pulse = false,
  title,
  className,
  testId,
}: BadgeProps) {
  return (
    <span
      data-testid={testId}
      data-tone={tone}
      title={title}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-md border font-semibold uppercase tracking-wide',
        TONE_STYLES[tone],
        SIZE_STYLES[size],
        pulse && 'animate-pulse',
        className,
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
}

export interface StatusDotProps {
  readonly status: TableStatus | OrderStatus | 'online' | 'offline' | 'degraded';
  readonly label?: string;
  readonly className?: string;
}

const STATUS_DOT_TONES: Record<StatusDotProps['status'], { color: string; text: string }> = {
  available: { color: 'bg-success', text: 'Available' },
  occupied: { color: 'bg-danger', text: 'Occupied' },
  reserved: { color: 'bg-tender', text: 'Reserved' },
  payment_pending: { color: 'bg-tender', text: 'Payment pending' },
  draft: { color: 'bg-info', text: 'Open' },
  parked: { color: 'bg-tender', text: 'Parked' },
  sent_to_kitchen: { color: 'bg-info', text: 'Sent to kitchen' },
  paid: { color: 'bg-success', text: 'Paid' },
  voided: { color: 'bg-zinc-500', text: 'Voided' },
  online: { color: 'bg-success', text: 'Online' },
  offline: { color: 'bg-danger', text: 'Offline' },
  degraded: { color: 'bg-tender', text: 'Degraded' },
};

/** Single-dot indicator for table / order / connectivity state. */
export function StatusDot({ status, label, className }: StatusDotProps) {
  const tone = STATUS_DOT_TONES[status];
  const text = label ?? tone.text;

  return (
    <span
      data-testid={`status-dot-${status}`}
      data-status={status}
      title={text}
      className={cn('inline-flex items-center gap-2', className)}
    >
      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', tone.color)} aria-hidden="true" />
      <span className="sr-only">{text}</span>
    </span>
  );
}

export interface PreparationTimerProps {
  readonly minutes: number;
  readonly size?: BadgeSize;
  readonly label?: string;
  readonly className?: string;
}

/** Fire icon plus the standard prep time advertised on catalog tiles. */
export function PreparationTimer({ minutes, size = 'sm', label, className }: PreparationTimerProps) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const isSlow = safeMinutes >= 12;

  return (
    <span
      data-testid="preparation-timer"
      data-minutes={safeMinutes}
      className={cn(
        'inline-flex select-none items-center justify-center gap-1 rounded-md border font-mono font-semibold uppercase',
        TONE_STYLES[isSlow ? 'tender' : 'muted'],
        SIZE_STYLES[size],
        className,
      )}
    >
      <Clock className={size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'} aria-hidden="true" />
      <span>{label ?? `${safeMinutes} min`}</span>
    </span>
  );
}

export interface IconBadgeProps {
  readonly icon: LucideIcon;
  readonly tone?: BadgeTone;
  readonly size?: BadgeSize;
  readonly title: string;
  readonly className?: string;
}

/** Icon-only chip for dense surfaces such as tile corners. */
export function IconBadge({ icon: Icon, tone = 'muted', size = 'sm', title, className }: IconBadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-md border',
        TONE_STYLES[tone],
        size === 'md' ? 'h-8 w-8' : 'h-6 w-6',
        className,
      )}
    >
      <Icon className={size === 'md' ? 'h-4 w-4' : 'h-3 w-3'} aria-hidden="true" />
      <span className="sr-only">{title}</span>
    </span>
  );
}