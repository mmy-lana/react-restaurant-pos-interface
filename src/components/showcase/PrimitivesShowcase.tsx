import { CircleDot } from 'lucide-react';
import { useState } from 'react';
import { Badge, IconBadge, PreparationTimer, StatusDot } from '@/components/primitives/Badge';
import { ModalShell } from '@/components/primitives/ModalShell';
import { PriceDisplay } from '@/components/primitives/PriceDisplay';
import { SearchInput } from '@/components/primitives/SearchInput';
import { TouchButton } from '@/components/primitives/TouchButton';
import { usePOS } from '@/hooks/usePOS';
import { formatCents } from '@/utils/financial';

/**
 * Design-system reference screen, mounted at `?showcase=primitives`.
 *
 * It keeps the atomic layer directly inspectable (and automatable) while the
 * transactional screens keep evolving around it.
 */
export function PrimitivesShowcase(): React.JSX.Element {
  const { state } = usePOS();
  const [query, setQuery] = useState('smash');
  const [modalOpen, setModalOpen] = useState(false);
  const [lastPressed, setLastPressed] = useState<string>('none');
  const [loadingDemo, setLoadingDemo] = useState(false);

  return (
    <main className="scrollbar-tactical h-screen w-screen overflow-y-auto bg-canvas px-4 py-6 text-ink sm:px-8">
      <h1 className="mb-6 text-lg font-bold uppercase tracking-[0.25em] text-zinc-200">
        Atomic primitives
      </h1>

      <section className="mb-8">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-ink-subtle">
          TouchButton
        </h2>
        <div className="flex flex-wrap gap-3">
          <TouchButton
            label="Primary action"
            variant="primary"
            size="lg"
            onPress={() => setLastPressed('primary')}
            testId="showcase-button-primary"
          />
          <TouchButton
            label="Tender"
            variant="tender"
            onPress={() => setLastPressed('tender')}
            testId="showcase-button-tender"
          />
          <TouchButton
            label="Danger"
            variant="danger"
            onPress={() => setLastPressed('danger')}
            testId="showcase-button-danger"
          />
          <TouchButton
            label="Disabled"
            variant="secondary"
            disabled
            onPress={() => setLastPressed('disabled')}
          />
          <TouchButton
            label="Saving order"
            variant="primary"
            loading={loadingDemo}
            onPress={() => setLoadingDemo((value) => !value)}
            testId="showcase-button-loading"
          />
          <TouchButton
            label="Open modal"
            variant="secondary"
            onPress={() => setModalOpen(true)}
            testId="showcase-button-modal"
          />
        </div>
        <p className="mt-3 font-mono text-xs text-ink-subtle" data-testid="showcase-last-press">
          last press: {lastPressed}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-ink-subtle">
          PriceDisplay
        </h2>
        <div className="flex flex-wrap items-end gap-6">
          <PriceDisplay amountInCents={1450} size="md" testId="showcase-price-md" />
          <PriceDisplay amountInCents={325099} size="xl" tone="primary" />
          <PriceDisplay amountInCents={-500} size="lg" prefix="−" />
          <PriceDisplay amountInCents={0} size="sm" tone="muted" />
          <span className="font-mono text-xs text-ink-subtle">
            raw: {formatCents(1450)} / {formatCents(-500)}
          </span>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-ink-subtle">Badge</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Badge label="2 items" tone="primary" testId="showcase-badge" />
          <Badge label="86'd" tone="danger" pulse />
          <Badge label="Tender due" tone="tender" />
          <Badge label="Synced" tone="success" size="md" />
          <PreparationTimer minutes={9} />
          <PreparationTimer minutes={15} size="md" />
          <IconBadge icon={CircleDot} title="Table status" />
          <div className="flex items-center gap-4">
            <StatusDot status="available" />
            <StatusDot status="occupied" />
            <StatusDot status="reserved" />
            <StatusDot status="payment_pending" />
            <StatusDot status="online" />
          </div>
        </div>
      </section>

      <section className="mb-8 max-w-xl">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-ink-subtle">
          SearchInput
        </h2>
        <SearchInput value={query} onChange={setQuery} />
        <p className="mt-2 font-mono text-xs text-ink-subtle" data-testid="showcase-search-value">
          value: "{query}"
        </p>
      </section>

      <section>
        <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-ink-subtle">
          ModalShell
        </h2>
        <TouchButton
          label="Launch overlay"
          variant="primary"
          size="xl"
          onPress={() => setModalOpen(true)}
          testId="showcase-launch-modal"
        />
      </section>

      <ModalShell
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Modifier selection"
        subtitle={`${state.currentOrder.orderNumber} · demo overlay`}
        testId="showcase-modal"
        footer={
          <div className="flex gap-3">
            <TouchButton
              label="Cancel"
              variant="ghost"
              fullWidth
              onPress={() => setModalOpen(false)}
              testId="showcase-modal-cancel"
            />
            <TouchButton
              label="Add to ticket"
              variant="primary"
              fullWidth
              onPress={() => setModalOpen(false)}
              testId="showcase-modal-confirm"
            />
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Backdrop blur, scroll lock, Escape-to-close and a Tab focus trap are active inside this
            panel.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <TouchButton label="Option A" variant="secondary" fullWidth onPress={() => undefined} />
            <TouchButton label="Option B" variant="secondary" fullWidth onPress={() => undefined} />
            <TouchButton label="Option C" variant="secondary" fullWidth onPress={() => undefined} />
          </div>
          <PriceDisplay amountInCents={1650} size="xl" tone="tender" />
        </div>
      </ModalShell>
    </main>
  );
}