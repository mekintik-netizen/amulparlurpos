/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Session-Only AI Config & Cloud Firestore (`adminSettings/aiConfig`) Manager.
 * Security Rules:
 * - Master Gemini API key is stored obfuscated in Cloud Firestore (`adminSettings/aiConfig`).
 * - Active session config is held strictly in module-level RAM only (NEVER localStorage or sessionStorage).
 * - Never loaded on public Login Screen (`!currentUser`).
 * - Immediately wiped upon logout via `clearAiSessionMemory()`.
 */

import { doc, getDoc, onSnapshot, setDoc, Unsubscribe } from 'firebase/firestore';
import { AdminAiConfig, Shop } from '../types/index.ts';
import { AuthSession } from './auth.ts';
import { authReady, db } from './firebase.ts';
import { decodeAiApiKey, encodeAiApiKey, maskApiKey } from '../utils/aiKeyCodec.ts';

export interface AiConfigSummary {
  hasApiKey: boolean;
  maskedKey: string;
  aiGlobalEnabled: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

interface AiSessionMemory {
  encodedApiKey: string;
  maskedKey: string;
  aiGlobalEnabled: boolean;
  shopId?: string;
  loadedAt: string;
}

// Strict module-level session-only memory (never written to localStorage / sessionStorage)
let sessionMemory: AiSessionMemory | null = null;

export const DEFAULT_ADMIN_AI_CONFIG: AdminAiConfig = {
  encodedApiKey: '',
  maskedKey: '',
  aiGlobalEnabled: true
};

/**
 * Checks whether the active logged-in session is allowed to view and invoke Amul AI.
 * Strictly false on public login screen (!currentUser) or when a shop's AI is disabled by Admin.
 */
export function isAiAccessAllowedForSession(
  currentUser?: AuthSession | null,
  currentShop?: Shop | null
): boolean {
  if (!currentUser) return false;
  if (currentUser.role === 'ADMIN') return true;
  if (!currentShop) return false;
  return currentShop.aiEnabled !== false;
}

/**
 * Immediately clears all AI keys & state from session RAM (must be called on logout or suspension).
 */
export function clearAiSessionMemory(): void {
  sessionMemory = null;
}

/**
 * Returns whether session memory is currently hydrated for an authenticated session.
 */
export function isAiSessionLoaded(): boolean {
  return sessionMemory !== null;
}

/**
 * Returns the obfuscated key currently cached in session RAM (never plain-text).
 */
export function getSessionEncodedAiKey(): string {
  return sessionMemory?.encodedApiKey || '';
}

function getEncodedViteEnvAiKey(): string {
  try {
    const envVal = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_GEMINI_API_KEY || '').trim();
    if (envVal && envVal !== 'MY_GEMINI_API_KEY') {
      return encodeAiApiKey(envVal);
    }
  } catch {
    // ignore in non-Vite runtimes
  }
  return '';
}

/**
 * Resolves encoded Gemini API keys in strict priority order:
 * 1. Cloud Firestore `adminSettings/aiConfig` active session key
 * 2. `import.meta.env.VITE_GEMINI_API_KEY` (if injected)
 * 3. Optional shop-level key stored in Shop Profile
 */
export function resolveClientEncodedKeys(shop?: Shop | null): {
  encodedAdminKey: string;
  encodedEnvKey: string;
  encodedShopKey: string;
  hasAnyKey: boolean;
} {
  const encodedAdminKey = getSessionEncodedAiKey();
  const encodedEnvKey = getEncodedViteEnvAiKey();
  const encodedShopKey = shop?.encodedGeminiApiKey || '';
  const hasAnyKey = Boolean(
    decodeAiApiKey(encodedAdminKey) ||
      decodeAiApiKey(encodedEnvKey) ||
      decodeAiApiKey(encodedShopKey)
  );
  return {
    encodedAdminKey,
    encodedEnvKey,
    encodedShopKey,
    hasAnyKey
  };
}

export function getSessionAiStatus(shop?: Shop | null): AiConfigSummary {
  const keys = resolveClientEncodedKeys(shop);
  if (!sessionMemory) {
    return {
      hasApiKey: keys.hasAnyKey,
      maskedKey: shop?.maskedGeminiApiKey || '',
      aiGlobalEnabled: true
    };
  }
  return {
    hasApiKey: keys.hasAnyKey,
    maskedKey: sessionMemory.maskedKey || shop?.maskedGeminiApiKey || '',
    aiGlobalEnabled: sessionMemory.aiGlobalEnabled
  };
}

/**
 * Loads `adminSettings/aiConfig` from Cloud Firestore into module-level RAM ONLY
 * when a valid authenticated user is logged in and their shop permits AI.
 */
