import { Armchair, Receipt, ScanBarcode, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NumpadGrid } from '@/components/molecules/NumpadGrid';
import { ActiveOrderTicket } from '@/components/organisms/ActiveOrderTicket';
import { CatalogGrid } from '@/components/organisms/CatalogGrid';
import { HelpGuideModal } from '@/components/organisms/HelpGuideModal';
import { ModifierSelectionModal } from '@/components/organisms/ModifierSelectionModal';
import { OrderHistoryModal } from '@/components/organisms/OrderHistoryModal';
import { PaymentCheckoutModal } from '@/components/organisms/PaymentCheckoutModal';
import { TableManagementDrawer } from '@/components/organisms/TableManagementDrawer';
import { TopNavigationHeader } from '@/components/organisms/TopNavigationHeader';
import { ModalShell } from '@/components/primitives/ModalShell';
import { PriceDisplay } from '@/components/primitives/PriceDisplay';
import { TouchButton } from '@/components/primitives/TouchButton';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { useRegisterShortcuts } from '@/hooks/useRegisterShortcuts';
import { usePOS } from '@/hooks/usePOS';
import { AudioFeedback } from '@/utils/audioFeedback';

const SCAN_TOAST_TIMEOUT_MS = 2200;

/**
 * Responsive register shell.
 *
 * Breakpoints follow the blueprint matrix:
 * - `< 768px`  single catalog column + sticky order bar + full-screen ticket sheet
 * - `768px+`   stacked 60/40 split (tablet portrait)
 * - `1024px+`  65/35 split with a fixed, never-overlapping ticket rail
 * - `1280px+`  70/30 split with the wider catalog grid
 */
