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
  it('provides high quality SVG data URLs for all key Amul presets', () => {
    expect(AMUL_PRODUCT_IMAGE_PRESETS.TAAZA_MILK.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.GOLD_MILK.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.COW_MILK.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.BUTTER_PACK.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.CHEESE_SLICES.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.PANEER_FRESH.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.AMUL_GHEE.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.KOOL_BOTTLE.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.ICE_CREAM_TUB.dataUrl).toContain('data:image/svg+xml');
    expect(AMUL_PRODUCT_IMAGE_PRESETS.CHOCOLATE_BAR.dataUrl).toContain('data:image/svg+xml');
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

    const paneerImg = getAmulProductPresetImage('Amul Fresh Malai Paneer (200g Block)', 'Cheese & Paneer');
    expect(paneerImg).toBe(AMUL_PRODUCT_IMAGE_PRESETS.PANEER_FRESH.dataUrl);

    const koolImg = getAmulProductPresetImage('Amul Kool Badam Shakers (180ml Bottle)', 'Beverages & Buttermilk');
    expect(koolImg).toBe(AMUL_PRODUCT_IMAGE_PRESETS.KOOL_BOTTLE.dataUrl);
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
});
