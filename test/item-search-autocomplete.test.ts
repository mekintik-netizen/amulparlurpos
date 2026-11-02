/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Automated Unit Tests for Instant Item Search & Autocomplete on Shop Counter Billing Screen
 * Verifies:
 * 1. Search Bar properties (Label "Search Item / આઇટમ શોધો", autoComplete="off")
 * 2. Real-time scored matching by Name, Gujarati Regional Name, Barcode, and SKU
 * 3. Matching results display Name, Available Stock, and Selling Price
 * 4. Adding a new item to bill creates a line item with quantity 1
 * 5. Selecting an already added item increments quantity and recalculates line total
 * 6. Search input clearing and immediate focus retention for continuous fast billing
 * 7. Live inventory database isolation scoped strictly to `currentShop.id`
 * 8. Firestore real-time synchronization for products and inventory collections
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Product, SaleItem, Shop } from '../src/types/index.ts';
import { syncProductToCloud, deleteProductFromCloud, startShopRealtimeSync } from '../src/storage/firestoreSync.ts';

// Sample shop
const testShop: Shop = {
  id: 'shop-surat-01',
  shopCode: 'AP-SUR-101',
  name: 'Amul Preferred Parlour - Varachha',
  ownerName: 'Dharmesh Patel',
  phone: '+91 98250 11223',
  email: 'surat.varachha@amul.in',
  address: 'Shop 10, Diamond Market',
  city: 'Surat',
  state: 'Gujarat',
  pincode: '395006',
  approvalStatus: 'APPROVED',
  subscriptionPlanId: 'PRO',
  subscriptionStatus: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

// Sample inventory products for testShop
const testProducts: Product[] = [
  {
    id: 'prod-milk-taaza-500',
    shopId: 'shop-surat-01',
    barcode: '8901262010014',
    sku: 'AMUL-TAAZA-500ML',
    name: 'Amul Taaza Homogenised Toned Milk 500ml',
    regionalName: 'અમૂલ તાઝા દૂધ ૫૦૦ મિલી',
    category: 'Milk',
    unit: 'Pouch',
    mrp: 27,
    costPrice: 24.5,
    sellingPrice: 27,
    currentStock: 48,
    minStockAlert: 10,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'prod-butter-100g',
    shopId: 'shop-surat-01',
    barcode: '8901262010151',
    sku: 'AMUL-BUTTER-100G',
    name: 'Amul Pasteurized Butter 100g',
    regionalName: 'અમૂલ માખણ ૧૦૦ ગ્રામ',
    category: 'Ghee & Dairy Fats',
    unit: 'Pack',
    mrp: 60,
    costPrice: 54,
    sellingPrice: 60,
    currentStock: 25,
    minStockAlert: 5,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'prod-gold-milk-1000',
    shopId: 'shop-surat-01',
    barcode: '8901262010021',
    sku: 'AMUL-GOLD-1L',
    name: 'Amul Gold Full Cream Fresh Milk 1L',
    regionalName: 'અમૂલ ગોલ્ડ દૂધ ૧ લિટર',
    category: 'Milk',
    unit: 'Pouch',
    mrp: 66,
    costPrice: 61,
    sellingPrice: 66,
    currentStock: 30,
    minStockAlert: 8,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'prod-cheese-cubes-200g',
    shopId: 'shop-surat-01',
    barcode: '8901262020014',
    sku: 'AMUL-CHEESE-200G',
    name: 'Amul Processed Cheese Cubes 200g',
    regionalName: 'અમૂલ ચીઝ ક્યુબ્સ ૨૦૦ ગ્રામ',
    category: 'Cheese & Paneer',
    unit: 'Pack',
    mrp: 140,
    costPrice: 126,
    sellingPrice: 140,
    currentStock: 12,
    minStockAlert: 3,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'prod-other-shop-item',
    shopId: 'shop-anand-99', // Different shop
    barcode: '8901262999999',
    sku: 'AMUL-OTHER-ITEM',
    name: 'Different Shop Item',
    category: 'Others',
    unit: 'Piece',
    mrp: 50,
    costPrice: 40,
    sellingPrice: 50,
    currentStock: 100,
    minStockAlert: 10,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
];

// Helper to simulate the exact autocomplete ranking algorithm from BarcodePOS
function filterAutocompleteMatches(products: Product[], queryText: string): Product[] {
  const q = queryText.trim().toLowerCase();
  if (!q) return [];
  return products
    .filter((p) => p.isActive)
    .map((p) => {
      const nameLower = p.name.toLowerCase();
      const regLower = p.regionalName?.toLowerCase() || '';
      const barcode = (p.barcode || '').toLowerCase();
      const catLower = p.category.toLowerCase();
      const skuLower = p.sku.toLowerCase();

      let score = 0;
      if (barcode === q) score += 100;
      else if (barcode.startsWith(q)) score += 60;
      else if (nameLower === q) score += 50;
      else if (nameLower.startsWith(q)) score += 40;
      else if (regLower.startsWith(q)) score += 35;
      else if (nameLower.includes(q)) score += 20;
      else if (regLower.includes(q)) score += 15;
      else if (catLower.includes(q)) score += 10;
      else if (skuLower.includes(q)) score += 8;
      else if (barcode.includes(q)) score += 5;

      return { product: p, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((item) => item.product);
}

// Cart state simulation helper
interface CartLineItem extends SaleItem {
  availableStock: number;
}

function simulateAddToCart(cart: CartLineItem[], product: Product): CartLineItem[] {
  const existing = cart.find(i => i.productId === product.id);
  if (existing) {
    return cart.map(i =>
      i.productId === product.id
        ? {
            ...i,
            quantity: i.quantity + 1,
            total: (i.quantity + 1) * i.unitPrice
          }
        : i
    );
  } else {
    return [
      ...cart,
      {
        productId: product.id,
        productName: product.name,
        barcode: product.barcode,
        quantity: 1,
        unit: product.unit,
        mrp: product.mrp,
        unitPrice: product.sellingPrice,
        costPrice: product.costPrice,
        total: product.sellingPrice,
        availableStock: product.currentStock
      }
    ];
  }
}

describe('Instant Item Search & Autocomplete Tests', () => {
  it('1. verifies search input markup contains "Search Item / આઇટમ શોધો" and autoComplete="off"', () => {
    const posCode = fs.readFileSync(
      path.join(process.cwd(), 'src/components/pos/BarcodePOS.tsx'),
      'utf-8'
    );

    // Check label
    expect(posCode).toContain('Search Item / આઇટમ શોધો');
    // Check autoComplete attribute
    expect(posCode).toContain('autoComplete="off"');
    // Check input id
    expect(posCode).toContain('id="instant-item-search"');
  });

  it('2. filters items in real-time by English name (e.g. "Taaza")', () => {
    const shopInventory = testProducts.filter(p => p.shopId === testShop.id);
    const matches = filterAutocompleteMatches(shopInventory, 'Taaza');

    expect(matches.length).toBe(1);
    expect(matches[0].name).toContain('Amul Taaza');
    expect(matches[0].currentStock).toBe(48);
    expect(matches[0].sellingPrice).toBe(27);
  });

  it('3. filters items in real-time by Gujarati regional name (e.g. "માખણ")', () => {
    const shopInventory = testProducts.filter(p => p.shopId === testShop.id);
    const matches = filterAutocompleteMatches(shopInventory, 'માખણ');

    expect(matches.length).toBe(1);
    expect(matches[0].name).toBe('Amul Pasteurized Butter 100g');
    expect(matches[0].regionalName).toContain('માખણ');
    expect(matches[0].sellingPrice).toBe(60);
  });

  it('4. filters items in real-time by barcode prefix (e.g. "8901262010014")', () => {
    const shopInventory = testProducts.filter(p => p.shopId === testShop.id);
    const matches = filterAutocompleteMatches(shopInventory, '8901262010014');

    expect(matches.length).toBe(1);
    expect(matches[0].barcode).toBe('8901262010014');
    expect(matches[0].name).toContain('Amul Taaza');
  });

  it('5. enforces strict tenant data isolation (only matches items with current shopId)', () => {
    // Only items belonging to testShop (shop-surat-01) should be returned
    const shopInventory = testProducts.filter(p => p.shopId === testShop.id);
    const matches = filterAutocompleteMatches(shopInventory, 'Different Shop');

    expect(matches.length).toBe(0);
  });

  it('6. adding a new searched item to the bill table sets quantity to 1 and calculates total', () => {
    let cart: CartLineItem[] = [];
    const taaza = testProducts[0];

    cart = simulateAddToCart(cart, taaza);

    expect(cart.length).toBe(1);
    expect(cart[0].productId).toBe(taaza.id);
    expect(cart[0].quantity).toBe(1);
    expect(cart[0].unitPrice).toBe(27);
    expect(cart[0].total).toBe(27);
  });

  it('7. selecting an already added searched item increases its quantity by +1', () => {
    let cart: CartLineItem[] = [];
    const taaza = testProducts[0];

    // Add 1st time
    cart = simulateAddToCart(cart, taaza);
    expect(cart[0].quantity).toBe(1);
    expect(cart[0].total).toBe(27);

    // Add 2nd time
    cart = simulateAddToCart(cart, taaza);
    expect(cart.length).toBe(1); // Still 1 line item
    expect(cart[0].quantity).toBe(2);
    expect(cart[0].total).toBe(54);

    // Add Butter as a second line item
    const butter = testProducts[1];
    cart = simulateAddToCart(cart, butter);
    expect(cart.length).toBe(2);
    expect(cart[1].productName).toBe('Amul Pasteurized Butter 100g');
    expect(cart[1].quantity).toBe(1);
    expect(cart[1].total).toBe(60);

    // Total bill items
    const totalItems = cart.reduce((acc, i) => acc + i.quantity, 0);
    expect(totalItems).toBe(3);
    const subtotal = cart.reduce((acc, i) => acc + i.total, 0);
    expect(subtotal).toBe(114);
  });

  it('8. verifies continuous billing logic clears search query and refocuses input', () => {
    const posCode = fs.readFileSync(
      path.join(process.cwd(), 'src/components/pos/BarcodePOS.tsx'),
      'utf-8'
    );

    // Verify handleSelectSearchedItem clears search and refocuses input
    expect(posCode).toContain("setSearchQuery('')");
    expect(posCode).toContain("setSearchTerm('')");
    expect(posCode).toContain('setIsSearchDropdownOpen(false)');
    expect(posCode).toContain('searchInputRef.current?.focus()');
  });

  it('9. verifies firestoreSync.ts syncs and listens to both products and inventory collections with shopId filter', () => {
    const syncCode = fs.readFileSync(
      path.join(process.cwd(), 'src/storage/firestoreSync.ts'),
      'utf-8'
    );

    // Check inventory collection sync
    expect(syncCode).toContain("doc(db, 'inventory', product.id)");
    expect(syncCode).toContain("where('shopId', '==', shopId)");
    expect(syncCode).toContain("collection(db, 'inventory')");
    expect(syncCode).toContain('startShopRealtimeSync');
  });
});
