/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Comprehensive Reports Hub Component
 * Unified center for all Amul Parlour business reports:
 * 1. Daily Sales & Tax Report
 * 2. Daily Stock Inventory & Physical Audit Report
 * 3. Profit & Loss Statement (Revenue, COGS, Net Margin)
 * 4. Distributor Supply & Purchases Ledger
 * 5. Operating Expenses Statement
 * 
 * Features:
 * - Branded Report Header with official Amul logo, shop credentials & live timestamp
 * - Single-click "Download PDF / Print" with print-perfect A4 styling
 * - CSV Spreadsheet export fallback
 * - Real-time calculations from IndexedDB repositories
 */

import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Printer, 
  Download, 
  Calendar, 
  DollarSign, 
  Package, 
  Receipt, 
  Truck, 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw,
  CheckCircle2,
  FileSpreadsheet
} from 'lucide-react';
import { 
  Shop, 
  SaleBill, 
  DailyStockReportRow, 
  PurchaseBill, 
  Expense, 
  DailyFinancialSummary,
  Product 
} from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';
import { BrandedReportHeader } from '../common/BrandedReportHeader.tsx';
import { SalesProfitAnalytics } from './SalesProfitAnalytics.tsx';

interface ReportsHubProps {
  currentShop: Shop | null;
}

type ReportType = 'ANALYTICS' | 'SALES' | 'STOCK' | 'PNL' | 'PURCHASES' | 'EXPENSES';

