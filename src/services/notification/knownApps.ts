import type { CategoryHint, SourceKind } from '@/types';

/**
 * Apps whose notifications Kharcha knows about. Unknown packages are still processed when their
 * text looks like money (sourceKind `other`), so this list improves accuracy but is not a gate.
 *
 * Package names are from public Play Store listings; verify on a real device in Phase 6.
 * The native listener's allowlist should be generated from this list.
 */
export interface KnownApp {
  packageName: string;
  name: string;
  sourceKind: SourceKind;
  /** Bank / card issuer behind the app, used for account hints. */
  institution?: string;
  /** For merchant apps: the merchant their payment notifications are about. */
  merchant?: { name: string; categoryHint: CategoryHint };
}

const merchantApp = (packageName: string, name: string, categoryId: string, subcategoryId: string): KnownApp => ({
  packageName,
  name,
  sourceKind: 'merchant_app',
  merchant: { name, categoryHint: { categoryId, subcategoryId } },
});

export const KNOWN_APPS: readonly KnownApp[] = [
  // Synthetic source used by the direct SMS inbox reader. It is deliberately not a real app
  // package: the SMS provider is the source, while the user's Messages/Truecaller app may vary.
  { packageName: 'app.kharcha.sms-inbox', name: 'Bank SMS (inbox)', sourceKind: 'sms_app' },

  // UPI apps
  { packageName: 'com.google.android.apps.nbu.paisa.user', name: 'Google Pay', sourceKind: 'upi_app' },
  { packageName: 'com.phonepe.app', name: 'PhonePe', sourceKind: 'upi_app' },
  { packageName: 'net.one97.paytm', name: 'Paytm', sourceKind: 'upi_app' },
  { packageName: 'in.org.npci.upiapp', name: 'BHIM', sourceKind: 'upi_app' },
  { packageName: 'com.dreamplug.androidapp', name: 'CRED', sourceKind: 'upi_app' },
  { packageName: 'com.mobikwik_new', name: 'MobiKwik', sourceKind: 'wallet_app' },

  // SMS apps (bank SMS and RCS alerts arrive through these)
  { packageName: 'com.google.android.apps.messaging', name: 'Messages', sourceKind: 'sms_app' },
  { packageName: 'com.samsung.android.messaging', name: 'Samsung Messages', sourceKind: 'sms_app' },
  { packageName: 'com.android.mms', name: 'Messaging', sourceKind: 'sms_app' },
  { packageName: 'com.truecaller', name: 'Truecaller', sourceKind: 'sms_app' },

  // Bank apps
  { packageName: 'com.snapwork.hdfc', name: 'HDFC Bank', sourceKind: 'bank_app', institution: 'HDFC Bank' },
  { packageName: 'com.sbi.lotusintouch', name: 'YONO SBI', sourceKind: 'bank_app', institution: 'SBI' },
  { packageName: 'com.csam.icici.bank.imobile', name: 'iMobile', sourceKind: 'bank_app', institution: 'ICICI Bank' },
  { packageName: 'com.axis.mobile', name: 'Axis Mobile', sourceKind: 'bank_app', institution: 'Axis Bank' },
  { packageName: 'com.msf.kbank.mobile', name: 'Kotak Bank', sourceKind: 'bank_app', institution: 'Kotak Mahindra Bank' },
  { packageName: 'com.idfcfirstbank.optimus', name: 'IDFC FIRST Bank', sourceKind: 'bank_app', institution: 'IDFC FIRST Bank' },
  { packageName: 'money.jupiter', name: 'Jupiter', sourceKind: 'bank_app' },
  { packageName: 'com.epifi.paisa', name: 'Fi', sourceKind: 'bank_app' },

  // Card apps
  { packageName: 'indwin.c3.shareapp', name: 'slice', sourceKind: 'card_app' },

  // Merchant apps (order/payment confirmations). Amazon also hosts Amazon Pay UPI, so it has no
  // merchant fallback: its UPI payments name the real payee.
  { packageName: 'in.amazon.mShop.android.shopping', name: 'Amazon Pay', sourceKind: 'upi_app' },
  merchantApp('com.application.zomato', 'Zomato', 'food', 'food.food_delivery'),
  merchantApp('in.swiggy.android', 'Swiggy', 'food', 'food.food_delivery'),
  merchantApp('com.grofers.customerapp', 'Blinkit', 'food', 'food.groceries'),
  merchantApp('com.zeptoconsumerapp', 'Zepto', 'food', 'food.groceries'),
  merchantApp('com.ubercab', 'Uber', 'transport', 'transport.cab'),
  merchantApp('com.olacabs.customer', 'Ola', 'transport', 'transport.cab'),
  merchantApp('com.rapido.passenger', 'Rapido', 'transport', 'transport.bike_taxi'),
  merchantApp('cris.org.in.prs.ima', 'IRCTC', 'travel', 'travel.trains'),
  merchantApp('com.netflix.mediaclient', 'Netflix', 'bills', 'bills.ott'),
  merchantApp('com.spotify.music', 'Spotify', 'bills', 'bills.music'),
];

const BY_PACKAGE = new Map(KNOWN_APPS.map((app) => [app.packageName, app]));

export function findKnownApp(packageName: string): KnownApp | undefined {
  return BY_PACKAGE.get(packageName);
}

export function sourceKindOf(packageName: string): SourceKind {
  return BY_PACKAGE.get(packageName)?.sourceKind ?? 'other';
}
