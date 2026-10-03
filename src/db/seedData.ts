import type {
  CashierSessionRecord,
  DiningTableRecord,
  MenuItemRecord,
  OrderCategoryRecord,
} from '@/types/pos';

/**
 * Deterministic starter catalog shipped with the terminal.
 *
 * Every identifier is stable so re-seeding an existing database is idempotent:
 * `put` overwrites the same primary keys instead of duplicating rows.
 */

export const SEED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

/** Fallback tax rate; `VITE_DEFAULT_TAX_RATE` overrides it when configured. */
export const FALLBACK_TAX_RATE_PERCENT = 8.25;

function resolveTaxRatePercent(): number {
  const configured = import.meta.env?.VITE_DEFAULT_TAX_RATE;
  const parsed = typeof configured === 'string' ? Number.parseFloat(configured) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : FALLBACK_TAX_RATE_PERCENT;
}

export const DEFAULT_TAX_RATE_PERCENT = resolveTaxRatePercent();

export const STORE_IDENTIFIER = import.meta.env?.VITE_STORE_IDENTIFIER || 'STORE-001';
export const APP_TITLE = import.meta.env?.VITE_APP_TITLE || 'Restaurant POS Interface';

export const DEFAULT_CASHIER = {
  id: 'cashier-0001-alex-r',
  name: 'Alex R.',
  openingFloatInCents: 20000,
} as const;

export const SEED_CATEGORIES: readonly OrderCategoryRecord[] = [
  { id: 'cat-01-burgers', name: 'Burgers', sortOrder: 1, iconIdentifier: 'Sandwich' },
  { id: 'cat-02-sides', name: 'Sides', sortOrder: 2, iconIdentifier: 'UtensilsCrossed' },
  { id: 'cat-03-beverages', name: 'Beverages', sortOrder: 3, iconIdentifier: 'CupSoda' },
  { id: 'cat-04-desserts', name: 'Desserts', sortOrder: 4, iconIdentifier: 'CakeSlice' },
  { id: 'cat-05-combos', name: 'Combos', sortOrder: 5, iconIdentifier: 'Utensils' },
];

const BURGER_BUILD_GROUP = {
  id: 'grp-burger-build',
  name: 'Burger Build',
  minSelections: 1,
  maxSelections: 1,
  options: [
    { id: 'opt-build-single', name: 'Single Patty', priceDeltaInCents: 0, isDefault: true },
    { id: 'opt-build-double', name: 'Double Patty', priceDeltaInCents: 450, isDefault: false },
    { id: 'opt-build-triple', name: 'Triple Patty', priceDeltaInCents: 900, isDefault: false },
  ],
};

const CHEESE_GROUP = {
  id: 'grp-cheese',
  name: 'Cheese',
  minSelections: 0,
  maxSelections: 2,
  options: [
    { id: 'opt-cheese-american', name: 'American', priceDeltaInCents: 0, isDefault: true },
    { id: 'opt-cheese-swiss', name: 'Swiss', priceDeltaInCents: 75, isDefault: false },
    { id: 'opt-cheese-pepper-jack', name: 'Pepper Jack', priceDeltaInCents: 75, isDefault: false },
  ],
};

const TOPPINGS_GROUP = {
  id: 'grp-toppings',
  name: 'Toppings',
  minSelections: 0,
  maxSelections: 5,
  options: [
    { id: 'opt-top-pickles', name: 'Extra Pickles', priceDeltaInCents: 0, isDefault: false },
    { id: 'opt-top-onion', name: 'Grilled Onions', priceDeltaInCents: 50, isDefault: false },
    { id: 'opt-top-bacon', name: 'Bacon Strips', priceDeltaInCents: 200, isDefault: false },
    { id: 'opt-top-egg', name: 'Fried Egg', priceDeltaInCents: 150, isDefault: false },
    { id: 'opt-top-jalapeno', name: 'Jalapeños', priceDeltaInCents: 50, isDefault: false },
    { id: 'opt-top-avocado', name: 'Avocado', priceDeltaInCents: 175, isDefault: false },
  ],
};

const COOK_TEMP_GROUP = {
  id: 'grp-cook-temp',
  name: 'Cook Temperature',
  minSelections: 1,
  maxSelections: 1,
  options: [
    { id: 'opt-temp-medium', name: 'Medium', priceDeltaInCents: 0, isDefault: true },
    { id: 'opt-temp-medium-well', name: 'Medium Well', priceDeltaInCents: 0, isDefault: false },
    { id: 'opt-temp-well', name: 'Well Done', priceDeltaInCents: 0, isDefault: false },
  ],
};

