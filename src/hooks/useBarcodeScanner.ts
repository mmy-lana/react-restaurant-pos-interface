import { useEffect, useRef } from 'react';

/**
 * Hardware barcode-scanner buffer.
 *
 * USB/Bluetooth scanners behave like keyboards: they emit a burst of digits
 * terminated by `Enter` in under ~50ms. Anything slower is human typing, so
 * only bursts are treated as a scan. The Enter key is swallowed to keep the
 * scanner from also triggering the shortcut that follows it.
 */
export interface BarcodeScannerOptions {
  readonly onScan: (barcode: string) => void;
  /** Longest gap between two scanned characters that still counts as a burst. */
  readonly maxKeyIntervalMs?: number;
  readonly enabled?: boolean;
}

const DEFAULT_MAX_KEY_INTERVAL_MS = 50;

export function useBarcodeScanner({
  onScan,
  maxKeyIntervalMs = DEFAULT_MAX_KEY_INTERVAL_MS,
  enabled = true,
}: BarcodeScannerOptions): void {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const isTextEntry =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

      const now = performance.now();
      const elapsed = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (event.key === 'Enter') {
        // A burst followed by Enter is a scan, not a shortcut.
        if (bufferRef.current.length >= 4 && elapsed <= maxKeyIntervalMs) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          const barcode = bufferRef.current;
          bufferRef.current = '';
          onScanRef.current(barcode);
          return;
        }
        bufferRef.current = '';
        return;
      }

      if (event.key.length !== 1) return;

      if (bufferRef.current.length === 0 || elapsed > maxKeyIntervalMs) {
        bufferRef.current = '';
      }

      // Human typing inside a field must never be captured as a scan.
      if (isTextEntry) {
        bufferRef.current = '';
        return;
      }

      bufferRef.current += event.key;
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled, maxKeyIntervalMs]);
}
