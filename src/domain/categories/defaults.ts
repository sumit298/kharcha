import type { Category, CategoryKind } from '@/types';

/**
 * Built-in category tree. IDs are stable, readable keys ("food.food_delivery") so merchant
 * rules, seeds and tests can reference them. Users can rename/hide these and add their own.
 *
 * Accounting notes:
 *  - finance.credit_card_payment, finance.investments, finance.savings are `transfer` kind:
 *    money moved between the user's own pots is not spending (see ARCHITECTURE.md §8).
 *  - Income › Refunds is for refunds that can't be linked to an original expense.
 */
interface DefaultSubcategory {
  id: string;
  name: string;
  icon: string;
  kind?: CategoryKind;
}

export interface DefaultCategory {
  id: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  children: DefaultSubcategory[];
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  {
    id: 'food',
    name: 'Food & Dining',
    kind: 'expense',
    icon: 'silverware-fork-knife',
    color: '#F2994A',
    children: [
      { id: 'food.restaurants', name: 'Restaurants', icon: 'silverware' },
      { id: 'food.food_delivery', name: 'Food Delivery', icon: 'moped' },
      { id: 'food.fast_food', name: 'Fast Food', icon: 'hamburger' },
      { id: 'food.cafes', name: 'Cafes', icon: 'coffee' },
      { id: 'food.snacks', name: 'Snacks', icon: 'cookie' },
      { id: 'food.groceries', name: 'Groceries', icon: 'cart' },
      { id: 'food.fruits_vegetables', name: 'Fruits & Vegetables', icon: 'food-apple' },
      { id: 'food.dairy', name: 'Dairy', icon: 'cup' },
      { id: 'food.meat_eggs', name: 'Meat & Eggs', icon: 'food-drumstick' },
    ],
  },
  {
    id: 'transport',
    name: 'Transportation',
    kind: 'expense',
    icon: 'car',
    color: '#2D9CDB',
    children: [
      { id: 'transport.metro', name: 'Metro', icon: 'subway-variant' },
      { id: 'transport.bus', name: 'Bus', icon: 'bus' },
      { id: 'transport.cab', name: 'Cab', icon: 'taxi' },
      { id: 'transport.auto', name: 'Auto', icon: 'rickshaw' },
      { id: 'transport.bike_taxi', name: 'Bike Taxi', icon: 'motorbike' },
      { id: 'transport.fuel', name: 'Fuel', icon: 'gas-station' },
      { id: 'transport.parking', name: 'Parking', icon: 'parking' },
      { id: 'transport.toll', name: 'Toll', icon: 'boom-gate' },
    ],
  },
  {
    id: 'housing',
    name: 'Housing',
    kind: 'expense',
    icon: 'home',
    color: '#9B51E0',
    children: [
      { id: 'housing.rent', name: 'Rent', icon: 'home-city' },
      { id: 'housing.maintenance', name: 'Maintenance', icon: 'hammer-wrench' },
      { id: 'housing.electricity', name: 'Electricity', icon: 'flash' },
      { id: 'housing.water', name: 'Water', icon: 'water' },
      { id: 'housing.internet', name: 'Internet', icon: 'wifi' },
      { id: 'housing.gas', name: 'Gas', icon: 'fire' },
    ],
  },
  {
    id: 'shopping',
    name: 'Shopping',
    kind: 'expense',
    icon: 'shopping',
    color: '#EB5757',
    children: [
      { id: 'shopping.clothing', name: 'Clothing', icon: 'tshirt-crew' },
      { id: 'shopping.electronics', name: 'Electronics', icon: 'laptop' },
      { id: 'shopping.home', name: 'Home', icon: 'sofa' },
      { id: 'shopping.personal_care', name: 'Personal Care', icon: 'lotion' },
      { id: 'shopping.accessories', name: 'Accessories', icon: 'watch' },
      { id: 'shopping.online', name: 'Online Shopping', icon: 'package-variant' },
    ],
  },
  {
    id: 'health',
    name: 'Health',
    kind: 'expense',
    icon: 'heart-pulse',
    color: '#27AE60',
    children: [
      { id: 'health.pharmacy', name: 'Pharmacy', icon: 'pill' },
      { id: 'health.doctor', name: 'Doctor', icon: 'stethoscope' },
      { id: 'health.medical_tests', name: 'Medical Tests', icon: 'test-tube' },
      { id: 'health.products', name: 'Health Products', icon: 'bottle-tonic-plus' },
    ],
  },
  {
    id: 'entertainment',
    name: 'Entertainment',
    kind: 'expense',
    icon: 'movie-open',
    color: '#F2C94C',
    children: [
      { id: 'entertainment.movies', name: 'Movies', icon: 'movie' },
      { id: 'entertainment.games', name: 'Games', icon: 'gamepad-variant' },
      { id: 'entertainment.music', name: 'Music', icon: 'music' },
      { id: 'entertainment.streaming', name: 'Streaming', icon: 'television-play' },
      { id: 'entertainment.events', name: 'Events', icon: 'ticket' },
    ],
  },
  {
    id: 'bills',
    name: 'Bills & Subscriptions',
    kind: 'expense',
    icon: 'receipt',
    color: '#56CCF2',
    children: [
      { id: 'bills.mobile', name: 'Mobile', icon: 'cellphone' },
      { id: 'bills.internet', name: 'Internet', icon: 'router-wireless' },
      { id: 'bills.ott', name: 'OTT', icon: 'television-classic' },
      { id: 'bills.music', name: 'Music', icon: 'music-circle' },
      { id: 'bills.software', name: 'Software', icon: 'application' },
      { id: 'bills.cloud', name: 'Cloud Services', icon: 'cloud' },
      { id: 'bills.memberships', name: 'Memberships', icon: 'card-account-details-star' },
    ],
  },
  {
    id: 'finance',
    name: 'Finance',
    kind: 'expense',
    icon: 'bank',
    color: '#4F4F4F',
    children: [
      { id: 'finance.emi', name: 'EMI', icon: 'calendar-clock' },
      { id: 'finance.loan_payment', name: 'Loan Payment', icon: 'hand-coin' },
      { id: 'finance.bank_charges', name: 'Bank Charges', icon: 'bank-minus' },
      { id: 'finance.credit_card_payment', name: 'Credit Card Payment', icon: 'credit-card-check', kind: 'transfer' },
      { id: 'finance.insurance', name: 'Insurance', icon: 'shield-check' },
      { id: 'finance.investments', name: 'Investments', icon: 'chart-line', kind: 'transfer' },
      { id: 'finance.savings', name: 'Savings', icon: 'piggy-bank', kind: 'transfer' },
    ],
  },
  {
    id: 'education',
    name: 'Education',
    kind: 'expense',
    icon: 'school',
    color: '#6FCF97',
    children: [
      { id: 'education.courses', name: 'Courses', icon: 'teach' },
      { id: 'education.books', name: 'Books', icon: 'book-open-variant' },
      { id: 'education.certifications', name: 'Certifications', icon: 'certificate' },
      { id: 'education.platforms', name: 'Learning Platforms', icon: 'laptop-account' },
    ],
  },
  {
    id: 'travel',
    name: 'Travel',
    kind: 'expense',
    icon: 'airplane',
    color: '#BB6BD9',
    children: [
      { id: 'travel.flights', name: 'Flights', icon: 'airplane-takeoff' },
      { id: 'travel.hotels', name: 'Hotels', icon: 'bed' },
      { id: 'travel.trains', name: 'Trains', icon: 'train' },
      { id: 'travel.bus', name: 'Bus', icon: 'bus-side' },
      { id: 'travel.activities', name: 'Travel Activities', icon: 'map-marker-star' },
    ],
  },
  {
    id: 'personal',
    name: 'Personal',
    kind: 'expense',
    icon: 'account',
    color: '#828282',
    children: [
      { id: 'personal.gifts', name: 'Gifts', icon: 'gift' },
      { id: 'personal.donations', name: 'Donations', icon: 'hand-heart' },
      { id: 'personal.misc', name: 'Miscellaneous', icon: 'dots-horizontal' },
    ],
  },
  {
    id: 'income',
    name: 'Income',
    kind: 'income',
    icon: 'cash-plus',
    color: '#219653',
    children: [
      { id: 'income.salary', name: 'Salary', icon: 'briefcase' },
      { id: 'income.freelance', name: 'Freelance', icon: 'laptop' },
      { id: 'income.interest', name: 'Interest', icon: 'percent' },
      { id: 'income.refunds', name: 'Refunds', icon: 'cash-refund' },
      { id: 'income.other', name: 'Other Income', icon: 'cash' },
    ],
  },
  {
    id: 'transfers',
    name: 'Transfers',
    kind: 'transfer',
    icon: 'swap-horizontal',
    color: '#BDBDBD',
    children: [
      { id: 'transfers.own_account', name: 'Own Account Transfer', icon: 'bank-transfer' },
      { id: 'transfers.family', name: 'Family Transfer', icon: 'account-group' },
      { id: 'transfers.other', name: 'Other Transfer', icon: 'swap-horizontal-bold' },
    ],
  },
];

