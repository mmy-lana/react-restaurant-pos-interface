import { useEffect, useState } from 'react';
import { ActiveOrderTicket } from '@/components/organisms/ActiveOrderTicket';
import { CatalogGrid } from '@/components/organisms/CatalogGrid';
import { ModifierSelectionModal } from '@/components/organisms/ModifierSelectionModal';
import { PaymentCheckoutModal } from '@/components/organisms/PaymentCheckoutModal';
import { TableManagementDrawer } from '@/components/organisms/TableManagementDrawer';
import { TopNavigationHeader } from '@/components/organisms/TopNavigationHeader';
import { usePOS } from '@/hooks/usePOS';
import type { Cents } from '@/types/pos';
import { parseMoneyInputToCents } from '@/utils/financial';

/**
 * Organism workbench, mounted at `?showcase=organisms`.
 *
 * Wires every organism to the live register store so the full transaction loop
 * (ring → configure → seat → settle → park) can be exercised before the
 * responsive shell lands.
 */
export function OrganismsShowcase(): React.JSX.Element {
  const { state, catalog, visibleItems, activeTableLabel, storeIdentifier, audioMuted, toggleAudioMute, actions } =
    usePOS();

  const [isTableDrawerOpen, setTableDrawerOpen] = useState(false);
  const [isDiscountNumpadOpen, setDiscountNumpadOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState('');

  useEffect(() => {
    if (!state.isLoading) setDiscountNumpadOpen(false);
  }, [state.isLoading]);

  const applyDiscountFromInput = (rawValue: string): void => {
    const cents: Cents = parseMoneyInputToCents(rawValue);
    if (cents > 0) actions.applyOrderDiscount(cents);
    setDiscountInput('');
    setDiscountNumpadOpen(false);
  };

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-canvas text-ink"
      data-app-state={state.isLoading ? 'loading' : state.seedError ? 'error' : 'ready'}
    >
      <TopNavigationHeader
        storeIdentifier={storeIdentifier}
        orderNumber={state.currentOrder.orderNumber}
        orderStatus={state.currentOrder.status}
        cashierName={state.activeSession?.cashierName ?? 'No shift'}
        isSessionOpen={state.activeSession !== null}
        tableLabel={activeTableLabel}
        audioMuted={audioMuted}
        onToggleMute={toggleAudioMute}
        onOpenOrderHistory={() => undefined}
        isDegraded={state.seedError !== null || state.persistenceError !== null}
      />

      {state.persistenceError && (
        <div
          data-testid="persistence-error"
          role="alert"
          className="flex shrink-0 items-center justify-between gap-3 border-b border-danger/40 bg-danger/10 px-3 py-2 font-mono text-xs text-danger"
        >
          <span className="truncate uppercase tracking-widest">{state.persistenceError}</span>
          <button
            type="button"
            onClick={actions.dismissError}
            className="min-h-11 shrink-0 rounded-lg px-3 text-[10px] font-bold uppercase tracking-widest active:scale-95"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <CatalogGrid
          categories={catalog.categories}
          items={visibleItems}
          selectedCategory={state.selectedCategory}
          searchQuery={state.searchQuery}
          onSelectCategory={actions.selectCategory}
          onSearchChange={actions.setSearchQuery}
          onOpenItem={actions.openItem}
      onCustomizeItem={actions.customizeItem}
          isLoading={catalog.isCatalogLoading}
          onResetFilters={() => {
            actions.setSearchQuery('');
            actions.selectCategory('all');
          }}
        />

        <ActiveOrderTicket
          orderNumber={state.currentOrder.orderNumber}
          status={state.currentOrder.status}
          diningOption={state.currentOrder.diningOption}
          guestCount={state.currentOrder.guestCount}
          tableLabel={activeTableLabel}
          lineItems={state.currentOrder.lineItems}
          summary={state.currentOrder.summary}
          isMutating={state.isMutating}
          onIncrementQuantity={actions.incrementQuantity}
          onRemoveItem={actions.removeItem}
          onApplyItemDiscount={actions.applyItemDiscount}
          onEditLineItem={actions.editLineItem}
          onSetDiningOption={actions.setDiningOption}
          onSetGuestCount={actions.setGuestCount}
          onOpenTablePicker={() => setTableDrawerOpen(true)}
          onOpenOrderDiscount={() => {
            setDiscountInput('');
            setDiscountNumpadOpen(true);
          }}
          onApplyOrderDiscount={actions.applyOrderDiscount}
          onCheckout={actions.openPayment}
          onParkOrder={() => void actions.parkCurrentOrder()}
        />
      </div>

      {isDiscountNumpadOpen && (
        <div
          data-testid="discount-numpad"
          className="absolute bottom-6 right-6 z-40 w-72 rounded-panel border border-line bg-surface p-3 shadow-tactical"
        >
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-ink-subtle">
            Order discount
          </p>
          <p className="mb-2 font-mono text-2xl tabular-nums text-primary" data-testid="discount-input">
            {discountInput.length > 0 ? `$${discountInput}` : '$0.00'}
          </p>
          <input
            data-testid="discount-input-field"
            inputMode="decimal"
            value={discountInput}
            onChange={(event) => setDiscountInput(event.target.value.replace(/[^0-9.]/g, ''))}
            className="mb-3 min-h-touch w-full rounded-xl border border-line bg-canvas-raised px-3 font-mono"
            aria-label="Order discount amount in dollars"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDiscountNumpadOpen(false)}
              className="min-h-touch rounded-xl border border-line text-xs font-semibold uppercase text-ink-muted active:scale-95"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="discount-apply"
              onClick={() => applyDiscountFromInput(discountInput)}
              className="min-h-touch rounded-xl bg-primary text-xs font-semibold uppercase text-primary-contrast active:scale-95"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      <ModifierSelectionModal
        isOpen={state.activeModal === 'modifier'}
        item={state.stagedMenuItem}
        draft={state.stagedModifierDraft}
        quantity={state.stagedQuantity}
        note={state.stagedNote}
        onToggleOption={actions.toggleStagedModifier}
        onQuantityChange={actions.setStagedQuantity}
        onNoteChange={actions.setStagedNote}
        onSubmit={actions.submitStagedItem}
        onClose={actions.closeModal}
      />

      <PaymentCheckoutModal
        isOpen={state.activeModal === 'payment'}
        orderId={state.currentOrder.id}
        orderNumber={state.currentOrder.orderNumber}
        summary={state.currentOrder.summary}
        payments={state.currentOrder.payments}
        isMutating={state.isMutating}
        onClose={actions.closeModal}
        onSettle={actions.settleOrder}
      />

      <TableManagementDrawer
        isOpen={isTableDrawerOpen}
        tables={catalog.tables}
        assignedTableId={state.currentOrder.tableId ?? null}
        onAssign={actions.assignTable}
        onClearTable={actions.clearTable}
        onClose={() => setTableDrawerOpen(false)}
      />
    </div>
  );
}