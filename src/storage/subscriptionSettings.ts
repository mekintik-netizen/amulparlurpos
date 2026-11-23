/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Subscription Settings Persistence & Real-time Cloud Synchronization
 * Manages expiry popup message, ₹500 renewal fee, UPI ID, QR Code, and WhatsApp link.
 * Persists directly to Cloud Firestore collection 'adminSettings', document 'subscriptionConfig'
 * with local caching for instant counter rendering and offline reliability.
 */

import { doc, getDoc, setDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db, ensureAnonymousAuth } from './firebase.ts';
import { SubscriptionSettingsConfig, DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG, Shop } from '../types/index.ts';

const LOCAL_STORAGE_KEY = 'amul_pos_subscription_settings';
const CUSTOM_EVENT_KEY = 'amul-subscription-settings-changed';

let inMemoryConfig: SubscriptionSettingsConfig | null = null;

/**
 * Reads in-memory subscription settings (hydrated from Cloud Firestore `adminSettings/subscriptionConfig`).
 * Never uses browser localStorage for business subscription configuration.
 */
export function getCachedSubscriptionSettings(): SubscriptionSettingsConfig {
  if (inMemoryConfig) return inMemoryConfig;
  inMemoryConfig = { ...DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG };
  return inMemoryConfig;
}

/**
 * Updates in-memory state and dispatches in-app CustomEvent.
 */
function cacheInMemory(config: SubscriptionSettingsConfig): void {
  inMemoryConfig = config;
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CUSTOM_EVENT_KEY, { detail: config }));
    }
  } catch {
    // ignore
  }
}

function consumeLegacySubscriptionSettingsFromLocalStorage(): Partial<SubscriptionSettingsConfig> | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    return JSON.parse(raw) as Partial<SubscriptionSettingsConfig>;
  } catch {
    return null;
  }
}

/**
 * Fetches the master Subscription Settings from Cloud Firestore (`adminSettings/subscriptionConfig`).
 * Migrates any legacy localStorage config once if Firestore does not yet have it, then clears browser cache.
 */
export async function getSubscriptionSettingsConfig(): Promise<SubscriptionSettingsConfig> {
  try {
    await ensureAnonymousAuth();
    const docRef = doc(db, 'adminSettings', 'subscriptionConfig');
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      consumeLegacySubscriptionSettingsFromLocalStorage();
      const remote = snap.data() as Partial<SubscriptionSettingsConfig>;
      const merged: SubscriptionSettingsConfig = {
        ...DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG,
        ...remote
      };
      cacheInMemory(merged);
      return merged;
    } else {
      const legacy = consumeLegacySubscriptionSettingsFromLocalStorage();
      const initial: SubscriptionSettingsConfig = {
        ...DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG,
        ...(legacy || {}),
        updatedAt: new Date().toISOString()
      };
      await setDoc(docRef, initial, { merge: true });
      cacheInMemory(initial);
      return initial;
    }
  } catch (err) {
    console.warn('[SubscriptionSettings] Failed to fetch remote config from Firestore, using in-memory defaults:', err);
    return getCachedSubscriptionSettings();
  }
}

/**
 * Saves customized subscription settings directly to Cloud Firestore under `adminSettings/subscriptionConfig`.
 */
export async function saveSubscriptionSettingsConfig(
  updates: Partial<SubscriptionSettingsConfig>,
  updatedBy: string = 'Master Admin'
): Promise<SubscriptionSettingsConfig> {
  const current = getCachedSubscriptionSettings();
  const updated: SubscriptionSettingsConfig = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy
  };

  cacheInMemory(updated);

  try {
    await ensureAnonymousAuth();
    const docRef = doc(db, 'adminSettings', 'subscriptionConfig');
    await setDoc(docRef, updated, { merge: true });
  } catch (err) {
    console.error('[SubscriptionSettings] Failed to persist subscription settings to Firestore:', err);
    throw err;
  }

  return updated;
}

/**
 * Resets subscription configuration to factory default.
 */
export async function resetSubscriptionSettingsConfig(
  updatedBy: string = 'Master Admin'
): Promise<SubscriptionSettingsConfig> {
  return saveSubscriptionSettingsConfig(DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG, updatedBy);
}

/**
 * Subscribes to real-time updates of the Subscription Settings in Firestore.
 */
