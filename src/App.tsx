import { AlertTriangle, Database, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { POSProvider } from '@/context/POSContext';
import { PrimitivesShowcase } from '@/components/showcase/PrimitivesShowcase';
import { MoleculesShowcase } from '@/components/showcase/MoleculesShowcase';
import { OrganismsShowcase } from '@/components/showcase/OrganismsShowcase';
import { POSLayoutShell } from '@/components/templates/POSLayoutShell';
import { usePOS } from '@/hooks/usePOS';
import { formatCents } from '@/utils/financial';

/**
 * Phase 1 boot console.
 *
 * The register renders this diagnostic surface while the storage core, catalog
 * seed and cashier shift are being established. It proves the offline data
 * layer end to end before the transactional UI is mounted in later phases.
 */
function BootConsole(): React.JSX.Element {
  const { state, catalog, activeTableLabel, storeIdentifier, appTitle, defaultTaxRatePercent, actions } =
    usePOS();

  if (state.isLoading) {
    return (
      <main
        className="flex h-screen w-screen flex-col items-center justify-center gap-6 bg-zinc-950 px-6 text-zinc-100"
        data-testid="boot-loading"
        data-app-state="loading"
      >
        <Loader2 className="h-12 w-12 animate-spin text-emerald-500" aria-hidden="true" />
        <div className="text-center">
          <h1 className="text-lg font-bold uppercase tracking-[0.2em] text-zinc-200">{appTitle}</h1>
          <p className="mt-2 font-mono text-sm text-zinc-500">Initializing offline register core…</p>
        </div>
      </main>
    );
  }

  if (state.seedError) {
    return (
      <main
        className="flex h-screen w-screen flex-col items-center justify-center gap-6 bg-zinc-950 px-6 text-zinc-100"
        data-testid="boot-error"
        data-app-state="error"
      >
        <AlertTriangle className="h-12 w-12 text-rose-500" aria-hidden="true" />
        <div className="max-w-xl text-center">
          <h1 className="text-lg font-bold uppercase tracking-[0.2em] text-rose-400">Register offline</h1>
          <p className="mt-3 font-mono text-sm leading-relaxed text-zinc-400">{state.seedError}</p>
          <p className="mt-3 text-sm text-zinc-500">
            Service can continue in degraded mode once the catalog is rebuilt.
          </p>
        </div>
        <button
          type="button"
          onClick={() => actions.retryBoot()}
          className="flex min-h-[52px] items-center gap-3 rounded-xl bg-emerald-600 px-8 text-base font-bold uppercase tracking-wider text-white active:scale-95"
        >
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
          Retry initialization
        </button>
      </main>
    );
  }

  const stats: ReadonlyArray<{ label: string; value: string }> = [
    { label: 'Store', value: storeIdentifier },
    { label: 'Order Number', value: state.currentOrder.orderNumber },
    { label: 'Categories', value: String(catalog.categories.length) },
    { label: 'Menu Items', value: String(catalog.menuItems.length) },
    { label: 'Floor Tables', value: String(catalog.tables.length) },
    { label: 'Default Tax', value: `${defaultTaxRatePercent}%` },
    {
      label: 'Shift',
      value: state.activeSession
        ? `${state.activeSession.cashierName} · float ${formatCents(state.activeSession.openingFloatInCents)}`
        : 'No active session',
    },
    {
      label: 'Available Items',
      value: String(catalog.menuItems.filter((item) => item.isAvailable).length),
    },
    { label: 'Active Table', value: activeTableLabel ?? 'Unassigned' },
  ];

  return (
    <main
      className="flex h-screen w-screen flex-col items-center justify-center gap-8 overflow-y-auto bg-zinc-950 px-6 py-12 text-zinc-100"
      data-testid="boot-ready"
      data-order-number={state.currentOrder.orderNumber}
      data-menu-count={catalog.menuItems.length}
      data-table-count={catalog.tables.length}
      data-category-count={catalog.categories.length}
    >
      <header className="flex items-center gap-4">
        <ShieldCheck className="h-10 w-10 text-emerald-500" aria-hidden="true" />
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.25em] text-zinc-100">
            POS Core Online
          </h1>
          <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">
            Phase 1 · types · storage · utilities
          </p>
        </div>
      </header>

      <section className="w-full max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
        <div className="mb-5 flex items-center gap-2 border-b border-zinc-800 pb-4">
          <Database className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          <h2 className="font-mono text-xs uppercase tracking-widest text-zinc-400">
            IndexedDB diagnostics
          </h2>
        </div>

        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-baseline justify-between gap-4 border-b border-zinc-800/60 pb-2">
              <dt className="font-mono text-xs uppercase tracking-widest text-zinc-500">{stat.label}</dt>
              <dd className="truncate font-mono text-sm font-semibold tabular-nums text-zinc-200">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="max-w-2xl text-center text-sm leading-relaxed text-zinc-500">
        IndexedDB persistence, the integer-cents financial engine, optimistic locking and the
        Web&nbsp;Audio feedback controller are mounted. Transactional screens are wired in the
        following phases.
      </p>
    </main>
  );
}

export default function App(): React.JSX.Element {
  const showcase =
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('showcase');

  const screen = (() => {
    switch (showcase) {
      case 'primitives':
        return <PrimitivesShowcase />;
      case 'molecules':
        return <MoleculesShowcase />;
      case 'organisms':
        return <OrganismsShowcase />;
      case 'boot':
        return <BootConsole />;
      default:
        return <POSLayoutShell />;
    }
  })();

  return <POSProvider>{screen}</POSProvider>;
}