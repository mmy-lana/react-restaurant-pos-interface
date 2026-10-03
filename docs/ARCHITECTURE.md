# Restaurant POS Touch Interface — Patched Architectural Blueprint

This document is the compiled, post-implementation blueprint for
`react-restaurant-pos-interface`. It records the architecture as shipped, the
engineering decisions taken while building it, and every deviation from
`plan.md` with its rationale.

---

## 1. Stack as built

| Layer | Choice | Notes |
| :--- | :--- | :--- |
| UI | React 19 + TypeScript 7 (`moduleResolution: bundler`, `@/*` → `./src/*`) | `tsconfig.json` no longer uses `baseUrl` — TS7 removed it |
| Styling | Tailwind CSS v4 via `@theme` in `src/styles/globals.css` | No `tailwind.config.ts`, as specified |
| State | `use-immer` (Immer 11) reducer + `dexie-react-hooks` live queries | Single Immer draft is the active-transaction source of truth |
| Storage | Dexie 4 (`RestaurantPOS_DB`) | Pure module, zero React imports |
| Icons | lucide-react | Registry resolved through `src/utils/icons.ts` |
| Verification | Playwright (Chromium) driving `vite preview` | `pnpm run verify:all` |

---

## 2. Source tree

```
src/
├── components/
│   ├── primitives/        TouchButton · PriceDisplay · Badge · SearchInput · ModalShell
│   ├── molecules/         CategoryPill(+Rail) · ProductTile · TicketLineItem · NumpadGrid · QuickCashButtons
│   ├── organisms/         CatalogGrid · ActiveOrderTicket · ModifierSelectionModal · PaymentCheckoutModal
│   │                      TableManagementDrawer · TopNavigationHeader · OrderHistoryModal
│   ├── templates/         POSLayoutShell
│   └── showcase/          Reference screens (`?showcase=primitives|molecules|organisms|boot`)
├── context/               POSContext.tsx — state, reducer, thunks, public action surface
├── db/                    posDatabase.ts · seed.ts · seedData.ts
├── hooks/                 usePOS · useBarcodeScanner · useRegisterShortcuts
├── styles/                globals.css (@theme tokens + base + component layers)
├── types/                 pos.ts — exhaustive domain model + mutable DB records
└── utils/                 financial · orderFactory · modifiers · audioFeedback · icons · cn
scripts/
├── lib/harness.mjs        Shared headless-Chrome harness (preview server, isolated profile, assertions)
└── verify-phase{1..5}.mjs One suite per implementation phase
```

---

## 3. Domain model

Integer cents everywhere (`Cents`), no floating point ever holds money.
`FinancialEngine.calculateLineItem` rounds tax with `Math.round`;
`calculateOrderSummary` prorates an order-level discount across rows and
recomputes each row's effective tax from its own rate, so mixed-rate tickets stay
correct.

