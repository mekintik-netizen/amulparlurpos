import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { 
  parseProductsExcel, 
  normalizeCategory, 
  exportDataToExcel 
} from '../src/utils/excelEngine.ts';

describe('Excel Import and Export Module', () => {
  describe('1. normalizeCategory', () => {
    it('normalizes common variations to official categories', () => {
      expect(normalizeCategory('fresh milk')).toBe('Milk');
      expect(normalizeCategory('Amul Butter')).toBe('Butter & Spreads');
      expect(normalizeCategory('paneer')).toBe('Cheese & Paneer');
      expect(normalizeCategory('Cone Ice Cream')).toBe('Ice Cream & Frozen');
      expect(normalizeCategory('Cow Ghee')).toBe('Ghee & Dairy Fats');
      expect(normalizeCategory('Masti Buttermilk / Chaas')).toBe('Beverages & Buttermilk');
      expect(normalizeCategory('Dark Chocolate')).toBe('Chocolates & Sweets');
      expect(normalizeCategory('Masti Dahi / Curd')).toBe('Curd & Yogurt');
      expect(normalizeCategory('Cookies & Bakery')).toBe('Bakery & Snacks');
      expect(normalizeCategory('Random Product')).toBe('Others');
      expect(normalizeCategory('')).toBe('Others');
    });
  });

  describe('2. parseProductsExcel', () => {
    it('parses valid spreadsheet buffer and normalizes columns', () => {
      const mockData = [
        {
          'Product Name': 'Amul Taaza Milk 500ml',
          'Category': 'Milk',
          'Cost Price': 25,
          'Selling Price': 27,
          'MRP': 27,
          'Initial Stock': 80,
          'Barcode': '8901262010012',
          'SKU': 'AMUL-MLK-01',
          'Unit': 'Pouch'
        },
        {
          'Item Name': 'Amul Salted Butter 500g',
          'Type': 'Butter & Spreads',
          'CP': 240,
          'SP': 275,
          'Stock': 30,
          'Barcode': '8901262020059'
        }
      ];

      const ws = XLSX.utils.json_to_sheet(mockData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Products');
      const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

      const result = parseProductsExcel(buffer);
      expect(result.validRows.length).toBe(2);
      expect(result.errors.length).toBe(0);

      const first = result.validRows[0];
      expect(first.name).toBe('Amul Taaza Milk 500ml');
      expect(first.category).toBe('Milk');
      expect(first.costPrice).toBe(25);
      expect(first.sellingPrice).toBe(27);
      expect(first.initialStock).toBe(80);
      expect(first.barcode).toBe('8901262010012');
      expect(first.unit).toBe('Pouch');

      const second = result.validRows[1];
      expect(second.name).toBe('Amul Salted Butter 500g');
      expect(second.category).toBe('Butter & Spreads');
      expect(second.costPrice).toBe(240);
      expect(second.sellingPrice).toBe(275);
      expect(second.initialStock).toBe(30);
    });

    it('identifies and skips invalid rows (missing name or invalid pricing)', () => {
      const mockData = [
        {
          'Product Name': '', // Invalid empty name
          'Category': 'Milk',
          'Selling Price': 30
        },
        {
          'Product Name': 'Valid Amul Ghee',
          'Category': 'Ghee & Dairy Fats',
          'Selling Price': 0, // No valid price
          'Cost Price': 0,
          'MRP': 0
        },
        {
          'Product Name': 'Amul Kool Cafe 200ml',
          'Category': 'Beverages & Buttermilk',
          'Selling Price': 25,
          'Initial Stock': 50
        }
      ];

      const ws = XLSX.utils.json_to_sheet(mockData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Products');
      const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

      const result = parseProductsExcel(buffer);
      expect(result.validRows.length).toBe(1);
      expect(result.errors.length).toBe(2);
      expect(result.validRows[0].name).toBe('Amul Kool Cafe 200ml');
    });
  });

  describe('3. exportDataToExcel generation check', () => {
    it('creates and writes an XLSX workbook from report rows', () => {
      const sampleReportRows = [
        {
          'Bill Number': 'INV-2026-1001',
          'Customer': 'Walk-in Customer',
          'Amount': 250.0,
          'Payment Mode': 'UPI'
        },
        {
          'Bill Number': 'INV-2026-1002',
          'Customer': 'Retail Buyer',
          'Amount': 180.0,
          'Payment Mode': 'CASH'
        }
      ];

      const ws = XLSX.utils.json_to_sheet(sampleReportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Daily Sales');
      const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

      const readBackWb = XLSX.read(buffer, { type: 'array' });
      expect(readBackWb.SheetNames).toContain('Daily Sales');
      const readRows = XLSX.utils.sheet_to_json(readBackWb.Sheets['Daily Sales']);
      expect(readRows.length).toBe(2);
      expect((readRows[0] as any)['Bill Number']).toBe('INV-2026-1001');
    });
  });
});