/** Flatten the tree into Category rows (parents first) for seeding. */
export function buildDefaultCategoryRows(now: number): Category[] {
  const rows: Category[] = [];
  DEFAULT_CATEGORIES.forEach((parent, parentIndex) => {
    rows.push({
      id: parent.id,
      name: parent.name,
      parentId: null,
      kind: parent.kind,
      icon: parent.icon,
      color: parent.color,
      isSystem: true,
      sortOrder: parentIndex * 100,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    parent.children.forEach((child, childIndex) => {
      rows.push({
        id: child.id,
        name: child.name,
        parentId: parent.id,
        kind: child.kind ?? parent.kind,
        icon: child.icon,
        color: parent.color,
        isSystem: true,
        sortOrder: parentIndex * 100 + childIndex + 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    });
  });
  return rows;
}

const ALL_IDS = new Set(DEFAULT_CATEGORIES.flatMap((c) => [c.id, ...c.children.map((s) => s.id)]));

/** True if `id` is one of the built-in category IDs. */
export function isDefaultCategoryId(id: string): boolean {
  return ALL_IDS.has(id);
}

/** Parent ID of a built-in subcategory ("food.food_delivery" → "food"). */
export function defaultParentOf(subcategoryId: string): string | null {
  const parent = DEFAULT_CATEGORIES.find((c) => c.children.some((s) => s.id === subcategoryId));
  return parent?.id ?? null;
}
