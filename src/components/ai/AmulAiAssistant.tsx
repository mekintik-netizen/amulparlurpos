/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Amul AI Business Assistant — Blue Glassmorphism AI Interface
 * - Sleek sky-to-royal-blue flowing glassmorphism layout (`mode="page"` & `mode="drawer"`).
 * - Centered hero orb headline, frosted-glass pill quick prompts, tall translucent prompt composer
 *   with Bill Photo attachment (`📎`) + Gujarati/English toggle (`🌐`) + circular Send (`↑`),
 *   and bottom live shop metrics bar.
 * - Resolves Gemini API keys strictly in order (`adminSettings/aiConfig` -> Env -> Shop Profile)
 *   via `/api/ai/assistant`, with 10s AbortController timeout & zero-error local BI fallback.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  RefreshCw,
  X,
  Trash2,
  Copy,
  Check,
  ShieldAlert,
  Loader2,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  Zap,
  Sparkles,
  Paperclip,
  Globe,
  ArrowUp,
  RotateCcw
} from 'lucide-react';
import { AiChatMessage, Shop, ShopAiContextSummary } from '../../types/index.ts';
import { AuthSession } from '../../storage/auth.ts';
import {
  getSessionAiStatus,
  isAiAccessAllowedForSession,
  loadAiSessionConfig,
  resolveClientEncodedKeys,
  saveAdminAiConfig
} from '../../storage/aiConfig.ts';
import { AppRepository } from '../../storage/repositories.ts';
import { decodeAiApiKey, encodeAiApiKey, maskApiKey } from '../../utils/aiKeyCodec.ts';
import { buildShopAiContext, computeShopAiContextFromData } from '../../utils/shopAiContext.ts';
import { generateLocalGujaratiBusinessAnswer } from '../../utils/localAiFallback.ts';

function isStaticHostingEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return (
    window.location.protocol === 'file:' ||
    host.endsWith('.github.io') ||
    host.endsWith('.pages.dev') ||
    host.endsWith('.netlify.app') ||
    host.endsWith('.vercel.app') ||
    host.endsWith('.web.app') ||
    host.endsWith('.firebaseapp.com')
  );
}

async function callGeminiRestDirectly(params: {
  apiKey: string;
  question: string;
  shopContext: ShopAiContextSummary;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
  preferredLanguage: 'gu' | 'en';
  attachmentImage?: { mimeType: string; data: string };
  signal: AbortSignal;
}): Promise<string> {
  const compactContext = JSON.stringify(params.shopContext || {});
  const langRule =
    params.preferredLanguage === 'en'
      ? 'Respond in clear, polite English with exact ₹ currency figures and concise bullet points (•).'
      : 'Respond primarily in polite, clear Gujarati (ગુજરાતી) with exact ₹ currency figures and concise bullet points (•). Include English product names where helpful.';

  const systemText = [
    'You are "ParlourPro AI (બિઝનેસ સહાયક)", a retail parlour business advisor.',
    'Answer STRICTLY from the LIVE SHOP DATA JSON below. Never fabricate sales numbers, stock quantities, or dues.',
    langRule,
    '',
    'LIVE SHOP DATA JSON:',
    compactContext
  ].join('\n');

  const userParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (params.attachmentImage?.data && params.attachmentImage?.mimeType?.startsWith('image/')) {
    userParts.push({
      inlineData: {
        mimeType: params.attachmentImage.mimeType,
        data: params.attachmentImage.data
      }
    });
  }
  userParts.push({ text: params.question });

  const contents = [
    ...params.history
      .filter((m) => m.text && m.text.trim())
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text.trim() }]
      })),
    { role: 'user', parts: userParts }
  ];

  const models = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-4-hydrogen'];
  for (const model of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      params.apiKey
    )}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: params.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents
      })
    });
    if (res.status === 404 || res.status === 503) {
      continue;
    }
    const json = (await res.json().catch(() => ({}))) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    if (res.ok) {
      const text = (json.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || '')
        .join('')
        .trim();
      if (text) return text;
    }
    break;
  }
  return '';
}

export interface QuickQuestionChip {
  id: string;
  emoji: string;
  shortLabel: string;
  label: string;
  question: string;
}

