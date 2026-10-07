import type { TransactionType } from '@/types';

/**
 * Built-in merchants (ARCHITECTURE §6 level 2). `aliases` are lower-case words/phrases matched
 * on word boundaries against the cleaned merchant text and the UPI ID's handle. More specific
 * entries come first ("swiggy instamart" before "swiggy").
 */
export interface KnownMerchant {
  name: string;
  aliases: readonly string[];
  categoryId: string;
  subcategoryId: string | null;
  /** Override for money that isn't spending (e.g. broker top-ups are transfers). */
  type?: TransactionType;
}

const m = (
  name: string,
  aliases: string[],
  subcategoryId: string,
  type?: TransactionType,
): KnownMerchant => ({
  name,
  aliases,
  categoryId: subcategoryId.split('.')[0] ?? subcategoryId,
  subcategoryId,
  ...(type ? { type } : {}),
});

export const KNOWN_MERCHANTS: readonly KnownMerchant[] = [
  // Food
  m('Swiggy Instamart', ['swiggy instamart', 'instamart'], 'food.groceries'),
  m('Zomato', ['zomato'], 'food.food_delivery'),
  m('Swiggy', ['swiggy', 'bundl technologies'], 'food.food_delivery'),
  m('Blinkit', ['blinkit', 'grofers'], 'food.groceries'),
  m('Zepto', ['zepto', 'kiranakart'], 'food.groceries'),
  m('BigBasket', ['bigbasket', 'bbnow', 'supermarket grocery supplies'], 'food.groceries'),
  m('DMart', ['dmart', 'avenue supermarts'], 'food.groceries'),
  m('Reliance Smart', ['reliance fresh', 'reliance smart', 'smart bazaar'], 'food.groceries'),
  m('Starbucks', ['starbucks', 'tata starbucks'], 'food.cafes'),
  m('Chaayos', ['chaayos'], 'food.cafes'),
  m('Third Wave Coffee', ['third wave coffee'], 'food.cafes'),
  m("McDonald's", ['mcdonalds', 'mc donalds', 'hardcastle restaurants', 'connaught plaza restaurants'], 'food.fast_food'),
  m("Domino's", ['dominos', 'jubilant foodworks'], 'food.fast_food'),
  m('KFC', ['kfc', 'devyani international'], 'food.fast_food'),
  m('Burger King', ['burger king', 'restaurant brands asia'], 'food.fast_food'),
  m('Country Delight', ['country delight'], 'food.dairy'),
  m('Licious', ['licious', 'delightful gourmet'], 'food.meat_eggs'),

  // Transport
  m('Rapido', ['rapido', 'roppen transportation'], 'transport.bike_taxi'),
  m('Uber', ['uber'], 'transport.cab'),
  m('Ola', ['ola', 'olacabs', 'ani technologies'], 'transport.cab'),
  m('Namma Yatri', ['namma yatri', 'nammayatri'], 'transport.auto'),
  m('Metro', ['metro rail', 'bmrcl', 'dmrc', 'mmrda', 'hyderabad metro', 'chennai metro', 'metro card'], 'transport.metro'),
  m('FASTag', ['fastag', 'netc'], 'transport.toll'),
  m('Indian Oil', ['indian oil', 'iocl'], 'transport.fuel'),
  m('HPCL', ['hpcl', 'hindustan petroleum'], 'transport.fuel'),
  m('BPCL', ['bpcl', 'bharat petroleum'], 'transport.fuel'),
  m('Shell', ['shell'], 'transport.fuel'),

  // Shopping
  m('Amazon', ['amazon', 'amzn', 'amazon pay'], 'shopping.online'),
  m('Flipkart', ['flipkart'], 'shopping.online'),
  m('Myntra', ['myntra'], 'shopping.clothing'),
  m('Ajio', ['ajio'], 'shopping.clothing'),
  m('Meesho', ['meesho'], 'shopping.online'),
  m('Nykaa', ['nykaa'], 'shopping.personal_care'),
  m('Decathlon', ['decathlon'], 'shopping.accessories'),
  m('Croma', ['croma', 'infiniti retail'], 'shopping.electronics'),
  m('Reliance Digital', ['reliance digital'], 'shopping.electronics'),
  m('IKEA', ['ikea'], 'shopping.home'),

  // Health
  m('Apollo Pharmacy', ['apollo pharmacy', 'apollo pharma'], 'health.pharmacy'),
  m('PharmEasy', ['pharmeasy'], 'health.pharmacy'),
  m('Tata 1mg', ['1mg', 'tata 1mg'], 'health.pharmacy'),
  m('Netmeds', ['netmeds'], 'health.pharmacy'),

  // Entertainment & subscriptions
  m('BookMyShow', ['bookmyshow', 'bigtree entertainment'], 'entertainment.movies'),
  m('PVR INOX', ['pvr', 'inox'], 'entertainment.movies'),
  m('Netflix', ['netflix'], 'bills.ott'),
  m('JioHotstar', ['hotstar', 'jiohotstar', 'disney'], 'bills.ott'),
  m('Prime Video', ['prime video', 'primevideo'], 'bills.ott'),
  m('YouTube Premium', ['youtube'], 'bills.ott'),
  m('Spotify', ['spotify'], 'bills.music'),
  m('Google Play', ['google play', 'play store'], 'bills.software'),
  m('Apple', ['apple services', 'apple com', 'itunes'], 'bills.software'),
  m('GitHub', ['github'], 'bills.software'),
  m('Microsoft', ['microsoft'], 'bills.software'),
  m('Google Cloud', ['google cloud', 'google workspace'], 'bills.cloud'),
  m('AWS', ['aws', 'amazon web services'], 'bills.cloud'),

  // Bills
  m('Airtel', ['airtel', 'bharti airtel'], 'bills.mobile'),
  m('Jio', ['jio', 'reliance jio'], 'bills.mobile'),
  m('Vi', ['vodafone idea', 'vodafone', 'vi prepaid', 'vi postpaid'], 'bills.mobile'),
  m('ACT Fibernet', ['act fibernet', 'atria convergence'], 'housing.internet'),
  m('BESCOM', ['bescom'], 'housing.electricity'),
  m('Tata Power', ['tata power'], 'housing.electricity'),
  m('Adani Electricity', ['adani electricity'], 'housing.electricity'),

  // Travel
  m('IRCTC', ['irctc'], 'travel.trains'),
  m('MakeMyTrip', ['makemytrip', 'mmt'], 'travel.flights'),
  m('Goibibo', ['goibibo'], 'travel.flights'),
  m('IndiGo', ['indigo', 'interglobe aviation'], 'travel.flights'),
  m('Air India', ['air india'], 'travel.flights'),
  m('redBus', ['redbus'], 'travel.bus'),
  m('OYO', ['oyo'], 'travel.hotels'),

  // Education
  m('Udemy', ['udemy'], 'education.platforms'),
  m('Coursera', ['coursera'], 'education.platforms'),

  // Finance (money moved, not spent)
  m('Zerodha', ['zerodha'], 'finance.investments', 'transfer'),
  m('Groww', ['groww', 'nextbillion technology'], 'finance.investments', 'transfer'),
  m('LIC', ['lic of india', 'life insurance corporation'], 'finance.insurance'),
];