**Added field (deviation #1).** `OrderLineItem.taxRatePercent` snapshots the rate
at the moment the row was rung. Without it, a quantity edit, a restored parked
ticket or a historical reprint would have to re-read the catalog to re-price the
row, and any later tax-table change would silently rewrite past tickets.

`DeepMutable<T>` strips `readonly` recursively so Dexie can hold
`MenuItemRecord`, `OrderRecord`, `DiningTableRecord`, `CashierSessionRecord` and
`OrderCategoryRecord` while the domain surface stays immutable.

---

## 4. Persistence

`POSDatabase` keeps the blueprint schema verbatim:

```ts
this.version(1).stores({
  menuItems: 'id, sku, categoryId, isAvailable',
  categories: 'id, sortOrder',
  orders: 'id, &orderNumber, status, diningOption, tableId, version, createdAt, completedAt',
  tables: 'id, status, section, version',
  sessions: 'id, cashierId, openedAt, closedAt',
});
```

* **Deviation #2 — the table handle is `db.diningTables`, not `db.tables`.**
  `Dexie.tables` is reserved by Dexie for the live table-name registry, so the
  IndexedDB store name stays `tables` (exactly as specified) while the instance
  property is bound explicitly: `this.diningTables = this.table('tables')`.
* **No extra indexes were added.** `menuItems.name` and `tables.label` are not
  indexed, so catalog ordering happens in memory (`useMemo`) instead of adding a
  schema migration.
* `saveOrderWithOptimisticLock(posDb, order, tableUpdate?)` writes
  `version + 1` inside one transaction covering `orders` + `tables`, and throws
  `OptimisticLockError` (message keeps the blueprint's `CONCURRENCY_ERROR:` text)
  when another writer advanced the row.
* On **any** failed write the store reloads the authoritative row, so a phantom
  ticket can never linger on screen after a rejected mutation.
* `seedDatabase()` is idempotent (stable primary keys, `put` upsert) and
  `ensureCashierSession()` reuses the open shift.

---

## 5. State architecture

`ActivePOSState` keeps all thirteen blueprint fields and adds the eight the touch
UI genuinely needs:

| Field | Purpose |
| :--- | :--- |
| `nextOrderNumber` | Pre-minted `POS-YYYYMMDD-XXXX`, because the sequence is allocated asynchronously |
| `assignedTableLabel` | Renders the table chip before the DB write lands |
| `stagedQuantity`, `stagedNote` | Modifier-modal staging |
| `numpadMode`, `numpadTargetLineItemId` | Which numpad workflow is armed and on which row |
| `isMutating` | Disables CTAs during a persistence thunk |
| `persistenceError` | Dismissible failure banner |

`ADD_ITEM_DIRECT` guards `isAvailable`, and — **deviation #3** — rings the item
with the modifiers implied by its defaults and merges into an existing row only
when the full *row signature* matches (item + sorted option ids + note +
discount). Two burgers with different builds never collapse into one line.

`ADD_STAGED_ITEM` is also the edit path: when `stagedLineItemIndex` points at a
row, the staged configuration replaces that row instead of appending.

---

## 6. Component architecture

| Component | Responsibility | Notable behaviour |
| :--- | :--- | :--- |
| `TouchButton` | Atomic control | ≥48px via `--spacing-touch`, `:active:scale-95`, haptics, loading spinner |
| `PriceDisplay` | Money | `font-mono tabular-nums`, `data-amount-cents` for assertions |
| `Badge` | Status chips | Count and status chips, `PreparationTimer`, `StatusDot` for table + connectivity states |
| `SearchInput` | Catalog search | 48px clear affordance, 16px font (no iOS zoom) |
| `ModalShell` | Overlay | Bottom sheet on handheld, centred panel ≥sm, focus trap, scroll lock, Escape, **ghost-click guard** |
| `CategoryPill(+Rail)` | Category filter | `overflow-x-auto scrollbar-hide flex gap-2 pb-1`, `shrink-0 whitespace-nowrap` pills |
| `ProductTile` | Catalog card | Price, prep timer, options badge, 86'd state, **customize affordance** |
| `TicketLineItem` | Ticket row | Stepper, modifier recap, note, discount badge — keyed by `clientLineItemId` |
| `NumpadGrid` | Keypad | Blueprint 12 keys (0-9, clear, delete); optional full-width decimal key for money entry |
| `QuickCashButtons` | Tender | 2×2 grid of `computeQuickCashOptions`, change drawer, settled-state empty message |
| `CatalogGrid` | Catalog surface | Search + rail + adaptive grid, skeleton/empty/reset states |
| `ActiveOrderTicket` | Register rail | Rows, dining option, guests, discounts, park/checkout, totals |
| `ModifierSelectionModal` | Configuration | `validateModifierDraft` gate: confirm stays locked until every group satisfies min/max |
| `PaymentCheckoutModal` | Tender intake | Split payments, `buildPaymentRecord`, change, method + reference table |
| `TableManagementDrawer` | Floor plan | Three sections, capacity, `StatusDot`, assignment |
| `TopNavigationHeader` | Shift header | Session, connectivity (online/degraded/offline), table, mute, history |
| `OrderHistoryModal` | Shift archive | Last 50 tickets, restores parked ones |
| `POSLayoutShell` | Assembly | Responsive split, handheld order bar + ticket sheet, scanner, shortcuts, numpad discount modal |

**Deviation #4 — sold-out tiles use `aria-disabled`, not `disabled`.** A disabled
button is removed from the tab order and silently drops events, which hides the
reducer's availability guard from screen-reader and scanner users. The tile stays
focusable, announces its state, and the guard rejects the ring with
`AudioFeedback.playWarning()` plus an error banner.

**Deviation #5 — items ring with defaults.** A tap rings the item immediately
when `validateModifierDraft(createInitialModifierDraft(item))` passes; otherwise
the overlay is forced open. Optional modifiers stay reachable through the tile's
customize button, so a rush never pays a modal detour.

---

## 7. Responsive matrix (as shipped)

| Breakpoint | Width | Layout | Ticket | Grid |
| :--- | :--- | :--- | :--- | :--- |
| Mobile S | 360px | Single column + sticky order bar | Full-screen sheet | 2 |
| Mobile M/L | 390–430px | Single column + sticky order bar | Full-screen sheet | 2 |
| Tablet portrait | 768px | 60/40 split | Docked rail | 3 |
| iPad landscape | 1024px | 65/35 split | Docked rail | 4 (blueprint allows 3–4) |
| Desktop | 1280px+ | 70/30 split | Docked rail | 5 |

Zero-hover rule holds everywhere: `:active:*` states only, no hover-only
affordance, every tap target ≥48px (`h-touch`/`min-h-touch`/`min-h-touch-lg`).

---

## 8. Feedback, input and overlays

* **Audio/haptics** are synthesized with Web Audio — no network assets — and are
  gated behind the first real pointer/key gesture (`AudioFeedback.installGestureUnlock`).
  Browsers reject audio and vibration before a gesture, and Chrome logs blocked
  vibration calls as console errors; gating keeps the register quiet at boot and
  the console clean.
* **Scanner buffer** (`useBarcodeScanner`) treats a ≥4-character keystroke burst
  inside 50ms, terminated by `Enter`, as a barcode, swallows that `Enter`, and
  ignores anything typed inside a field.
* **Shortcuts** (`useRegisterShortcuts`): `Enter` confirms the active workflow,
  `Escape` closes, `/` focuses search, `n` parks, `t` opens the floor plan.
  `Enter` is ignored inside text fields and consumed (via `preventDefault`)
  elsewhere so the browser cannot synthesise a stray click.
* **Ghost-click guard**: dismissing an overlay arms a 350ms window that swallows
  only keyboard-synthesised activations (`detail === 0`) landing outside the
  panel. Without it, confirming a numpad with `Enter` re-opened the very dialog
  it had just closed. Real finger taps always report `detail ≥ 1` and are never
  swallowed.

---

## 9. Headless verification

`pnpm run verify:all` builds nothing (run `pnpm run build` first) and executes
each phase suite against the production bundle in headless Chromium, in an
isolated browser profile — the developer's own browser is never launched,
attached or closed.

| Suite | Checks | Covers |
| :--- | :--- | :--- |
| Phase 1 | 15 | Theme tokens, seed integrity, IndexedDB row counts, order-number format |
| Phase 2 | 39 | `@theme` values, 48px touch targets, live `:active` scale, cents formatting, tabular numerals, search clear, overlay role/focus/scroll-lock/Escape/backdrop |
| Phase 3 | 35 | Rail scrolling + selection, tile heights, 86'd state, row merge + stepper, 12-key keypad, 2×2 quick cash |
| Phase 4 | 54 | Availability guard, modifier validation (locked → unlocked), tax arithmetic, table assignment, discounts, split tender, settlement persistence, parking, empty states |
| Phase 5 | 67 | 6 breakpoints (columns, overlap, overflow, order bar), handheld sheet, scanner burst vs typing, shortcuts, 60-tap stress order, history restore, settlement + table release |

**Total: 210/210 checks passing**, with zero console errors and zero uncaught
runtime errors in every suite.

---

## 10. Scripts

```bash
pnpm install
pnpm dev            # local development server
pnpm typecheck      # tsc --noEmit
pnpm build          # tsc && vite build
pnpm verify         # latest phase suite (phase 5)
pnpm verify:all     # every phase suite, in order
```

Reference screens: `/?showcase=primitives`, `/?showcase=molecules`,
`/?showcase=organisms`, `/?showcase=boot`.

---

## 11. Summary of deviations from `plan.md`

| # | Deviation | Rationale |
| :--- | :--- | :--- |
| 1 | `OrderLineItem.taxRatePercent` added | Snapshot the rate per row so edits, restores and reprints stay historically exact |
| 2 | `db.diningTables` instead of `db.tables` | `Dexie.tables` is reserved by Dexie; the IndexedDB store name is unchanged |
| 3 | `ADD_ITEM_DIRECT` merges by full row signature | Prevents different modifier builds from collapsing into one row |
| 4 | `ProductTile` uses `aria-disabled` | Keeps sold-out items discoverable and the guard reachable by assistive tech and scanners |
| 5 | Items with valid defaults ring on a single tap | Removes a modal detour per line item during a rush |
| 6 | `ActivePOSState` extended with eight UI fields | Async order numbering, staging, mutation and error state have nowhere else to live |
| 7 | Extra files: `OrderHistoryModal`, `useBarcodeScanner`, `useRegisterShortcuts`, `showcase/*`, `utils/icons.ts`, `utils/cn.ts`, `utils/modifiers.ts`, `utils/orderFactory.ts` | Blueprint listed these behaviours but not every file they need |
| 8 | tsconfig drops `baseUrl` | TypeScript 7 removed the option; `paths` are now workspace-relative |
| 9 | Audio/haptics gated behind a user gesture | Browsers block pre-gesture audio/vibration and log console errors |
