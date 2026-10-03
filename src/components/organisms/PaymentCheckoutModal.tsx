import { Banknote, CreditCard, Gift, Loader2, Smartphone, Split, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { NumpadGrid } from '@/components/molecules/NumpadGrid';
import { QuickCashButtons } from '@/components/molecules/QuickCashButtons';
import { Badge } from '@/components/primitives/Badge';
import { ModalShell } from '@/components/primitives/ModalShell';
import { PriceDisplay } from '@/components/primitives/PriceDisplay';
import { TouchButton } from '@/components/primitives/TouchButton';
import type { OrderSummary, PaymentMethod, PaymentRecord, UUID } from '@/types/pos';
import { cn } from '@/utils/cn';
import {
  FinancialEngine,
  createTransactionReference,
  formatCents,
  formatCentsPlain,
  parseMoneyInputToCents,
} from '@/utils/financial';
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

const METHOD_LABEL: Readonly<Record<PaymentMethod, string>> = {
  cash: 'Cash',
  credit_card: 'Credit card',
  debit_card: 'Debit card',
  gift_card: 'Gift card',
  digital_wallet: 'Wallet',
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
  /** Physical cash handed over (cash tenders only). */
  const [tenderInput, setTenderInput] = useState<string>('');
  /** Portion of that cash the cashier wants applied to the balance. */
  const [applyInput, setApplyInput] = useState<string>('');
  /** Which value the shared keypad is currently editing. */
  const [entryTarget, setEntryTarget] = useState<'tender' | 'apply'>('tender');

  // Every checkout session opens clean: cash method, empty keypad, no leftover
  // split entry from the previous ticket.
  useEffect(() => {
    if (!isOpen) return;
    setMethod('cash');
    setTenderInput('');
    setApplyInput('');
    setEntryTarget('tender');
  }, [isOpen, orderId]);

  const balanceInCents = summary.remainingBalanceInCents;
  const quickCashOptions = useMemo(
    () => FinancialEngine.computeQuickCashOptions(balanceInCents),
    [balanceInCents],
  );

  const isCashTender = method === 'cash';
  const hasTypedAmount = tenderInput.trim().length > 0;
  const hasApplyAmount = applyInput.trim().length > 0;
  const parsedAmountInCents = hasTypedAmount ? parseMoneyInputToCents(tenderInput) : 0;
  const parsedApplyInCents = hasApplyAmount ? parseMoneyInputToCents(applyInput) : 0;

  /**
   * Cash: the first entry is the money physically handed over, which may exceed
   * the balance. The second entry designates how much of that cash is applied,
   * so a $50 bill against a $20 partial payment books $20 and returns $30
   * instead of silently consuming the whole bill.
   *
   * Every other method settles exactly what is owed: the keypad is the amount
   * applied toward the balance and change is always $0.00 — over-tendering at a
   * terminal would just fabricate money.
   */
  const tenderAmountInCents = isCashTender
    ? hasTypedAmount
      ? parsedAmountInCents
      : balanceInCents
    : 0;
  const maxApplicableInCents = isCashTender
    ? Math.min(tenderAmountInCents, balanceInCents)
    : balanceInCents;
  const canSplitCash = isCashTender && tenderAmountInCents > balanceInCents && balanceInCents > 0;
  const appliedAmountInCents = isCashTender
    ? hasApplyAmount
      ? Math.min(parsedApplyInCents, maxApplicableInCents)
      : maxApplicableInCents
    : hasTypedAmount
      ? Math.min(parsedAmountInCents, balanceInCents)
      : balanceInCents;
  const changeInCents = isCashTender ? Math.max(0, tenderAmountInCents - appliedAmountInCents) : 0;
  const isPartial = appliedAmountInCents < balanceInCents;
  const typedAmountExceedsBalance =
    hasTypedAmount && parsedAmountInCents > balanceInCents && !isCashTender;
  const isEditingAppliedAmount = entryTarget === 'apply' && canSplitCash;

  const appendDigit = (digit: string): void => {
    AudioFeedback.vibrate(8);

    const updateEntry = (current: string): string => {
      if (digit === '.' && current.includes('.')) return current;
      if (current.includes('.') && current.split('.')[1]?.length >= 2) return current;
      const next = (current === '' || current === '0') && digit !== '.' ? digit : `${current}${digit}`;
      return next.slice(0, 9);
    };

    if (isEditingAppliedAmount) setApplyInput(updateEntry);
    else setTenderInput(updateEntry);
  };

  const backspaceEntry = (): void => {
    if (isEditingAppliedAmount) setApplyInput((current) => current.slice(0, -1));
    else setTenderInput((current) => current.slice(0, -1));
  };

  const clearEntry = (): void => {
    if (isEditingAppliedAmount) setApplyInput('');
    else setTenderInput('');
  };

  const handleSettle = async (): Promise<void> => {
    // FIN-01: the tender is refused while a commit owns the register, and while
    // there is nothing legitimate to book. A double tap (or a wedged keyboard
    // wedge repeating the key) must never post the same tender twice.
    if (isMutating || balanceInCents <= 0 || appliedAmountInCents <= 0) {
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
    setApplyInput('');
    setEntryTarget('tender');
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
              label={
                changeInCents > 0
                  ? `Apply ${formatCents(appliedAmountInCents)}`
                  : isPartial
                    ? `Apply ${formatCents(appliedAmountInCents)}`
                    : 'Settle ticket'
              }
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
                    if (entry.value !== method) {
                      setTenderInput('');
                      setApplyInput('');
                      setEntryTarget('tender');
                    }
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
                setApplyInput('');
                setEntryTarget('tender');
                AudioFeedback.triggerBeep(760, 0.05, 'triangle');
              }}
              disabled={balanceInCents <= 0 || !isCashTender}
            />

            {!isCashTender && (
              <p
                data-testid="payment-non-cash-notice"
                className="mt-2 rounded-xl border border-line bg-surface px-3 py-2 font-mono text-[10px] uppercase leading-relaxed tracking-widest text-ink-subtle"
              >
                {METHOD_LABEL[method].toLowerCase()} settles the exact balance — cash tendering and
                change are disabled
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-xs uppercase tracking-widest text-ink-muted">
                {isCashTender
                  ? isEditingAppliedAmount
                    ? 'Apply to balance'
                    : 'Cash tendered'
                  : 'Amount to apply'}
              </p>
              {isMutating && <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />}
            </div>

            {/* FIN-03: a single keypad edits either the physical cash or the
                portion applied to the balance. Splitting is only offered when
                the cash actually exceeds what is owed. */}
            {isCashTender && (
              <div
                role="radiogroup"
                aria-label="Amount entry target"
                data-testid="payment-entry-targets"
                className="grid grid-cols-2 gap-2"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={!isEditingAppliedAmount}
                  onClick={() => {
                    setEntryTarget('tender');
                    AudioFeedback.playTick();
                  }}
                  data-testid="payment-entry-target-tender"
                  data-active={!isEditingAppliedAmount}
                  className={cn(
                    'min-h-touch rounded-xl border px-2 text-[10px] font-bold uppercase tracking-widest transition-transform duration-75 active:scale-95',
                    !isEditingAppliedAmount
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-line bg-surface text-ink-muted active:bg-surface-raised active:text-ink',
                  )}
                >
                  Cash {formatCents(tenderAmountInCents)}
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={isEditingAppliedAmount}
                  disabled={!canSplitCash}
                  onClick={() => {
                    setEntryTarget('apply');
                    setApplyInput('');
                    AudioFeedback.playTick();
                  }}
                  data-testid="payment-entry-target-apply"
                  data-active={isEditingAppliedAmount}
                  className={cn(
                    'min-h-touch rounded-xl border px-2 text-[10px] font-bold uppercase tracking-widest transition-transform duration-75 active:scale-95',
                    isEditingAppliedAmount
                      ? 'border-primary bg-primary/15 text-primary'
                      : canSplitCash
                        ? 'border-line bg-surface text-ink-muted active:bg-surface-raised active:text-ink'
                        : 'border-line bg-surface text-ink-subtle opacity-50',
                  )}
                >
                  Apply {formatCents(appliedAmountInCents)}
                </button>
              </div>
            )}

            <div
              data-testid="payment-numpad-display"
              className="flex min-h-touch items-center justify-end rounded-xl border border-line bg-canvas-raised px-3"
            >
              <span
                data-testid="payment-numpad-amount"
                className="font-mono text-3xl font-bold tabular-nums text-primary"
              >
                {isCashTender
                  ? isEditingAppliedAmount
                    ? `$${hasApplyAmount ? applyInput : formatCentsPlain(maxApplicableInCents)}`
                    : hasTypedAmount
                      ? `$${tenderInput}`
                      : '—'
                  : hasTypedAmount
                    ? `$${formatCentsPlain(appliedAmountInCents)}`
                    : `$${formatCentsPlain(balanceInCents)}`}
              </span>
            </div>

            {canSplitCash && (
              <p
                data-testid="payment-split-hint"
                className="rounded-xl border border-tender/40 bg-tender/10 px-3 py-2 font-mono text-[10px] uppercase leading-relaxed tracking-widest text-tender"
              >
                Cash tendered exceeds the balance — switch to "Apply" to book part of it and return
                the rest as change
              </p>
            )}

            <NumpadGrid
              onDigit={appendDigit}
              onBackspace={backspaceEntry}
              onClear={clearEntry}
              allowDecimal
              disabled={isMutating}
            />
          </div>
        </div>

        {(isCashTender ? tenderAmountInCents < balanceInCents : appliedAmountInCents < balanceInCents) && (
          <p
            data-testid="payment-warning"
            role="status"
            className="flex items-center gap-2 rounded-xl border border-tender/40 bg-tender/10 px-3 py-2 font-mono text-xs uppercase tracking-widest text-tender"
          >
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            Below balance — this will be recorded as a split tender
          </p>
        )}

        {typedAmountExceedsBalance && (
          <p
            data-testid="payment-over-tender-notice"
            role="status"
            className="flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-xs uppercase tracking-widest text-danger"
          >
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            {METHOD_LABEL[method]} applies to the balance only — no change is returned
          </p>
        )}

        {balanceInCents <= 0 && (
          <Badge label="Ticket fully settled" tone="success" size="md" testId="payment-settled-badge" />
        )}
      </div>
    </ModalShell>
  );
}

/** Acquirer-style reference for card-present tenders, backed by Web Crypto. */
function buildTransactionReference(): string {
  return createTransactionReference('AUTH');
}