const SIDE_SWAP_GROUP = {
  id: 'grp-side-swap',
  name: 'Side Swap',
  minSelections: 0,
  maxSelections: 1,
  options: [
    { id: 'opt-side-fries', name: 'Seasoned Fries', priceDeltaInCents: 0, isDefault: true },
    { id: 'opt-side-salad', name: 'Side Salad', priceDeltaInCents: 50, isDefault: false },
    { id: 'opt-side-soup', name: 'Cup of Soup', priceDeltaInCents: 100, isDefault: false },
    { id: 'opt-side-none', name: 'No Side', priceDeltaInCents: -100, isDefault: false },
  ],
};

const SAUCE_GROUP = {
  id: 'grp-sauce',
  name: 'Sauces',
  minSelections: 0,
  maxSelections: 3,
  options: [
    { id: 'opt-sauce-ketchup', name: 'House Ketchup', priceDeltaInCents: 0, isDefault: true },
    { id: 'opt-sauce-mayo', name: 'Spicy Mayo', priceDeltaInCents: 0, isDefault: false },
    { id: 'opt-sauce-bbq', name: 'Smoky BBQ', priceDeltaInCents: 0, isDefault: false },
    { id: 'opt-sauce-extra', name: 'Extra Sauce Cup', priceDeltaInCents: 25, isDefault: false },
  ],
};

const ICE_LEVEL_GROUP = {
  id: 'grp-ice-level',
  name: 'Ice Level',
  minSelections: 1,
  maxSelections: 1,
  options: [
    { id: 'opt-ice-none', name: 'No Ice', priceDeltaInCents: 0, isDefault: true },
    { id: 'opt-ice-light', name: 'Light Ice', priceDeltaInCents: 0, isDefault: false },
    { id: 'opt-ice-regular', name: 'Regular Ice', priceDeltaInCents: 0, isDefault: false },
  ],
};

const DESSERT_TOPPING_GROUP = {
  id: 'grp-dessert-topping',
  name: 'Toppings',
  minSelections: 0,
  maxSelections: 3,
  options: [
    { id: 'opt-dessert-whip', name: 'Whipped Cream', priceDeltaInCents: 75, isDefault: false },
    { id: 'opt-dessert-choc', name: 'Chocolate Sauce', priceDeltaInCents: 85, isDefault: false },
    { id: 'opt-dessert-scoop', name: 'Extra Scoop', priceDeltaInCents: 150, isDefault: false },
  ],
};

function createMenuItem(input: {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  priceInCents: number;
  preparationMinutes: number;
  isAvailable?: boolean;
  barcode?: string;
  colorTag?: string;
  taxRatePercent?: number;
  modifierGroups?: MenuItemRecord['modifierGroups'];
}): MenuItemRecord {
  return {
    id: input.id,
    sku: input.sku,
    name: input.name,
    categoryId: input.categoryId,
    priceInCents: input.priceInCents,
    taxRatePercent: input.taxRatePercent ?? DEFAULT_TAX_RATE_PERCENT,
    modifierGroups: (input.modifierGroups ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      minSelections: group.minSelections,
      maxSelections: group.maxSelections,
      options: group.options.map((option) => ({ ...option })),
    })),
    isAvailable: input.isAvailable ?? true,
    preparationMinutes: input.preparationMinutes,
    ...(input.barcode ? { barcode: input.barcode } : {}),
    ...(input.colorTag ? { colorTag: input.colorTag } : {}),
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  };
}

