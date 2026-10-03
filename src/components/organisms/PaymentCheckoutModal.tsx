import { Banknote, CreditCard, Gift, Loader2, Smartphone, Split, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { NumpadGrid } from '@/components/molecules/NumpadGrid';
import { QuickCashButtons } from '@/components/molecules/QuickCashButtons';
import { Badge } from '@/components/primitives/Badge';
import { ModalShell } from '@/components/primitives/ModalShell';
import { PriceDisplay } from '@/components/primitives/PriceDisplay';
import { TouchButton } from '@/components/primitives/TouchButton';
import type { OrderSummary, PaymentMethod, PaymentRecord, UUID } from '@/types/pos';
import { cn } from '@/utils/cn';
import { FinancialEngine, formatCents, parseMoneyInputToCents } from '@/utils/financial';
import { AudioFeedback } from '@/utils/audioFeedback';

export interface PaymentCheckoutModalProps {
  readonly isOpen: boolean;
  readonly orderId: UUID;
  readonly orderNumber: string;
  readonly summary: OrderSummary;
  readonly payments: readonly PaymentRecord[];
  readonly isMutating: boolean;
  readonly onClose: () => void;
  readonly onSettle: (payment: PaymentRecord) => Promise<void> | void;
}

const METHODS: readonly {
  value: PaymentMethod;
  label: string;
  icon: typeof Banknote;
  /** Card-present tenders always carry an acquirer reference. */
  reference: boolean;
}[] = [
  { value: 'cash', label: 'Cash', icon: Banknote, reference: false },
  { value: 'credit_card', label: 'Credit', icon: CreditCard, reference: true },
  { value: 'debit_card', label: 'Debit', icon: CreditCard, reference: true },
  { value: 'gift_card', label: 'Gift', icon: Gift, reference: true },
  { value: 'digital_wallet', label: 'Wallet', icon: Smartphone, reference: true },
];

/**
 * Tender intake.
 *
 * The outstanding balance drives four calculated quick-cash buttons and the
 * change drawer. Split payments append a record per tender and only settle the
 * ticket once `remainingBalanceInCents` reaches zero — every record is produced
 * by `FinancialEngine.buildPaymentRecord`.
 */
const METHOD_REQUIRES_REFERENCE: Readonly<Record<PaymentMethod, boolean>> = {
  cash: false,
  credit_card: true,
  debit_card: true,
  gift_card: true,
  digital_wallet: true,
};

export function PaymentCheckoutModal({
  isOpen,
  orderId,
  orderNumber,
  summary,
  payments,
  isMutating,
  onClose,
  onSettle,
}: PaymentCheckoutModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [tenderInput, setTenderInput] = useState<string>('');

  const balanceInCents = summary.remainingBalanceInCents;
  const quickCashOptions = useMemo(
    () => FinancialEngine.computeQuickCashOptions(balanceInCents),
    [balanceInCents],
  );

  const tenderAmountInCents = tenderInput.trim().length > 0
    ? parseMoneyInputToCents(tenderInput)
    : balanceInCents;
  const appliedAmountInCents = Math.min(tenderAmountInCents, balanceInCents);
  const changeInCents = Math.max(0, tenderAmountInCents - appliedAmountInCents);
  const isPartial = appliedAmountInCents < balanceInCents;

  const appendDigit = (digit: string): void => {
    AudioFeedback.vibrate(8);
    setTenderInput((current) => {
      if (digit === '.' && current.includes('.')) return current;
      if (current.includes('.') && current.split('.')[1]?.length >= 2) return current;
      const next = (current === '' || current === '0') && digit !== '.' ? digit : `${current}${digit}`;
      return next.slice(0, 9);
    });
  };

  const handleSettle = async (): Promise<void> => {
    if (balanceInCents <= 0 || appliedAmountInCents <= 0) {
      AudioFeedback.playWarning();
      return;
    }

    const payment = FinancialEngine.buildPaymentRecord(
      orderId,
      method,
      appliedAmountInCents,
      tenderAmountInCents,
      METHOD_REQUIRES_REFERENCE[method] ? buildTransactionReference() : undefined,
    );

    await onSettle(payment);
    setTenderInput('');
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Checkout"
      subtitle={orderNumber}
      size="lg"
      preventClose={isMutating}
      testId="payment-modal"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-3 sm:justify-start">
            <span className="font-mono text-xs uppercase tracking-widest text-ink-muted">Change due</span>
            <PriceDisplay amountInCents={changeInCents} size="xl" tone="tender" testId="payment-change" />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:w-auto">
            <TouchButton label="Cancel" variant="ghost" onPress={onClose} disabled={isMutating} testId="payment-cancel" />
            <TouchButton
              label={isPartial ? `Apply ${formatCents(appliedAmountInCents)}` : 'Settle ticket'}
              variant={isPartial ? 'tender' : 'primary'}
              onPress={() => void handleSettle()}
              loading={isMutating}
              disabled={appliedAmountInCents <= 0}
              testId="payment-settle"
            />
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 rounded-panel border border-line bg-canvas-raised p-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-ink-subtle">Balance due</p>
            <PriceDisplay amountInCents={balanceInCents} size="xl" tone="primary" testId="payment-balance" />
          </div>
          <div className="text-right">
            <p className="font-mono text-[10px] uppercase tracking-widest text-ink-subtle">Tendered</p>
            <PriceDisplay amountInCents={appliedAmountInCents} size="xl" testId="payment-applied" />
          </div>
        </div>

        {payments.length > 0 && (
          <div className="rounded-panel border border-line bg-canvas-raised p-3" data-testid="payment-history">
            <div className="flex items-center gap-2">
              <Split className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
              <span className="font-mono text-xs uppercase tracking-widest text-ink-muted">
                Split tender ({payments.length})
              </span>
            </div>
            <ul className="mt-2 space-y-1">
              {payments.map((payment) => (
                <li
                  key={payment.id}
                  data-testid={`payment-record-${payment.id}`}
                  className="flex items-center justify-between gap-2 font-mono text-xs text-ink-muted"
                >
                  <span className="uppercase tracking-widest">{payment.method.replace('_', ' ')}</span>
                  <span className="tabular-nums">
                    {formatCents(payment.amountInCents)}
                    {payment.changeReturnedInCents > 0
                      ? ` · change ${formatCents(payment.changeReturnedInCents)}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-ink-muted">Tender method</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" data-testid="payment-methods">
            {METHODS.map((entry) => {
              const Icon = entry.icon;
              const isActive = method === entry.value;

              return (
                <button
                  key={entry.value}
                  type="button"
                  onClick={() => {
                    setMethod(entry.value);
                    AudioFeedback.playTick();
                  }}
                  aria-pressed={isActive}
                  data-testid={`payment-method-${entry.value}`}
                  data-active={isActive}
                  className={cn(
                    'flex min-h-touch flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2',
                    'text-[10px] font-bold uppercase tracking-wide transition-transform duration-75 active:scale-95',
                    isActive
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-line bg-surface text-ink-muted active:bg-surface-raised active:text-ink',
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {entry.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-widest text-ink-muted">Quick tender</p>
            <QuickCashButtons
              optionsInCents={quickCashOptions}
              balanceInCents={balanceInCents}
              onSelect={(amountInCents) => {
                setTenderInput((amountInCents / 100).toFixed(2));
                AudioFeedback.triggerBeep(760, 0.05, 'triangle');
              }}
              disabled={balanceInCents <= 0}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-xs uppercase tracking-widest text-ink-muted">Custom amount</p>
              {isMutating && <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />}
            </div>

            <div
              data-testid="payment-numpad-display"
              className="flex min-h-touch items-center justify-end rounded-xl border border-line bg-canvas-raised px-3"
            >
              <span className="font-mono text-3xl font-bold tabular-nums text-primary">
                {tenderInput.trim().length > 0 ? `$${tenderInput}` : '—'}
              </span>
            </div>

            <NumpadGrid
              onDigit={appendDigit}
              onBackspace={() => setTenderInput((current) => current.slice(0, -1))}
              onClear={() => setTenderInput('')}
              allowDecimal
              disabled={isMutating}
            />
          </div>
        </div>

        {tenderAmountInCents < balanceInCents && (
          <p
            data-testid="payment-warning"
            role="status"
            className="flex items-center gap-2 rounded-xl border border-tender/40 bg-tender/10 px-3 py-2 font-mono text-xs uppercase tracking-widest text-tender"
          >
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            Below balance — this will be recorded as a split tender
          </p>
        )}

        {balanceInCents <= 0 && (
          <Badge label="Ticket fully settled" tone="success" size="md" testId="payment-settled-badge" />
        )}
      </div>
    </ModalShell>
  );
}

/** Simulated acquirer reference for card-present tenders. */
function buildTransactionReference(): string {
  return `AUTH-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}