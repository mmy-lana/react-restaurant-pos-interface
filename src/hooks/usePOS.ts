import { useContext } from 'react';
import { POSContext, type POSContextValue } from '@/context/POSContext';

/**
 * Access point for the register store.
 *
 * @throws when invoked outside of `<POSProvider>`, which is a wiring bug that
 *         must surface immediately during development rather than silently
 *         degrading to an empty ticket.
 */
export function usePOS(): POSContextValue {
  const context = useContext(POSContext);

  if (!context) {
    throw new Error('usePOS must be called inside a <POSProvider> boundary.');
  }

  return context;
}