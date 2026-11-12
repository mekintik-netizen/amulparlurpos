/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Excel Stock / Product Import Modal
 * Allows shop owners to upload .xlsx, .xls, or .csv files,
 * preview parsed rows, review validation warnings, and bulk-save
 * directly into local IndexedDB and Cloud Firestore.
 */

import React, { useState, useRef } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  RefreshCw, 
  ArrowRight,
  ShieldCheck,
  PackagePlus,
  HelpCircle
} from 'lucide-react';
import { Product, Shop } from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';
import { getAmulProductPresetImage } from '../../storage/productImages.ts';
import { 
  parseProductsExcel, 
  downloadProductImportTemplate, 
  ExcelImportProductRow, 
  ExcelImportResult 
} from '../../utils/excelEngine.ts';

interface ExcelProductImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentShop: Shop;
  onImportComplete: (summary: { added: number; updated: number }) => void;
}

export const ExcelProductImportModal: React.FC<ExcelProductImportModalProps> = ({
  isOpen,
  onClose,
  currentShop,
  onImportComplete
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importResult, setImportResult] = useState<ExcelImportResult | null>(null);
  const [saveProgress, setSaveProgress] = useState<{ current: number; total: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setErrorMsg(null);
    setFile(selectedFile);
    setParsing(true);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const result = parseProductsExcel(buffer);

      if (result.validRows.length === 0) {
        setErrorMsg('No valid product rows were found in the uploaded file. Please verify column headers against the template.');
      }
      setImportResult(result);
    } catch (err: any) {
      console.error('Failed to parse Excel file:', err);
      setErrorMsg(err.message || 'Failed to read Excel file. Please ensure it is a valid .xlsx or .csv file.');
      setImportResult(null);
    } finally {
      setParsing(false);
    }
  };

  const handleCommitImport = async () => {
    if (!importResult || importResult.validRows.length === 0) return;

    setSaving(true);
    setErrorMsg(null);
    let addedCount = 0;
    let updatedCount = 0;

    try {
      // 1. Fetch existing products to determine whether to update or create new
      const existingProducts = await AppRepository.products.getByShop(currentShop.id);
      const barcodeMap = new Map<string, Product>();
      const nameMap = new Map<string, Product>();

      existingProducts.forEach(p => {
        if (p.barcode) barcodeMap.set(p.barcode.trim(), p);
        nameMap.set(p.name.trim().toLowerCase(), p);
      });

      const total = importResult.validRows.length;

      // 2. Process each valid row
      for (let i = 0; i < total; i++) {
        const row = importResult.validRows[i];
        setSaveProgress({ current: i + 1, total });

        // Match existing product by barcode (priority) or by exact product name
        let matchedProduct: Product | undefined;
        if (row.barcode && barcodeMap.has(row.barcode.trim())) {
          matchedProduct = barcodeMap.get(row.barcode.trim());
        } else if (nameMap.has(row.name.trim().toLowerCase())) {
          matchedProduct = nameMap.get(row.name.trim().toLowerCase());
        }

        if (matchedProduct) {
          // Update existing product with new prices & add/override stock
          const updated: Product = {
            ...matchedProduct,
            name: row.name,
            category: row.category,
            costPrice: row.costPrice,
            sellingPrice: row.sellingPrice,
            mrp: row.mrp,
            // If initial stock provided in Excel, set or adjust it
            currentStock: row.initialStock !== undefined ? row.initialStock : matchedProduct.currentStock,
            barcode: row.barcode || matchedProduct.barcode,
            sku: row.sku || matchedProduct.sku,
            unit: row.unit || matchedProduct.unit,
            minStockAlert: row.minStockAlert || matchedProduct.minStockAlert,
            updatedAt: new Date().toISOString()
          };
          await AppRepository.products.save(updated);
          updatedCount++;
        } else {
          // Create new product
          const newBarcode = row.barcode || `8901262${Math.floor(100000 + Math.random() * 900000)}`;
          const newSku = row.sku || `AMUL-${Math.floor(100 + Math.random() * 900)}`;
          const newProduct: Product = {
            id: `prod-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            shopId: currentShop.id,
            name: row.name,
            category: row.category,
            costPrice: row.costPrice,
            sellingPrice: row.sellingPrice,
            mrp: row.mrp,
            currentStock: row.initialStock || 0,
            barcode: newBarcode,
            sku: newSku,
            unit: row.unit || 'Pouch',
            minStockAlert: row.minStockAlert || 10,
            imageUrl: getAmulProductPresetImage(row.name, row.category),
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          await AppRepository.products.save(newProduct);
          // Update local matching maps so subsequent rows in same spreadsheet can recognize it
          barcodeMap.set(newBarcode, newProduct);
          nameMap.set(newProduct.name.trim().toLowerCase(), newProduct);
          addedCount++;
        }
      }

      onImportComplete({ added: addedCount, updated: updatedCount });
      onClose();
    } catch (err: any) {
      console.error('Failed to commit Excel import:', err);
      setErrorMsg(`Import failed: ${err.message}`);
    } finally {
      setSaving(false);
      setSaveProgress(null);
    }
  };

  const resetUpload = () => {
    setFile(null);
    setImportResult(null);
    setErrorMsg(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn select-none">
      <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Import Products from Excel</span>
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                  .xlsx / .csv
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
                Bulk add or update stock, cost prices, selling prices, and barcodes directly from your inventory spreadsheet.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={saving}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-neutral-800 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="py-4 space-y-4">
          {/* Template Download Recommendation */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 rounded-2xl p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <HelpCircle className="w-4 h-4 text-blue-600 shrink-0" />
              <div className="text-xs text-blue-900 dark:text-blue-200">
                <span className="font-bold">Need the correct column format?</span>
                <span className="text-blue-700 dark:text-blue-300 ml-1">
                  Columns: Product Name, Category, Cost Price, Selling Price, Initial Stock, Barcode, etc.
                </span>
              </div>
            </div>
            <button
              onClick={downloadProductImportTemplate}
              className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Template</span>
            </button>
          </div>

          {/* Upload Area */}
          {!importResult && (
            <div className="border-2 border-dashed border-slate-300 dark:border-neutral-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-3xl p-8 text-center transition bg-slate-50/50 dark:bg-neutral-800/20">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                disabled={parsing}
                className="hidden"
                id="excel-file-upload"
              />
              <label
                htmlFor="excel-file-upload"
                className="cursor-pointer flex flex-col items-center justify-center"
              >
                <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3 shadow-inner">
                  {parsing ? (
                    <RefreshCw className="w-6 h-6 animate-spin" />
                  ) : (
                    <Upload className="w-6 h-6" />
                  )}
                </div>
                <div className="text-sm font-bold text-slate-800 dark:text-neutral-200">
                  {parsing ? 'Reading and Validating Spreadsheet...' : 'Click to select Excel (.xlsx) or CSV file'}
                </div>
                <div className="text-xs text-slate-400 dark:text-neutral-500 mt-1">
                  Supports Microsoft Excel (.xlsx, .xls) and standard CSV files up to 10MB
                </div>
              </label>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Import Notice</p>
                <p className="mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Parsed Results Preview */}
          {importResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-slate-100 dark:bg-neutral-800/60 p-3 rounded-2xl text-xs">
                <div className="flex items-center gap-3">
                  <div className="font-bold text-slate-900 dark:text-white">
                    File: <span className="text-emerald-600">{file?.name}</span>
                  </div>
                  <span className="text-slate-400">•</span>
                  <div className="text-emerald-700 dark:text-emerald-400 font-semibold">
                    {importResult.validRows.length} valid items ready
                  </div>
                  {importResult.errors.length > 0 && (
                    <>
                      <span className="text-slate-400">•</span>
                      <div className="text-amber-600 dark:text-amber-400 font-semibold">
                        {importResult.errors.length} skipped
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={resetUpload}
                  disabled={saving}
                  className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white underline cursor-pointer"
                >
                  Choose another file
                </button>
              </div>

              {/* Table Preview (first 5 rows) */}
              <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-neutral-800 rounded-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 sticky top-0 font-bold border-b border-slate-200 dark:border-neutral-700">
                    <tr>
                      <th className="p-2.5">Product Name</th>
                      <th className="p-2.5">Category</th>
                      <th className="p-2.5 text-right">Cost Price</th>
                      <th className="p-2.5 text-right">Selling Price</th>
                      <th className="p-2.5 text-right">Stock</th>
                      <th className="p-2.5">Barcode</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-neutral-800 text-slate-700 dark:text-neutral-300">
                    {importResult.validRows.slice(0, 8).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-neutral-800/40">
                        <td className="p-2.5 font-medium text-slate-900 dark:text-white truncate max-w-[180px]">
                          {row.name}
                        </td>
                        <td className="p-2.5">
                          <span className="bg-slate-100 dark:bg-neutral-800 px-2 py-0.5 rounded text-[10px] font-semibold">
                            {row.category}
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-mono">₹{row.costPrice.toFixed(2)}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-emerald-600">₹{row.sellingPrice.toFixed(2)}</td>
                        <td className="p-2.5 text-right font-mono">{row.initialStock}</td>
                        <td className="p-2.5 font-mono text-[11px] text-slate-500">{row.barcode || 'Auto'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {importResult.validRows.length > 8 && (
                <div className="text-center text-[11px] text-slate-400">
                  + {importResult.validRows.length - 8} more items will be imported
                </div>
              )}

              {/* Progress bar when saving */}
              {saveProgress && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-neutral-300">
                    <span>Importing & Syncing to Cloud...</span>
                    <span>{saveProgress.current} / {saveProgress.total}</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-neutral-800 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-emerald-600 h-full transition-all duration-150"
                      style={{ width: `${Math.round((saveProgress.current / saveProgress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-neutral-800">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
          >
            Cancel
          </button>

          {importResult && (
            <button
              onClick={handleCommitImport}
              disabled={saving || importResult.validRows.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing Items...</span>
                </>
              ) : (
                <>
                  <PackagePlus className="w-4 h-4" />
                  <span>Confirm & Import {importResult.validRows.length} Products</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