export function POSLayoutShell(): React.JSX.Element {
  const {
    state,
    catalog,
    visibleItems,
    activeTableLabel,
    storeIdentifier,
    audioMuted,
    toggleAudioMute,
    actions,
  } = usePOS();

  const [isTableDrawerOpen, setTableDrawerOpen] = useState(false);
  const [isHistoryOpen, setHistoryOpen] = useState(false);
  const [isHelpOpen, setHelpOpen] = useState(false);
  const [isTicketSheetOpen, setTicketSheetOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  const order = state.currentOrder;

  /* ------------------------------------------------------------ scanning */

  const handleScan = useCallback(
    (barcode: string) => {
      // CONC-02: a scan must never ring stock behind an open overlay. The
      // reducer state can lag the keystroke, so this guard reads the same state
      // the overlays render from and bails out before any mutation happens.
      if (state.activeModal !== 'none' || state.isNumpadOpen || state.isMutating) {
        AudioFeedback.playWarning();
        return;
      }

      const menuItem = actions.findMenuItemByBarcode(barcode);
      if (!menuItem) {
        AudioFeedback.playWarning();
        setScanMessage(`No catalog item for barcode ${barcode}`);
      } else if (!menuItem.isAvailable) {
        AudioFeedback.playWarning();
        setScanMessage(`${menuItem.name} is 86'd — not sellable`);
      } else {
        AudioFeedback.triggerBeep(900, 0.05, 'triangle');
        actions.openItem(menuItem);
        setScanMessage(`Scanned ${menuItem.name}`);
      }

      if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = window.setTimeout(() => {
        setScanMessage(null);
        scanTimerRef.current = null;
      }, SCAN_TOAST_TIMEOUT_MS);
    },
    [actions, state.activeModal, state.isMutating, state.isNumpadOpen],
  );

  useBarcodeScanner({ onScan: handleScan });

  useEffect(
    () => () => {
      if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current);
    },
    [],
  );

  /* ----------------------------------------------------------- shortcuts */

  useRegisterShortcuts({
    onSubmit: (event) => {
      // The register owns Enter outside of text fields; consuming it stops the
      // browser from synthesising a click on the focused control afterwards.
      event.preventDefault();

      if (state.activeModal === 'modifier') {
        actions.submitStagedItem();
        return;
      }
      if (state.isNumpadOpen) {
        actions.commitNumpadValue(state.numpadValue);
        return;
      }
      actions.openPayment();
    },
    onEscape: () => {
      if (state.activeModal !== 'none' || state.isNumpadOpen) {
        actions.closeModal();
        return;
      }
      if (isTicketSheetOpen) setTicketSheetOpen(false);
    },
    onFocusSearch: () => {
      document.querySelector<HTMLInputElement>('[data-testid="catalog-search-input"]')?.focus();
    },
    onNewOrder: () => {
      if (order.lineItems.length === 0) return;
      void actions.parkCurrentOrder();
    },
    onOpenTables: () => setTableDrawerOpen(true),
  });

  /* --------------------------------------------------------------- views */

  const catalogNode = (
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
  );

  const ticketNode = (extraClassName?: string) => (
    <ActiveOrderTicket
      orderNumber={order.orderNumber}
      status={order.status}
      diningOption={order.diningOption}
      guestCount={order.guestCount}
      tableLabel={activeTableLabel}
      lineItems={order.lineItems}
      summary={order.summary}
      isMutating={state.isMutating}
      onIncrementQuantity={actions.incrementQuantity}
      onRemoveItem={actions.removeItem}
      onApplyItemDiscount={actions.applyItemDiscount}
      onOpenItemDiscount={(clientLineItemId) => actions.openNumpad('item_discount', clientLineItemId)}
      onEditLineItem={actions.editLineItem}
      onSetDiningOption={actions.setDiningOption}
      onSetGuestCount={actions.setGuestCount}
      onOpenTablePicker={() => setTableDrawerOpen(true)}
      onOpenOrderDiscount={() => actions.openNumpad('order_discount')}
      onApplyOrderDiscount={actions.applyOrderDiscount}
      onCheckout={actions.openPayment}
      onParkOrder={() => void actions.parkCurrentOrder()}
      className={extraClassName}
    />
  );

  const numpadTitle =
    state.numpadMode === 'item_discount'
      ? 'Line discount'
      : state.numpadMode === 'order_discount'
        ? 'Order discount'
        : 'Quantity';

  const numpadTargetName = useMemo(() => {
    if (state.numpadMode !== 'item_discount') return null;
    return (
      order.lineItems.find((lineItem) => lineItem.clientLineItemId === state.numpadTargetLineItemId)?.name ??
      null
    );
  }, [order.lineItems, state.numpadMode, state.numpadTargetLineItemId]);

  return (
    <div
      data-testid="pos-shell"
      data-app-state={state.isLoading ? 'loading' : state.seedError ? 'error' : 'ready'}
      className="flex h-screen w-screen flex-col overflow-hidden bg-canvas text-ink"
    >
      <TopNavigationHeader
        storeIdentifier={storeIdentifier}
        orderNumber={order.orderNumber}
        orderStatus={order.status}
        cashierName={state.activeSession?.cashierName ?? 'No shift'}
        isSessionOpen={state.activeSession !== null}
        tableLabel={activeTableLabel}
        audioMuted={audioMuted}
        onToggleMute={toggleAudioMute}
        onOpenOrderHistory={() => setHistoryOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        isDegraded={state.seedError !== null || state.persistenceError !== null}
      />

      {state.persistenceError && (
        <div
          data-testid="persistence-error"
          role="alert"
          className="flex shrink-0 items-center justify-between gap-3 border-b border-danger/40 bg-danger/10 px-3 py-2"
        >
          <span className="truncate font-mono text-xs uppercase tracking-widest text-danger">
            {state.persistenceError}
          </span>
          <TouchButton
            label="Dismiss"
            size="sm"
            variant="ghost"
            onPress={actions.dismissError}
            testId="error-dismiss"
          />
        </div>
      )}

      {scanMessage && (
        <div
          data-testid="scan-toast"
          role="status"
          className="flex shrink-0 items-center gap-2 border-b border-info/40 bg-info/10 px-3 py-2 font-mono text-xs uppercase tracking-widest text-info"
        >
          <ScanBarcode className="h-4 w-4" aria-hidden="true" />
          <span className="truncate">{scanMessage}</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="flex min-h-0 flex-1 flex-col md:basis-[60%] lg:basis-[65%] xl:basis-[70%]">
          {catalogNode}
        </div>

        <div className="hidden min-h-0 md:flex md:w-[40%] lg:w-[35%] xl:w-[30%]">{ticketNode()}</div>
      </div>

      {/* Handheld order bar: the settlement surface stays within thumb reach. */}
      <div
        data-testid="mobile-order-bar"
        className="safe-bottom flex shrink-0 items-center gap-3 border-t border-line bg-surface-raised px-3 py-2 md:hidden"
      >
        <TouchButton
          label="Floor plan"
          icon={Armchair}
          iconOnly
          variant="quiet"
          onPress={() => setTableDrawerOpen(true)}
          ariaLabel="Open floor plan"
          testId="mobile-table-button"
        />

        <div className="min-w-0 flex-1">
          <p
            data-testid="mobile-bar-count"
            className="font-mono text-[10px] uppercase tracking-widest text-ink-subtle"
          >
            {order.lineItems.length} item{order.lineItems.length === 1 ? '' : 's'}
          </p>
          <PriceDisplay
            amountInCents={order.summary.remainingBalanceInCents}
            size="lg"
            tone="primary"
            testId="mobile-bar-total"
          />
        </div>

        <TouchButton
          label="View ticket"
          icon={Receipt}
          variant="primary"
          onPress={() => setTicketSheetOpen(true)}
          testId="mobile-ticket-button"
        />
      </div>

      {/* Full-screen ticket sheet for handheld viewports. */}
      {isTicketSheetOpen && (
        <div
          data-testid="ticket-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Current ticket"
          className="fixed inset-0 z-40 flex flex-col bg-surface"
        >
          <div className="safe-top flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface-raised px-3 py-2">
            <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-ink">Current ticket</h2>
            <button
              type="button"
              onClick={() => setTicketSheetOpen(false)}
              aria-label="Close ticket"
              data-testid="ticket-sheet-close"
              className="flex h-touch w-touch items-center justify-center rounded-xl border border-line bg-canvas-raised text-ink-muted transition-transform duration-75 active:scale-95 active:text-ink"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {ticketNode('flex-1')}
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
        orderId={order.id}
        orderNumber={order.orderNumber}
        summary={order.summary}
        payments={order.payments}
        isMutating={state.isMutating}
        onClose={actions.closeModal}
        onSettle={actions.settleOrder}
      />

      <HelpGuideModal isOpen={isHelpOpen} onClose={() => setHelpOpen(false)} />

      <OrderHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setHistoryOpen(false)}
        onRestore={(historyOrder) => {
          actions.restoreOrder(historyOrder);
          setHistoryOpen(false);
        }}
        currentOrderId={order.id}
      />

      <TableManagementDrawer
        isOpen={isTableDrawerOpen}
        tables={catalog.tables}
        assignedTableId={order.tableId ?? null}
        onAssign={actions.assignTable}
        onClearTable={actions.clearTable}
        onClose={() => setTableDrawerOpen(false)}
      />

      {/* Numpad-driven order / line discount workflow. */}
      <ModalShell
        isOpen={state.isNumpadOpen}
        onClose={actions.closeNumpad}
        title={numpadTitle}
        subtitle={numpadTargetName ?? order.orderNumber}
        size="sm"
        testId="numpad-modal"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <TouchButton label="Cancel" variant="ghost" onPress={actions.closeNumpad} testId="numpad-cancel" />
            <TouchButton
              label="Apply"
              variant="primary"
              onPress={() => actions.commitNumpadValue(state.numpadValue)}
              disabled={state.numpadValue.trim().length === 0}
              testId="numpad-apply"
            />
          </div>
        }
      >
        <div className="space-y-3">
          <p
            data-testid="numpad-modal-display"
            className="flex min-h-touch-lg items-center justify-end rounded-xl border border-line bg-canvas-raised px-4 font-mono text-4xl font-bold tabular-nums text-primary"
          >
            {state.numpadValue.trim().length > 0 ? `$${state.numpadValue}` : '$0.00'}
          </p>

          <NumpadGrid
            onDigit={actions.numpadAppendKey}
            onBackspace={actions.numpadBackspace}
            onClear={actions.numpadClear}
            allowDecimal={state.numpadMode !== 'item_quantity'}
          />
        </div>
      </ModalShell>
    </div>
  );
}