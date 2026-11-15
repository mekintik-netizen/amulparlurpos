/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Automated Verification Suite for the Login-Gated Amul AI Business Assistant (AI સહાયક)
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { encodeAiApiKey, decodeAiApiKey, maskApiKey } from '../src/utils/aiKeyCodec.ts';
import {
  clearAiSessionMemory,
  getSessionEncodedAiKey,
  isAiAccessAllowedForSession,
  isAiSessionLoaded,
  resolveClientEncodedKeys
} from '../src/storage/aiConfig.ts';
import { computeShopAiContextFromData } from '../src/utils/shopAiContext.ts';
import { generateLocalGujaratiBusinessAnswer } from '../src/utils/localAiFallback.ts';
import { AMUL_AI_QUICK_CHIPS } from '../src/components/ai/AmulAiAssistant.tsx';
import { AuthSession } from '../src/storage/auth.ts';
import { Expense, Product, PurchaseBill, SaleBill, Shop, Supplier } from '../src/types/index.ts';

const baseShop: Shop = {
  id: 'shop-ai-01',
  shopCode: 'AP-2026-2001',
  name: 'Sardar Amul Parlour',
  ownerName: 'Rameshbhai Patel',
  phone: '9876543210',
  email: 'sardar@amul.in',
  address: 'Dairy Road',
  city: 'Anand',
  state: 'Gujarat',
  pincode: '388001',
  approvalStatus: 'APPROVED',
  subscriptionPlanId: 'PRO',
  subscriptionStatus: 'ACTIVE',
  aiEnabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

const shopSession: AuthSession = {
  userId: 'usr-shop-01',
  username: 'ap20262001',
  fullName: 'Rameshbhai Patel',
  role: 'SHOP_USER',
  shopId: baseShop.id,
  shopCode: baseShop.shopCode,
  shopName: baseShop.name,
  tokenExpiresAt: Date.now() + 3600_000,
  loggedInAt: new Date().toISOString()
};

const adminSession: AuthSession = {
  userId: 'usr-admin-01',
  username: 'admin',
  fullName: 'Master Admin',
  role: 'ADMIN',
  tokenExpiresAt: Date.now() + 3600_000,
  loggedInAt: new Date().toISOString()
};

function collectFilesRecursive(dirPath: string): string[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursive(full));
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

describe('Amul AI Business Assistant - Security, Context & UI Integration', () => {
  it('encodes and decodes Admin Gemini API keys obfuscated without plain-text exposure', () => {
    const sampleDummyKey = ['AIza', 'TestDummy', 'Key9876543210'].join('');
    const encoded = encodeAiApiKey(sampleDummyKey);

    expect(encoded.startsWith('AMUL_OBF_V1:')).toBe(true);
    expect(encoded).not.toContain(sampleDummyKey);
    expect(decodeAiApiKey(encoded)).toBe(sampleDummyKey);

    const masked = maskApiKey(sampleDummyKey);
    expect(masked).toContain('••••');
    expect(masked).not.toBe(sampleDummyKey);
  });

  it('strictly enforces login gating and per-shop AI Active status', () => {
    // Public Login Screen (!currentUser) -> strictly denied
    expect(isAiAccessAllowedForSession(null, baseShop)).toBe(false);
    expect(isAiAccessAllowedForSession(undefined, null)).toBe(false);

    // Logged in shop user with aiEnabled=true -> allowed
    expect(isAiAccessAllowedForSession(shopSession, baseShop)).toBe(true);

    // Logged in shop user when Admin suspends AI (aiEnabled=false) -> denied
    expect(isAiAccessAllowedForSession(shopSession, { ...baseShop, aiEnabled: false })).toBe(false);

    // Master Admin always allowed
    expect(isAiAccessAllowedForSession(adminSession, { ...baseShop, aiEnabled: false })).toBe(true);

    // Session memory clears cleanly
    clearAiSessionMemory();
    expect(isAiSessionLoaded()).toBe(false);
    expect(getSessionEncodedAiKey()).toBe('');
  });

  it('compiles accurate live shop metrics, payment splits, low stock, dead stock, customer dues, and agency payables', () => {
    const refNow = new Date('2026-11-15T14:30:00');
    const todayDate = '2026-11-15';

    const products: Product[] = [
      {
        id: 'p-milk',
        shopId: baseShop.id,
        barcode: '8901262010014',
        sku: 'MILK-500',
        name: 'Amul Gold Milk 500ml',
        category: 'Milk',
        unit: 'Pouch',
        mrp: 33,
        costPrice: 30,
        sellingPrice: 33,
        currentStock: 8,
        minStockAlert: 15,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      },
      {
        id: 'p-cheese',
        shopId: baseShop.id,
        barcode: '8901262020020',
        sku: 'CHEESE-500',
        name: 'Amul Mozzarella Cheese 500g',
        category: 'Cheese & Paneer',
        unit: 'Pack',
        mrp: 280,
        costPrice: 240,
        sellingPrice: 280,
        currentStock: 5,
        minStockAlert: 2,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      },
      {
        id: 'p-paneer',
        shopId: baseShop.id,
        barcode: '8901262030037',
        sku: 'PANEER-200',
        name: 'Amul Malai Paneer 200g',
        category: 'Cheese & Paneer',
        unit: 'Pack',
        mrp: 95,
        costPrice: 82,
        sellingPrice: 95,
        currentStock: 0, // Out of stock
        minStockAlert: 5,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }
    ];

    const sales: SaleBill[] = [
      {
        id: 'bill-1',
        billNumber: 'BILL-001',
        shopId: baseShop.id,
        timestamp: `${todayDate}T09:15:00`,
        items: [
          {
            productId: 'p-milk',
            productName: 'Amul Gold Milk 500ml',
            barcode: '8901262010014',
            quantity: 20,
            unit: 'Pouch',
            mrp: 33,
            unitPrice: 33,
            costPrice: 30,
            total: 660
          }
        ],
        itemCount: 1,
        subtotal: 660,
        discountAmount: 0,
        taxAmount: 0,
        roundOff: 0,
        finalAmount: 660,
        paymentMode: 'UPI',
        status: 'COMPLETED',
        cashierName: 'Ramesh',
        idempotencyKey: 'k1',
        createdAt: `${todayDate}T09:15:00`
      },
      {
        id: 'bill-2',
        billNumber: 'BILL-002',
        shopId: baseShop.id,
        timestamp: `${todayDate}T11:30:00`,
        items: [
          {
            productId: 'p-milk',
            productName: 'Amul Gold Milk 500ml',
            barcode: '8901262010014',
            quantity: 10,
            unit: 'Pouch',
            mrp: 33,
            unitPrice: 33,
            costPrice: 30,
            total: 330
          }
        ],
        itemCount: 1,
        subtotal: 330,
        discountAmount: 0,
        taxAmount: 0,
        roundOff: 0,
        finalAmount: 330,
        paymentMode: 'CREDIT',
        customerName: 'Kiran Patel',
        customerPhone: '9988776655',
        status: 'COMPLETED',
        cashierName: 'Ramesh',
        idempotencyKey: 'k2',
        createdAt: `${todayDate}T11:30:00`
      },
      {
        id: 'bill-cancelled',
        billNumber: 'BILL-003',
        shopId: baseShop.id,
        timestamp: `${todayDate}T12:00:00`,
        items: [],
        itemCount: 0,
        subtotal: 500,
        discountAmount: 0,
        taxAmount: 0,
        roundOff: 0,
        finalAmount: 500,
        paymentMode: 'CASH',
        status: 'CANCELLED',
        cashierName: 'Ramesh',
        idempotencyKey: 'k3',
        createdAt: `${todayDate}T12:00:00`
      }
    ];

    const expenses: Expense[] = [
      {
        id: 'exp-1',
        shopId: baseShop.id,
        date: todayDate,
        category: 'Packaging & Ice Bags',
        amount: 40,
        paymentMode: 'CASH',
        createdBy: 'Ramesh',
        createdAt: `${todayDate}T10:00:00`
      }
    ];

    const purchases: PurchaseBill[] = [
      {
        id: 'pur-1',
        purchaseInvoiceNumber: 'INV-9001',
        billNumber: 'INV-9001',
        shopId: baseShop.id,
        supplierId: 'sup-1',
        supplierName: 'Anand Dairy Depot',
        agencyName: 'Anand Dairy Depot',
        purchaseDate: todayDate,
        items: [],
        itemCount: 0,
        subtotal: 5000,
        taxAmount: 0,
        otherCharges: 0,
        totalAmount: 5000,
        paidAmount: 2000,
        dueAmount: 3000,
        status: 'PENDING',
        paymentMode: 'CREDIT',
        stockPosted: false,
        createdAt: `${todayDate}T08:00:00`,
        updatedAt: `${todayDate}T08:00:00`
      }
    ];

    const suppliers: Supplier[] = [
      {
        id: 'sup-1',
        shopId: baseShop.id,
        name: 'Anand Dairy Depot',
        companyName: 'GCMMF Anand',
        phone: '9825000001',
        currentBalance: 3000,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }
    ];

    const ctx = computeShopAiContextFromData({
      shop: baseShop,
      products,
      sales,
      purchases,
      suppliers,
      expenses,
      referenceDate: refNow
    });

    // Today's revenue = 660 + 330 = 990 (cancelled bill ignored); COGS = 30 * 30 = 900; Gross = 90; Exp = 40; Net = 50
    expect(ctx.salesMetrics.todayBills).toBe(2);
    expect(ctx.salesMetrics.todayRevenue).toBe(990);
    expect(ctx.salesMetrics.todayCogs).toBe(900);
    expect(ctx.salesMetrics.todayGrossProfit).toBe(90);
    expect(ctx.salesMetrics.todayExpenses).toBe(40);
    expect(ctx.salesMetrics.todayNetProfit).toBe(50);
    expect(ctx.salesMetrics.todayByPaymentMode.upi).toBe(660);
    expect(ctx.salesMetrics.todayByPaymentMode.credit).toBe(330);
    expect(ctx.salesMetrics.todayByPaymentMode.cash).toBe(0);

    // Top selling product 7d
    expect(ctx.topSellingProducts7d[0].productName).toBe('Amul Gold Milk 500ml');
    expect(ctx.topSellingProducts7d[0].qtySold).toBe(30);

    // Low stock & out-of-stock (Paneer 0 + Milk 8 <= 15)
    expect(ctx.outOfStockCount).toBe(1);
    expect(ctx.lowStockCount).toBe(2);

    // Dead stock (Cheese has stock 5 and 0 sales in 30d; Paneer has stock 0 so not dead stock capital)
    expect(ctx.deadStockItems30d.length).toBe(1);
    expect(ctx.deadStockItems30d[0].productName).toBe('Amul Mozzarella Cheese 500g');
    expect(ctx.deadStockItems30d[0].stockValueAtCost).toBe(1200);

    // Smart order 7d recommendation for Milk (30 sold / 7d -> avgDailySales 4.286 -> ceil(4.286 * 7 * 1.1 - 8) = 26)
    expect(ctx.smartOrder7dRecommendations.length).toBe(1);
    expect(ctx.smartOrder7dRecommendations[0].productName).toBe('Amul Gold Milk 500ml');
    expect(ctx.smartOrder7dRecommendations[0].suggestedQty).toBe(26);

    // Pending customer dues
    expect(ctx.pendingCustomerDues.totalPendingAmount).toBe(330);
    expect(ctx.pendingCustomerDues.customers[0].customerName).toBe('Kiran Patel');

    // Pending agency / supplier payables
    expect(ctx.pendingSupplierPayables.totalPendingBillsAmount).toBe(3000);
    expect(ctx.pendingSupplierPayables.totalSupplierLedgerBalance).toBe(3000);
    expect(ctx.pendingSupplierPayables.pendingBills[0].billNumber).toBe('INV-9001');
  });

  it('includes all 7 required Gujarati quick-question chips', () => {
    expect(AMUL_AI_QUICK_CHIPS).toHaveLength(7);
    const joined = AMUL_AI_QUICK_CHIPS.map((c) => c.label).join(' ');
    expect(joined).toContain('આજનો કુલ નફો અને વેચાણ કેટલું થયું?');
    expect(joined).toContain('આ અઠવાડિયે સૌથી વધુ કઈ આઈટમ વેચાઈ?');
    expect(joined).toContain('કઈ આઈટમનો સ્ટોક ખતમ થવા આવ્યો છે?');
    expect(joined).toContain('આવતા ૭ દિવસ માટે શું ઓર્ડર કરવું જોઈએ?');
    expect(joined).toContain('કયા કસ્ટમરની ઉઘરાણી બાકી છે?');
    expect(joined).toContain('કઈ એજન્સીનું પેમેન્ટ બાકી છે?');
    expect(joined).toContain('કઈ આઈટમ બિલકુલ નથી વેચાતી (Dead Stock)?');
  });

  it('keeps @google/genai strictly server-side with zero client-side key exposure or LoginPage leaks', () => {
    const rootDir = path.resolve(import.meta.dirname, '..');
    const srcFiles = collectFilesRecursive(path.join(rootDir, 'src'));

    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content, `${file} must never import @google/genai`).not.toContain('@google/genai');
      expect(content, `${file} must never contain a hardcoded Google API key`).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
    }

    const loginContent = fs.readFileSync(path.join(rootDir, 'src/components/auth/LoginPage.tsx'), 'utf-8');
    expect(loginContent).not.toContain('aiConfig');
    expect(loginContent).not.toContain('/api/ai/');

    const navContent = fs.readFileSync(path.join(rootDir, 'src/components/layout/RightSideNavigation.tsx'), 'utf-8');
    const smartIdx = navContent.indexOf("key: 'SMART_ORDER'");
    const aiIdx = navContent.indexOf("key: 'AMUL_AI'");
    expect(smartIdx).toBeGreaterThan(-1);
    expect(aiIdx).toBeGreaterThan(smartIdx);
    expect(navContent).toContain("label: 'Amul AI'");
    expect(navContent).toContain("sub: 'AI સહાયક & બિઝનેસ સલાહ'");
    expect(navContent).toContain('showAiAssistant');

    const headerContent = fs.readFileSync(path.join(rootDir, 'src/components/layout/Header.tsx'), 'utf-8');
    const headerSmartIdx = headerContent.indexOf('<span>Smart Order</span>');
    const headerAiIdx = headerContent.indexOf('<span>✨ Amul AI</span>');
    expect(headerSmartIdx).toBeGreaterThan(-1);
    expect(headerAiIdx).toBeGreaterThan(headerSmartIdx);
    expect(headerContent).toContain('showAiAssistant');

    const adminContent = fs.readFileSync(path.join(rootDir, 'src/components/admin/AdminPortal.tsx'), 'utf-8');
    expect(adminContent).toContain('AI Configuration / AI સેટિંગ્સ');
    expect(adminContent).toContain('AI Active');
    expect(adminContent).toContain('handleToggleShopAi');

    const serverContent = fs.readFileSync(path.join(rootDir, 'server.ts'), 'utf-8');
    expect(serverContent).toContain("from '@google/genai'");
    expect(serverContent).toContain("gemini-2.5-flash");
    expect(serverContent).toContain("aistudio-build");
    expect(serverContent).toContain('/api/ai/assistant');

    const rulesContent = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf-8');
    expect(rulesContent).toContain("'aiConfig'");

    const assistantContent = fs.readFileSync(path.join(rootDir, 'src/components/ai/AmulAiAssistant.tsx'), 'utf-8');
    expect(assistantContent).toContain('⚙️ API Key સેટ કરો');
    expect(assistantContent).toContain('⚙️ API Key');
    expect(assistantContent).toContain('from-[#3b82f6] via-[#60a5fa] to-[#dbeafe]');
    expect(assistantContent).toContain('તમારા પાર્લરનો');
    expect(assistantContent).toContain('✨ Amul AI • તમારા બિઝનેસનો સ્માર્ટ સહાયક');
    expect(assistantContent).toContain('Clear / નવો પ્રશ્ન');
    expect(assistantContent).toContain('generateLocalGujaratiBusinessAnswer');
    expect(assistantContent).toContain('AbortController');
    expect(assistantContent).not.toContain('/api/ai/status');

    const indexContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
    expect(indexContent).toContain('name="mobile-web-app-capable"');
    expect(indexContent).toContain('name="apple-mobile-web-app-capable"');

    const profileContent = fs.readFileSync(path.join(rootDir, 'src/components/profile/ShopProfileManagement.tsx'), 'utf-8');
    expect(profileContent).toContain('Amul AI — Gemini API Key');
    expect(profileContent).toContain('encodedGeminiApiKey');
  });

  it('generates structured Gujarati answers locally across all 7 quick-chip categories with zero API key needed', () => {
    const refNow = new Date('2026-11-15T14:30:00');
    const todayDate = '2026-11-15';

    const ctx = computeShopAiContextFromData({
      shop: baseShop,
      products: [
        {
          id: 'p-milk',
          shopId: baseShop.id,
          barcode: '8901262010014',
          sku: 'MILK-500',
          name: 'Amul Gold Milk 500ml',
          category: 'Milk',
          unit: 'Pouch',
          mrp: 33,
          costPrice: 30,
          sellingPrice: 33,
          currentStock: 8,
          minStockAlert: 15,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        },
        {
          id: 'p-cheese',
          shopId: baseShop.id,
          barcode: '8901262020020',
          sku: 'CHEESE-500',
          name: 'Amul Mozzarella Cheese 500g',
          category: 'Cheese & Paneer',
          unit: 'Pack',
          mrp: 280,
          costPrice: 240,
          sellingPrice: 280,
          currentStock: 5,
          minStockAlert: 2,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      sales: [
        {
          id: 'b-1',
          billNumber: 'B-1',
          shopId: baseShop.id,
          timestamp: `${todayDate}T10:00:00`,
          items: [
            {
              productId: 'p-milk',
              productName: 'Amul Gold Milk 500ml',
              barcode: '8901262010014',
              quantity: 20,
              unit: 'Pouch',
              mrp: 33,
              unitPrice: 33,
              costPrice: 30,
              total: 660
            }
          ],
          itemCount: 1,
          subtotal: 660,
          discountAmount: 0,
          taxAmount: 0,
          roundOff: 0,
          finalAmount: 660,
          paymentMode: 'UPI',
          status: 'COMPLETED',
          cashierName: 'Ramesh',
          idempotencyKey: 'ib1',
          createdAt: `${todayDate}T10:00:00`
        },
        {
          id: 'b-2',
          billNumber: 'B-2',
          shopId: baseShop.id,
          timestamp: `${todayDate}T11:00:00`,
          items: [],
          itemCount: 0,
          subtotal: 250,
          discountAmount: 0,
          taxAmount: 0,
          roundOff: 0,
          finalAmount: 250,
          paymentMode: 'CREDIT',
          customerName: 'Nileshbhai',
          status: 'COMPLETED',
          cashierName: 'Ramesh',
          idempotencyKey: 'ib2',
          createdAt: `${todayDate}T11:00:00`
        }
      ],
      purchases: [
        {
          id: 'p-1',
          purchaseInvoiceNumber: 'SUP-77',
          billNumber: 'SUP-77',
          shopId: baseShop.id,
          supplierId: 'sup-1',
          supplierName: 'Amul Depot Anand',
          agencyName: 'Amul Depot Anand',
          purchaseDate: todayDate,
          items: [],
          itemCount: 0,
          subtotal: 4000,
          taxAmount: 0,
          otherCharges: 0,
          totalAmount: 4000,
          paidAmount: 1000,
          dueAmount: 3000,
          status: 'PENDING',
          paymentMode: 'CREDIT',
          stockPosted: false,
          createdAt: `${todayDate}T08:00:00`,
          updatedAt: `${todayDate}T08:00:00`
        }
      ],
      suppliers: [],
      expenses: [],
      referenceDate: refNow
    });

    const profitAns = generateLocalGujaratiBusinessAnswer(AMUL_AI_QUICK_CHIPS[0].question, ctx);
    expect(profitAns).toContain('₹910');
    expect(profitAns).toContain('UPI');

    const topAns = generateLocalGujaratiBusinessAnswer(AMUL_AI_QUICK_CHIPS[1].question, ctx);
    expect(topAns).toContain('Amul Gold Milk 500ml');

    const lowStockAns = generateLocalGujaratiBusinessAnswer(AMUL_AI_QUICK_CHIPS[2].question, ctx);
    expect(lowStockAns).toContain('Amul Gold Milk 500ml');

    const smartOrderAns = generateLocalGujaratiBusinessAnswer(AMUL_AI_QUICK_CHIPS[3].question, ctx);
    expect(smartOrderAns).toContain('Smart Order');
    expect(smartOrderAns).toContain('Amul Gold Milk 500ml');

    const custDuesAns = generateLocalGujaratiBusinessAnswer(AMUL_AI_QUICK_CHIPS[4].question, ctx);
    expect(custDuesAns).toContain('Nileshbhai');
    expect(custDuesAns).toContain('₹250');

    const agencyDuesAns = generateLocalGujaratiBusinessAnswer(AMUL_AI_QUICK_CHIPS[5].question, ctx);
    expect(agencyDuesAns).toContain('Amul Depot Anand');
    expect(agencyDuesAns).toContain('₹3,000');

    const deadStockAns = generateLocalGujaratiBusinessAnswer(AMUL_AI_QUICK_CHIPS[6].question, ctx);
    expect(deadStockAns).toContain('Amul Mozzarella Cheese 500g');

    const generalAns = generateLocalGujaratiBusinessAnswer('દુકાનનો ટૂંકો રિપોર્ટ આપો', ctx);
    expect(generalAns).toContain(baseShop.name);
    expect(generalAns).toContain('₹910');

    const englishProfitAns = generateLocalGujaratiBusinessAnswer(AMUL_AI_QUICK_CHIPS[0].question, ctx, 'en');
    expect(englishProfitAns).toContain("Today's Sales & Net Profit");
    expect(englishProfitAns).toContain('₹910');
  });

  it('resolves shop-level encoded key cleanly when session admin key is absent', () => {
    clearAiSessionMemory();
    const dummyShopKey = ['AIza', 'ShopProfileDummy', 'Key123456'].join('');
    const shopWithKey: Shop = {
      ...baseShop,
      encodedGeminiApiKey: encodeAiApiKey(dummyShopKey),
      maskedGeminiApiKey: maskApiKey(dummyShopKey)
    };
    const resolved = resolveClientEncodedKeys(shopWithKey);
    expect(resolved.encodedAdminKey).toBe('');
    expect(decodeAiApiKey(resolved.encodedShopKey)).toBe(dummyShopKey);
    expect(resolved.hasAnyKey).toBe(true);
  });
});