export const SEED_MENU_ITEMS: readonly MenuItemRecord[] = [
  createMenuItem({
    id: 'menu-smash-classic',
    sku: 'BRG-001',
    name: 'Tactical Smash Burger',
    categoryId: 'cat-01-burgers',
    priceInCents: 1250,
    preparationMinutes: 9,
    barcode: '880100000001',
    colorTag: '#10b981',
    modifierGroups: [BURGER_BUILD_GROUP, CHEESE_GROUP, TOPPINGS_GROUP, COOK_TEMP_GROUP, SIDE_SWAP_GROUP, SAUCE_GROUP],
  }),
  createMenuItem({
    id: 'menu-double-bacon',
    sku: 'BRG-002',
    name: 'Double Bacon Stack',
    categoryId: 'cat-01-burgers',
    priceInCents: 1495,
    preparationMinutes: 12,
    barcode: '880100000002',
    colorTag: '#f97316',
    modifierGroups: [BURGER_BUILD_GROUP, CHEESE_GROUP, TOPPINGS_GROUP, COOK_TEMP_GROUP, SIDE_SWAP_GROUP, SAUCE_GROUP],
  }),
  createMenuItem({
    id: 'menu-bbq-bacon',
    sku: 'BRG-003',
    name: 'Smoky BBQ Bacon Melt',
    categoryId: 'cat-01-burgers',
    priceInCents: 1595,
    preparationMinutes: 13,
    barcode: '880100000003',
    colorTag: '#ef4444',
    modifierGroups: [BURGER_BUILD_GROUP, CHEESE_GROUP, TOPPINGS_GROUP, COOK_TEMP_GROUP, SAUCE_GROUP],
  }),
  createMenuItem({
    id: 'menu-veggie-stack',
    sku: 'BRG-004',
    name: 'Beyond Veggie Stack',
    categoryId: 'cat-01-burgers',
    priceInCents: 1395,
    preparationMinutes: 10,
    barcode: '880100000004',
    colorTag: '#22c55e',
    modifierGroups: [CHEESE_GROUP, TOPPINGS_GROUP, COOK_TEMP_GROUP, SIDE_SWAP_GROUP],
  }),
  createMenuItem({
    id: 'menu-mushroom-swiss',
    sku: 'BRG-005',
    name: 'Grilled Mushroom Swiss',
    categoryId: 'cat-01-burgers',
    priceInCents: 1450,
    preparationMinutes: 11,
    isAvailable: false,
    barcode: '880100000005',
    colorTag: '#64748b',
    modifierGroups: [CHEESE_GROUP, TOPPINGS_GROUP, COOK_TEMP_GROUP],
  }),
  createMenuItem({
    id: 'menu-spicy-chicken',
    sku: 'BRG-006',
    name: 'Nashville Hot Chicken',
    categoryId: 'cat-01-burgers',
    priceInCents: 1290,
    preparationMinutes: 11,
    barcode: '880100000006',
    colorTag: '#eab308',
    modifierGroups: [TOPPINGS_GROUP, COOK_TEMP_GROUP, SAUCE_GROUP, SIDE_SWAP_GROUP],
  }),
  createMenuItem({
    id: 'menu-truffle-fries',
    sku: 'SID-001',
    name: 'Truffle Parmesan Fries',
    categoryId: 'cat-02-sides',
    priceInCents: 650,
    preparationMinutes: 5,
    barcode: '880100000007',
    colorTag: '#a3e635',
    modifierGroups: [SAUCE_GROUP],
  }),
  createMenuItem({
    id: 'menu-onion-rings',
    sku: 'SID-002',
    name: 'Crispy Onion Rings',
    categoryId: 'cat-02-sides',
    priceInCents: 550,
    preparationMinutes: 5,
    barcode: '880100000008',
    colorTag: '#fbbf24',
  }),
  createMenuItem({
    id: 'menu-garlic-fries',
    sku: 'SID-003',
    name: 'Garlic Parm Fries',
    categoryId: 'cat-02-sides',
    priceInCents: 590,
    preparationMinutes: 5,
    barcode: '880100000009',
    colorTag: '#84cc16',
    modifierGroups: [SAUCE_GROUP],
  }),
  createMenuItem({
    id: 'menu-loaded-nachos',
    sku: 'SID-004',
    name: 'Loaded Beef Nachos',
    categoryId: 'cat-02-sides',
    priceInCents: 850,
    preparationMinutes: 7,
    barcode: '880100000010',
    colorTag: '#facc15',
    modifierGroups: [SAUCE_GROUP, TOPPINGS_GROUP],
  }),
  createMenuItem({
    id: 'menu-cold-brew',
    sku: 'BEV-001',
    name: 'Cold Brew Nitro Coffee',
    categoryId: 'cat-03-beverages',
    priceInCents: 475,
    preparationMinutes: 2,
    barcode: '880100000011',
    colorTag: '#8b5cf6',
    modifierGroups: [ICE_LEVEL_GROUP],
  }),
  createMenuItem({
    id: 'menu-sparkling-water',
    sku: 'BEV-002',
    name: 'Sparkling Mineral Water',
    categoryId: 'cat-03-beverages',
    priceInCents: 300,
    preparationMinutes: 1,
    barcode: '880100000012',
    colorTag: '#38bdf8',
  }),
  createMenuItem({
    id: 'menu-house-lemonade',
    sku: 'BEV-003',
    name: 'House Lemonade',
    categoryId: 'cat-03-beverages',
    priceInCents: 425,
    preparationMinutes: 2,
    barcode: '880100000013',
    colorTag: '#fde047',
    modifierGroups: [ICE_LEVEL_GROUP],
  }),
  createMenuItem({
    id: 'menu-craft-cola',
    sku: 'BEV-004',
    name: 'Craft Cola',
    categoryId: 'cat-03-beverages',
    priceInCents: 350,
    preparationMinutes: 1,
    barcode: '880100000014',
    colorTag: '#c2410c',
    modifierGroups: [ICE_LEVEL_GROUP],
  }),
  createMenuItem({
    id: 'menu-lava-cake',
    sku: 'DST-001',
    name: 'Molten Lava Cake',
    categoryId: 'cat-04-desserts',
    priceInCents: 795,
    preparationMinutes: 8,
    barcode: '880100000015',
    colorTag: '#f43f5e',
    modifierGroups: [DESSERT_TOPPING_GROUP, ICE_LEVEL_GROUP],
  }),
  createMenuItem({
    id: 'menu-cheesecake',
    sku: 'DST-002',
    name: 'NY Cheesecake Slice',
    categoryId: 'cat-04-desserts',
    priceInCents: 725,
    preparationMinutes: 3,
    barcode: '880100000016',
    colorTag: '#fcd34d',
    modifierGroups: [DESSERT_TOPPING_GROUP],
  }),
  createMenuItem({
    id: 'menu-brownie-sundae',
    sku: 'DST-003',
    name: 'Brownie Sundae',
    categoryId: 'cat-04-desserts',
    priceInCents: 850,
    preparationMinutes: 4,
    barcode: '880100000017',
    colorTag: '#92400e',
    modifierGroups: [DESSERT_TOPPING_GROUP],
  }),
  createMenuItem({
    id: 'menu-combo-feast',
    sku: 'CMB-001',
    name: 'Burger Feast Combo',
    categoryId: 'cat-05-combos',
    priceInCents: 2195,
    preparationMinutes: 15,
    barcode: '880100000018',
    colorTag: '#10b981',
    modifierGroups: [BURGER_BUILD_GROUP, CHEESE_GROUP, TOPPINGS_GROUP, COOK_TEMP_GROUP, SAUCE_GROUP],
  }),
  createMenuItem({
    id: 'menu-combo-duo',
    sku: 'CMB-002',
    name: 'Two Burger Duo',
    categoryId: 'cat-05-combos',
    priceInCents: 2195,
    preparationMinutes: 16,
    barcode: '880100000019',
    colorTag: '#14b8a6',
    modifierGroups: [BURGER_BUILD_GROUP, CHEESE_GROUP, COOK_TEMP_GROUP, SAUCE_GROUP],
  }),
];

