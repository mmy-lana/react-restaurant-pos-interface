import { useMemo, useState } from 'react';
import { CategoryPillRail } from '@/components/molecules/CategoryPill';
import { NumpadGrid } from '@/components/molecules/NumpadGrid';
import { ProductTile } from '@/components/molecules/ProductTile';
import { QuickCashButtons } from '@/components/molecules/QuickCashButtons';
import { TicketLineItem } from '@/components/molecules/TicketLineItem';
import { TouchButton } from '@/components/primitives/TouchButton';
import { usePOS } from '@/hooks/usePOS';
import type { UUID } from '@/types/pos';
import { FinancialEngine } from '@/utils/financial';
import { buildOrderLineItem } from '@/utils/orderFactory';

/**
 * Molecule reference screen, mounted at `?showcase=molecules`.
 *
 * It wires the compound components against live store data so every
 * interaction path is exercised in a real browser during verification.
 */
export function MoleculesShowcase(): React.JSX.Element {
  const { catalog, visibleItems, state, actions } = usePOS();
  const [numpadValue, setNumpadValue] = useState('0');
  const [selectedCategory, setSelectedCategory] = useState<UUID | 'all'>('all');

  const itemCounts = useMemo(() => {
    const counts: Record<UUID, number> = {};
    for (const item of catalog.menuItems) {
      counts[item.categoryId] = (counts[item.categoryId] ?? 0) + 1;
    }
    return counts;
  }, [catalog.menuItems]);

  const balanceInCents = state.currentOrder.summary.remainingBalanceInCents;
  const quickCashOptions = useMemo(
    () => FinancialEngine.computeQuickCashOptions(balanceInCents),
    [balanceInCents],
  );

  const categoryNameFor = (categoryId: UUID): string | undefined =>
    catalog.categories.find((category) => category.id === categoryId)?.name;

  const appendDigit = (digit: string): void => {
    if (digit === '.' && numpadValue.includes('.')) return;
    const next = numpadValue === '0' && digit !== '.' ? digit : `${numpadValue}${digit}`;
    setNumpadValue(next.slice(0, 9));
  };

  const demoLine = buildOrderLineItem({
    clientLineItemId: 'showcase-line-1',
    menuItemId: catalog.menuItems[0]?.id ?? 'unknown',
    name: catalog.menuItems[0]?.name ?? 'Menu Item',
    basePriceInCents: catalog.menuItems[0]?.priceInCents ?? 1250,
    taxRatePercent: catalog.menuItems[0]?.taxRatePercent ?? 8.25,
    modifiers: [
      {
        modifierGroupId: 'grp-burger-build',
        modifierGroupName: 'Burger Build',
        optionId: 'opt-build-double',
        optionName: 'Double Patty',
        priceDeltaInCents: 450,
      },
    ],
    quantity: 2,
    specialInstructions: 'No onions on the side',
  });

  return (
    <main className="scrollbar-tactical h-screen w-screen overflow-y-auto bg-canvas px-4 py-6 text-ink sm:px-8">
      <h1 className="mb-6 text-lg font-bold uppercase tracking-[0.25em] text-zinc-200">
        Compound molecules
      </h1>

      <section className="mb-8">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-ink-subtle">
          CategoryPillRail
        </h2>
        <CategoryPillRail
          categories={catalog.categories}
          selectedCategory={selectedCategory}
          onSelect={(categoryId) => {
            setSelectedCategory(categoryId);
            actions.selectCategory(categoryId);
          }}
          itemCounts={itemCounts}
          totalItemCount={catalog.menuItems.length}
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-ink-subtle">
          ProductTile
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {visibleItems.map((item) => (
            <ProductTile
              key={item.id}
              item={item}
              categoryName={categoryNameFor(item.categoryId)}
              onPress={actions.openItem}
              onCustomize={actions.customizeItem}
            />
          ))}
        </div>
      </section>

      <section className="mb-8 max-w-2xl">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-ink-subtle">
          TicketLineItem · live store rows
        </h2>

        <div data-testid="showcase-real-ticket" className="space-y-2">
          {state.currentOrder.lineItems.length === 0 ? (
            <p
              data-testid="showcase-ticket-empty"
              className="rounded-xl border border-dashed border-line px-4 py-8 text-center font-mono text-xs uppercase tracking-widest text-ink-subtle"
            >
              Ticket is empty — add a catalog item to start
            </p>
          ) : (
            state.currentOrder.lineItems.map((lineItem, index) => (
              <TicketLineItem
                key={lineItem.clientLineItemId}
                lineItem={lineItem}
                position={index + 1}
                onIncrement={actions.incrementQuantity}
                onRemove={actions.removeItem}
                onDiscount={(clientLineItemId) => actions.applyItemDiscount(clientLineItemId, 100)}
              />
            ))
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <TouchButton
            label="Add a modifier-free item"
            variant="secondary"
            onPress={() => {
              const firstItem = catalog.menuItems.find((item) => item.modifierGroups.length === 0);
              if (firstItem) actions.openItem(firstItem);
            }}
            testId="showcase-add-ticket-row"
          />
          <TouchButton
            label="Ring the same item twice"
            variant="quiet"
            onPress={() => {
              const firstItem = catalog.menuItems.find((item) => item.modifierGroups.length === 0);
              if (firstItem) actions.openItem(firstItem);
            }}
          />
        </div>

        <p
          className="mt-3 font-mono text-xs text-ink-subtle"
          data-testid="showcase-ticket-rows"
          data-row-count={state.currentOrder.lineItems.length}
        >
          ticket rows: {state.currentOrder.lineItems.length} · subtotal{' '}
          {state.currentOrder.summary.rawSubtotalInCents}¢
        </p>
      </section>

      <section className="mb-8 max-w-2xl">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-ink-subtle">
          TicketLineItem · static modifier preview
        </h2>
        <div data-testid="showcase-demo-ticket">
          <TicketLineItem
            lineItem={demoLine}
            position={1}
            onIncrement={() => undefined}
            onRemove={() => undefined}
            onEdit={() => undefined}
            onDiscount={() => undefined}
          />
        </div>
      </section>

      <section className="mb-8 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-ink-subtle">
            NumpadGrid
          </h2>
          <p className="mb-3 font-mono text-3xl tabular-nums text-primary" data-testid="showcase-numpad-value">
            {numpadValue === '' ? '0' : numpadValue}
          </p>
          <NumpadGrid
            onDigit={appendDigit}
            onBackspace={() => setNumpadValue((value) => value.slice(0, -1))}
            onClear={() => setNumpadValue('')}
          />
        </div>

        <div>
          <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-ink-subtle">
            QuickCashButtons
          </h2>
          <p className="mb-3 font-mono text-xs text-ink-subtle" data-testid="showcase-quick-cash-balance">
            balance: {balanceInCents}¢
          </p>
          <QuickCashButtons
            optionsInCents={quickCashOptions}
            balanceInCents={balanceInCents}
            onSelect={(amount) => setNumpadValue(String(Math.round(amount / 100)))}
          />
        </div>
      </section>
    </main>
  );
}