export const AMUL_AI_QUICK_CHIPS: QuickQuestionChip[] = [
  {
    id: 'profit-sales',
    emoji: '📊',
    shortLabel: 'આજનો નફો & વેચાણ',
    label: 'આજનો કુલ નફો અને વેચાણ કેટલું થયું?',
    question: 'આજનો કુલ નફો અને વેચાણ કેટલું થયું?'
  },
  {
    id: 'top-selling',
    emoji: '🔥',
    shortLabel: 'ટોપ વેચાણ',
    label: 'આ અઠવાડિયે સૌથી વધુ કઈ આઈટમ વેચાઈ?',
    question: 'આ અઠવાડિયે સૌથી વધુ કઈ આઈટમ વેચાઈ?'
  },
  {
    id: 'low-stock',
    emoji: '⚠️',
    shortLabel: 'ઓછો સ્ટોક',
    label: 'કઈ આઈટમનો સ્ટોક ખતમ થવા આવ્યો છે?',
    question: 'કઈ આઈટમનો સ્ટોક ખતમ થવા આવ્યો છે?'
  },
  {
    id: 'smart-order',
    emoji: '🛒',
    shortLabel: 'સ્માર્ટ ઓર્ડર',
    label: 'આવતા ૭ દિવસ માટે શું ઓર્ડર કરવું જોઈએ?',
    question: 'આવતા ૭ દિવસ માટે શું ઓર્ડર કરવું જોઈએ?'
  },
  {
    id: 'customer-dues',
    emoji: '💰',
    shortLabel: 'ઉઘરાણી બાકી',
    label: 'કયા કસ્ટમરની ઉઘરાણી બાકી છે?',
    question: 'કયા કસ્ટમરની ઉઘરાણી બાકી છે?'
  },
  {
    id: 'agency-dues',
    emoji: '🧾',
    shortLabel: 'એજન્સી બાકી',
    label: 'કઈ એજન્સીનું પેમેન્ટ બાકી છે?',
    question: 'કઈ એજન્સીનું પેમેન્ટ બાકી છે?'
  },
  {
    id: 'dead-stock',
    emoji: '📉',
    shortLabel: 'ડેડ સ્ટોક',
    label: 'કઈ આઈટમ બિલકુલ નથી વેચાતી (Dead Stock)?',
    question: 'કઈ આઈટમ બિલકુલ નથી વેચાતી (Dead Stock)?'
  }
];

interface AttachedBillPhoto {
  fileName: string;
  mimeType: string;
  base64Data: string;
  previewUrl: string;
}

interface AmulAiAssistantProps {
  currentShop: Shop;
  currentUser: AuthSession | null;
  mode: 'page' | 'drawer';
  onClose?: () => void;
  onShopUpdated?: (updatedShop: Shop) => void;
}

function renderInlineFormatting(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-bold text-slate-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function StructuredAiText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) {
          return <div key={idx} className="h-1" />;
        }
        if (line.startsWith('### ') || line.startsWith('## ') || line.startsWith('# ')) {
          const clean = line.replace(/^#{1,3}\s+/, '');
          return (
            <div key={idx} className="font-bold text-[#005A9C] dark:text-sky-300 text-sm pt-1">
              {renderInlineFormatting(clean)}
            </div>
          );
        }
        if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
          const clean = line.replace(/^[-*•]\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="text-[#2563eb] font-black mt-0.5">•</span>
              <span className="flex-1 tabular-nums">{renderInlineFormatting(clean)}</span>
            </div>
          );
        }
        return (
          <div key={idx} className="tabular-nums">
            {renderInlineFormatting(line)}
          </div>
        );
      })}
    </div>
  );
}

