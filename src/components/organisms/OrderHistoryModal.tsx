import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { Badge } from '@/components/primitives/Badge';
import { ModalShell } from '@/components/primitives/ModalShell';
import { PriceDisplay } from '@/components/primitives/PriceDisplay';
import { TouchButton } from '@/components/primitives/TouchButton';
import { db } from '@/db/posDatabase';
import type { Order, OrderStatus } from '@/types/pos';
import { cn } from '@/utils/cn';
import { formatCents } from '@/utils/financial';

export interface OrderHistoryModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onRestore: (order: Order) => void;
  readonly currentOrderId: string;
}

const STATUS_TONES: Record<OrderStatus, 'success' | 'tender' | 'info' | 'muted'> = {
  paid: 'success',
  parked: 'tender',
  sent_to_kitchen: 'info',
  draft: 'info',
  voided: 'muted',
};

const RESTORABLE: readonly OrderStatus[] = ['parked', 'draft', 'sent_to_kitchen'];

/**
 * Shift history: every ticket persisted by this register, newest first.
 *
 * Parked tickets can be pulled back onto the terminal, which is how a cashier
 * resumes a tab after switching registers mid-rush.
 */
export function OrderHistoryModal({ isOpen, onClose, onRestore, currentOrderId }: OrderHistoryModalProps) {
  const orders = useLiveQuery(async () => {
    const rows = await db.orders.orderBy('createdAt').reverse().limit(50).toArray();
    return rows;
  }, []);

  const sortedOrders = useMemo(
    () => (orders ? [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []),
    [orders],
  );

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Order history"
      subtitle={sortedOrders.length > 0 ? `${sortedOrders.length} tickets in this register` : undefined}
      size="lg"
      testId="order-history-modal"
      footer={
        <TouchButton label="Close" variant="secondary" fullWidth onPress={onClose} testId="order-history-close" />
      }
    >
      {sortedOrders.length === 0 ? (
        <div
          data-testid="order-history-empty"
          className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-line px-6 text-center"
        >
          <Archive className="h-10 w-10 text-ink-subtle" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-ink">No tickets yet</p>
            <p className="mt-1 font-mono text-xs text-ink-subtle">
              Parked and settled tickets are archived here automatically.
            </p>
          </div>
        </div>
      ) : (
        <ul data-testid="order-history-list" className="space-y-2">
          {sortedOrders.map((order) => {
            const isRestorable = RESTORABLE.includes(order.status) && order.id !== currentOrderId;

            return (
              <li
                key={order.id}
                data-testid={`history-row-${order.orderNumber}`}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas-raised p-3',
                  order.id === currentOrderId && 'border-primary/60',
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-ink">{order.orderNumber}</span>
                    <Badge label={order.status.replace(/_/g, ' ')} tone={STATUS_TONES[order.status]} />
                    {order.id === currentOrderId && <Badge label="On screen" tone="primary" />}
                  </div>
                  <p className="mt-1 font-mono text-xs text-ink-subtle">
                    {order.lineItems.length} item{order.lineItems.length === 1 ? '' : 's'} ·{' '}
                    {order.diningOption.replace(/_/g, ' ')} · {new Date(order.createdAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <PriceDisplay amountInCents={order.summary.finalPayableInCents} size="md" />
                  {isRestorable && (
                    <TouchButton
                      label="Restore"
                      icon={RotateCcw}
                      size="sm"
                      variant="quiet"
                      onPress={() => onRestore(order)}
                      testId={`history-restore-${order.orderNumber}`}
                      ariaLabel={`Restore ${order.orderNumber} worth ${formatCents(order.summary.finalPayableInCents)}`}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </ModalShell>
  );
}