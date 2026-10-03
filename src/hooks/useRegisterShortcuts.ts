import { useEffect, useRef } from 'react';

export interface RegisterShortcutHandlers {
  /**
   * Enter — confirm the open workflow (modal confirm, numpad apply, checkout).
   * The event is handed back so the caller can `preventDefault()` and swallow
   * the click the browser would synthesise on the focused control.
   */
  readonly onSubmit?: (event: KeyboardEvent) => void;
  /** Escape — close the open overlay. */
  readonly onEscape?: () => void;
  /** `/` — jump focus into the catalog search field. */
  readonly onFocusSearch?: () => void;
  /** `n` — start a fresh ticket. */
  readonly onNewOrder?: () => void;
  /** `d` — open the floor plan. */
  readonly onOpenTables?: () => void;
}

function isTextEntry(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element?.isContentEditable === true
  );
}

/**
 * Global register shortcuts for keyboard-wedge terminals.
 *
 * Shortcuts never fire while the cashier is typing in a field, and they are all
 * single unmodified keys so they cannot collide with browser chrome.
 */
export function useRegisterShortcuts(handlers: RegisterShortcutHandlers): void {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const { onSubmit, onEscape, onFocusSearch, onNewOrder, onOpenTables } = handlersRef.current;

      if (event.key === 'Escape') {
        if (!isTextEntry(event.target)) onEscape?.();
        return;
      }

      if (event.key === 'Enter') {
        // Enter inside a field belongs to that field (search, note fields).
        if (!isTextEntry(event.target)) onSubmit?.(event);
        return;
      }

      if (isTextEntry(event.target)) return;

      if (event.key === '/') {
        event.preventDefault();
        onFocusSearch?.();
        return;
      }

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        onNewOrder?.();
        return;
      }

      if (event.key.toLowerCase() === 't') {
        event.preventDefault();
        onOpenTables?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
