/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { normalizeProductName, detectDuplicateGroups } from '../src/storage/duplicateDetector.ts';
import { Product } from '../src/types/index.ts';

describe('Duplicate Product Detection & Management', () => {
  const baseProduct: Product = {
    id: 'prod-001',
    shopId: 'shop-test-1',
    name: 'Amul Taaza Milk 500ml',
    sku: 'MILK-TAAZA-500',
    barcode: '8901262010014',
    category: 'MILK',
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

  describe('1. Product Name Normalization', () => {
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
  });

  describe('2. Duplicate Group Detection', () => {
    it('returns empty array when catalog has no duplicates', () => {
      const cleanProducts: Product[] = [
        { ...baseProduct, id: 'p1', name: 'Amul Taaza Milk 500ml', barcode: '11111111', sku: 'SKU1' },
        { ...baseProduct, id: 'p2', name: 'Amul Gold Milk 500ml', barcode: '22222222', sku: 'SKU2' },
        { ...baseProduct, id: 'p3', name: 'Amul Butter 100g', barcode: '33333333', sku: 'SKU3' }
      ];

      const groups = detectDuplicateGroups(cleanProducts);
      expect(groups).toHaveLength(0);
    });

    it('detects duplicates sharing identical normalized names', () => {
      const productsWithDuplicateNames: Product[] = [
        { ...baseProduct, id: 'p1', name: 'Amul Taaza Milk 500ml', currentStock: 30, barcode: '8901262010014', sku: 'SKU-TZ-1' },
        { ...baseProduct, id: 'p2', name: 'Amul Taaza Milk 500 ml', currentStock: 10, barcode: '', sku: 'SKU-TZ-2' },
        { ...baseProduct, id: 'p3', name: 'Amul Gold Milk 500ml', currentStock: 15, barcode: '8901262010021', sku: 'SKU-GLD-1' }
      ];

      const groups = detectDuplicateGroups(productsWithDuplicateNames);
      expect(groups).toHaveLength(1);
      expect(groups[0].items).toHaveLength(2);
      expect(groups[0].totalStock).toBe(40);
      expect(groups[0].primaryItem.id).toBe('p1'); // Higher stock & valid barcode chosen as primary
    });

    it('detects duplicates sharing identical barcodes', () => {
      const productsWithDuplicateBarcode: Product[] = [
        { ...baseProduct, id: 'p1', name: 'Amul Butter 500g', barcode: '8901262020013', currentStock: 5, sku: 'SKU-B1' },
        { ...baseProduct, id: 'p2', name: 'Amul Table Butter 500g Pack', barcode: '8901262020013', currentStock: 12, sku: 'SKU-B2' },
        { ...baseProduct, id: 'p3', name: 'Amul Ghee 1L', barcode: '8901262030012', currentStock: 8, sku: 'SKU-G1' }
      ];

      const groups = detectDuplicateGroups(productsWithDuplicateBarcode);
      expect(groups).toHaveLength(1);
      expect(groups[0].items).toHaveLength(2);
      expect(groups[0].matchType).toBe('BARCODE');
      expect(groups[0].primaryItem.id).toBe('p2'); // p2 has 12 stock vs 5
    });

    it('detects duplicates sharing identical SKUs', () => {
      const productsWithDuplicateSku: Product[] = [
        { ...baseProduct, id: 'p1', name: 'Amul Masti Dahi 400g', sku: 'DAHI-MASTI-400', barcode: '123' },
        { ...baseProduct, id: 'p2', name: 'Amul Masti Cup Curd', sku: 'dahi-masti-400', barcode: '456' }
      ];

      const groups = detectDuplicateGroups(productsWithDuplicateSku);
      expect(groups).toHaveLength(1);
      expect(groups[0].matchType).toBe('SKU');
    });

    it('recommends primary item based on stock, valid barcode, and recency', () => {
      const groupProducts: Product[] = [
        {
          ...baseProduct,
          id: 'p-low',
          name: 'Amul Cheese Slices 200g',
          currentStock: 0,
          barcode: '',
          updatedAt: '2026-10-01T00:00:00Z'
        },
        {
          ...baseProduct,
          id: 'p-high',
          name: 'Amul Cheese Slices 200g',
          currentStock: 22,
          barcode: '8901262040011',
          updatedAt: '2026-11-01T00:00:00Z'
        }
      ];

      const groups = detectDuplicateGroups(groupProducts);
      expect(groups).toHaveLength(1);
      expect(groups[0].primaryItem.id).toBe('p-high');
      expect(groups[0].totalStock).toBe(22);
    });
  });

  describe('3. Stock Merging Calculation', () => {
    it('correctly calculates merged stock between primary keeper and duplicate item', () => {
      const primary: Product = { ...baseProduct, id: 'p-keeper', currentStock: 15 };
      const duplicate: Product = { ...baseProduct, id: 'p-dup', currentStock: 8 };

      const mergedStock = (primary.currentStock || 0) + (duplicate.currentStock || 0);
      expect(mergedStock).toBe(23);

      const updatedKeeper: Product = {
        ...primary,
        currentStock: mergedStock,
        updatedAt: '2026-11-02T10:00:00Z'
      };

      expect(updatedKeeper.currentStock).toBe(23);
      expect(updatedKeeper.id).toBe('p-keeper');
    });
  });
});
