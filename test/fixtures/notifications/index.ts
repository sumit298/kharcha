/**
 * SYNTHETIC notification corpus. Formats approximate public Indian bank/UPI alert styles; all
 * names, accounts and references are invented. Replace/extend with anonymized real formats in
 * Phase 6.
 */
import type { NonFinancialReason } from '@/services/detection/detect';
import type { Direction, ParsedKind, ParsedStatus, PaymentMethod, RawNotificationPayload } from '@/types';

import { app, PKG, payload, sms } from './builders';

export interface ExpectedParse {
  amountMinor: number;
  direction: Direction;
  kind?: ParsedKind;
  status?: ParsedStatus;
  merchantRaw?: string | null;
  payeeVpa?: string | null;
  reference?: string | null;
  last4?: string | null;
  paymentMethod?: PaymentMethod;
  currency?: string;
}

export interface NotificationFixture {
  id: string;
  payload: RawNotificationPayload;
  /** 'financial' fixtures must parse to `parsed` (or fail when parsed is null). */
  detect: 'financial' | 'redacted' | NonFinancialReason;
  parsed?: ExpectedParse | null;
}

export const FIXTURES: NotificationFixture[] = [
  // ─── UPI apps ──────────────────────────────────────────────────────────────
  {
    id: 'gpay.paid_merchant',
    payload: app(PKG.gpay, 'Payment successful', '₹124 paid to Zomato'),
    detect: 'financial',
    parsed: { amountMinor: 12400, direction: 'debit', kind: 'payment', merchantRaw: 'Zomato', paymentMethod: 'upi' },
  },
  {
    id: 'gpay.received_p2p',
    payload: app(PKG.gpay, 'Asha Test paid you ₹500', 'Money received in your bank account'),
    detect: 'financial',
    parsed: { amountMinor: 50000, direction: 'credit', kind: 'receipt', merchantRaw: 'Asha Test' },
  },
  {
    id: 'phonepe.paid_with_account',
    payload: app(PKG.phonepe, 'Paid ₹82 to Rapido', 'Debited from HDFC Bank - 1234'),
    detect: 'financial',
    parsed: { amountMinor: 8200, direction: 'debit', merchantRaw: 'Rapido', last4: '1234', paymentMethod: 'upi' },
  },
  {
    id: 'phonepe.received',
    payload: app(PKG.phonepe, 'Received ₹1,500 from Ravi Kumar', 'Credited to Axis Bank - 9876'),
    detect: 'financial',
    parsed: { amountMinor: 150000, direction: 'credit', merchantRaw: 'Ravi Kumar', last4: '9876' },
  },
  {
    id: 'paytm.paid_ref',
    payload: app(PKG.paytm, 'Paid Rs.250 to Chai Point', 'UPI Ref No: 612345678901'),
    detect: 'financial',
    parsed: { amountMinor: 25000, direction: 'debit', merchantRaw: 'Chai Point', reference: '612345678901' },
  },
  {
    id: 'paytm.failed',
    payload: app(PKG.paytm, 'Payment Failed', 'Your payment of ₹399 to Big Mart failed. Any amount deducted will be refunded.'),
    detect: 'financial',
    parsed: { amountMinor: 39900, direction: 'debit', status: 'failed', merchantRaw: 'Big Mart' },
  },
  {
    id: 'bhim.pending',
    payload: app(PKG.bhim, 'Transaction pending', 'Payment of ₹2,000 to shop.test@okaxis is pending'),
    detect: 'financial',
    parsed: { amountMinor: 200000, direction: 'debit', status: 'pending', payeeVpa: 'shop.test@okaxis' },
  },
  {
    id: 'cred.card_bill',
    payload: app(PKG.cred, 'Payment successful', '₹12,450 paid towards your HDFC Bank credit card ending 4321'),
    detect: 'financial',
    parsed: { amountMinor: 1245000, direction: 'debit', kind: 'bill_payment', last4: '4321' },
  },
  {
    id: 'gpay.upi_lite_topup',
    payload: app(PKG.gpay, 'UPI Lite', '₹1,000 added to your UPI Lite balance'),
    detect: 'financial',
    parsed: { amountMinor: 100000, direction: 'debit', kind: 'wallet_topup', paymentMethod: 'upi_lite' },
  },
  {
    id: 'gpay.collect_request',
    payload: app(PKG.gpay, 'Payment request', 'Test Seller has requested ₹1,999. Tap to pay.'),
    detect: 'collect_request',
  },
  {
    id: 'phonepe.cashback_offer',
    payload: app(PKG.phonepe, 'Offer for you', 'Get up to ₹100 cashback on your next recharge. T&C apply'),
    detect: 'promotional',
  },
  {
    id: 'gpay.reward_credited',
    payload: app(PKG.gpay, 'You won ₹15', '₹15 cashback credited to your bank account XX1234'),
    detect: 'financial',
    parsed: { amountMinor: 1500, direction: 'credit', kind: 'receipt' },
  },

  // ─── Bank SMS ──────────────────────────────────────────────────────────────
  {
    id: 'hdfc.upi_sent',
    payload: sms(
      'AX-HDFCBK-S',
      'Sent Rs.124.00\nFrom HDFC Bank A/C *1234\nTo ZOMATO LTD\nOn 01/10/26\nRef 612345678902\nNot You?\nCall 18000000000/SMS BLOCK UPI to 7000000000',
    ),
    detect: 'financial',
    parsed: {
      amountMinor: 12400,
      direction: 'debit',
      merchantRaw: 'ZOMATO LTD',
      reference: '612345678902',
      last4: '1234',
      paymentMethod: 'upi',
    },
  },
  {
    id: 'hdfc.card_spent',
    payload: sms(
      'VM-HDFCBK-T',
      'Spent Rs.1,499 On HDFC Bank Card 5678 At AMAZON PAY INDIA On 2026-10-01:12:10:05 Bal Rs.45,000 Not You? Call 18000000000',
    ),
    detect: 'financial',
    parsed: { amountMinor: 149900, direction: 'debit', merchantRaw: 'AMAZON PAY INDIA', last4: '5678', paymentMethod: 'card' },
  },
  {
    id: 'hdfc.credit_vpa',
    payload: sms(
      'JD-HDFCBK-S',
      'Credit Alert!\nRs.500.00 credited to HDFC Bank A/c XX1234 on 01-10-26 from VPA friend.test@okicici (UPI 612345678903)',
    ),
    detect: 'financial',
    parsed: {
      amountMinor: 50000,
      direction: 'credit',
      payeeVpa: 'friend.test@okicici',
      reference: '612345678903',
      last4: '1234',
    },
  },
  {
    id: 'sbi.upi_debit_bare_amount',
    payload: sms(
      'AD-SBIUPI-S',
      'Dear UPI user A/C X4321 debited by 124.0 on date 01Oct26 trf to SWIGGY Refno 612345678904. If not u? call 1800000000. -SBI',
    ),
    detect: 'financial',
    parsed: { amountMinor: 12400, direction: 'debit', merchantRaw: 'SWIGGY', reference: '612345678904', last4: '4321' },
  },
  {
    id: 'sbi.upi_credit',
    payload: sms('BZ-SBIINB-S', 'Dear SBI UPI User, ur A/cX4321 credited by Rs500 on 01Oct26 by (Ref no 612345678905)'),
    detect: 'financial',
    parsed: { amountMinor: 50000, direction: 'credit', reference: '612345678905', last4: '4321', merchantRaw: null },
  },
  {
    id: 'icici.upi_debit',
    payload: sms(
      'AX-ICICIB-S',
      'ICICI Bank Acct XX123 debited for Rs 349.00 on 01-Oct-26; BLINKIT credited. UPI:612345678906. Call 18000000000 for dispute.',
    ),
    detect: 'financial',
    parsed: { amountMinor: 34900, direction: 'debit', merchantRaw: 'BLINKIT', reference: '612345678906', last4: '123' },
  },
  {
    id: 'icici.cc_spent',
    payload: sms(
      'VK-ICICIT-S',
      'INR 1,249.00 spent using ICICI Bank Card XX9012 on 01-Oct-26 on NETFLIX. Avl Limit: INR 88,751.00. If not you, call 18000000000.',
    ),
    detect: 'financial',
    parsed: { amountMinor: 124900, direction: 'debit', merchantRaw: 'NETFLIX', last4: '9012' },
  },
  {
    id: 'axis.upi_narration',
    payload: sms(
      'AX-AXISBK-S',
      'INR 82.00 debited\nA/c no. XX5555\n01-10-26, 12:28:40\nUPI/P2M/612345678907/RAPIDO\nNot you? SMS BLOCKUPI to 900000000\nAxis Bank',
    ),
    detect: 'financial',
    parsed: { amountMinor: 8200, direction: 'debit', merchantRaw: 'RAPIDO', reference: '612345678907', last4: '5555' },
  },
  {
    id: 'kotak.upi_sent_vpa',
    payload: sms(
      'AX-KOTAKB-S',
      'Sent Rs.199.00 from Kotak Bank AC X7777 to netflix.test@icici on 01-10-26.UPI Ref 612345678908. Not you, call 18000000000',
    ),
    detect: 'financial',
    parsed: { amountMinor: 19900, direction: 'debit', payeeVpa: 'netflix.test@icici', reference: '612345678908', last4: '7777' },
  },
  {
    id: 'bank.atm',
    payload: sms('AX-HDFCBK-S', 'Rs.5,000 withdrawn at ATM TEST LOCATION from A/c XX1234 on 01-10-26. Avl Bal Rs.20,000'),
    detect: 'financial',
    parsed: { amountMinor: 500000, direction: 'debit', kind: 'atm_withdrawal', paymentMethod: 'atm', last4: '1234' },
  },
  {
    id: 'bank.neft_salary',
    payload: sms('AX-HDFCBK-S', 'Rs.85,000.00 credited to A/c XX1234 on 01-10-26 by NEFT from TEST EMPLOYER PVT LTD. Avl Bal Rs.1,05,000.00'),
    detect: 'financial',
    parsed: { amountMinor: 8500000, direction: 'credit', kind: 'receipt', paymentMethod: 'neft', merchantRaw: 'TEST EMPLOYER PVT LTD' },
  },
  {
    id: 'bank.refund',
    payload: sms('AX-ICICIB-S', 'Refund of Rs 499.00 from MYNTRA credited to your Acct XX123 on 01-Oct-26.'),
    detect: 'financial',
    parsed: { amountMinor: 49900, direction: 'credit', kind: 'refund', merchantRaw: 'MYNTRA', last4: '123' },
  },
  {
    id: 'bank.reversal',
    payload: sms('AX-SBIUPI-S', 'Rs.399 reversed to your A/c X4321 for failed txn Ref 612345678909 on 01Oct26.'),
    detect: 'financial',
    parsed: { amountMinor: 39900, direction: 'credit', kind: 'reversal', status: 'success', reference: '612345678909' },
  },
  {
    id: 'bank.self_transfer',
    payload: sms('AX-HDFCBK-S', 'Rs.10,000 debited from A/c XX1234 for self transfer to A/c XX9999 via IMPS Ref 612345678910'),
    detect: 'financial',
    parsed: { amountMinor: 1000000, direction: 'debit', kind: 'transfer', paymentMethod: 'imps' },
  },
  {
    id: 'bank.autopay_executed',
    payload: sms('AX-HDFCBK-S', 'UPI AutoPay of Rs.649.00 for SPOTIFY debited from A/c XX1234 on 01-10-26. UPI Ref 612345678911'),
    detect: 'financial',
    parsed: { amountMinor: 64900, direction: 'debit', paymentMethod: 'autopay', reference: '612345678911' },
  },
  {
    id: 'bank.usd_card',
    payload: sms('AX-HDFCBK-S', 'USD 12.99 spent on HDFC Bank Credit Card XX4321 at GITHUB.COM on 2026-10-01:08:15:00'),
    detect: 'financial',
    parsed: { amountMinor: 1299, direction: 'debit', currency: 'USD', merchantRaw: 'GITHUB.COM', paymentMethod: 'credit_card' },
  },
  {
    id: 'cardissuer.bill_payment_received',
    payload: sms('AX-SBICRD-S', 'We have received payment of Rs.12,450.00 towards your SBI Card ending 4321. Thank you.'),
    detect: 'financial',
    parsed: { amountMinor: 1245000, direction: 'credit', kind: 'bill_payment', last4: '4321' },
  },

  // ─── Look-alikes (must be rejected) ────────────────────────────────────────
  {
    id: 'otp.card_txn',
    payload: sms('AX-HDFCBK-S', 'OTP for txn of Rs 5,000.00 at TESTSHOP on card XX1234 is 482913. Valid for 10 mins. Do not share.'),
    detect: 'otp',
  },
  {
    id: 'otp.login',
    payload: sms('AX-ICICIB-S', '482913 is your OTP for login. Never share it with anyone.'),
    detect: 'otp',
  },
  {
    id: 'reminder.autopay_predebit',
    payload: sms('AX-HDFCBK-S', 'Rs.649 will be debited on 05-10-26 for SPOTIFY via UPI AutoPay. To stop, visit your UPI app.'),
    detect: 'payment_reminder',
  },
  {
    id: 'reminder.bill_due',
    payload: sms('VM-AIRTEL-S', 'Your bill of Rs 599 is due on 05-Oct-26. Pay now to avoid late fee.'),
    detect: 'payment_reminder',
  },
  {
    id: 'statement.card',
    payload: sms('AX-SBICRD-S', 'Statement for SBI Card ending 4321: Total Amount Due Rs.12,450.00, Min Amount Due Rs.620.00, due by 20-Oct-26.'),
    detect: 'statement',
  },
  {
    id: 'mandate.created',
    payload: app(PKG.gpay, 'AutoPay set up', 'AutoPay of up to ₹199 created for NETFLIX'),
    detect: 'mandate_setup',
  },
  {
    id: 'promo.loan_sms',
    payload: sms('AX-HDFCBK-P', 'Pre-approved personal loan of Rs 5,00,000 for you! Apply now.'),
    detect: 'promotional',
  },
  {
    id: 'promo.loan_no_suffix',
    payload: sms('AD-TESTFN', 'You are eligible for an instant loan up to Rs 2,00,000. Click here to apply.'),
    detect: 'promotional',
  },
  {
    id: 'balance.only',
    payload: sms('AX-SBIINB-S', 'Available balance in A/c X4321 is Rs 12,345.67 as on 01-10-26.'),
    detect: 'balance_info',
  },
  {
    id: 'merchant.order_shipped',
    payload: app(PKG.amazon, 'Shipped', 'Your order of ₹499 has been shipped.'),
    detect: 'no_transaction',
  },
  {
    id: 'chat.no_amount',
    payload: app('com.whatsapp', 'Friend', 'See you at 5'),
    detect: 'no_amount',
  },
  {
    id: 'redacted.sms',
    payload: sms('AX-HDFCBK-S', 'Sensitive notification content hidden'),
    detect: 'redacted',
  },

  // ─── Merchant apps ─────────────────────────────────────────────────────────
  {
    id: 'zomato.payment',
    payload: app(PKG.zomato, 'Order placed', 'Payment of ₹356 successful'),
    detect: 'financial',
    parsed: { amountMinor: 35600, direction: 'debit', merchantRaw: 'Zomato' },
  },
  {
    id: 'swiggy.received_payment',
    payload: app(PKG.swiggy, 'Order confirmed', 'We have received your payment of ₹410'),
    detect: 'financial',
    parsed: { amountMinor: 41000, direction: 'debit', merchantRaw: 'Swiggy' },
  },

  // ─── Unknown app, generic parsing ──────────────────────────────────────────
  {
    id: 'unknown.generic_debit',
    payload: app(PKG.unknown, 'Transaction alert', 'INR 2,340.50 debited from your account ending 6789 towards DMART'),
    detect: 'financial',
    parsed: { amountMinor: 234050, direction: 'debit', merchantRaw: 'DMART', last4: '6789' },
  },
  {
    id: 'unknown.payment_successful_no_verb',
    payload: payload({ packageName: PKG.gpay, title: '₹60', text: 'Payment successful' }),
    detect: 'financial',
    parsed: { amountMinor: 6000, direction: 'debit' },
  },
];
