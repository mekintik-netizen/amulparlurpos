/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Excel & Spreadsheet Import/Export Utility for Amul Parlour POS
 * Powered by SheetJS (xlsx) for full .xlsx and .csv support.
 * Includes column normalization, data sanitization, template download, and styled file generation.
 */

import * as XLSX from 'xlsx';
import { Product, ProductCategory } from '../types/index.ts';
import { sanitizeBarcode, sanitizeNumber, sanitizeText } from './sanitizer.ts';

export interface ExcelImportProductRow {
  name: string;
  category: ProductCategory;
  costPrice: number;
  sellingPrice: number;
  mrp: number;
  initialStock: number;
  barcode?: string;
  sku?: string;
  unit?: Product['unit'];
  minStockAlert?: number;
}

export interface ExcelImportResult {
  validRows: ExcelImportProductRow[];
  errors: Array<{ rowNumber: number; reason: string; rawData: any }>;
  totalRead: number;
}

const VALID_CATEGORIES: ProductCategory[] = [
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
];

/**
 * Normalizes input category string to an official ProductCategory enum
 */
export function normalizeCategory(rawCategory: unknown): ProductCategory {
  if (!rawCategory) return 'Others';
  const clean = String(rawCategory).trim().toLowerCase();

  if (clean.includes('beverage') || clean.includes('buttermilk') || clean.includes('chaas') || clean.includes('lassi') || clean.includes('kool')) return 'Beverages & Buttermilk';
  if (clean.includes('milk') && !clean.includes('butter') && !clean.includes('curd')) return 'Milk';
  if (clean.includes('butter') || clean.includes('spread')) return 'Butter & Spreads';
  if (clean.includes('cheese') || clean.includes('paneer')) return 'Cheese & Paneer';
  if (clean.includes('ice cream') || clean.includes('frozen') || clean.includes('kulfi') || clean.includes('cone')) return 'Ice Cream & Frozen';
  if (clean.includes('ghee') || clean.includes('fat')) return 'Ghee & Dairy Fats';
  if (clean.includes('chocolate') || clean.includes('sweet') || clean.includes('mithai') || clean.includes('gulab')) return 'Chocolates & Sweets';
  if (clean.includes('curd') || clean.includes('yogurt') || clean.includes('dahi') || clean.includes('masti')) return 'Curd & Yogurt';
  if (clean.includes('bakery') || clean.includes('snack') || clean.includes('bread') || clean.includes('cookie')) return 'Bakery & Snacks';

  const exact = VALID_CATEGORIES.find(c => c.toLowerCase() === clean);
  return exact || 'Others';
}

/**
 * Parses and validates an uploaded Excel (.xlsx, .xls) or CSV file buffer
 */
export function parseProductsExcel(buffer: ArrayBuffer): ExcelImportResult {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('The uploaded Excel spreadsheet contains no worksheets.');
  }

  const worksheet = workbook.Sheets[sheetName];
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  const validRows: ExcelImportProductRow[] = [];
  const errors: Array<{ rowNumber: number; reason: string; rawData: any }> = [];

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2; // +2 for 1-based index and header row

    // Find keys ignoring case and whitespace
    const getVal = (...possibleKeys: string[]): any => {
      const rowKeys = Object.keys(row);
      for (const pk of possibleKeys) {
        const foundKey = rowKeys.find(k => k.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === pk.toLowerCase().replace(/[^a-z0-9]/g, ''));
        if (foundKey && row[foundKey] !== undefined && row[foundKey] !== '') {
          return row[foundKey];
        }
      }
      return '';
    };

    const rawName = getVal('productname', 'name', 'itemname', 'product', 'item');
    const rawCategory = getVal('category', 'itemcategory', 'type');
    const rawCost = getVal('costprice', 'cost', 'purchaseprice', 'buyprice', 'cp');
    const rawSelling = getVal('sellingprice', 'selling', 'saleprice', 'retailprice', 'price', 'sp');
    const rawMrp = getVal('mrp', 'maxretailprice');
    const rawStock = getVal('initialstock', 'stock', 'openingstock', 'currentstock', 'qty', 'quantity');
    const rawBarcode = getVal('barcode', 'barcodeno', 'upc', 'ean');
    const rawSku = getVal('sku', 'productsku', 'itemcode', 'code');
    const rawUnit = getVal('unit', 'uom', 'packtype');
    const rawMinAlert = getVal('minstockalert', 'minstock', 'lowstockalert', 'alertlevel');

    // Validation
    const cleanName = sanitizeText(rawName, 120);
    if (!cleanName || cleanName.length < 2) {
      errors.push({
        rowNumber,
        reason: 'Product Name is missing or too short (minimum 2 characters required).',
        rawData: row
      });
      return;
    }

    const sellingPrice = sanitizeNumber(rawSelling, 0, 999999, 0);
    const costPrice = sanitizeNumber(rawCost, 0, 999999, sellingPrice);
    const mrp = sanitizeNumber(rawMrp, 0, 999999, sellingPrice || costPrice);
    const initialStock = sanitizeNumber(rawStock, 0, 999999, 0);
    const minStockAlert = sanitizeNumber(rawMinAlert, 0, 1000, 10);

    if (sellingPrice <= 0 && mrp <= 0 && costPrice <= 0) {
      errors.push({
        rowNumber,
        reason: 'Product must have a valid selling price, MRP, or cost price (> ₹0).',
        rawData: row
      });
      return;
    }

    const category = normalizeCategory(rawCategory);
    const barcode = sanitizeBarcode(rawBarcode, 32);
    const sku = sanitizeText(rawSku, 32);

    let unit: Product['unit'] = 'Pouch';
    const cleanUnit = String(rawUnit).trim().toLowerCase();
    const allowedUnits: Product['unit'][] = ['Pouch', 'Pack', 'Cup', 'Cone', 'Tub', 'Bottle', 'Tin', 'Brick', 'Kg', 'Litre', 'Piece'];
    const matchedUnit = allowedUnits.find(u => u.toLowerCase() === cleanUnit);
    if (matchedUnit) {
      unit = matchedUnit;
    }

    validRows.push({
      name: cleanName,
      category,
      costPrice,
      sellingPrice: sellingPrice || mrp,
      mrp: mrp || sellingPrice,
      initialStock,
      barcode: barcode || undefined,
      sku: sku || undefined,
      unit,
      minStockAlert
    });
  });

  return {
    validRows,
    errors,
    totalRead: rawRows.length
  };
}

