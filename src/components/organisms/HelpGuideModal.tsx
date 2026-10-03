import { BookOpen, Keyboard, ScanBarcode, ShieldCheck, Split, Volume2 } from 'lucide-react';
import { ModalShell } from '@/components/primitives/ModalShell';
import { TouchButton } from '@/components/primitives/TouchButton';

export interface HelpGuideModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

interface GuideSection {
  readonly id: string;
  readonly title: string;
  readonly icon: typeof Keyboard;
  readonly summary: string;
  readonly points: readonly string[];
}

/**
 * Terminal operator guide.
 *
 * A register is run by people who never read the manual, so this sheet answers
 * only the questions that actually stop service: what the keys do, how the
 * scanner behaves, when change is allowed, what happens when the network dies,
 * and how to send a kitchen note.
 */
const GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    id: 'shortcuts',
    title: 'Section A · Keyboard shortcuts',
    icon: Keyboard,
    summary: 'Keyboard-wedge terminals can drive the whole register without touching the glass.',
    points: [
      '/ — jump focus into the catalog search field.',
      'T — open the floor plan and assign or clear a table.',
      'N — park the current ticket and start a fresh one.',
      'Enter — confirm the open workflow: modifier overlay, discount numpad, then checkout.',
      'Escape — dismiss the open overlay or close the handheld ticket sheet.',
      'Shortcuts never fire while the cursor is inside a text field, so typing notes is safe.',
    ],
  },
  {
    id: 'scanner',
    title: 'Section B · Hardware barcode scanner',
    icon: ScanBarcode,
    summary: 'USB and Bluetooth scanners behave like a fast typist, not like a keyboard.',
    points: [
      'A scan is a burst of at least 4 characters delivered within 50 ms of each other.',
      'The burst must be terminated by Enter; the register then rings the matching SKU.',
      'Typing slower than 50 ms per character is treated as human input and never scans.',
      'Supported formats: UPC-A, EAN-13, Code 128 and any internal SKU.',
      'Scanning is ignored while a modal is open, so a scanner can never ring stock behind checkout.',
      'An unknown or 86\'d barcode produces a warning tone and an on-screen notice.',
    ],
  },
  {
    id: 'tenders',
    title: 'Section C · Split payments and tenders',
    icon: Split,
    summary: 'Cash can over-tender and return change; every other method settles exactly.',
    points: [
      'Cash: enter the bill the guest handed over. If it exceeds the balance you can switch to "Apply" to book part of it and return the rest as change.',
      'Credit, debit, gift card and wallet settle the exact balance and never return change.',
      'Tendering less than the balance records a split tender and leaves the remainder outstanding.',
      'Each tender is stored as its own payment record with its own reference.',
      'Quick cash buttons are calculated from the live balance and are cash only.',
    ],
  },
  {
    id: 'offline',
    title: 'Section D · Offline-first storage and recovery',
    icon: ShieldCheck,
    summary: 'The register never depends on a network connection to take money.',
    points: [
      'Every ticket is written to IndexedDB on the terminal itself; service continues offline.',
      'Writes are guarded by an optimistic version lock: a stale ticket is rejected, never silently overwritten.',
      'A rejected write reloads the authoritative ticket and shows a concurrency banner.',
      'The shift drawer, the ticket and the table are saved in a single atomic transaction.',
      'If the terminal is closed mid-shift, the next boot restores the open shift, the catalog and the floor plan.',
    ],
  },
  {
    id: 'availability',
    title: 'Section E · 86\'d items and kitchen notes',
    icon: Volume2,
    summary: 'Availability is enforced by the register, and notes are what the kitchen actually reads.',
    points: [
      'An 86\'d item stays visible but refuses to ring, so a cashier can explain the situation instead of guessing.',
      'Required modifier groups must be satisfied before the item can be added.',
      'Optional modifiers keep their defaults: tap the tile to ring fast, or use the tile\'s Edit control to customize.',
      'Kitchen notes are limited to 140 characters and strip control characters so receipt printers cannot be driven by pasted input.',
    ],
  },
];

/** Touch-friendly in-terminal quick reference. */
export function HelpGuideModal({ isOpen, onClose }: HelpGuideModalProps): React.JSX.Element {
  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Terminal operator guide"
      subtitle="Quick reference for this register"
      size="lg"
      testId="help-guide-modal"
      footer={
        <TouchButton label="Close guide" variant="secondary" fullWidth onPress={onClose} testId="help-guide-close" />
      }
    >
      <div className="space-y-4">
        <p className="flex items-center gap-2 rounded-xl border border-line bg-canvas-raised px-3 py-2 font-mono text-xs uppercase tracking-widest text-ink-muted">
          <BookOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          Everything here works with gloves, glare and no network.
        </p>

        {GUIDE_SECTIONS.map((section) => {
          const Icon = section.icon;

          return (
            <section
              key={section.id}
              data-testid={`help-section-${section.id}`}
              aria-labelledby={`help-${section.id}-title`}
              className="rounded-panel border border-line bg-canvas-raised p-3"
            >
              <h3
                id={`help-${section.id}-title`}
                className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink"
              >
                <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {section.title}
              </h3>

              <p className="mt-1 text-xs leading-relaxed text-ink-muted">{section.summary}</p>

              <ul className="mt-2 space-y-1.5">
                {section.points.map((point) => (
                  <li key={point} className="flex gap-2 text-xs leading-relaxed text-ink-muted">
                    <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </ModalShell>
  );
}

export const HELP_SECTION_COUNT = GUIDE_SECTIONS.length;