export function subscribeToSubscriptionSettings(
  callback: (config: SubscriptionSettingsConfig) => void
): Unsubscribe {
  // Fire initial cached value immediately
  callback(getCachedSubscriptionSettings());

  // Listen to local cross-tab / in-window events
  const localListener = (e: Event) => {
    const customEvt = e as CustomEvent<SubscriptionSettingsConfig>;
    if (customEvt.detail) {
      callback(customEvt.detail);
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener(CUSTOM_EVENT_KEY, localListener);
  }

  // Subscribe to Cloud Firestore once authenticated
  let firestoreUnsub: Unsubscribe = () => {};
  let isCancelled = false;

  ensureAnonymousAuth().then(() => {
    if (isCancelled) return;
    try {
      const docRef = doc(db, 'adminSettings', 'subscriptionConfig');
      firestoreUnsub = onSnapshot(
        docRef,
        (snap) => {
          if (snap.exists()) {
            const remote = snap.data() as Partial<SubscriptionSettingsConfig>;
            const merged: SubscriptionSettingsConfig = {
              ...DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG,
              ...remote
            };
            cacheInMemory(merged);
            callback(merged);
          }
        },
        (err) => {
          console.warn('[SubscriptionSettings] Firestore subscription listener notice:', err.message);
        }
      );
    } catch (err) {
      console.warn('[SubscriptionSettings] Realtime listener setup skipped:', err);
    }
  });

  return () => {
    isCancelled = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener(CUSTOM_EVENT_KEY, localListener);
    }
    firestoreUnsub();
  };
}

/**
 * Builds the high-resolution UPI Payment QR Code URL.
 * If admin uploaded a custom QR image URL, uses it.
 * Otherwise, generates a dynamic standard UPI QR encoding pay parameters.
 */
export function getUpiQrCodeUrl(
  config: SubscriptionSettingsConfig,
  amount: number = 500,
  shop?: Shop | null,
  isNewShopParam?: boolean
): string {
  if (config.upiQrImageUrl && config.upiQrImageUrl.trim().length > 0) {
    return config.upiQrImageUrl.trim();
  }

  const payeeName = config.payeeName || 'ParlourPro HQ Admin';
  const upiId = config.upiId || 'parlourpro.admin@okhdfcbank';
  const shopRef = shop?.shopCode ? ` (${shop.shopCode})` : '';
  const note = (isNewShopParam || amount >= 3000)
    ? `ParlourPro POS Setup & 1st Month${shopRef}`
    : `ParlourPro POS Renewal${shopRef}`;

  const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(
    payeeName
  )}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;

  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(
    upiUrl
  )}`;
}

/**
 * Builds the direct WhatsApp chat link with pre-filled Gujarati payment confirmation message.
 * Supports distinct messages for New Shop (₹3000 setup + 1st month) vs Existing Shop (₹500 renewal).
 */
export function getWhatsAppPaymentLink(
  config: SubscriptionSettingsConfig,
  shop?: Shop | null,
  customAmount?: number,
  isNewShopParam?: boolean
): string {
  // Clean phone number: remove non-numeric chars except leading +
  const rawNumber = config.whatsappNumber || '+919173598234';
  const cleanNumber = rawNumber.replace(/[^0-9]/g, '');

  const shopName = shop?.name || 'પાર્લરપ્રો POS (ParlourPro POS)';
  const shopCode = shop?.shopCode || 'AP-SHOP';
  const amount = customAmount !== undefined ? customAmount : (config.monthlyFee || 500);

  let message = '';
  if (isNewShopParam || amount >= 3000) {
    message = `નમસ્તે એડમિન, મેં પાર્લરપ્રો POS (${shopName} - ${shopCode}) માટે સેટઅપ ચાર્જ ₹૨૫૦૦ + સબ્સ્ક્રિપ્શન ચાર્જ ₹૫૦૦ મળીને પહેલા મહિનાના કુલ ₹૩,૦૦૦ નું પેમેન્ટ કર્યું છે. કૃપા કરીને સ્ક્રીનશોટ ચકાસીને એકાઉન્ટ સક્રિય કરી આપશો.`;
  } else {
    message = config.whatsappMessageTemplate ||
      'નમસ્તે એડમિન, મેં પાર્લરપ્રો POS ({shopName} - {shopCode}) માટે ₹{amount} નું સબ્સ્ક્રિપ્શન રિન્યુઅલ પેમેન્ટ કર્યું છે. કૃપા કરીને સ્ક્રીનશોટ ચકાસીને સબ્સ્ક્રિપ્શન રિન્યુ કરી આપશો.';
    message = message
      .replace('{shopName}', shopName)
      .replace('{shopCode}', shopCode)
      .replace('{amount}', amount.toString());
  }

  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
}
