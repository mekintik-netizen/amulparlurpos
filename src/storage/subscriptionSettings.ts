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
 * Cleanly reads cached subscription settings from LocalStorage or returns defaults.
 */
export function getCachedSubscriptionSettings(): SubscriptionSettingsConfig {
  if (inMemoryConfig) return inMemoryConfig;

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        inMemoryConfig = { ...DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG, ...parsed };
        return inMemoryConfig!;
      }
    }
  } catch (err) {
    console.warn('[SubscriptionSettings] Failed to parse local subscription config:', err);
  }

  inMemoryConfig = { ...DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG };
  return inMemoryConfig;
}

/**
 * Saves configuration to local cache and dispatches cross-tab/in-app event.
 */
function cacheLocally(config: SubscriptionSettingsConfig): void {
  inMemoryConfig = config;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(config));
      window.dispatchEvent(new CustomEvent(CUSTOM_EVENT_KEY, { detail: config }));
    }
  } catch (err) {
    console.warn('[SubscriptionSettings] Failed to update local storage:', err);
  }
}

/**
 * Fetches the master Subscription Settings from Cloud Firestore (`adminSettings/subscriptionConfig`).
 * If not yet created in Firestore, seeds the document with default values.
 */
export async function getSubscriptionSettingsConfig(): Promise<SubscriptionSettingsConfig> {
  try {
    await ensureAnonymousAuth();
    const docRef = doc(db, 'adminSettings', 'subscriptionConfig');
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const remote = snap.data() as Partial<SubscriptionSettingsConfig>;
      const merged: SubscriptionSettingsConfig = {
        ...DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG,
        ...remote
      };
      cacheLocally(merged);
      return merged;
    } else {
      // Initialize with default configuration in Firestore
      const initial: SubscriptionSettingsConfig = {
        ...DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG,
        updatedAt: new Date().toISOString()
      };
      await setDoc(docRef, initial, { merge: true });
      cacheLocally(initial);
      return initial;
    }
  } catch (err) {
    console.warn('[SubscriptionSettings] Failed to fetch remote config from Firestore, using cache:', err);
    return getCachedSubscriptionSettings();
  }
}

/**
 * Saves customized subscription settings directly to Cloud Firestore under `adminSettings/subscriptionConfig`
 * and updates local memory/storage.
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

  // Immediate local update
  cacheLocally(updated);

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
            cacheLocally(merged);
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

  const payeeName = config.payeeName || 'Amul HQ Admin';
  const upiId = config.upiId || 'amulparlour.admin@okhdfcbank';
  const shopRef = shop?.shopCode ? ` (${shop.shopCode})` : '';
  const note = (isNewShopParam || amount >= 3000)
    ? `Amul POS Setup & 1st Month${shopRef}`
    : `Amul POS Renewal${shopRef}`;

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

  const shopName = shop?.name || 'અમૂલ પાર્લર (Amul Parlour)';
  const shopCode = shop?.shopCode || 'AP-SHOP';
  const amount = customAmount !== undefined ? customAmount : (config.monthlyFee || 500);

  let message = '';
  if (isNewShopParam || amount >= 3000) {
    message = `નમસ્તે એડમિન, મેં અમુલ પાર્લર (${shopName} - ${shopCode}) માટે સેટઅપ ચાર્જ ₹૨૫૦૦ + સબ્સ્ક્રિપ્શન ચાર્જ ₹૫૦૦ મળીને પહેલા મહિનાના કુલ ₹૩,૦૦૦ નું પેમેન્ટ કર્યું છે. કૃપા કરીને સ્ક્રીનશોટ ચકાસીને એકાઉન્ટ સક્રિય કરી આપશો.`;
  } else {
    message = config.whatsappMessageTemplate ||
      'નમસ્તે એડમિન, મેં અમુલ પાર્લર ({shopName} - {shopCode}) માટે ₹{amount} નું સબ્સ્ક્રિપ્શન રિન્યુઅલ પેમેન્ટ કર્યું છે. કૃપા કરીને સ્ક્રીનશોટ ચકાસીને સબ્સ્ક્રિપ્શન રિન્યુ કરી આપશો.';
    message = message
      .replace('{shopName}', shopName)
      .replace('{shopCode}', shopCode)
      .replace('{amount}', amount.toString());
  }

  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
}
