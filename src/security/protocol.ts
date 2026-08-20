import { Db } from 'mongodb';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — CRYPTO-SCALED SPENDING CAPS (USDC, IMMUTABLE)
// ─────────────────────────────────────────────────────────────────────────────

export type SpendingCategory =
  | 'airtime_data'
  | 'electricity_bills'
  | 'send_money'
  | 'flights_shopping_swap';

interface CategoryCap {
  label: string;
  perTxMaxUSDC: number;
}

const CATEGORY_CAPS: Record<SpendingCategory, CategoryCap> = {
  airtime_data:         { label: 'Airtime / Data Top-up',       perTxMaxUSDC: 50 },
  electricity_bills:    { label: 'Electricity / Bills / Ramps',  perTxMaxUSDC: 250 },
  send_money:           { label: 'Send Money / Wallet Transfer', perTxMaxUSDC: 1_500 },
  flights_shopping_swap:{ label: 'Flights / Shopping / Swap',    perTxMaxUSDC: 3_000 },
};

const DAILY_WALLET_CAP_USDC = 5_000;

export function getCategoryForService(service: string): SpendingCategory {
  switch (service) {
    case 'airtime':
    case 'data':
      return 'airtime_data';
    case 'electricity':
    case 'cable':
      return 'electricity_bills';
    case 'send_money':
      return 'send_money';
    case 'swap':
    case 'flights':
    case 'shopping':
      return 'flights_shopping_swap';
    default:
      return 'airtime_data';
  }
}

export function getCategoryCap(category: SpendingCategory): CategoryCap {
  return CATEGORY_CAPS[category];
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — PASSKEY CHALLENGE GATEKEEPER
// ─────────────────────────────────────────────────────────────────────────────

export class PayBoxSecurityError extends Error {
  constructor(
    message: string,
    public code: string,
    public httpStatus: number = 402,
  ) {
    super(message);
    this.name = 'PayBoxSecurityError';
  }
}

export function enforceCategoryCap(
  service: string,
  assetAmount: string,
): { allowed: boolean; category: SpendingCategory; cap: CategoryCap; amount: number } {
  const category = getCategoryForService(service);
  const cap = getCategoryCap(category);
  const amount = parseFloat(assetAmount);

  if (amount > cap.perTxMaxUSDC) {
    throw new PayBoxSecurityError(
      `PayBox Passkey verification required. ${cap.label} cap is ${cap.perTxMaxUSDC} USDC per transaction. Requested: ${amount} USDC.`,
      'PASSKEY_VERIFICATION_REQUIRED',
      402,
    );
  }

  return { allowed: true, category, cap, amount };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — DAILY WALLET CAP (5,000 USDC ACROSS ALL FEATURES)
// ─────────────────────────────────────────────────────────────────────────────

export async function enforceDailyWalletCap(
  db: Db,
  userId: string,
  additionalAmount: number,
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const key = `${userId}:${today}`;

  const doc = await db.collection<{ key: string; total: number }>('daily_wallet_spends').findOne({ key });
  const currentTotal = doc?.total ?? 0;
  const newTotal = currentTotal + additionalAmount;

  if (newTotal > DAILY_WALLET_CAP_USDC) {
    throw new PayBoxSecurityError(
      `Daily wallet cap exceeded. ${DAILY_WALLET_CAP_USDC} USDC daily limit across all features. Today's spend: ${currentTotal.toFixed(2)} USDC. Requested: ${additionalAmount} USDC.`,
      'DAILY_WALLET_CAP_EXCEEDED',
      402,
    );
  }

  await db.collection('daily_wallet_spends').updateOne(
    { key },
    { $set: { key, userId, date: today, total: newTotal } },
    { upsert: true },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — SLIPPAGE PROTECTION (SWAP TOKENS)
// ─────────────────────────────────────────────────────────────────────────────

const MAX_SLIPPAGE_PERCENT = 1.0;

export interface PathPaymentQuote {
  sourceAsset: string;
  destinationAsset: string;
  sourceAmount: string;
  destinationAmount: string;
  expectedPrice: string;
  networkFee: string;
  slippageBps: number;
}

export function validateSlippage(quote: PathPaymentQuote): void {
  const slippagePercent = quote.slippageBps / 100;

  if (slippagePercent > MAX_SLIPPAGE_PERCENT) {
    throw new PayBoxSecurityError(
      `Slippage threshold exceeded. Aborting swap to protect USDC balance. Estimated slippage: ${slippagePercent.toFixed(2)}% (max: ${MAX_SLIPPAGE_PERCENT}%)`,
      'SLIPPAGE_THRESHOLD_EXCEEDED',
      400,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — STELLAR ADDRESS & MEMO VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z0-9]{55}$/;
const STELLAR_SECRET_KEY_REGEX = /^S[A-Z0-9]{55}$/;

// Known anchor/exchange prefixes that typically require a memo
const MEMO_REQUIRED_PREFIXES = [
  'GBACEST',  // Binance
  'GBSHZN',   // Coinbase
  'GAOK',     // StellarTerm exchange
  'GAD',      // Stronghold
];

export function isValidStellarAddress(address: string): boolean {
  return STELLAR_PUBLIC_KEY_REGEX.test(address);
}

export function isValidStellarSecretKey(secret: string): boolean {
  return STELLAR_SECRET_KEY_REGEX.test(secret);
}

export function requiresMemo(address: string): boolean {
  return MEMO_REQUIRED_PREFIXES.some((prefix) => address.startsWith(prefix));
}

export function validateStellarDestination(
  address: string,
  memo?: string,
): { valid: boolean; error?: string } {
  if (!isValidStellarAddress(address)) {
    return { valid: false, error: 'Invalid Stellar address. Must start with G and be 56 alphanumeric characters.' };
  }

  if (requiresMemo(address) && (!memo || memo.trim() === '')) {
    return {
      valid: false,
      error: 'This destination address requires a Stellar Memo ID. Please provide a Memo before proceeding.',
    };
  }

  return { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — TRANSACTION STATE ISOLATION (SINGLE-USE)
// ─────────────────────────────────────────────────────────────────────────────

const activeSessions = new Map<string, { createdAt: number; service: string }>();
const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function acquireTransactionLock(sessionId: string, service: string): boolean {
  cleanupExpiredSessions();

  if (activeSessions.has(sessionId)) {
    return false; // already in use
  }

  activeSessions.set(sessionId, { createdAt: Date.now(), service });
  return true;
}

export function releaseTransactionLock(sessionId: string): void {
  activeSessions.delete(sessionId);
}

function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of activeSessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      activeSessions.delete(id);
    }
  }
}
