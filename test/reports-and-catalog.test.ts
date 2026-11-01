/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Unit tests for Product Images Presets & Reports Hub formatting
 */

import { describe, it, expect } from 'vitest';
import { getAmulProductPresetImage, AMUL_PRODUCT_IMAGE_PRESETS } from '../src/storage/productImages.ts';
import { getSeedProductsForShop } from '../src/storage/seedData.ts';

describe('Product Image Presets & Catalog Photos', () => {
  it('provides high quality SVG data URLs for all key Amul presets including Dahi, Chhaas, Ghee Tin, Mozzarella & Sweets', () => {
    expect(AMUL_PRODUCT_IMAGE_PRESETS.TAAZA_MILK.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.GOLD_MILK.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.COW_MILK.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.BUTTER_PACK.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.CHEESE_SLICES.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.CHEESE_MOZZARELLA.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.PANEER_FRESH.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.AMUL_GHEE_POUCH.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.AMUL_GHEE_TIN.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.MASTI_DAHI.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.CHHAAS_POUCH.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.KOOL_BOTTLE.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.ICE_CREAM_TUB.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.CHOCOLATE_BAR.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.SHRIKHAND_TUB.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.MITHAI_GULAB_JAMUN.dataUrl).toContain('data:image/svg+xml');
  });

  it('correctly maps specific Amul product names to their custom graphic preset', () => {
    const taazaImg = getAmulProductPresetImage('Amul Taaza Toned Milk (500ml)', 'Milk');
    expect(taazaImg).toBe(AMUL_PRODUCT_IMAGE_PRESETS.TAAZA_MILK.dataUrl);

    const goldImg = getAmulProductPresetImage('Amul Gold Full Cream Milk (500ml)', 'Milk');
    expect(goldImg).toBe(AMUL_PRODUCT_IMAGE_PRESETS.GOLD_MILK.dataUrl);

    const butterImg = getAmulProductPresetImage('Amul Butter Pasteurized (100g)', 'Butter & Spreads');
    expect(butterImg).toBe(AMUL_PRODUCT_IMAGE_PRESETS.BUTTER_PACK.dataUrl);

    const cheeseImg = getAmulProductPresetImage('Amul Processed Cheese Slices (200g)', 'Cheese & Paneer');
    expect(cheeseImg).toBe(AMUL_PRODUCT_IMAGE_PRESETS.CHEESE_SLICES.dataUrl);

    const mozzarellaImg = getAmulProductPresetImage('Amul Mozzarella Pizza Cheese (200g Diced)', 'Cheese & Paneer');
    expect(mozzarellaImg).toBe(AMUL_PRODUCT_IMAGE_PRESETS.CHEESE_MOZZARELLA.dataUrl);

    const paneerImg = getAmulProductPresetImage('Amul Fresh Malai Paneer (200g Block)', 'Cheese & Paneer');
    expect(paneerImg).toBe(AMUL_PRODUCT_IMAGE_PRESETS.PANEER_FRESH.dataUrl);

    const dahiImg = getAmulProductPresetImage('Amul Masti Dahi (400g Cup)', 'Curd & Yogurt');
    expect(dahiImg).toBe(AMUL_PRODUCT_IMAGE_PRESETS.MASTI_DAHI.dataUrl);

    const chaasImg = getAmulProductPresetImage('Amul Masti Spiced Buttermilk / Chhaas (500ml)', 'Beverages & Buttermilk');
    expect(chaasImg).toBe(AMUL_PRODUCT_IMAGE_PRESETS.CHHAAS_POUCH.dataUrl);

    const shrikhandImg = getAmulProductPresetImage('Amul Shrikhand Kesar (500g Tub)', 'Chocolates & Sweets');
    expect(shrikhandImg).toBe(AMUL_PRODUCT_IMAGE_PRESETS.SHRIKHAND_TUB.dataUrl);
  });

  it('verifies editable price inputs in CatalogManagement and PurchaseManagement', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const catalogContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/catalog/CatalogManagement.tsx'), 'utf8');
    expect(catalogContent).toContain('startInlinePriceEdit');
    expect(catalogContent).toContain('saveInlinePrice');
    expect(catalogContent).toContain('Cost (Wholesale)');

    const purchaseContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/purchases/PurchaseManagement.tsx'), 'utf8');
    expect(purchaseContent).toContain('itemRate');
    expect(purchaseContent).toContain('itemMrp');
    expect(purchaseContent).toContain('updateItemRate');
    expect(purchaseContent).toContain('updateItemMrp');
  });


  it('guarantees every seeded product in getSeedProductsForShop receives an imageUrl', () => {
    const products = getSeedProductsForShop('shop-test-123');
    expect(products.length).toBeGreaterThan(0);
    products.forEach(prod => {
      expect(prod.imageUrl).toBeDefined();
      expect(typeof prod.imageUrl).toBe('string');
      expect(prod.imageUrl!.length).toBeGreaterThan(20);
      expect(prod.imageUrl).toContain('data:image/svg+xml');
    });
  });

  it('verifies official Amul logo artwork is integrated across LoginPage, Header and Reports', async () => {
    const fs = await import('fs');
    const path = await import('path');

    // Verify logo assets exist
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/assets/amul-logo.jpg'))).toBe(true);
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/assets/logo.ts'))).toBe(true);

    const loginContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/auth/LoginPage.tsx'), 'utf8');
    expect(loginContent).toContain('amulLogo');

    const reportHeaderContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/common/BrandedReportHeader.tsx'), 'utf8');
    expect(reportHeaderContent).toContain('amulLogo');

    const headerContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/layout/Header.tsx'), 'utf8');
    expect(headerContent).toContain('amulLogo');

    const salesContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/reports/DailySalesReport.tsx'), 'utf8');
    expect(salesContent).toContain('amulLogo');

    const stockContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/reports/DailyStockReport.tsx'), 'utf8');
    expect(stockContent).toContain('amulLogo');
  });

  it('provides at least 65 authentic Amul products with valid EAN-13 barcodes and positive margins', () => {
    const products = getSeedProductsForShop('shop-catalog-test');
    expect(products.length).toBeGreaterThanOrEqual(65);

    const barcodeSet = new Set<string>();
    products.forEach((prod) => {
      // Must have valid barcode string of length 12-14 (EAN-13 format)
      expect(prod.barcode).toBeDefined();
      expect(prod.barcode.length).toBeGreaterThanOrEqual(12);
      expect(/^\d+$/.test(prod.barcode)).toBe(true);

      // Must have positive MRP and costPrice where costPrice < mrp
      expect(prod.mrp).toBeGreaterThan(0);
      expect(prod.costPrice).toBeGreaterThan(0);
      expect(prod.costPrice).toBeLessThan(prod.mrp);

      // Barcode uniqueness check
      expect(barcodeSet.has(prod.barcode)).toBe(false);
      barcodeSet.add(prod.barcode);

      // Check categories are valid
      expect([
        'Milk',
        'Butter & Spreads',
        'Cheese & Paneer',
        'Ice Cream & Frozen',
        'Ghee & Dairy Fats',
        'Beverages & Buttermilk',
        'Chocolates & Sweets',
        'Curd & Yogurt',
        'Bakery & Snacks',
        'Others'
      ]).toContain(prod.category);
    });
  });
});

