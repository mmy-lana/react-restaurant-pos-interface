# Restaurant POS Touch Interface

Offline-first, touch-native point-of-sale register built with React 19,
TypeScript, Tailwind CSS v4, Dexie (IndexedDB) and Immer. Tuned for iPad and
tablet-landscape terminals, and adaptive from 360px phones to desktop POS
stations.

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

## Scripts

| Command | Purpose |
| :--- | :--- |
| `pnpm dev` | Vite dev server |
| `pnpm typecheck` | `tsc --noEmit` across app + scripts |
| `pnpm build` | Typecheck, then production build to `dist/` |
| `pnpm preview` | Serve the production build |
| `pnpm verify` | Latest phase suite in headless Chromium |
| `pnpm verify:all` | Every phase suite, in order (210 assertions) |

Build before verifying: the suites run against the production bundle.

## What it does

* Rings menu items with modifier groups, honouring `minSelections` /
  `maxSelections` before anything reaches the ticket.
* Prices everything in integer cents with prorated order discounts and per-row
  tax snapshots.
* Splits tenders across cash, credit, debit, gift card and wallet, computing the
  change drawer and writing one payment record per tender.
* Seats tickets on a floor plan, parks them, and restores parked tickets.
* Persists every mutation to IndexedDB behind an optimistic version lock.
* Speaks to hardware barcode scanners and keyboard-wedge terminals.

## Reference screens

`/?showcase=primitives`, `/?showcase=molecules`, `/?showcase=organisms` and
`/?showcase=boot` mount the design-system and storage-diagnostic views used by the
automated suites.

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the compiled blueprint,
the responsive breakpoint matrix and every documented deviation from the spec.
