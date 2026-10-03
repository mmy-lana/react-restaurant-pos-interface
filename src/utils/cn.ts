import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Conditional className helper that also de-duplicates conflicting Tailwind
 * utilities (the last declaration wins, regardless of source order).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}