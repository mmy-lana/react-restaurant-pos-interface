/**
 * Input sanitization for anything that reaches a receipt printer or the
 * kitchen rail.
 *
 * ESC/POS printers treat a handful of ASCII control bytes as commands: 0x1B
 * starts an escape sequence, 0x0C feeds a page, 0x08 and 0x7F backspace
 * characters and can silently rewrite an already-printed line. A cashier
 * pasting a note from a web page could therefore drive the printer, so control
 * characters are stripped at the boundary and the text is length-clamped.
 */

/** Maximum length accepted for kitchen notes and order notes. */
export const MAX_NOTE_LENGTH = 140;

/** ASCII C0 controls (0x00-0x1F), DEL (0x7F) and the line separators. */
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/g;

/** Collapses whitespace runs so a pasted blob cannot push the ticket off screen. */
const WHITESPACE_RUNS = /\s+/g;

/**
 * Strips control characters, normalises whitespace and clamps the result to
 * `maxLength` characters. Non-string input degrades to an empty string.
 */
export function sanitizePrinterSafeText(
  input: string | null | undefined,
  maxLength: number = MAX_NOTE_LENGTH,
): string {
  if (typeof input !== 'string') return '';

  const safeLength = Number.isFinite(maxLength) && maxLength > 0 ? Math.floor(maxLength) : MAX_NOTE_LENGTH;

  return input
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(WHITESPACE_RUNS, ' ')
    .trim()
    .slice(0, safeLength);
}

/** True when the text still contains a character a printer could interpret. */
export function containsControlCharacters(input: string): boolean {
  return new RegExp(CONTROL_CHARACTERS.source).test(input);
}
