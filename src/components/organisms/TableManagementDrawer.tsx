import { Armchair, Users, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Badge, StatusDot } from '@/components/primitives/Badge';
import { TouchButton } from '@/components/primitives/TouchButton';
import type { DiningTableRecord, UUID } from '@/types/pos';
import { cn } from '@/utils/cn';
import { AudioFeedback } from '@/utils/audioFeedback';

export interface TableManagementDrawerProps {
  readonly isOpen: boolean;
  readonly tables: readonly DiningTableRecord[];
  readonly assignedTableId: UUID | null;
  readonly onAssign: (tableId: UUID, label: string) => void;
  /** Detaches the ticket from its table (takeout / delivery). */
  readonly onClearTable: () => void;
  readonly onClose: () => void;
}

const SECTION_LABELS: Record<DiningTableRecord['section'], string> = {
  main_floor: 'Main Floor',
  patio: 'Patio',
  bar: 'Bar',
};

const SECTION_ORDER: readonly DiningTableRecord['section'][] = ['main_floor', 'patio', 'bar'];

const STATUS_LABELS: Record<DiningTableRecord['status'], { label: string; tone: 'success' | 'danger' | 'tender' | 'info' }> = {
  available: { label: 'Open', tone: 'success' },
  occupied: { label: 'Seated', tone: 'danger' },
  reserved: { label: 'Reserved', tone: 'tender' },
  payment_pending: { label: 'Paying', tone: 'info' },
};

/**
 * Floor-plan drawer for seating a ticket.
 *
 * Occupied tables stay tappable: a cashier legitimately walks a party between
 * tables mid-check, and the drawer says so instead of silently refusing.
 */
export function TableManagementDrawer({
  isOpen,
  tables,
  assignedTableId,
  onAssign,
  onClearTable,
  onClose,
}: TableManagementDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const ghostClickGuardUntilRef = useRef(0);

  useEffect(() => {
    const blockGhostClick = (event: MouseEvent): void => {
      if (performance.now() > ghostClickGuardUntilRef.current) return;
      // Only keyboard-synthesised activations produce a ghost click:
      // `detail === 0`. A real finger tap always reports `detail >= 1` and is
      // never swallowed, so the cashier's next tap lands immediately.
      if (event.detail !== 0) return;
      const panel = panelRef.current;
      const target = event.target as Node | null;
      if (panel && target && !panel.contains(target)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!isOpen) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        ghostClickGuardUntilRef.current = performance.now() + 350;
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', blockGhostClick, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', blockGhostClick, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="table-drawer-overlay">
      <button
        type="button"
        aria-label="Dismiss table picker"
        tabIndex={-1}
        onClick={onClose}
        data-testid="table-drawer-backdrop"
        className="absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Floor plan"
        tabIndex={-1}
        data-testid="table-drawer"
        className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-rail outline-none"
      >
        <header className="safe-top flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface-raised px-4 py-3">
          <div className="flex items-center gap-2">
            <Armchair className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink">Floor plan</h2>
          </div>

          <button
            type="button"
            onClick={() => {
              ghostClickGuardUntilRef.current = performance.now() + 350;
              AudioFeedback.playTick();
              onClose();
            }}
            aria-label="Close floor plan"
            data-testid="table-drawer-close"
            className="flex h-touch w-touch items-center justify-center rounded-xl border border-line bg-canvas-raised text-ink-muted transition-transform duration-75 active:scale-95 active:text-ink"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="scrollbar-tactical min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {SECTION_ORDER.map((section) => {
            const sectionTables = tables.filter((table) => table.section === section);

            if (sectionTables.length === 0) return null;

            return (
              <section key={section} data-testid={`table-section-${section}`}>
                <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-ink-subtle">
                  {SECTION_LABELS[section]} · {sectionTables.length}
                </h3>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {sectionTables.map((table) => {
                    const status = STATUS_LABELS[table.status];
                    const isAssigned = table.id === assignedTableId;

                    return (
                      <button
                        key={table.id}
                        type="button"
                        onClick={() => {
                          AudioFeedback.vibrate(12);
                          onAssign(table.id, table.label);
                          onClose();
                        }}
                        aria-pressed={isAssigned}
                        data-testid={`table-card-${table.label}`}
                        data-status={table.status}
                        data-assigned={isAssigned}
                        className={cn(
                          'flex min-h-[92px] flex-col items-start justify-between gap-2 rounded-xl border p-3 text-left',
                          'transition-transform duration-75 active:scale-95',
                          isAssigned
                            ? 'border-primary bg-primary/15'
                            : 'border-line bg-surface-raised active:bg-zinc-700',
                        )}
                      >
                        <span className="flex w-full items-center justify-between gap-2">
                          <span
                            className={cn(
                              'font-mono text-base font-bold tracking-wide',
                              isAssigned ? 'text-primary' : 'text-ink',
                            )}
                          >
                            {table.label}
                          </span>
                          <StatusDot status={table.status} />
                        </span>

                        <span className="flex w-full items-center justify-between gap-2">
                          <Badge label={status.label} tone={status.tone} />
                          <span className="flex items-center gap-1 font-mono text-[10px] text-ink-subtle">
                            <Users className="h-3 w-3" aria-hidden="true" />
                            {table.capacity}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <footer className="safe-bottom shrink-0 border-t border-line bg-surface-raised p-3">
          <TouchButton
            label={assignedTableId ? 'Clear table assignment' : 'Leave unassigned'}
            variant="secondary"
            fullWidth
            onPress={() => {
              AudioFeedback.playTick();
              onClearTable();
              onClose();
            }}
            testId="table-drawer-clear"
          />
        </footer>
      </div>
    </div>
  );
}