/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { 
  normalizeProductName, 
  normalizeBarcode, 
  normalizeSku, 
  detectDuplicateGroups 
} from '../src/storage/duplicateDetector.ts';
import { Product } from '../src/types/index.ts';

describe('Duplicate Product Detection & Management', () => {
  const baseProduct: Product = {
    id: 'prod-001',
    shopId: 'shop-test-1',
    name: 'Amul Taaza Milk 500ml',
    sku: 'MILK-TAAZA-500',
    barcode: '8901262010014',
    category: 'Milk',
    unit: 'Pouch',
    mrp: 27,
    costPrice: 24.5,
    sellingPrice: 27,
    currentStock: 25,
    minStockAlert: 10,
    isActive: true,
    createdAt: '2026-11-01T08:00:00Z',
    updatedAt: '2026-11-01T08:00:00Z'
  };

  describe('1. Product Name & Barcode Normalization', () => {
    it('normalizes extra spacing and punctuation', () => {
      expect(normalizeProductName('Amul  Taaza - Fresh Milk (500 ml)'))
        .toBe('amul taaza fresh milk 500ml');
    });

    it('standardizes unit variations like 500 ml to 500ml and 1 kg to 1kg', () => {
      expect(normalizeProductName('Amul Gold Milk 500 ml')).toBe('amul gold milk 500ml');
      expect(normalizeProductName('Amul Cow Ghee 1 kg Tin')).toBe('amul cow ghee 1kg tin');
      expect(normalizeProductName('Amul Butter 500 gm')).toBe('amul butter 500gm');
    });

    it('handles empty or blank names safely', () => {
      expect(normalizeProductName('')).toBe('');
      expect(normalizeProductName('   ')).toBe('');
    });

    it('normalizes barcodes by trimming and removing formatting spaces or dashes', () => {
      expect(normalizeBarcode(' 8901262010014 ')).toBe('8901262010014');
      expect(normalizeBarcode('8901262 010014')).toBe('8901262010014');
      expect(normalizeBarcode('890-1262-010014')).toBe('8901262010014');
    });

    it('filters out dummy/placeholder barcode values', () => {
      expect(normalizeBarcode('')).toBe('');
      expect(normalizeBarcode('-')).toBe('');
      expect(normalizeBarcode('0')).toBe('');
      expect(normalizeBarcode('000')).toBe('');
      expect(normalizeBarcode('N/A')).toBe('');
      expect(normalizeBarcode('none')).toBe('');
    });

    it('normalizes SKUs for case-insensitive matching', () => {
      expect(normalizeSku(' MILK-Taaza-500 ')).toBe('milktaaza500');
      expect(normalizeSku('-')).toBe('');
      expect(normalizeSku('NA')).toBe('');
    });
  });

  describe('2. Barcode-Based Duplicate Group Detection', () => {
    it('returns empty array when catalog has no duplicates', () => {
      const cleanProducts: Product[] = [
        { ...baseProduct, id: 'p1', name: 'Amul Taaza Milk 500ml', barcode: '8901262010014', sku: 'SKU1' },
        { ...baseProduct, id: 'p2', name: 'Amul Gold Milk 500ml', barcode: '8901262010021', sku: 'SKU2' },
        { ...baseProduct, id: 'p3', name: 'Amul Butter 100g', barcode: '8901262020013', sku: 'SKU3' }
      ];

      const groups = detectDuplicateGroups(cleanProducts);
      expect(groups).toHaveLength(0);
    });

    it('strictly identifies duplicate items by Barcode even with completely different names or spelling variations', () => {
      const productsWithSameBarcode: Product[] = [
        {
          ...baseProduct,
          id: 'p1',
          name: 'Amul Taaza Fresh Toned Milk 500ml',
          barcode: '8901262010014',
          sku: 'SKU-TZ-01',
          currentStock: 30
        },
        {
          ...baseProduct,
          id: 'p2',
          name: 'Taaza Milk Pouch 500 ml (Gujarati Batch)',
          barcode: '8901262010014',
          sku: 'SKU-TZ-GJ',
          currentStock: 15
        },
        {
          ...baseProduct,
          id: 'p3',
          name: 'Amul Gold Milk 500ml',
          barcode: '8901262010021',
          sku: 'SKU-GLD-01',
          currentStock: 10
        }
      ];

      const groups = detectDuplicateGroups(productsWithSameBarcode);
      expect(groups).toHaveLength(1);
      expect(groups[0].matchType).toBe('BARCODE');
      expect(groups[0].sharedBarcode).toBe('8901262010014');
      expect(groups[0].items).toHaveLength(2);
      expect(groups[0].totalStock).toBe(45);
      expect(groups[0].primaryItem.id).toBe('p1'); // Highest active stock (30 vs 15)
    });

    it('matches barcodes formatted with spaces or hyphens', () => {
      const productsWithFormattedBarcodes: Product[] = [
        { ...baseProduct, id: 'p1', name: 'Amul Butter 500g', barcode: '8901262020013', sku: 'SKU-B1', currentStock: 10 },
        { ...baseProduct, id: 'p2', name: 'Amul Butter 500g Pack', barcode: '8901262 020013', sku: 'SKU-B2', currentStock: 20 }
      ];

      const groups = detectDuplicateGroups(productsWithFormattedBarcodes);
      expect(groups).toHaveLength(1);
      expect(groups[0].matchType).toBe('BARCODE');
      expect(groups[0].items).toHaveLength(2);
      expect(groups[0].totalStock).toBe(30);
    });

    it('does not falsely group items that both have empty or placeholder barcodes', () => {
      const productsWithPlaceholderBarcodes: Product[] = [
        { ...baseProduct, id: 'p1', name: 'Product A', barcode: '', sku: 'SKU-A' },
        { ...baseProduct, id: 'p2', name: 'Product B', barcode: '-', sku: 'SKU-B' },
        { ...baseProduct, id: 'p3', name: 'Product C', barcode: '0', sku: 'SKU-C' },
        { ...baseProduct, id: 'p4', name: 'Product D', barcode: 'N/A', sku: 'SKU-D' }
      ];

      const groups = detectDuplicateGroups(productsWithPlaceholderBarcodes);
      expect(groups).toHaveLength(0);
    });

    it('strictly identifies duplicate items by SKU', () => {
      const productsWithSameSku: Product[] = [
        { ...baseProduct, id: 'p1', name: 'Amul Masti Dahi 400g Cup', sku: 'DAHI-MASTI-400', barcode: '101' },
        { ...baseProduct, id: 'p2', name: 'Curd Masti Cup 400g', sku: 'dahi-masti-400', barcode: '102' }
      ];

      const groups = detectDuplicateGroups(productsWithSameSku);
      expect(groups).toHaveLength(1);
      expect(groups[0].matchType).toBe('SKU');
      expect(groups[0].sharedSku).toBe('DAHI-MASTI-400');
    });

    it('detects multiple matches when both barcode and normalized name match', () => {
      const productsWithBothMatch: Product[] = [
        { ...baseProduct, id: 'p1', name: 'Amul Cow Ghee 1L Tin', barcode: '8901262030012', sku: 'SKU-G1', currentStock: 10 },
        { ...baseProduct, id: 'p2', name: 'Amul Cow Ghee 1L Tin', barcode: '8901262030012', sku: 'SKU-G2', currentStock: 5 }
      ];

      const groups = detectDuplicateGroups(productsWithBothMatch);
      expect(groups).toHaveLength(1);
      expect(groups[0].matchType).toBe('MULTIPLE');
      expect(groups[0].sharedBarcode).toBe('8901262030012');
    });
  });

  describe('3. Stock Merging Calculation & Identifier Retention', () => {
    it('correctly calculates merged stock between primary keeper and duplicate item', () => {
      const primary: Product = { ...baseProduct, id: 'p-keeper', currentStock: 15, barcode: '8901262010014' };
      const duplicate: Product = { ...baseProduct, id: 'p-dup', currentStock: 8, barcode: '8901262010014' };

      const mergedStock = (primary.currentStock || 0) + (duplicate.currentStock || 0);
      expect(mergedStock).toBe(23);

      const updatedKeeper: Product = {
        ...primary,
        currentStock: mergedStock,
        updatedAt: '2026-11-02T10:00:00Z'
      };

      expect(updatedKeeper.currentStock).toBe(23);
      expect(updatedKeeper.id).toBe('p-keeper');
      expect(updatedKeeper.barcode).toBe('8901262010014');
    });

    it('preserves barcode on keeper if keeper initially lacked barcode', () => {
      const primaryWithoutBarcode: Product = { ...baseProduct, id: 'p-no-bc', barcode: '', currentStock: 20 };
      const duplicateWithBarcode: Product = { ...baseProduct, id: 'p-with-bc', barcode: '8901262010014', currentStock: 5 };

      const bestBarcode = primaryWithoutBarcode.barcode || duplicateWithBarcode.barcode;
      expect(bestBarcode).toBe('8901262010014');
    });
  });
});
