/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Amul Parlour Web POS Server Entry Point
 * - Serves Express API routes (/api/ai/assistant, /api/ai/status)
 * - Runs server-side @google/genai (gemini-2.5-flash) cleanly with zero client API key exposure
 * - Mounts Vite dev middleware in development and serves dist/ in production on port 3000
 */

import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { GoogleGenAI } from '@google/genai';
import { decodeAiApiKey } from './src/utils/aiKeyCodec.ts';

interface AssistantHistoryItem {
  role: 'user' | 'assistant';
  text: string;
}

interface AssistantRequestBody {
  question?: string;
  shopContext?: Record<string, unknown>;
  history?: AssistantHistoryItem[];
  shopId?: string;
  userRole?: 'ADMIN' | 'SHOP_USER';
  shopAiEnabled?: boolean;
  preferredLanguage?: 'gu' | 'en';
  attachmentImage?: {
    mimeType?: string;
    data?: string;
  };
  encodedKey?: string;
  encodedAdminKey?: string;
  encodedEnvKey?: string;
  encodedShopKey?: string;
}

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const MODEL_NAME = 'gemini-4-hydrogen';
const MODEL_CANDIDATES = ['gemini-4-hydrogen', 'gemini-3.8-flash', 'gemini-2.5-flash'];

function isValidGeminiApiKey(candidate: string): boolean {
  const k = (candidate || '').trim();
  return Boolean(k && k !== 'MY_GEMINI_API_KEY' && k.length >= 15);
}

/**
 * Resolves the Gemini API key strictly in order:
 * 1. Active session key from Cloud Firestore `adminSettings/aiConfig`
 * 2. Environment variable (`GEMINI_API_KEY` or encoded `VITE_GEMINI_API_KEY`)
 * 3. Optional shop-level key from `Shop Profile`
 */
function resolveServerGeminiKey(body: AssistantRequestBody): { apiKey: string; source: string } {
  const decodedAdminKey = decodeAiApiKey(body.encodedAdminKey || body.encodedKey);
  if (isValidGeminiApiKey(decodedAdminKey)) {
    return { apiKey: decodedAdminKey, source: 'adminSettings/aiConfig' };
  }

  const decodedViteEnvKey = decodeAiApiKey(body.encodedEnvKey);
  if (isValidGeminiApiKey(decodedViteEnvKey)) {
    return { apiKey: decodedViteEnvKey, source: 'VITE_GEMINI_API_KEY' };
  }

  const processEnvKey = (process.env.GEMINI_API_KEY || '').trim();
  if (isValidGeminiApiKey(processEnvKey)) {
    return { apiKey: processEnvKey, source: 'process.env.GEMINI_API_KEY' };
  }

  const decodedShopKey = decodeAiApiKey(body.encodedShopKey);
  if (isValidGeminiApiKey(decodedShopKey)) {
    return { apiKey: decodedShopKey, source: 'ShopProfile' };
  }

  return { apiKey: '', source: 'none' };
}