export const ReportsHub: React.FC<ReportsHubProps> = ({ currentShop }) => {
  const [selectedReport, setSelectedReport] = useState<ReportType>('ANALYTICS');
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);

  // Loaded Data
  const [sales, setSales] = useState<SaleBill[]>([]);
  const [stockRows, setStockRows] = useState<DailyStockReportRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseBill[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [financialSummary, setFinancialSummary] = useState<DailyFinancialSummary | null>(null);

  const loadReportData = async () => {
    if (!currentShop) return;
    try {
      setLoading(true);
      const [salesData, stockData, purData, expData, finData] = await Promise.all([
        AppRepository.sales.getByShop(currentShop.id, selectedDate),
        AppRepository.reports.getDailyStock(currentShop.id, selectedDate),
        AppRepository.purchases.getByShop(currentShop.id, selectedDate),
        AppRepository.expenses.getByShop(currentShop.id, selectedDate),
        AppRepository.reports.getDailyFinancials(currentShop.id, selectedDate)
      ]);

      setSales(salesData);
      setStockRows(stockData);
      setPurchases(purData);
      setExpenses(expData);
      setFinancialSummary(finData);
    } catch (err) {
      console.error('Failed to load reports hub data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReportData();
  }, [currentShop?.id, selectedDate]);

  // Trigger Print-to-PDF
  const handlePrintOrDownloadPDF = () => {
    window.print();
  };

  // CSV Export Handler
  const handleExportCSV = () => {
    if (!currentShop) return;
    let headers: string[] = [];
    let rowsData: (string | number)[][] = [];
    let filename = `Amul_${selectedReport}_Report_${currentShop.shopCode}_${selectedDate}.csv`;

    if (selectedReport === 'SALES') {
      headers = ['Bill Number', 'Time', 'Customer', 'Items Count', 'Payment Mode', 'Status', 'Total (₹)'];
      rowsData = sales.map(s => [
        s.billNumber,
        new Date(s.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        s.customerName || 'Walk-in Customer',
        s.itemCount,
        s.paymentMode,
        s.status,
        s.finalAmount
      ]);
    } else if (selectedReport === 'STOCK') {
      headers = ['Product Name', 'Barcode', 'Category', 'Opening', 'Stock In', 'Sales Qty', 'Stock Out', 'Closing Stock', 'Status'];
      rowsData = stockRows.map(r => [
        `"${r.productName.replace(/"/g, '""')}"`,
        r.barcode,
        r.category,
        r.openingStock,
        r.stockIn,
        r.salesQty,
        r.stockOut,
        r.closingStock,
        r.isLowStock ? 'LOW STOCK' : 'Normal'
      ]);
    } else if (selectedReport === 'PURCHASES') {
      headers = ['Invoice Number', 'Distributor', 'Date', 'Items Count', 'Payment Mode', 'Status', 'Total Amount', 'Due Amount'];
      rowsData = purchases.map(p => [
        p.purchaseInvoiceNumber,
        `"${p.supplierName.replace(/"/g, '""')}"`,
        p.purchaseDate,
        p.itemCount,
        p.paymentMode,
        p.status,
        p.totalAmount,
        p.dueAmount
      ]);
    } else if (selectedReport === 'EXPENSES') {
      headers = ['Expense Category', 'Notes & Remarks', 'Payment Mode', 'Created By', 'Amount (₹)'];
      rowsData = expenses.map(e => [
        `"${e.category.replace(/"/g, '""')}"`,
        `"${(e.notes || '-').replace(/"/g, '""')}"`,
        e.paymentMode,
        e.createdBy,
        e.amount
      ]);
    } else if (selectedReport === 'PNL' && financialSummary) {
      headers = ['Financial Metric', 'Amount (₹)'];
      rowsData = [
        ['Total Sales Revenue', financialSummary.salesRevenue],
        ['Cost of Goods Sold (COGS)', financialSummary.costOfGoodsSold],
        ['Gross Margin Profit', financialSummary.grossProfit],
        ['Operating Expenses', financialSummary.expensesTotal],
        ['Net Operating Profit', financialSummary.netOperatingProfit]
      ];
    }

    const content = [headers.join(','), ...rowsData.map(e => e.join(','))].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Titles mapping
  const reportTitles: Record<ReportType, { title: string; subtitle: string; ref: string }> = {
    ANALYTICS: {
      title: 'Sales & Profit Analytics Dashboard',
      subtitle: 'Comparative sales growth, item margin breakdown, and 30-day profit trend analytics.',
      ref: `RPT-ANL-${selectedDate.replace(/-/g, '')}`
    },
    SALES: {
      title: 'Daily Sales & Cash Register Report',
      subtitle: 'Complete breakdown of counter POS sales, tax reconciliations, and tender modes.',
      ref: `RPT-SLS-${selectedDate.replace(/-/g, '')}`
    },
    STOCK: {
      title: 'Daily Inventory & Physical Stock Audit Report',
      subtitle: 'Accurate reconciliation of opening stock, fresh milk crate supply, customer sales, and closing stock.',
      ref: `RPT-STK-${selectedDate.replace(/-/g, '')}`
    },
    PNL: {
      title: 'Daily Profit & Loss (P&L) Statement',
      subtitle: 'Audit distinguishing gross revenue from true net profit after COGS and operational expenses.',
      ref: `RPT-PNL-${selectedDate.replace(/-/g, '')}`
    },
    PURCHASES: {
      title: 'Distributor Supply & Purchase Invoices Ledger',
      subtitle: 'Deliveries received from GCMMF Anand depot, payment settlements, and outstanding balances.',
      ref: `RPT-PUR-${selectedDate.replace(/-/g, '')}`
    },
    EXPENSES: {
      title: 'Operating Expenses & Cash Outflow Register',
      subtitle: 'Itemized operational overheads, cold storage electricity, transport, and maintenance costs.',
      ref: `RPT-EXP-${selectedDate.replace(/-/g, '')}`
    }
  };

  const activeMeta = reportTitles[selectedReport];

  return (
    <div className="space-y-6">
      {/* Top Controls Strip (Hidden in Print) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-xs border border-slate-200 dark:border-slate-800 no-print transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <div className="bg-[#E31837] text-white p-2 rounded-xl shadow-xs">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Reports Hub & PDF Export Center</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                    Audit Certified
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Generate, print, and download official Amul parlour audit reports with authorized brand headers and timestamps.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons: PDF Download & Print */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5">
              <Calendar className="w-4 h-4 text-slate-500" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-hidden"
              />
            </div>

            <button
              onClick={handleExportCSV}
              className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Export as CSV spreadsheet"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>CSV</span>
            </button>

            <button
              onClick={handlePrintOrDownloadPDF}
              className="bg-[#005A9C] hover:bg-blue-800 text-white text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Download or Print PDF with official Amul header and timestamp"
            >
              <Download className="w-4 h-4 text-amber-300" />
              <span>Download PDF / Print</span>
            </button>
          </div>
        </div>

        {/* Report Selector Pills */}
        <div className="flex items-center gap-2 pt-4 overflow-x-auto scrollbar-none">
          {(
            [
              { key: 'ANALYTICS', label: '📊 Sales & Profit Analytics', icon: TrendingUp },
              { key: 'SALES', label: '1. Daily Sales Report', icon: Receipt },
              { key: 'STOCK', label: '2. Stock Audit Report', icon: Package },
              { key: 'PNL', label: '3. P&L Financials', icon: DollarSign },
              { key: 'PURCHASES', label: '4. Purchases Ledger', icon: Truck },
              { key: 'EXPENSES', label: '5. Operating Expenses', icon: Wallet }
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const isSelected = selectedReport === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setSelectedReport(item.key)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'bg-[#E31837] text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Render Selected View */}
      {selectedReport === 'ANALYTICS' ? (
        <SalesProfitAnalytics currentShop={currentShop} />
      ) : (
        /* Printable Report Document (Rendered for both Screen and PDF Print) */
        <div id="printable-report" className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-800 p-6 print:p-0 print:border-none print:shadow-none transition-colors">
          {/* Standard Branded Header */}
          <BrandedReportHeader
            currentShop={currentShop}
            reportTitle={activeMeta.title}
            reportSubtitle={activeMeta.subtitle}
            reportDate={selectedDate}
            referenceCode={activeMeta.ref}
          />

          {loading ? (
            <div className="py-16 text-center text-slate-400 font-sans">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
              Loading report data for {selectedDate}...
            </div>
          ) : (
            <div>
              {/* 1. SALES REPORT VIEW */}
            {selectedReport === 'SALES' && (
              <div className="space-y-4">
                {/* Sales Summary KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="text-[10px] font-bold uppercase text-slate-500">Total Billed Volume</div>
                    <div className="text-base font-black font-mono text-slate-900 dark:text-white mt-0.5">
                      ₹{sales.filter(s => s.status === 'COMPLETED').reduce((sum, s) => sum + s.finalAmount, 0).toFixed(2)}
                    </div>
                    <div className="text-[9px] text-slate-400">Net counter receipts</div>
                  </div>

                  <div className="bg-emerald-50/70 dark:bg-emerald-950/40 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800">
                    <div className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">Completed Bills</div>
                    <div className="text-base font-black font-mono text-emerald-800 dark:text-emerald-200 mt-0.5">
                      {sales.filter(s => s.status === 'COMPLETED').length} Transactions
                    </div>
                    <div className="text-[9px] text-emerald-600">Successfully finalized</div>
                  </div>

                  <div className="bg-blue-50/70 dark:bg-blue-950/40 p-3 rounded-xl border border-blue-200 dark:border-blue-800">
                    <div className="text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300">Units Dispatched</div>
                    <div className="text-base font-black font-mono text-blue-800 dark:text-blue-200 mt-0.5">
                      {sales.filter(s => s.status === 'COMPLETED').reduce((sum, s) => sum + s.itemCount, 0)} Items
                    </div>
                    <div className="text-[9px] text-blue-600">Dairy pouches & packs</div>
                  </div>

                  <div className="bg-amber-50/70 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
                    <div className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">Total GST Included</div>
                    <div className="text-base font-black font-mono text-amber-800 dark:text-amber-200 mt-0.5">
                      ₹{sales.filter(s => s.status === 'COMPLETED').reduce((sum, s) => sum + (s.taxAmount || 0), 0).toFixed(2)}
                    </div>
                    <div className="text-[9px] text-amber-600">CGST + SGST collected</div>
                  </div>
                </div>

                {/* Sales Table */}
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3">Bill Number & Time</th>
                        <th className="py-2.5 px-3">Customer</th>
                        <th className="py-2.5 px-2 text-center">Items</th>
                        <th className="py-2.5 px-2">Payment Mode</th>
                        <th className="py-2.5 px-2 text-center">Status</th>
                        <th className="py-2.5 px-3 text-right">Payable (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {sales.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-8 text-slate-400 font-sans">
                            No sales recorded on {selectedDate}.
                          </td>
                        </tr>
                      ) : (
                        sales.map(s => (
                          <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-900 dark:text-white">{s.billNumber}</div>
                              <div className="text-[10px] text-slate-400 font-sans">
                                {new Date(s.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-sans text-slate-700 dark:text-slate-300">
                              {s.customerName || 'Walk-in Customer'}
                            </td>
                            <td className="py-2.5 px-2 text-center text-slate-700 dark:text-slate-300">
                              {s.itemCount}
                            </td>
                            <td className="py-2.5 px-2">
                              <span className="font-sans text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                {s.paymentMode}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-center font-sans">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                s.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {s.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-black text-slate-900 dark:text-white">
                              ₹{s.finalAmount.toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 2. STOCK AUDIT REPORT VIEW */}
            {selectedReport === 'STOCK' && (
              <div className="space-y-4">
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3">Product Name & Barcode</th>
                        <th className="py-2.5 px-2">Category</th>
                        <th className="py-2.5 px-2 text-right">Opening</th>
                        <th className="py-2.5 px-2 text-right text-emerald-700 dark:text-emerald-400">Stock In</th>
                        <th className="py-2.5 px-2 text-right text-blue-700 dark:text-blue-400">Sales Qty</th>
                        <th className="py-2.5 px-2 text-right text-rose-700 dark:text-rose-400">Stock Out</th>
                        <th className="py-2.5 px-3 text-right font-black">Closing Stock</th>
                        <th className="py-2.5 px-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {stockRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-8 text-slate-400 font-sans">
                            No inventory items found.
                          </td>
                        </tr>
                      ) : (
                        stockRows.map(r => (
                          <tr key={r.productId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="py-2.5 px-3 font-sans">
                              <div className="font-bold text-slate-900 dark:text-white">{r.productName}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{r.barcode}</div>
                            </td>
                            <td className="py-2.5 px-2 font-sans text-slate-600 dark:text-slate-400 text-[11px]">
                              {r.category}
                            </td>
                            <td className="py-2.5 px-2 text-right">{r.openingStock} {r.unit}</td>
                            <td className="py-2.5 px-2 text-right text-emerald-700 dark:text-emerald-400 font-bold">
                              {r.stockIn > 0 ? `+${r.stockIn}` : '-'}
                            </td>
                            <td className="py-2.5 px-2 text-right text-blue-700 dark:text-blue-400 font-bold">
                              {r.salesQty > 0 ? `-${r.salesQty}` : '-'}
                            </td>
                            <td className="py-2.5 px-2 text-right text-rose-700 dark:text-rose-400 font-bold">
                              {r.stockOut > 0 ? `-${r.stockOut}` : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-black text-slate-900 dark:text-white">
                              {r.closingStock} <span className="text-[10px] text-slate-400 font-normal">{r.unit}</span>
                            </td>
                            <td className="py-2.5 px-2 text-center font-sans">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                r.isLowStock ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'
                              }`}>
                                {r.isLowStock ? 'LOW' : 'OK'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 3. PROFIT & LOSS REPORT VIEW */}
            {selectedReport === 'PNL' && financialSummary && (
              <div className="space-y-4 font-sans">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50/60 dark:bg-blue-950/40 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
                    <div className="text-xs font-bold uppercase text-blue-800 dark:text-blue-300">Total Sales Revenue</div>
                    <div className="text-2xl font-black font-mono text-blue-950 dark:text-white mt-1">
                      ₹{financialSummary.salesRevenue.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-blue-600 mt-1">Gross counter receipts</div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300">Cost of Goods Sold (COGS)</div>
                    <div className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-1">
                      ₹{financialSummary.costOfGoodsSold.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">Acquisition cost from GCMMF</div>
                  </div>

                  <div className="bg-emerald-50/60 dark:bg-emerald-950/40 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800">
                    <div className="text-xs font-bold uppercase text-emerald-800 dark:text-emerald-300">Net Operating Profit</div>
                    <div className="text-2xl font-black font-mono text-emerald-900 dark:text-emerald-200 mt-1">
                      ₹{financialSummary.netOperatingProfit.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-emerald-600 mt-1">True net take-home earnings</div>
                  </div>
                </div>

                {/* Audit breakdown table */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden font-mono text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="py-2.5 px-4 font-sans">P&amp;L Financial Metric</th>
                        <th className="py-2.5 px-4 text-right">Amount (₹)</th>
                        <th className="py-2.5 px-4 text-right">% of Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      <tr>
                        <td className="py-2.5 px-4 font-sans font-semibold text-slate-900 dark:text-white">Gross Sales Revenue</td>
                        <td className="py-2.5 px-4 text-right font-bold">₹{financialSummary.salesRevenue.toFixed(2)}</td>
                        <td className="py-2.5 px-4 text-right">100.0%</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4 font-sans text-rose-700 dark:text-rose-400">Less: Cost of Goods Sold (Wholesale Purchase)</td>
                        <td className="py-2.5 px-4 text-right text-rose-700 dark:text-rose-400 font-bold">-₹{financialSummary.costOfGoodsSold.toFixed(2)}</td>
                        <td className="py-2.5 px-4 text-right text-rose-700 dark:text-rose-400">
                          {financialSummary.salesRevenue > 0 ? ((financialSummary.costOfGoodsSold / financialSummary.salesRevenue) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                      <tr className="bg-slate-50/60 dark:bg-slate-800/60 font-bold">
                        <td className="py-2.5 px-4 font-sans text-slate-900 dark:text-white">Gross Trading Margin</td>
                        <td className="py-2.5 px-4 text-right text-slate-900 dark:text-white">₹{financialSummary.grossProfit.toFixed(2)}</td>
                        <td className="py-2.5 px-4 text-right">
                          {financialSummary.salesRevenue > 0 ? ((financialSummary.grossProfit / financialSummary.salesRevenue) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4 font-sans text-amber-700 dark:text-amber-400">Less: Operating Expenses (Cold Storage, Rent, Wages)</td>
                        <td className="py-2.5 px-4 text-right text-amber-700 dark:text-amber-400 font-bold">-₹{financialSummary.expensesTotal.toFixed(2)}</td>
                        <td className="py-2.5 px-4 text-right text-amber-700 dark:text-amber-400">
                          {financialSummary.salesRevenue > 0 ? ((financialSummary.expensesTotal / financialSummary.salesRevenue) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                      <tr className="bg-emerald-50 dark:bg-emerald-950/60 font-black text-sm text-emerald-900 dark:text-emerald-200">
                        <td className="py-3 px-4 font-sans">Net Operating Profit for the Day</td>
                        <td className="py-3 px-4 text-right">₹{financialSummary.netOperatingProfit.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right">
                          {financialSummary.salesRevenue > 0 ? ((financialSummary.netOperatingProfit / financialSummary.salesRevenue) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. PURCHASES REPORT VIEW */}
            {selectedReport === 'PURCHASES' && (
              <div className="space-y-4">
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3">Invoice Number</th>
                        <th className="py-2.5 px-3">Supplier / Depot</th>
                        <th className="py-2.5 px-2 text-center">Delivered Items</th>
                        <th className="py-2.5 px-2">Payment Mode</th>
                        <th className="py-2.5 px-2 text-center">Status</th>
                        <th className="py-2.5 px-2 text-right">Paid</th>
                        <th className="py-2.5 px-3 text-right">Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {purchases.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-slate-400 font-sans">
                            No purchases recorded on {selectedDate}.
                          </td>
                        </tr>
                      ) : (
                        purchases.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                              {p.purchaseInvoiceNumber}
                            </td>
                            <td className="py-2.5 px-3 font-sans text-slate-700 dark:text-slate-300">
                              {p.supplierName}
                            </td>
                            <td className="py-2.5 px-2 text-center text-slate-700 dark:text-slate-300">
                              {p.itemCount} units ({p.items.length} SKUs)
                            </td>
                            <td className="py-2.5 px-2 font-sans text-slate-700 dark:text-slate-300">
                              {p.paymentMode}
                            </td>
                            <td className="py-2.5 px-2 text-center font-sans">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                p.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {p.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-right text-emerald-700 dark:text-emerald-400 font-bold">
                              ₹{p.paidAmount.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-black text-slate-900 dark:text-white">
                              ₹{p.totalAmount.toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 5. EXPENSES REPORT VIEW */}
            {selectedReport === 'EXPENSES' && (
              <div className="space-y-4">
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3">Expense Category</th>
                        <th className="py-2.5 px-3">Notes &amp; Remarks</th>
                        <th className="py-2.5 px-2">Payment Mode</th>
                        <th className="py-2.5 px-2">Recorded By</th>
                        <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {expenses.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center py-8 text-slate-400 font-sans">
                            No operating expenses recorded on {selectedDate}.
                          </td>
                        </tr>
                      ) : (
                        expenses.map(e => (
                          <tr key={e.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="py-2.5 px-3 font-sans font-bold text-slate-900 dark:text-white">
                              {e.category}
                            </td>
                            <td className="py-2.5 px-3 font-sans text-[11px] text-slate-600 dark:text-slate-400">
                              {e.notes || '-'}
                            </td>
                            <td className="py-2.5 px-2 font-sans text-slate-700 dark:text-slate-300">
                              {e.paymentMode}
                            </td>
                            <td className="py-2.5 px-2 font-sans text-slate-600 dark:text-slate-400 text-[11px]">
                              {e.createdBy}
                            </td>
                            <td className="py-2.5 px-3 text-right font-black text-slate-900 dark:text-white">
                              ₹{e.amount.toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Certified Sign-off Footer block for Print & PDF */}
        <div className="mt-8 pt-6 border-t-2 border-slate-200 dark:border-slate-800 flex flex-wrap items-end justify-between gap-6 text-xs text-slate-500 font-sans">
          <div>
            <div className="font-bold text-slate-800 dark:text-slate-200">System Declaration</div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-md mt-0.5">
              This document is generated by Amul Preferred Outlet Web POS &amp; ERP System.
              All product sales, inventory movements, and supplier khata figures are verified for audit compliance.
            </p>
          </div>

          <div className="flex gap-8 text-center">
            <div className="w-36 pt-8 border-t border-slate-300 dark:border-slate-700">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Prepared By (Cashier)
              </span>
            </div>

            <div className="w-36 pt-8 border-t border-slate-300 dark:border-slate-700">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Authorized Signatory
              </span>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
);
};