function createTable(
  id: string,
  label: string,
  section: DiningTableRecord['section'],
  capacity: number,
  status: DiningTableRecord['status'] = 'available',
): DiningTableRecord {
  return { id, label, section, capacity, status, version: 0 };
}

export const SEED_TABLES: readonly DiningTableRecord[] = [
  createTable('tbl-01', 'T01', 'main_floor', 2),
  createTable('tbl-02', 'T02', 'main_floor', 2),
  createTable('tbl-03', 'T03', 'main_floor', 4, 'reserved'),
  createTable('tbl-04', 'T04', 'main_floor', 4),
  createTable('tbl-05', 'T05', 'main_floor', 6),
  createTable('tbl-06', 'T06', 'main_floor', 6),
  createTable('tbl-07', 'T07', 'bar', 2),
  createTable('tbl-08', 'T08', 'bar', 2),
  createTable('tbl-09', 'T09', 'bar', 1),
  createTable('tbl-10', 'T10', 'bar', 4, 'payment_pending'),
  createTable('tbl-11', 'P01', 'patio', 4),
  createTable('tbl-12', 'P02', 'patio', 6),
  createTable('tbl-13', 'P03', 'patio', 8),
  createTable('tbl-14', 'P04', 'patio', 2),
];

export function createSeedCashierSession(): CashierSessionRecord {
  return {
    id: `session-${DEFAULT_CASHIER.id}-${SEED_TIMESTAMP}`,
    cashierId: DEFAULT_CASHIER.id,
    cashierName: DEFAULT_CASHIER.name,
    openingFloatInCents: DEFAULT_CASHIER.openingFloatInCents,
    openedAt: SEED_TIMESTAMP,
    totalCashReceivedInCents: 0,
    totalCardReceivedInCents: 0,
    totalGiftCardReceivedInCents: 0,
    totalDigitalWalletReceivedInCents: 0,
  };
}