/**
 * Downloads a sample Excel Template for product import
 */
export function downloadProductImportTemplate(): void {
  const sampleData = [
    {
      'Product Name': 'Amul Taaza Milk 500ml',
      'Category': 'Milk',
      'Cost Price': 25.0,
      'Selling Price': 27.0,
      'MRP': 27.0,
      'Initial Stock': 60,
      'Barcode': '8901262010012',
      'SKU': 'AMUL-MLK-001',
      'Unit': 'Pouch',
      'Min Stock Alert': 15
    },
    {
      'Product Name': 'Amul Gold Milk 500ml',
      'Category': 'Milk',
      'Cost Price': 31.0,
      'Selling Price': 33.0,
      'MRP': 33.0,
      'Initial Stock': 50,
      'Barcode': '8901262010029',
      'SKU': 'AMUL-MLK-002',
      'Unit': 'Pouch',
      'Min Stock Alert': 15
    },
    {
      'Product Name': 'Amul Salted Butter 100g',
      'Category': 'Butter & Spreads',
      'Cost Price': 52.0,
      'Selling Price': 58.0,
      'MRP': 58.0,
      'Initial Stock': 24,
      'Barcode': '8901262020011',
      'SKU': 'AMUL-BTR-001',
      'Unit': 'Pack',
      'Min Stock Alert': 6
    },
    {
      'Product Name': 'Amul Vanilla Gold Ice Cream 1L',
      'Category': 'Ice Cream & Frozen',
      'Cost Price': 140.0,
      'Selling Price': 180.0,
      'MRP': 180.0,
      'Initial Stock': 15,
      'Barcode': '8901262040019',
      'SKU': 'AMUL-IC-001',
      'Unit': 'Tub',
      'Min Stock Alert': 5
    },
    {
      'Product Name': 'Amul Pure Ghee 1L Tin',
      'Category': 'Ghee & Dairy Fats',
      'Cost Price': 580.0,
      'Selling Price': 650.0,
      'MRP': 650.0,
      'Initial Stock': 10,
      'Barcode': '8901262050018',
      'SKU': 'AMUL-GHEE-001',
      'Unit': 'Tin',
      'Min Stock Alert': 3
    }
  ];

  exportDataToExcel({
    filename: 'Amul_Product_Import_Template.xlsx',
    sheetName: 'Products Template',
    data: sampleData
  });
}

/**
 * Generic Excel Export Function using XLSX
 */
export function exportDataToExcel(options: {
  filename: string;
  sheetName?: string;
  data: Record<string, any>[];
}): void {
  const { filename, sheetName = 'Sheet1', data } = options;

  const worksheet = XLSX.utils.json_to_sheet(data);

  // Auto-fit column widths
  if (data.length > 0) {
    const keys = Object.keys(data[0]);
    worksheet['!cols'] = keys.map(k => {
      let maxLen = k.length;
      data.forEach(row => {
        const val = row[k];
        if (val !== undefined && val !== null) {
          const strLen = String(val).length;
          if (strLen > maxLen) maxLen = strLen;
        }
      });
      return { wch: Math.min(Math.max(maxLen + 3, 10), 45) };
    });
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  XLSX.writeFile(workbook, filename);
}