function buildGujaratiBusinessSystemPrompt(
  shopContext: Record<string, unknown> | undefined,
  preferredLanguage: 'gu' | 'en' = 'gu'
): string {
  const compactContext = JSON.stringify(shopContext || {});
  const langRule =
    preferredLanguage === 'en'
      ? '3. Respond in clear, polite English with exact ₹ currency figures, quantities, and concise bullet points (•). Include Gujarati terms only where helpful.'
      : '3. Respond primarily in polite, clear, easy-to-read Gujarati (ગુજરાતી) with exact ₹ currency figures, quantities, and concise bullet points (•). Include English product names alongside ₹ amounts so shopkeepers can act quickly.';

  return [
    'You are "Amul AI (અમૂલ બિઝનેસ સહાયક)", an expert retail dairy & Amul Parlour business advisor for an Indian shopkeeper.',
    'STRICT GROUNDING & HONESTY RULES:',
    '1. Answer STRICTLY based on the LIVE SHOP DATA JSON provided below (plus any attached bill photo if provided). NEVER invent, guess, or fabricate sales numbers, product names, customer dues, or supplier bills.',
    '2. If a requested list (such as pending customer dues, pending supplier bills, or dead stock) is empty in the live data, clearly say that there are currently zero pending items (₹0) or none found.',
    langRule,
    '4. When asked about profit & sales, clearly distinguish Revenue (કુલ વેચાણ), Cash / UPI / Card / Credit split, Expenses (ખર્ચ), and Net Profit (ચોખ્ખો નફો).',
    '5. When giving reorder or dead-stock advice, provide practical, actionable next steps for the Amul Parlour owner.',
    '6. Keep responses well-structured, crisp, and scannable with bold section headings.',
    '',
    'LIVE SHOP DATA JSON:',
    compactContext
  ].join('\n');
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/ai/status', (_req: Request, res: Response) => {
    const envKey = (process.env.GEMINI_API_KEY || '').trim();
    const serverKeyAvailable = isValidGeminiApiKey(envKey);
    res.json({
      ok: true,
      model: MODEL_NAME,
      serverKeyAvailable
    });
  });

  app.post('/api/ai/assistant', async (req: Request, res: Response) => {
    const body = (req.body || {}) as AssistantRequestBody;
    const question = (body.question || '').trim();
    const userRole = body.userRole;
    const shopId = (body.shopId || '').trim();
    const shopAiEnabled = body.shopAiEnabled !== false;

    if (!userRole || (!shopId && userRole !== 'ADMIN')) {
      res.status(401).json({
        code: 'UNAUTHORIZED',
        error: 'કૃપા કરીને પહેલા તમારા Shop ID અને Password વડે લોગિન કરો.'
      });
      return;
    }

    if (userRole !== 'ADMIN' && !shopAiEnabled) {
      res.status(403).json({
        code: 'SHOP_AI_DISABLED',
        error: 'આ શોપ માટે Amul AI સુવિધા Master Admin દ્વારા બંધ કરવામાં આવી છે.'
      });
      return;
    }

    if (!question) {
      res.status(400).json({
        code: 'EMPTY_QUESTION',
        error: 'કૃપા કરીને તમારો પ્રશ્ન લખો અથવા નીચેનામાંથી એક બટન પસંદ કરો.'
      });
      return;
    }

    const { apiKey, source } = resolveServerGeminiKey(body);
    if (!apiKey) {
      res.status(400).json({
        code: 'NO_API_KEY',
        error: 'Gemini API Key not configured yet; using built-in local intelligence.'
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const hasImageAttachment = Boolean(
        body.attachmentImage?.data &&
          typeof body.attachmentImage.data === 'string' &&
          body.attachmentImage.mimeType?.startsWith('image/')
      );

      const userParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (hasImageAttachment && body.attachmentImage?.data && body.attachmentImage?.mimeType) {
        userParts.push({
          inlineData: {
            mimeType: body.attachmentImage.mimeType,
            data: body.attachmentImage.data
          }
        });
      }
      userParts.push({ text: question });

      const historyItems = Array.isArray(body.history) ? body.history.slice(-8) : [];
      const contents = [
        ...historyItems
          .filter((m) => m && typeof m.text === 'string' && m.text.trim())
          .map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.text.trim() }]
          })),
        {
          role: 'user',
          parts: userParts
        }
      ];

      const systemInstruction = buildGujaratiBusinessSystemPrompt(
        body.shopContext,
        body.preferredLanguage === 'en' ? 'en' : 'gu'
      );
      let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
      let usedModel = MODEL_NAME;
      let lastModelErr: unknown = null;

      for (const candidateModel of MODEL_CANDIDATES) {
        try {
          const isGemini4 = candidateModel.startsWith('gemini-4-');
          response = await ai.models.generateContent({
            model: candidateModel,
            contents,
            config: isGemini4
              ? { systemInstruction }
              : { systemInstruction, temperature: 0.2 }
          });
          usedModel = candidateModel;
          break;
        } catch (modelErr: unknown) {
          lastModelErr = modelErr;
          const mObj = modelErr as { status?: number; code?: number; message?: string };
          const mStatus = mObj?.status || mObj?.code;
          const mMsg = (mObj?.message || '').toLowerCase();
          const isNotFound = mStatus === 404 || mMsg.includes('not_found') || mMsg.includes('no longer available');
          const isUnavailable = mStatus === 503 || mMsg.includes('unavailable') || mMsg.includes('high demand') || mMsg.includes('overloaded');
          if (!isNotFound && !isUnavailable) {
            throw modelErr;
          }
          console.warn(`[Amul AI] Model ${candidateModel} unavailable (${mStatus}), trying next candidate...`);
        }
      }

      if (!response) {
        throw lastModelErr || new Error('No compatible Gemini model responded.');
      }

      const answer = (response.text || '').trim();
      if (!answer) {
        res.status(502).json({
          code: 'EMPTY_AI_RESPONSE',
          error: 'AI returned an empty response.'
        });
        return;
      }

      res.json({
        answer,
        model: usedModel,
        keySource: source
      });
    } catch (err: unknown) {
      const errObj = err as { status?: number; code?: number; message?: string; name?: string };
      const message = errObj?.message || String(err);
      const status = errObj?.status || errObj?.code || 500;
      const lower = message.toLowerCase();

      let friendlyError = 'Gemini API request failed.';
      let statusCode = typeof status === 'number' && status >= 400 && status < 600 ? status : 500;

      if (
        statusCode === 401 ||
        statusCode === 403 ||
        lower.includes('api key') ||
        lower.includes('permission_denied') ||
        lower.includes('authentication scopes')
      ) {
        statusCode = 403;
        friendlyError = 'Invalid or unauthorized Gemini API key.';
      } else if (statusCode === 429 || lower.includes('quota') || lower.includes('rate limit')) {
        statusCode = 429;
        friendlyError = 'Gemini API quota exceeded.';
      }

      console.error('[Amul AI Server Error]', {
        keySource: source,
        status: statusCode,
        name: errObj?.name,
        message
      });

      res.status(statusCode).json({
        code: 'GEMINI_API_ERROR',
        error: friendlyError,
        details: message
      });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  const rootDir = process.cwd();

  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true'
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(rootDir, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`[Amul Parlour POS] Server listening on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Amul Parlour POS server:', err);
  process.exit(1);
});