export async function loadAiSessionConfig(
  shop: Shop | null | undefined,
  user: AuthSession | null | undefined
): Promise<AiConfigSummary> {
  if (!isAiAccessAllowedForSession(user, shop)) {
    clearAiSessionMemory();
    return { hasApiKey: false, maskedKey: '', aiGlobalEnabled: false };
  }

  try {
    await authReady;
    const snap = await getDoc(doc(db, 'adminSettings', 'aiConfig'));
    if (snap.exists()) {
      const data = snap.data() as Partial<AdminAiConfig>;
      const encodedApiKey = data.encodedApiKey || '';
      const aiGlobalEnabled = data.aiGlobalEnabled !== false;
      const maskedKey = data.maskedKey || '';
      sessionMemory = {
        encodedApiKey,
        maskedKey,
        aiGlobalEnabled,
        shopId: shop?.id,
        loadedAt: new Date().toISOString()
      };
      return {
        hasApiKey: Boolean(decodeAiApiKey(encodedApiKey)),
        maskedKey,
        aiGlobalEnabled,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy
      };
    }
  } catch (err) {
    console.warn('[AI Config] Could not load remote aiConfig (using server env fallback if configured):', err);
  }

  sessionMemory = {
    encodedApiKey: '',
    maskedKey: '',
    aiGlobalEnabled: true,
    shopId: shop?.id,
    loadedAt: new Date().toISOString()
  };

  return { hasApiKey: false, maskedKey: '', aiGlobalEnabled: true };
}

/**
 * Fetches summary metadata for Master Admin Portal UI (never exposes raw API key).
 */
export async function getAdminAiConfigSummary(): Promise<AiConfigSummary> {
  try {
    await authReady;
    const snap = await getDoc(doc(db, 'adminSettings', 'aiConfig'));
    if (!snap.exists()) {
      return { hasApiKey: false, maskedKey: '', aiGlobalEnabled: true };
    }
    const data = snap.data() as Partial<AdminAiConfig>;
    return {
      hasApiKey: Boolean(decodeAiApiKey(data.encodedApiKey)),
      maskedKey: data.maskedKey || '',
      aiGlobalEnabled: data.aiGlobalEnabled !== false,
      updatedAt: data.updatedAt,
      updatedBy: data.updatedBy
    };
  } catch {
    return { hasApiKey: false, maskedKey: '', aiGlobalEnabled: true };
  }
}

/**
 * Saves Master Gemini API Key (encoded/obfuscated) and global AI enablement flag
 * to Cloud Firestore (`adminSettings/aiConfig`).
 */
export async function saveAdminAiConfig(params: {
  apiKey?: string;
  clearApiKey?: boolean;
  aiGlobalEnabled?: boolean;
  updatedBy?: string;
}): Promise<AiConfigSummary> {
  await authReady;
  const docRef = doc(db, 'adminSettings', 'aiConfig');
  const existingSnap = await getDoc(docRef).catch(() => null);
  const existing = existingSnap && existingSnap.exists() ? (existingSnap.data() as Partial<AdminAiConfig>) : {};

  let encodedApiKey = existing.encodedApiKey || '';
  let maskedKey = existing.maskedKey || '';

  if (params.clearApiKey) {
    encodedApiKey = '';
    maskedKey = '';
  } else if (params.apiKey && params.apiKey.trim()) {
    const trimmed = params.apiKey.trim();
    encodedApiKey = encodeAiApiKey(trimmed);
    maskedKey = maskApiKey(trimmed);
  }

  const aiGlobalEnabled =
    params.aiGlobalEnabled !== undefined
      ? params.aiGlobalEnabled
      : existing.aiGlobalEnabled !== false;

  const updatedAt = new Date().toISOString();
  const payload: AdminAiConfig = {
    encodedApiKey,
    maskedKey,
    aiGlobalEnabled,
    updatedAt,
    updatedBy: params.updatedBy || 'Master Admin'
  };

  await setDoc(docRef, payload, { merge: true });

  // Refresh session RAM if already active
  if (sessionMemory) {
    sessionMemory = {
      ...sessionMemory,
      encodedApiKey,
      maskedKey,
      aiGlobalEnabled
    };
  }

  return {
    hasApiKey: Boolean(decodeAiApiKey(encodedApiKey)),
    maskedKey,
    aiGlobalEnabled,
    updatedAt,
    updatedBy: payload.updatedBy
  };
}

/**
 * Real-time subscription for Master Admin Portal & active authenticated sessions.
 */
export function subscribeToAdminAiConfig(
  callback: (summary: AiConfigSummary) => void
): Unsubscribe {
  let firestoreUnsub: Unsubscribe = () => {};
  let cancelled = false;

  authReady.then(() => {
    if (cancelled) return;
    try {
      const ref = doc(db, 'adminSettings', 'aiConfig');
      firestoreUnsub = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            callback({ hasApiKey: false, maskedKey: '', aiGlobalEnabled: true });
            return;
          }
          const data = snap.data() as Partial<AdminAiConfig>;
          if (sessionMemory) {
            sessionMemory = {
              ...sessionMemory,
              encodedApiKey: data.encodedApiKey || '',
              maskedKey: data.maskedKey || '',
              aiGlobalEnabled: data.aiGlobalEnabled !== false
            };
          }
          callback({
            hasApiKey: Boolean(decodeAiApiKey(data.encodedApiKey)),
            maskedKey: data.maskedKey || '',
            aiGlobalEnabled: data.aiGlobalEnabled !== false,
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy
          });
        },
        (err) => {
          console.warn('[AI Config] Realtime listener notice:', err.message);
        }
      );
    } catch {
      // Ignore offline initialization issues
    }
  });

  return () => {
    cancelled = true;
    firestoreUnsub();
  };
}
