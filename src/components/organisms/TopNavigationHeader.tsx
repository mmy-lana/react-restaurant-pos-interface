import { Armchair, CircleUser, MonitorSmartphone, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, StatusDot } from '@/components/primitives/Badge';
import { TouchButton } from '@/components/primitives/TouchButton';
import { cn } from '@/utils/cn';

export interface TopNavigationHeaderProps {
  readonly storeIdentifier: string;
  readonly orderNumber: string;
  readonly orderStatus: 'draft' | 'parked' | 'sent_to_kitchen' | 'paid' | 'voided';
  readonly cashierName: string;
  readonly isSessionOpen: boolean;
  readonly tableLabel: string | null;
  readonly audioMuted: boolean;
  readonly onToggleMute: () => void;
  readonly onOpenOrderHistory: () => void;
  readonly isDegraded: boolean;
  readonly className?: string;
}

/**
 * Register header: shift identity, live connectivity, the active ticket
 * reference and the audio mute switch.
 */
export function TopNavigationHeader({
  storeIdentifier,
  orderNumber,
  orderStatus,
  cashierName,
  isSessionOpen,
  tableLabel,
  audioMuted,
  onToggleMute,
  onOpenOrderHistory,
  isDegraded,
  className,
}: TopNavigationHeaderProps) {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = (): void => setIsOnline(true);
    const handleOffline = (): void => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const connectivity = isOnline && !isDegraded ? 'online' : isOnline ? 'degraded' : 'offline';

  return (
    <header
      data-testid="top-header"
      data-connectivity={connectivity}
      data-order-number={orderNumber}
      className={cn(
        'safe-top flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface-raised px-3 py-2',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <MonitorSmartphone className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate font-mono text-[10px] uppercase tracking-widest text-ink-subtle">
            {storeIdentifier} · Terminal 01
          </p>
          <p className="truncate text-sm font-bold uppercase tracking-wide text-ink">
            {orderNumber}
          </p>
        </div>
        <Badge label={orderStatus.replace(/_/g, ' ')} tone={orderStatus === 'draft' ? 'info' : 'muted'} testId="header-order-status" />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {tableLabel && (
          <span
            data-testid="header-table"
            className="hidden items-center gap-1.5 rounded-lg border border-line bg-canvas-raised px-2.5 py-1.5 font-mono text-xs text-ink-muted sm:inline-flex"
          >
            <Armchair className="h-3.5 w-3.5" aria-hidden="true" />
            {tableLabel}
          </span>
        )}

        <span
          data-testid="header-session"
          className="hidden items-center gap-1.5 rounded-lg border border-line bg-canvas-raised px-2.5 py-1.5 font-mono text-xs text-ink-muted md:inline-flex"
        >
          <CircleUser className="h-3.5 w-3.5" aria-hidden="true" />
          {isSessionOpen ? cashierName : 'No shift'}
        </span>

        <span
          data-testid="header-connectivity"
          aria-label={connectivity === 'online' ? 'Register online' : connectivity === 'degraded' ? 'Register degraded' : 'Register offline'}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-xs uppercase',
            connectivity === 'online'
              ? 'border-success/40 bg-success/10 text-success'
              : connectivity === 'degraded'
                ? 'border-tender/40 bg-tender/10 text-tender'
                : 'border-danger/40 bg-danger/10 text-danger',
          )}
        >
          {connectivity === 'offline' ? (
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <StatusDot status={connectivity === 'online' ? 'online' : connectivity === 'degraded' ? 'degraded' : 'offline'} />
          {connectivity}
        </span>

        <TouchButton
          label={audioMuted ? 'Unmute feedback' : 'Mute feedback'}
          icon={audioMuted ? VolumeX : Volume2}
          iconOnly
          size="sm"
          variant="quiet"
          onPress={onToggleMute}
          ariaLabel={audioMuted ? 'Unmute audio feedback' : 'Mute audio feedback'}
          testId="header-mute-toggle"
        />

        <TouchButton
          label="Order history"
          size="sm"
          variant="quiet"
          onPress={onOpenOrderHistory}
          testId="header-history-button"
        />
      </div>
    </header>
  );
}