function GlossyBlueOrb({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center align-middle rounded-full relative shrink-0 ${
        compact ? 'w-7 h-7 mx-1' : 'w-9 h-9 md:w-11 md:h-11 mx-1.5'
      }`}
      style={{
        background:
          'radial-gradient(circle at 32% 28%, #e0f2fe 0%, #60a5fa 26%, #2563eb 62%, #1e3a8a 100%)',
        boxShadow:
          '0 10px 25px -4px rgba(30, 58, 138, 0.55), inset 0 -4px 8px rgba(15, 23, 42, 0.4), inset 0 2px 6px rgba(255, 255, 255, 0.7)'
      }}
    >
      <span
        className="absolute top-[14%] left-[20%] w-[36%] h-[24%] rounded-full"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.08))',
          transform: 'rotate(-20deg)'
        }}
      />
    </span>
  );
}

export const AmulAiAssistant: React.FC<AmulAiAssistantProps> = ({
  currentShop,
  currentUser,
  mode,
  onClose,
  onShopUpdated
}) => {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState<'gu' | 'en'>('gu');
  const [attachedPhoto, setAttachedPhoto] = useState<AttachedBillPhoto | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [contextSummary, setContextSummary] = useState<ShopAiContextSummary | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Inline API Key Setup State
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [showApiKeyText, setShowApiKeyText] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyPanelFeedback, setKeyPanelFeedback] = useState<string | null>(null);
  const [, setConfigVersion] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  const accessAllowed = isAiAccessAllowedForSession(currentUser, currentShop);
  const sessionStatus = getSessionAiStatus(currentShop);
  const resolvedKeys = resolveClientEncodedKeys(currentShop);
  const canUseCloudGemini = resolvedKeys.hasAnyKey || !isStaticHostingEnvironment();

  const refreshContext = async (): Promise<ShopAiContextSummary | null> => {
    try {
      setIsLoadingContext(true);
      const summary = await buildShopAiContext(currentShop);
      setContextSummary(summary);
      return summary;
    } catch (err) {
      console.error('[Amul AI] Failed to compile live shop context:', err);
      return null;
    } finally {
      setIsLoadingContext(false);
    }
  };

  useEffect(() => {
    if (accessAllowed && currentShop?.id) {
      refreshContext();
    }
  }, [currentShop?.id, accessAllowed]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleBillPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const commaIdx = dataUrl.indexOf(',');
      const base64Data = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : '';
      if (base64Data) {
        setAttachedPhoto({
          fileName: file.name,
          mimeType: file.type,
          base64Data,
          previewUrl: dataUrl
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveInlineApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = apiKeyDraft.trim();
    if (!trimmed || isSavingKey || !currentUser) return;

    try {
      setIsSavingKey(true);
      setKeyPanelFeedback(null);

      if (currentUser.role === 'ADMIN') {
        await saveAdminAiConfig({
          apiKey: trimmed,
          aiGlobalEnabled: true,
          updatedBy: currentUser.fullName || 'Master Admin'
        });
        await loadAiSessionConfig(currentShop, currentUser);
        setKeyPanelFeedback('Master Gemini API Key Cloud Firestore માં સેવ થઈ ગઈ છે!');
      } else {
        const updatedShop: Shop = {
          ...currentShop,
          encodedGeminiApiKey: encodeAiApiKey(trimmed),
          maskedGeminiApiKey: maskApiKey(trimmed),
          updatedAt: new Date().toISOString()
        };
        const saved = await AppRepository.shops.save(updatedShop);
        onShopUpdated?.(saved);
        setKeyPanelFeedback('તમારી Shop Gemini API Key સુરક્ષિત રીતે સેવ થઈ ગઈ છે!');
      }

      setApiKeyDraft('');
      setConfigVersion((v) => v + 1);
      setTimeout(() => {
        setShowKeyPanel(false);
        setKeyPanelFeedback(null);
      }, 1800);
    } catch (err) {
      console.error('[Amul AI] Failed to save API key:', err);
      setKeyPanelFeedback('API Key સેવ કરવામાં ભૂલ આવી, છતાં Local Smart BI મોડ ચાલુ જ છે.');
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleClearApiKey = async () => {
    if (!currentUser || isSavingKey) return;
    try {
      setIsSavingKey(true);
      if (currentUser.role === 'ADMIN') {
        await saveAdminAiConfig({
          clearApiKey: true,
          updatedBy: currentUser.fullName || 'Master Admin'
        });
        await loadAiSessionConfig(currentShop, currentUser);
      } else {
        const updatedShop: Shop = {
          ...currentShop,
          encodedGeminiApiKey: undefined,
          maskedGeminiApiKey: undefined,
          updatedAt: new Date().toISOString()
        };
        const saved = await AppRepository.shops.save(updatedShop);
        onShopUpdated?.(saved);
      }
      setConfigVersion((v) => v + 1);
      setKeyPanelFeedback('API Key દૂર કરવામાં આવી છે. હવે Local Smart BI મોડ સક્રિય છે.');
    } catch (err) {
      console.error('[Amul AI] Failed to clear API key:', err);
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleSendQuestion = async (rawQuestion: string) => {
    const trimmedText = rawQuestion.trim();
    const photoSnap = attachedPhoto;
    const question =
      trimmedText ||
      (photoSnap
        ? language === 'en'
          ? `Please read and summarize this uploaded bill photo (${photoSnap.fileName}).`
          : `આ અપલોડ કરેલ બિલ ફોટો (${photoSnap.fileName}) વાંચીને તેનો હિસાબ સમજાવો.`
        : '');

    if (!question || isSending || !accessAllowed) return;

    const userMsg: AiChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: photoSnap ? `📎 ${photoSnap.fileName}\n${question}` : question,
      timestamp: new Date().toISOString()
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setAttachedPhoto(null);
    setIsSending(true);

    try {
      const latestContext =
        (await refreshContext()) ||
        contextSummary ||
        computeShopAiContextFromData({
          shop: currentShop,
          products: [],
          sales: [],
          purchases: [],
          suppliers: [],
          expenses: []
        });

      const currentKeys = resolveClientEncodedKeys(currentShop);
      const isStaticHost = isStaticHostingEnvironment();
      const decodedClientKey = decodeAiApiKey(
        currentKeys.encodedAdminKey || currentKeys.encodedEnvKey || currentKeys.encodedShopKey
      );
      const shouldTryCloudGemini =
        sessionStatus.aiGlobalEnabled !== false &&
        (Boolean(decodedClientKey) || !isStaticHost);

      if (shouldTryCloudGemini) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
          let geminiAnswer = '';

          if (isStaticHost && decodedClientKey) {
            geminiAnswer = await callGeminiRestDirectly({
              apiKey: decodedClientKey,
              question,
              shopContext: latestContext,
              history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
              preferredLanguage: language,
              attachmentImage: photoSnap
                ? { mimeType: photoSnap.mimeType, data: photoSnap.base64Data }
                : undefined,
              signal: controller.signal
            });
          } else if (!isStaticHost) {
            const response = await fetch('/api/ai/assistant', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                question,
                shopContext: latestContext,
                history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
                shopId: currentShop.id,
                userRole: currentUser?.role,
                shopAiEnabled: currentShop.aiEnabled !== false,
                preferredLanguage: language,
                attachmentImage: photoSnap
                  ? { mimeType: photoSnap.mimeType, data: photoSnap.base64Data }
                  : undefined,
                encodedAdminKey: currentKeys.encodedAdminKey,
                encodedEnvKey: currentKeys.encodedEnvKey,
                encodedShopKey: currentKeys.encodedShopKey
              })
            });

            const data = (await response.json().catch(() => ({}))) as {
              answer?: string;
              code?: string;
              error?: string;
              details?: string;
            };

            if (response.ok && data.answer && data.answer.trim()) {
              geminiAnswer = data.answer.trim();
            } else if ((response.status === 404 || response.status === 405) && decodedClientKey) {
              geminiAnswer = await callGeminiRestDirectly({
                apiKey: decodedClientKey,
                question,
                shopContext: latestContext,
                history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
                preferredLanguage: language,
                attachmentImage: photoSnap
                  ? { mimeType: photoSnap.mimeType, data: photoSnap.base64Data }
                  : undefined,
                signal: controller.signal
              });
            } else {
              console.warn('[Amul AI] Cloud Gemini fallback triggered:', {
                status: response.status,
                code: data.code,
                error: data.error,
                details: data.details
              });
            }
          }

          if (geminiAnswer) {
            const aiMsg: AiChatMessage = {
              id: `a-${Date.now()}`,
              role: 'assistant',
              text: geminiAnswer,
              timestamp: new Date().toISOString(),
              sourceMode: 'gemini'
            };
            setMessages((prev) => [...prev, aiMsg]);
            return;
          }
        } catch (fetchErr) {
          console.warn('[Amul AI] Cloud Gemini request failed/timed out, switching to Local BI:', fetchErr);
        } finally {
          clearTimeout(timeoutId);
        }
      }

      // Guaranteed Local Business Intelligence Fallback (Zero-Error)
      const localAnswer = photoSnap
        ? [
            language === 'en'
              ? `### 📎 Bill Photo Attached (${photoSnap.fileName})`
              : `### 📎 બિલ ફોટો જોડાયેલ છે (${photoSnap.fileName})`,
            language === 'en'
              ? `• Full OCR bill photo reading requires an active Gemini API key; below is your live POS & agency account summary meanwhile:`
              : `• ફોટોમાંથી લખાણ વાંચવા માટે Gemini API Key જરૂરી છે — ત્યાં સુધી તમારી દુકાનનો લાઈવ હિસાબ નીચે મુજબ છે:`,
            ``,
            generateLocalGujaratiBusinessAnswer(question, latestContext, language)
          ].join('\n')
        : generateLocalGujaratiBusinessAnswer(question, latestContext, language);

      const localMsg: AiChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: localAnswer,
        timestamp: new Date().toISOString(),
        sourceMode: 'local'
      };
      setMessages((prev) => [...prev, localMsg]);
    } catch (unexpectedErr) {
      console.error('[Amul AI] Unexpected error caught by zero-error fallback:', unexpectedErr);
      const safeContext =
        contextSummary ||
        computeShopAiContextFromData({
          shop: currentShop,
          products: [],
          sales: [],
          purchases: [],
          suppliers: [],
          expenses: []
        });
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: generateLocalGujaratiBusinessAnswer(question, safeContext, language),
          timestamp: new Date().toISOString(),
          sourceMode: 'local'
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleCopy = async (msg: AiChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.text);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const isDrawer = mode === 'drawer';
  const todaySalesVal = contextSummary?.salesMetrics.todayRevenue ?? 0;
  const todayProfitVal = contextSummary?.salesMetrics.todayNetProfit ?? 0;
  const lowStockVal = contextSummary?.lowStockCount ?? 0;
  const agencyDueVal = contextSummary?.pendingSupplierPayables.totalPendingBillsAmount ?? 0;

  const contentBody = (
    <div
      className={`relative overflow-hidden flex flex-col bg-gradient-to-br from-[#3b82f6] via-[#60a5fa] to-[#dbeafe] text-white ${
        isDrawer
          ? 'h-full rounded-none sm:rounded-l-3xl'
          : 'rounded-3xl shadow-2xl min-h-[calc(100vh-140px)] border border-white/40'
      }`}
    >
      {/* Subtle Translucent Flowing Abstract Wave Highlights */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-35 blur-3xl"
          style={{ background: 'radial-gradient(circle, #1d4ed8 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-1/3 -right-24 w-[28rem] h-[28rem] rounded-full opacity-35 blur-3xl"
          style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)' }}
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 1440 360"
          preserveAspectRatio="none"
          className="absolute bottom-0 left-0 w-full h-56 opacity-25"
        >
          <path
            fill="#1e40af"
            d="M0,224L60,213.3C120,203,240,181,360,186.7C480,192,600,224,720,229.3C840,235,960,213,1080,186.7C1200,160,1320,128,1380,112L1440,96L1440,360L0,360Z"
          />
        </svg>
      </div>

      {/* Top Glass Header Row */}
      <div className="relative z-10 px-4 sm:px-6 pt-4 pb-2 flex items-center justify-between gap-2 shrink-0">
        {/* Left balance spacer / clear shortcut on desktop */}
        <div className="flex items-center gap-1.5 min-w-0">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="px-3 py-1.5 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 text-white text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              title="Clear conversation and start fresh"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear / નવો પ્રશ્ન</span>
            </button>
          )}
        </div>

        {/* Centered Top Pill Badge */}
        <div className="hidden sm:flex items-center justify-center px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-md border border-white/35 shadow-xs text-xs font-semibold text-white whitespace-nowrap shrink-0">
          ✨ ParlourPro AI • તમારા બિઝનેસનો સ્માર્ટ સહાયક
        </div>

        {/* Top-Right Subtle API Key & Utility Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {currentUser && (
            <button
              type="button"
              onClick={() => {
                setKeyPanelFeedback(null);
                setShowKeyPanel((prev) => !prev);
              }}
              aria-label="⚙️ API Key સેટ કરો"
              title="⚙️ API Key સેટ કરો"
              className={`px-3 py-1.5 rounded-full backdrop-blur-md border text-xs font-semibold transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
                showKeyPanel
                  ? 'bg-white text-[#1e3a8a] border-white shadow-sm'
                  : 'bg-white/15 hover:bg-white/25 text-white border-white/30'
              }`}
            >
              <span>⚙️ API Key</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => refreshContext()}
            disabled={isLoadingContext}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/30 text-white flex items-center justify-center transition cursor-pointer shrink-0"
            title="લાઈવ ડેટા રિફ્રેશ કરો"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingContext ? 'animate-spin' : ''}`} />
          </button>

          {isDrawer && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-rose-500/80 backdrop-blur-md border border-white/30 text-white flex items-center justify-center transition cursor-pointer shrink-0"
              title="Close AI Drawer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Mobile Pill Badge Fallback */}
      <div className="relative z-10 sm:hidden px-4 pb-1 flex justify-center">
        <div className="px-3.5 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/35 text-[11px] font-semibold text-white whitespace-nowrap">
          ✨ ParlourPro AI • તમારા બિઝનેસનો સ્માર્ટ સહાયક
        </div>
      </div>

      {/* Collapsible Glass API Key Setup Drawer */}
      {showKeyPanel && currentUser && (
        <form
          onSubmit={handleSaveInlineApiKey}
          className="relative z-10 mx-4 sm:mx-auto max-w-3xl w-full mt-2 bg-[#0f2952]/75 backdrop-blur-xl border border-white/35 rounded-2xl p-3.5 space-y-2.5 shadow-xl shrink-0"
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="font-bold text-white flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-sky-300" />
              <span>
                {currentUser.role === 'ADMIN'
                  ? 'Master Gemini API Key (Admin Settings)'
                  : 'Shop Gemini API Key (વૈકલ્પિક)'}
              </span>
            </div>
            <span className="text-[11px] font-mono text-sky-100">
              {sessionStatus.maskedKey
                ? `Active: ${sessionStatus.maskedKey}`
                : resolvedKeys.hasAnyKey
                ? 'Gemini Key Active'
                : 'Local BI Mode Active'}
            </span>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <input
                type={showApiKeyText ? 'text' : 'password'}
                value={apiKeyDraft}
                onChange={(e) => setApiKeyDraft(e.target.value)}
                placeholder="Gemini API Key પેસ્ટ કરો (દા.ત. AIza...)"
                className="w-full pl-3 pr-9 py-2 bg-white/15 border border-white/30 rounded-xl text-xs font-mono text-white placeholder-white/65 focus:outline-hidden focus:ring-2 focus:ring-white/60"
              />
              <button
                type="button"
                onClick={() => setShowApiKeyText((v) => !v)}
                className="absolute right-2.5 top-2.5 text-white/75 hover:text-white cursor-pointer"
                title={showApiKeyText ? 'Hide key' : 'Show key'}
              >
                {showApiKeyText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <button
              type="submit"
              disabled={isSavingKey || !apiKeyDraft.trim()}
              className="px-4 py-2 bg-white text-[#1e3a8a] hover:bg-blue-50 disabled:opacity-50 rounded-xl text-xs font-bold transition cursor-pointer shrink-0"
            >
              {isSavingKey ? 'Saving...' : 'સેવ કરો'}
            </button>
            {(resolvedKeys.encodedAdminKey || resolvedKeys.encodedShopKey) && (
              <button
                type="button"
                onClick={handleClearApiKey}
                disabled={isSavingKey}
                className="px-3 py-2 bg-rose-500/80 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition cursor-pointer shrink-0"
              >
                દૂર કરો
              </button>
            )}
          </div>

          {keyPanelFeedback && (
            <div className="text-xs font-medium text-emerald-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{keyPanelFeedback}</span>
            </div>
          )}
        </form>
      )}

      {/* Main Guard Check OR Active Glass AI Workspace */}
      {!accessAllowed ? (
        <div className="relative z-10 flex-1 flex items-center justify-center p-6 text-center">
          <div className="max-w-md bg-[#0f2952]/65 backdrop-blur-xl border border-white/35 rounded-3xl p-6 space-y-2.5 shadow-xl">
            <ShieldAlert className="w-10 h-10 text-amber-300 mx-auto" />
            <h3 className="text-base font-bold text-white">ParlourPro AI સુવિધા હાલમાં બંધ છે</h3>
            <p className="text-xs text-blue-100 leading-relaxed">
              આ શોપ માટે AI સહાયક Master Admin દ્વારા બંધ (Suspend) કરવામાં આવેલ છે. કૃપા કરીને Admin નો સંપર્ક કરો.
            </p>
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex-1 flex flex-col overflow-y-auto px-4 sm:px-8 py-4 sm:py-6 justify-between gap-5">
          {/* Hero Section + Quick Chips (Compact automatically when chat has started) */}
          <div className="flex flex-col items-center text-center gap-4">
            <div className="space-y-1.5 max-w-2xl mx-auto">
              <h1
                className={`font-semibold text-white tracking-tight leading-snug text-balance drop-shadow-xs ${
                  isDrawer ? 'text-2xl sm:text-3xl' : 'text-3xl md:text-4xl'
                }`}
              >
                <span>તમારા પાર્લરનો</span>
                <GlossyBlueOrb compact={isDrawer} />
                <span>સ્માર્ટ AI સહાયક</span>
              </h1>
              <p className="text-xs sm:text-sm text-white/90 font-medium">
                {currentShop.name} ({currentShop.shopCode}) ·{' '}
                {canUseCloudGemini ? 'Gemini AI & Live POS Data' : 'Live Local Smart BI'}
              </p>
            </div>

            {/* Centered Glass Pill Quick-Prompt Chips */}
            <div className="flex flex-wrap items-center justify-center gap-2 max-w-4xl mx-auto">
              {AMUL_AI_QUICK_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  disabled={isSending}
                  onClick={() => handleSendQuestion(chip.question)}
                  title={chip.question}
                  className="bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/30 text-white rounded-full px-4 py-2 text-xs sm:text-sm font-medium transition duration-150 shadow-2xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span>{chip.emoji}</span>
                  <span>{chip.shortLabel}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Chat Response Thread (Shown cleanly when a chip or custom prompt is submitted) */}
          {(messages.length > 0 || isSending) && (
            <div className="max-w-3xl mx-auto w-full space-y-3 my-1">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-white/90">
                  સંવાદ (Conversation)
                </span>
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  className="px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 text-white text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear / નવો પ્રશ્ન</span>
                </button>
              </div>

              <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'user' ? (
                      <div className="max-w-[85%] bg-[#1e3a8a]/85 backdrop-blur-md border border-white/30 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-xs sm:text-sm font-medium shadow-md whitespace-pre-line">
                        {msg.text}
                      </div>
                    ) : (
                      <div className="w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-white/70 dark:border-slate-700 rounded-2xl p-4 sm:p-5 shadow-xl text-slate-800 dark:text-slate-100 space-y-2.5">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-700 pb-2">
                          <span className="text-xs font-bold text-[#1d4ed8] dark:text-sky-300 flex items-center gap-1.5">
                            {msg.sourceMode === 'local' ? (
                              <>
                                <Zap className="w-3.5 h-3.5 text-emerald-600" />
                                <span>લાઈવ POS ડેટા વિશ્લેષણ (Local Smart BI)</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                                <span>ParlourPro AI સલાહ (Gemini AI)</span>
                              </>
                            )}
                          </span>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleCopy(msg)}
                              className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                              title="Copy response"
                            >
                              {copiedId === msg.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-emerald-600 font-semibold">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        <StructuredAiText text={msg.text} />
                      </div>
                    )}
                  </div>
                ))}

                {isSending && (
                  <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-white/60 dark:border-slate-700 rounded-2xl px-4 py-3.5 flex items-center gap-2.5 text-xs sm:text-sm font-medium text-[#1e3a8a] dark:text-sky-300 shadow-lg">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>લાઈવ શોપ ડેટાનું વિશ્લેષણ થઈ રહ્યું છે...</span>
                  </div>
                )}
                <div ref={scrollEndRef} />
              </div>
            </div>
          )}

          {/* Large Frosted-Glass Prompt Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendQuestion(input);
            }}
            className="max-w-3xl mx-auto w-full bg-[#0b2a5b]/30 backdrop-blur-xl border border-white/40 shadow-2xl rounded-2xl p-4 flex flex-col gap-3"
          >
            {attachedPhoto && (
              <div className="flex items-center justify-between gap-2 bg-white/15 border border-white/30 rounded-xl px-3 py-1.5 text-xs text-white">
                <div className="flex items-center gap-2 min-w-0">
                  <img
                    src={attachedPhoto.previewUrl}
                    alt={attachedPhoto.fileName}
                    className="w-7 h-7 rounded-md object-cover border border-white/40 shrink-0"
                  />
                  <span className="truncate font-medium">📎 {attachedPhoto.fileName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachedPhoto(null)}
                  className="p-1 rounded-full hover:bg-white/20 text-white cursor-pointer shrink-0"
                  title="Remove attached bill photo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <textarea
              rows={isDrawer ? 2 : 3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendQuestion(input);
                }
              }}
              disabled={isSending}
              placeholder={
                language === 'en'
                  ? 'Ask anything about your shop in Gujarati or English... (e.g. What is today net profit?)'
                  : 'ગુજરાતી અથવા English માં કંઈ પણ પૂછો... (દા.ત. આજનો કુલ નફો કેટલો થયો?)'
              }
              className="w-full bg-transparent border-0 text-white placeholder-white/80 text-sm sm:text-base leading-relaxed focus:outline-hidden resize-none"
            />

            {/* Bottom Toolbar Inside Prompt Container */}
            <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/20">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleBillPhotoSelect}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="બિલ ફોટો સ્કેન / એટેચમેન્ટ (Bill Photo Scan)"
                  className="h-10 px-3 rounded-full bg-white/15 hover:bg-white/25 border border-white/30 text-white flex items-center gap-1.5 text-xs font-medium transition cursor-pointer whitespace-nowrap"
                >
                  <Paperclip className="w-4 h-4" />
                  <span className="hidden sm:inline">📎 Bill Photo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLanguage((prev) => (prev === 'gu' ? 'en' : 'gu'))}
                  title="ભાષા બદલો: ગુજરાતી / English"
                  className="h-10 px-3 rounded-full bg-white/15 hover:bg-white/25 border border-white/30 text-white flex items-center gap-1.5 text-xs font-medium transition cursor-pointer whitespace-nowrap"
                >
                  <Globe className="w-4 h-4" />
                  <span>🌐 {language === 'gu' ? 'ગુજરાતી' : 'English'}</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={isSending || (!input.trim() && !attachedPhoto)}
                aria-label="Send question"
                title="મોકલો (Send)"
                className="w-10 h-10 rounded-full bg-white hover:bg-blue-50 disabled:bg-white/40 text-[#1d4ed8] disabled:text-white/70 flex items-center justify-center shadow-lg transition cursor-pointer shrink-0"
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowUp className="w-5 h-5" />
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bottom Live Shop Metrics Bar Separated by Subtle Vertical Dividers */}
      <div
        className={`relative z-10 grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/25 bg-[#0b2a5b]/35 backdrop-blur-md border-t border-white/25 shrink-0 ${
          isDrawer ? '' : 'rounded-b-3xl'
        }`}
      >
        <div className="px-4 py-3 text-center">
          <div className="text-[11px] font-medium text-blue-100">આજનું વેચાણ</div>
          <div className="text-sm sm:text-base font-bold text-white font-mono tabular-nums mt-0.5">
            ₹{todaySalesVal.toLocaleString('en-IN')}
          </div>
        </div>
        <div className="px-4 py-3 text-center">
          <div className="text-[11px] font-medium text-blue-100">આજનો ચોખ્ખો નફો</div>
          <div className="text-sm sm:text-base font-bold text-emerald-200 font-mono tabular-nums mt-0.5">
            ₹{todayProfitVal.toLocaleString('en-IN')}
          </div>
        </div>
        <div className="px-4 py-3 text-center">
          <div className="text-[11px] font-medium text-blue-100">ઓછો સ્ટોક આઈટમ્સ</div>
          <div className="text-sm sm:text-base font-bold text-amber-200 font-mono tabular-nums mt-0.5">
            {lowStockVal} આઈટમ્સ
          </div>
        </div>
        <div className="px-4 py-3 text-center">
          <div className="text-[11px] font-medium text-blue-100">એજન્સી બાકી</div>
          <div className="text-sm sm:text-base font-bold text-rose-200 font-mono tabular-nums mt-0.5">
            ₹{agencyDueVal.toLocaleString('en-IN')}
          </div>
        </div>
      </div>
    </div>
  );

  if (isDrawer) {
    return (
      <div
        className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[2px] no-print"
        role="dialog"
        aria-label="ParlourPro AI Business Assistant Drawer"
      >
        <div className="flex-1" onClick={onClose} />
        <div className="w-full max-w-2xl h-full shadow-2xl border-l border-white/30">
          {contentBody}
        </div>
      </div>
    );
  }

  return contentBody;
};
