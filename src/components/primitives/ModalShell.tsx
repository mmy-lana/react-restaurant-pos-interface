import { X } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { AudioFeedback } from '@/utils/audioFeedback';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalShellProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
  /** Sticky action bar pinned to the bottom of the panel. */
  readonly footer?: ReactNode;
  readonly size?: ModalSize;
  /** Blocks backdrop/Escape dismissal, e.g. while a payment settles. */
  readonly preventClose?: boolean;
  readonly closeLabel?: string;
  readonly testId?: string;
  readonly className?: string;
}

const SIZE_STYLES: Record<ModalSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-2xl',
  lg: 'sm:max-w-4xl',
  xl: 'sm:max-w-6xl',
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Full-screen touch overlay: bottom sheet on handhelds, centered panel on
 * iPad/desktop, with a physical close button, Escape handling, scroll lock and
 * a keyboard focus trap.
 */
export function ModalShell({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  preventClose = false,
  closeLabel = 'Close',
  testId = 'modal-shell',
  className,
}: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  // A dismissal triggered by Enter/Escape also releases the key as a click on
  // whatever sits underneath. Suppress that ghost click for a moment.
  const ghostClickGuardUntilRef = useRef(0);
  const preventCloseRef = useRef(preventClose);
  useEffect(() => {
    preventCloseRef.current = preventClose;
  }, [preventClose]);
  const titleId = useId();
  const subtitleId = useId();

  const requestClose = useCallback(() => {
    if (preventClose) {
      AudioFeedback.playWarning();
      return;
    }
    AudioFeedback.playTick();
    onClose();
  }, [onClose, preventClose]);

  // Every close path (backdrop, Escape, close button, external state change)
  // arms the guard in the same commit, before the browser can synthesise the
  // follow-up click on whatever now sits behind the dismissed overlay.
  const wasOpenRef = useRef(isOpen);
  useLayoutEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      ghostClickGuardUntilRef.current = performance.now() + 350;
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  // Mounted for the component's lifetime (not just while open) because the
  // ghost click lands in the window between the close and the reopen attempt.
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

    document.addEventListener('click', blockGhostClick, true);
    return () => document.removeEventListener('click', blockGhostClick, true);
  }, []);

  // The close callback is read through a ref so the focus/scroll-lock effect
  // below only runs when the dialog opens or closes. Re-running it on every
  // parent re-render would steal focus back to the first control mid-edit,
  // which makes typing inside a dialog impossible.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? panel)?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (preventCloseRef.current) {
          AudioFeedback.playWarning();
        } else {
          AudioFeedback.playTick();
          onCloseRef.current();
        }
        return;
      }

      if (event.key !== 'Tab' || !panel) return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus?.({ preventScroll: true });
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6"
      data-testid={`${testId}-overlay`}
    >
      <button
        type="button"
        aria-label="Dismiss modal"
        tabIndex={-1}
        onClick={requestClose}
        className="absolute inset-0 h-full w-full cursor-default bg-transparent"
        data-testid={`${testId}-backdrop`}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
        data-testid={testId}
        className={cn(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden border border-line bg-surface shadow-tactical outline-none',
          'rounded-t-panel sm:rounded-panel',
          SIZE_STYLES[size],
          className,
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line bg-surface-raised px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="truncate text-base font-bold uppercase tracking-wider text-ink sm:text-lg"
            >
              {title}
            </h2>
            {subtitle && (
              <p id={subtitleId} className="mt-0.5 truncate font-mono text-xs text-ink-muted">
                {subtitle}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={requestClose}
            disabled={preventClose}
            aria-label={closeLabel}
            data-testid={`${testId}-close`}
            className="flex h-touch w-touch shrink-0 items-center justify-center rounded-xl border border-line bg-canvas-raised text-ink-muted transition-transform duration-75 active:scale-95 active:bg-surface active:text-ink disabled:opacity-40"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </header>

        <div className="scrollbar-tactical min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {children}
        </div>

        {footer && (
          <footer className="safe-bottom shrink-0 border-t border-line bg-surface-raised px-4 py-3 sm:px-5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}