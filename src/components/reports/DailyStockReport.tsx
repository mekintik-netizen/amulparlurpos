/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Daily Stock Reports Component
 * Calculates Opening, Stock In, Sales, Stock Out, Closing Stock,
 * alerts on low stock thresholds, and provides CSV export.
 */

import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Download, 
  AlertTriangle, 
  TrendingDown, 
  TrendingUp, 
  Package, 
  RefreshCw,
  Search,
  Edit3,
  CheckCircle2,
  DollarSign,
  X,
  Printer,
  FileSpreadsheet
} from 'lucide-react';
import { DailyStockReportRow, Product, Shop, StockMovement } from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';
import { exportDataToExcel } from '../../utils/excelEngine.ts';
import { BrandedReportHeader } from '../common/BrandedReportHeader.tsx';
import {
  buildDynamicPdfFilename,
  downloadShopTablePdf,
  getShopFileSlug,
  getShopPdfIdentity,
  PDF_FOOTER_BRAND_CREDIT,
  printWithDynamicTitle
} from '../../utils/shopPdfBranding.ts';

interface DailyStockReportProps {
  currentShop: Shop;
}

export const DailyStockReport: React.FC<DailyStockReportProps> = ({ currentShop }) => {
  const [targetDate, setTargetDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [rows, setRows] = useState<DailyStockReportRow[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [includeZeroStock, setIncludeZeroStock] = useState(false);
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'LOGS'>('SUMMARY');

  // Stock & Price Edit Modal State
  const [editingStockRow, setEditingStockRow] = useState<DailyStockReportRow | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [newStockQty, setNewStockQty] = useState<number>(0);
  const [newCostPrice, setNewCostPrice] = useState<number>(0);
  const [newSellingPrice, setNewSellingPrice] = useState<number>(0);
  const [newMrp, setNewMrp] = useState<number>(0);
  const [adjustmentReason, setAdjustmentReason] = useState<string>('Physical count reconciliation');
  const [isSavingAdjustment, setIsSavingAdjustment] = useState<boolean>(false);

  const hasLoadedOnceRef = React.useRef(false);

  const loadReport = async (opts?: { silent?: boolean }) => {
    const shouldShowSpinner = !opts?.silent && !hasLoadedOnceRef.current;
    try {
      if (shouldShowSpinner) setLoading(true);
      const [reportRows, movementLogs, productList] = await Promise.all([
        AppRepository.reports.getDailyStock(currentShop.id, targetDate),
        AppRepository.inventory.getMovements(
          currentShop.id,
          `${targetDate}T00:00:00.000Z`,
          `${targetDate}T23:59:59.999Z`
        ),
        AppRepository.products.getByShop(currentShop.id)
      ]);
      setRows(reportRows);
      setMovements(movementLogs);
      setProducts(productList);
      hasLoadedOnceRef.current = true;
    } catch (err) {
      console.error('Failed to load stock report:', err);
    } finally {
      if (shouldShowSpinner) setLoading(false);
    }
  };

  const handleOpenStockEdit = (row: DailyStockReportRow) => {
    const prod = products.find(p => p.id === row.productId);
    setEditingStockRow(row);
    setEditingProduct(prod || null);
    setNewStockQty(row.closingStock);
    setNewCostPrice(prod ? prod.costPrice : 0);
    setNewSellingPrice(prod ? prod.sellingPrice : 0);
    setNewMrp(prod ? prod.mrp : 0);
    setAdjustmentReason('Physical count reconciliation');
  };

  const handleSaveStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStockRow) return;

    try {
      setIsSavingAdjustment(true);
      await AppRepository.inventory.adjustStockAndPrices(
        currentShop.id,
        editingStockRow.productId,
        newStockQty,
        newCostPrice,
        newSellingPrice,
        newMrp,
        adjustmentReason.trim() || 'Physical inventory count adjustment'
      );
      setEditingStockRow(null);
      setEditingProduct(null);
      await loadReport();
    } catch (err: any) {
      alert(`Failed to adjust stock and prices: ${err.message}`);
    } finally {
      setIsSavingAdjustment(false);
    }
  };

  useEffect(() => {
    hasLoadedOnceRef.current = false;
    loadReport();
    const handleCloudSynced = () => {
      loadReport({ silent: true });
    };
    window.addEventListener('parlourpro-cloud-synced', handleCloudSynced);
    return () => {
      window.removeEventListener('parlourpro-cloud-synced', handleCloudSynced);
    };
  }, [currentShop.id, targetDate]);

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Product Name',
      'Barcode',
      'Category',
      'Unit',
      'Opening Stock',
      'Stock Received (In)',
      'Sales Quantity',
      'Stock Out / Adj',
      'Closing Stock',
      'Min Alert Level',
      'Status'
    ];

    const rowsToExport = includeZeroStock ? rows : rows.filter(r => r.closingStock > 0);
    const csvData = rowsToExport.map((r) => [
      `"${r.productName.replace(/"/g, '""')}"`,
      r.barcode,
      r.category,
      r.unit,
      r.openingStock,
      r.stockIn,
      r.salesQty,
      r.stockOut,
      r.closingStock,
      r.minStockAlert,
      r.isLowStock ? 'LOW STOCK ALERT' : 'Normal'
    ]);

    const content = [headers.join(','), ...csvData.map((e) => e.join(','))].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `${getShopFileSlug(currentShop)}_Stock_Report_${targetDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Excel (.xlsx)
  const handleExportExcel = () => {
    const rowsToExport = includeZeroStock ? rows : rows.filter(r => r.closingStock > 0);
    const excelData = rowsToExport.map((r) => ({
      'Product Name': r.productName,
      'Barcode': r.barcode,
      'Category': r.category,
      'Unit': r.unit,
      'Opening Stock': r.openingStock,
      'Stock Received (In)': r.stockIn,
      'Sales Quantity': r.salesQty,
      'Stock Out / Adjustment': r.stockOut,
      'Closing Stock': r.closingStock,
      'Min Alert Level': r.minStockAlert,
      'Stock Status': r.isLowStock ? 'LOW STOCK ALERT' : 'Normal'
    }));

    exportDataToExcel({
      filename: `${getShopFileSlug(currentShop)}_Stock_Report_${targetDate}.xlsx`,
      sheetName: 'Stock Audit Report',
      data: excelData
    });
  };

  // Filtered rows: by default excludes all items with 0 stock (quantity >= 1 only)
  const filteredRows = rows.filter((r) => {
    const matchesSearch =
      searchTerm === '' ||
      r.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.barcode.includes(searchTerm) ||
      r.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLowStock = !showLowStockOnly || r.isLowStock;
    const matchesActiveStock = includeZeroStock || r.closingStock > 0;
    return matchesSearch && matchesLowStock && matchesActiveStock;
  });

  const totalOpening = rows.reduce((acc, r) => acc + r.openingStock, 0);
  const totalIn = rows.reduce((acc, r) => acc + r.stockIn, 0);
  const totalSales = rows.reduce((acc, r) => acc + r.salesQty, 0);
  const totalOut = rows.reduce((acc, r) => acc + r.stockOut, 0);
  const totalClosing = rows.reduce((acc, r) => acc + r.closingStock, 0);
  const lowStockCount = rows.filter((r) => r.isLowStock).length;

  const handleDownloadPdf = () => {
    const exportRows = includeZeroStock ? filteredRows : filteredRows.filter((r) => r.closingStock > 0);
    downloadShopTablePdf({
      shop: currentShop,
      documentTitle: 'Daily Inventory & Physical Stock Audit Report',
      documentSubtitle: `Date: ${targetDate}`,
      metaRightLines: [
        `Ref: RPT-STK-${targetDate.replace(/-/g, '')}`,
        `Generated: ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`
      ],
      kpis: [
        { label: 'Opening', value: `${totalOpening}` },
        { label: 'Stock In', value: `+${totalIn}` },
        { label: 'Sold', value: `-${totalSales}` },
        { label: 'Stock Out', value: `-${totalOut}` },
        { label: 'Closing', value: `${totalClosing}` }
      ],
      columns: [
        { label: 'Product Name', width: 42 },
        { label: 'Category', width: 22 },
        { label: 'Opening', width: 14, align: 'right' },
        { label: 'In', width: 12, align: 'right' },
        { label: 'Sold', width: 12, align: 'right' },
        { label: 'Out', width: 12, align: 'right' },
        { label: 'Closing', width: 18, align: 'right' },
        { label: 'Status', width: 14, align: 'center' }
      ],
      rows: exportRows.map((r) => [
        r.productName,
        r.category,
        `${r.openingStock}`,
        r.stockIn > 0 ? `+${r.stockIn}` : '-',
        r.salesQty > 0 ? `-${r.salesQty}` : '-',
        r.stockOut > 0 ? `-${r.stockOut}` : '-',
        `${r.closingStock} ${r.unit}`,
        r.isLowStock ? 'LOW' : 'OK'
      ]),
      emptyMessage: `No stock items matching filter on ${targetDate}.`,
      filename: buildDynamicPdfFilename({ kind: 'STOCK_AUDIT', date: targetDate })
    });
  };

  const handlePrintStockReport = () => {
    printWithDynamicTitle(buildDynamicPdfFilename({ kind: 'STOCK_AUDIT', date: targetDate }));
  };

  const shopIdentity = getShopPdfIdentity(currentShop);

  return (
    <div id="unified-print-area" className="space-y-6 a4-print-container">
      {/* Unified Print-Only CA-Grade Two-Column Shop Header (Page 1 Top Only) */}
      <div className="hidden print:block">
        <BrandedReportHeader
          currentShop={currentShop}
          reportTitle="Daily Inventory & Physical Stock Audit Report"
          reportDate={targetDate}
          referenceCode={`RPT-STK-${targetDate.replace(/-/g, '')}`}
        />
      </div>

      {/* Top Controls & KPI Summary */}
      <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/80 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="no-print flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-start gap-3.5">
            {shopIdentity.logoUrl && (
              <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-2xs shrink-0">
                <img
                  src={shopIdentity.logoUrl}
                  alt={shopIdentity.displayName}
                  className="h-11 w-11 sm:h-12 sm:w-12 rounded-lg object-contain"
                  loading="eager"
                />
              </div>
            )}
            <div>
              <div className="text-base sm:text-lg font-black uppercase tracking-wide text-slate-900">
                {shopIdentity.displayName}
              </div>
              <h2 className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5 mt-0.5">
                <Package className="w-4 h-4 text-blue-600" />
                <span>Daily Inventory &amp; Stock Audit Report · {targetDate}</span>
              </h2>
              <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                {shopIdentity.addressLine && <span>{shopIdentity.addressLine}</span>}
                {shopIdentity.phoneLine && <span className="font-mono">Mob: {shopIdentity.phoneLine}</span>}
                {shopIdentity.gstNumber && <span className="font-mono">GSTIN: {shopIdentity.gstNumber}</span>}
                {shopIdentity.fssaiNumber && <span className="font-mono">FSSAI: {shopIdentity.fssaiNumber}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5">
              <Calendar className="w-4 h-4 text-slate-500" />
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-hidden"
              />
            </div>

            <button
              onClick={handleDownloadPdf}
              className="bg-[#005A9C] hover:bg-blue-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Download Stock Audit Report directly as clean PDF"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </button>

            <button
              onClick={handlePrintStockReport}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Print Stock Report"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Export Stock Report to Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export to Excel</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Export CSV"
            >
              <Download className="w-4 h-4" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        {/* KPI Cards (Non-Overlapping 5-Column Grid in Print) */}
        <div className="unified-kpi-grid-5 grid grid-cols-2 md:grid-cols-5 gap-3 pt-4 print:pt-0">
          <div className="unified-kpi-card bg-slate-50 rounded-xl p-3 border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500 uppercase">Opening Stock</div>
            <div className="text-lg font-black font-mono text-slate-800 mt-0.5">{totalOpening}</div>
            <div className="text-[10px] text-slate-400 print:hidden">Total units at start of day</div>
          </div>

          <div className="unified-kpi-card bg-emerald-50/60 rounded-xl p-3 border border-emerald-200">
            <div className="text-[11px] font-semibold text-emerald-700 uppercase flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 no-print" /> Stock In
            </div>
            <div className="text-lg font-black font-mono text-emerald-800 mt-0.5">+{totalIn}</div>
            <div className="text-[10px] text-emerald-600 print:hidden">Supply deliveries</div>
          </div>

          <div className="unified-kpi-card bg-blue-50/60 rounded-xl p-3 border border-blue-200">
            <div className="text-[11px] font-semibold text-blue-700 uppercase flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 no-print" /> Sold (Sales)
            </div>
            <div className="text-lg font-black font-mono text-blue-800 mt-0.5">-{totalSales}</div>
            <div className="text-[10px] text-blue-600 print:hidden">Billed through POS</div>
          </div>

          <div className="unified-kpi-card bg-rose-50/60 rounded-xl p-3 border border-rose-200">
            <div className="text-[11px] font-semibold text-rose-700 uppercase">Stock Out / Leakage</div>
            <div className="text-lg font-black font-mono text-rose-800 mt-0.5">-{totalOut}</div>
            <div className="text-[10px] text-rose-600 print:hidden">Damage &amp; adjustments</div>
          </div>

          <div className="unified-kpi-card bg-indigo-50/60 rounded-xl p-3 border border-indigo-200">
            <div className="text-[11px] font-semibold text-indigo-700 uppercase">Closing Stock</div>
            <div className="text-lg font-black font-mono text-indigo-900 mt-0.5">{totalClosing}</div>
            <div className="text-[10px] text-indigo-600 print:hidden">Current closing balance</div>
          </div>
        </div>

        {/* Low Stock Warning Banner if any (Screen-only) */}
        {lowStockCount > 0 && (
          <div className="no-print mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>
                <strong>{lowStockCount} products</strong> have reached or fallen below their minimum stock reorder threshold.
              </span>
            </div>
            <button
              onClick={() => setShowLowStockOnly(!showLowStockOnly)}
              className="text-amber-900 font-bold underline hover:text-amber-950"
            >
              {showLowStockOnly ? 'Show All Products' : 'Filter Low Stock Only'}
            </button>
          </div>
        )}
      </div>

      {/* Tabs & Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-5 print:p-0 print:border-0 print:shadow-none print:rounded-none">
        <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('SUMMARY')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'SUMMARY'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Product Stock Summary ({filteredRows.length})
            </button>
            <button
              onClick={() => setActiveTab('LOGS')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'LOGS'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Movement Logs ({movements.length})
            </button>

            {activeTab === 'SUMMARY' && (
              <button
                onClick={() => setIncludeZeroStock(prev => !prev)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  !includeZeroStock
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                title="Only items with available stock >= 1 are printed and displayed by default"
              >
                <span>{!includeZeroStock ? '✓ સક્રિય સ્ટોક (>0 Stock)' : 'બધા આઇટમ્સ (0 Stock સહિત)'}</span>
              </button>
            )}
          </div>

          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter by product name, barcode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>
        </div>

        {activeTab === 'SUMMARY' ? (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="unified-report-table w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-y border-slate-200">
                <tr>
                  <th className="py-3 px-3">Product Name &amp; Code</th>
                  <th className="py-3 px-2 print-nowrap">Category</th>
                  <th className="py-3 px-2 text-right print-nowrap">Opening</th>
                  <th className="py-3 px-2 text-right text-emerald-700 print-nowrap">Stock In</th>
                  <th className="py-3 px-2 text-right text-blue-700 print-nowrap">Sales Qty</th>
                  <th className="py-3 px-2 text-right text-rose-700 print-nowrap">Stock Out</th>
                  <th className="py-3 px-3 text-right font-black print-nowrap">Closing Stock</th>
                  <th className="py-3 px-2 text-center print-nowrap">Status</th>
                  <th className="py-3 px-3 text-right no-print">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-slate-400 font-sans">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Calculating daily stock balances...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-slate-400 font-sans">
                      No products match your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <tr key={r.productId} className={`hover:bg-slate-50/80 transition ${r.closingStock <= 0 ? 'print:hidden' : ''}`}>
                      <td className="py-2.5 px-3 font-sans">
                        <div className="font-bold text-slate-900">{r.productName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{r.barcode}</div>
                      </td>
                      <td className="py-2.5 px-2 font-sans print-nowrap">
                        <span className="bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded font-medium print:bg-transparent print:p-0">
                          {r.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-700 print-nowrap">{r.openingStock} {r.unit}</td>
                      <td className="py-2.5 px-2 text-right text-emerald-700 font-bold print-nowrap">
                        {r.stockIn > 0 ? `+${r.stockIn}` : '-'}
                      </td>
                      <td className="py-2.5 px-2 text-right text-blue-700 font-bold print-nowrap">
                        {r.salesQty > 0 ? `-${r.salesQty}` : '-'}
                      </td>
                      <td className="py-2.5 px-2 text-right text-rose-700 font-bold print-nowrap">
                        {r.stockOut > 0 ? `-${r.stockOut}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-slate-900 text-sm print-nowrap">
                        {r.closingStock} <span className="text-[10px] font-semibold text-slate-600">{r.unit}</span>
                      </td>
                      <td className="py-2.5 px-2 text-center font-sans print-nowrap">
                        {r.isLowStock ? (
                          <span className="print-badge-low bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 no-print" />
                            <span>LOW</span>
                          </span>
                        ) : (
                          <span className="print-badge-ok bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            OK
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-sans no-print">
                        <button
                          onClick={() => handleOpenStockEdit(r)}
                          className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer"
                          title="Edit stock count quantity and product price"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit Stock & Price</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-y border-slate-200">
                <tr>
                  <th className="py-3 px-3">Time</th>
                  <th className="py-3 px-3">Product Name</th>
                  <th className="py-3 px-2">Type</th>
                  <th className="py-3 px-2 text-right">Qty</th>
                  <th className="py-3 px-3">Reason / Reference</th>
                  <th className="py-3 px-3">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      No stock movements recorded for {targetDate}.
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                        {new Date(m.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-800">{m.productName}</td>
                      <td className="py-2 px-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            m.movementType === 'IN' || m.movementType === 'SALE_RETURN'
                              ? 'bg-emerald-100 text-emerald-700'
                              : m.movementType === 'SALE'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {m.movementType}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-slate-900">
                        {m.quantity}
                      </td>
                      <td className="py-2 px-3 text-slate-600 text-[11px]">
                        {m.reason} {m.referenceNumber ? `(${m.referenceNumber})` : ''}
                      </td>
                      <td className="py-2 px-3 text-slate-500 text-[11px]">{m.createdBy}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Direct Stock & Price Edit Modal */}
      {editingStockRow && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-600" />
                  Edit Stock Quantity & Price
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingStockRow.productName} ({editingStockRow.category} · {editingStockRow.unit})
                </p>
              </div>
              <button
                onClick={() => setEditingStockRow(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStockAdjustment} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Physical Stock Count / Quantity ({editingStockRow.unit})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={newStockQty}
                    onChange={(e) => setNewStockQty(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="text-[10px] text-slate-500 mt-1 flex justify-between">
                    <span>Previous recorded: {editingStockRow.closingStock}</span>
                    <span className={newStockQty - editingStockRow.closingStock >= 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                      Difference: {newStockQty - editingStockRow.closingStock >= 0 ? `+${newStockQty - editingStockRow.closingStock}` : newStockQty - editingStockRow.closingStock}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cost Price (₹)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={newCostPrice}
                    onChange={(e) => setNewCostPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[9px] text-slate-400">Wholesale cost</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Selling Price / MRP (₹)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={newSellingPrice}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setNewSellingPrice(val);
                      if (newMrp < val) setNewMrp(val);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[9px] text-slate-400">Retail counter rate</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reason for Stock / Price Adjustment
                </label>
                <select
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Physical count reconciliation">Physical count reconciliation / Audit</option>
                  <option value="Unrecorded delivery batch">Unrecorded delivery batch arrival</option>
                  <option value="Damaged or expired pouch write-off">Damaged or expired pouch write-off</option>
                  <option value="Rate revision by Distributor / Company">Rate revision by Distributor / Company</option>
                  <option value="Manual stock correction">Manual stock count correction</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingStockRow(null)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingAdjustment}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md transition cursor-pointer flex items-center gap-1.5"
                >
                  {isSavingAdjustment ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Save Stock & Price</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print-Only Commercial Signatory & Subtle Text-Only Footer Attribution (No Logo Image) */}
      <div className="unified-print-footer hidden print:block mt-8 pt-6 border-t border-slate-300 text-xs text-slate-700">
        <div className="flex items-end justify-between">
          <div className="w-44 text-center border-t border-dashed border-slate-500 pt-1.5 font-bold">
            Prepared By
          </div>
          <div className="w-48 text-center border-t border-dashed border-slate-500 pt-1.5 font-bold">
            Authorized Signatory
            <div className="text-[10px] font-normal text-slate-500">
              For {shopIdentity.displayName}
            </div>
          </div>
        </div>
        <div className="mt-4 pt-2 border-t border-slate-200 flex items-center justify-between text-[9px] text-slate-400">
          <span>Stock Audit Report — {shopIdentity.displayName}</span>
          <span>{PDF_FOOTER_BRAND_CREDIT}</span>
        </div>
      </div>
    </div>
  );
};
