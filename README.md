# Restaurant POS Touch Interface

Offline-first, bank-grade point-of-sale (POS) touch interface engineered for commercial restaurant operations. Built with React 19, TypeScript, Tailwind CSS v4, Dexie.js (IndexedDB), and Immer. Optimized for iPad and tablet-landscape terminals, with adaptive responsive layouts scaling from 360px handhelds to desktop stations.

- Live Deployment: https://react-restaurant-pos-interface.vercel.app
- Source Repository: https://github.com/mmy-lana/react-restaurant-pos-interface

---

## Key Capabilities

- Touch-Native Architecture: High-contrast tactical dark UI (`zinc-950` canvas), minimum 48px tap targets, zero mouse-hover dependencies, active press scaling (`active:scale-95`), and low-latency audio/haptic feedback synthesized via Web Audio API without network asset dependencies.
- Strict Financial Engine: 100% integer cents precision (`Cents`) with banker's rounding (`Math.round`). Prorates order-level discounts across mixed-rate line items, computes exact change drawers, and enforces snapshotted row tax rates.
- Concurrency & Storage Integrity: Client-side persistence using IndexedDB (Dexie 4) protected by optimistic version locking (`OptimisticLockError`). Multi-tab atomic order sequencing prevents collision across concurrent terminal boots.
- Modifier Validation Engine: Enforces `minSelections` and `maxSelections` rules, roving tabindex keyboard navigation, single/multi-choice groups, and default option rings without modal detours during rush periods.
- Split Tenders & Payments: Accepts cash, credit, debit, gift card, and digital wallet. Supports multi-tender split payments with automatic remaining balance computation and acquirer reference generation.
- Floor Plan & Table Management: Real-time table assignments across Main Floor, Patio, and Bar sections. Table reservation overrides, occupancy tracking, and automatic release upon settlement.
- Hardware Scanner & Shortcut Integration: USB/Bluetooth barcode scanner buffer supporting UPC-A, EAN-13, and Code 128 (50ms burst detection with Enter ingestion). Keyboard-wedge shortcuts (`/`, `t`, `n`, `Enter`, `Escape`) guarded against active modal collisions and text input fields.
- Peripheral Safety: Sanitizes kitchen notes and ticket text by stripping ASCII C0 control characters (0x00-0x1F, 0x7F) and clamping lengths to prevent ESC/POS receipt printer buffer injection.

---

## Tech Stack

| Layer | Technology | Details |
| :--- | :--- | :--- |
| Runtime / UI | React 19 + TypeScript | Bundler module resolution, strict type checking |
| Styling | Tailwind CSS v4 | CSS `@theme` tokens in `src/styles/globals.css` (no `tailwind.config.ts`) |
| State Management | Immer 11 + `use-immer` | Immutable active transaction draft as single source of truth |
| Persistence | Dexie.js 4 + `dexie-react-hooks` | Pure IndexedDB storage layer with live query bindings |
| Icons | Lucide React | Resolved via dynamic typed registry |
| Verification | Playwright | Headless Chromium automated test runner driving production preview |

---

## Responsive Breakpoint Matrix

| Viewport | Width | Layout Strategy | Ticket Behavior | Grid Columns |
| :--- | :--- | :--- | :--- | :--- |
| Mobile S | 360px | Single-column catalog; sticky bottom order bar | Fullscreen overlay sheet | 2 |
| Mobile M/L | 390px - 430px | Single-column catalog; sticky bottom order bar | Fullscreen overlay sheet | 2 |
| Tablet Portrait | 768px | 60/40 stacked split pane | Docked bottom rail | 3 |
| iPad Landscape | 1024px | 65/35 split view | Fixed right docked rail | 4 |
| Desktop POS | 1280px+ | 70/30 split view | Fixed right rail | 5 |

---

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0

### Installation

```bash
git clone https://github.com/mmy-lana/react-restaurant-pos-interface.git
cd react-restaurant-pos-interface
pnpm install
```

### Development

```bash
pnpm dev
```

Local dev server runs at `http://localhost:5173`.

### Production Build

```bash
pnpm build
pnpm preview
```

---

## Verification & Testing

Every implementation phase is asserted using headless Chromium driven by Playwright against the production bundle.

```bash
# Run full suite (Phases 1-5, 210 assertions)
pnpm verify:all

# Run individual verification suites
pnpm verify:phase1   # Storage schema, seed idempotency, order number reservation, contrast
pnpm verify:phase2   # Theme tokens, 48px touch targets, PriceDisplay, modal focus trap
pnpm verify:phase3   # Category rail, product tiles, 12-key numpad, 2x2 quick cash
pnpm verify:phase4   # 86'd guards, modifier roving nav, split tender, optimistic locks
pnpm verify:phase5   # Responsive matrix, barcode scanner, keyboard shortcuts, 60-tap stress test
```

---

## Diagnostic Showcases

The application includes standalone reference views for manual inspection and automated testing:

- `/?showcase=primitives` - Atomic primitives (TouchButton, PriceDisplay, Badge, SearchInput, ModalShell)
- `/?showcase=molecules` - Compound components (CategoryPillRail, ProductTile, TicketLineItem, NumpadGrid, QuickCashButtons)
- `/?showcase=organisms` - Complete transactional organisms connected to the live store
- `/?showcase=boot` - IndexedDB diagnostics, cashier shift float, and catalog seed verification

---

## Architecture Blueprint

Comprehensive system documentation, architectural decisions, and deviation notes are documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## License

This project is licensed under the MIT License.