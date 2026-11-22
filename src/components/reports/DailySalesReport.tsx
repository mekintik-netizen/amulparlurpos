/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Daily Sales Reports Component
 * Provides complete sales revenue breakdown, bill search,
 * thermal reprint, payment mode aggregation, and safe bill cancellation.
 */

import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Receipt, 
  Search, 
  Printer, 
  XCircle, 
  IndianRupee, 
  Banknote, 
  QrCode, 
  CreditCard,
  User,
  CheckCircle2,
  RefreshCw,
  ShoppingBag,
  Eye,
  FileSpreadsheet,
  Download
} from 'lucide-react';
import { DailySalesReportSummary, SaleBill, Shop } from '../../types/index.ts';
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

interface DailySalesReportProps {
  currentShop: Shop;
  onReprintBill: (bill: SaleBill) => void;
}

export const DailySalesReport: React.FC<DailySalesReportProps> = ({ currentShop, onReprintBill }) => {
  const [targetDate, setTargetDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState<DailySalesReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [billSearch, setBillSearch] = useState('');
  const [selectedBillForDetails, setSelectedBillForDetails] = useState<SaleBill | null>(null);
  const [cancellingBillId, setCancellingBillId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('Customer returned milk item');

  const loadDailySales = async () => {
    try {
      setLoading(true);
      const data = await AppRepository.reports.getDailySales(currentShop.id, targetDate);
      setSummary(data);
    } catch (err) {
      console.error('Failed to load daily sales report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDailySales();
  }, [currentShop.id, targetDate]);

  const handleCancelBill = async (billId: string) => {
    if (!window.confirm('Are you sure you want to cancel this bill? Stock will be restored automatically.')) {
      return;
    }

    try {
      await AppRepository.sales.cancelBill(billId, currentShop.id, cancelReason);
      setCancellingBillId(null);
      await loadDailySales();
    } catch (err: any) {
      alert(`Failed to cancel bill: ${err.message}`);
    }
  };

  const filteredBills = (summary?.bills || []).filter((b) => {
    if (!billSearch.trim()) return true;
    const q = billSearch.toLowerCase();
    return (
      b.billNumber.toLowerCase().includes(q) ||
      (b.customerPhone && b.customerPhone.includes(q)) ||
      (b.customerName && b.customerName.toLowerCase().includes(q))
    );
  });

  // Export Sales History & Daily Cash Register to Excel
  const handleExportSalesToExcel = () => {
    if (!summary || summary.bills.length === 0) {
      alert('No sales transactions recorded for this date to export.');
      return;
    }

    const excelData = summary.bills.map((b) => ({
      'Invoice / Bill No': b.billNumber,
      'Date & Time': new Date(b.createdAt || b.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
      'Customer Name': b.customerName || 'Walk-in Customer',
      'Customer Phone': b.customerPhone || 'N/A',
      'Payment Mode': b.paymentMode,
      'Total Items': b.items.reduce((acc, it) => acc + it.quantity, 0),
      'Item Details': b.items.map(it => `${it.productName} (x${it.quantity})`).join(', '),
      'Subtotal (₹)': b.subtotal,
      'Discount (₹)': b.discountAmount || 0,
      'Final Amount (₹)': b.finalAmount,
      'Status': b.status || 'COMPLETED'
    }));

    exportDataToExcel({
      filename: `${getShopFileSlug(currentShop)}_Daily_Sales_Register_${targetDate}.xlsx`,
      sheetName: 'Daily Cash Register',
      data: excelData
    });
  };

  const handleDownloadPdf = () => {
    const bills = summary?.bills || [];
    downloadShopTablePdf({
      shop: currentShop,
      documentTitle: 'Daily Sales & Cash Register',
      documentSubtitle: `Date: ${targetDate}`,
      metaRightLines: [
        `Ref: RPT-SLS-${targetDate.replace(/-/g, '')}`,
        `Generated: ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`
      ],
      kpis: [
        { label: 'Net Revenue', value: `INR ${(summary?.totalAmount || 0).toFixed(2)}` },
        { label: 'Cash', value: `INR ${(summary?.cashAmount || 0).toFixed(2)}` },
        { label: 'UPI', value: `INR ${(summary?.upiAmount || 0).toFixed(2)}` },
        { label: 'Card', value: `INR ${(summary?.cardAmount || 0).toFixed(2)}` },
        { label: 'Credit', value: `INR ${(summary?.creditAmount || 0).toFixed(2)}` }
      ],
      columns: [
        { label: 'Bill No', width: 24 },
        { label: 'Time', width: 16 },
        { label: 'Customer', width: 32 },
        { label: 'Items', width: 12, align: 'center' },
        { label: 'Mode', width: 18, align: 'center' },
        { label: 'Status', width: 18, align: 'center' },
        { label: 'Amount (INR)', width: 24, align: 'right' }
      ],
      rows: bills.map((b) => [
        b.billNumber,
        new Date(b.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        b.customerName || 'Walk-in Customer',
        b.itemCount || b.items.reduce((s, i) => s + i.quantity, 0),
        b.paymentMode,
        b.status,
        b.finalAmount.toFixed(2)
      ]),
      emptyMessage: `No sales bills recorded on ${targetDate}.`,
      filename: buildDynamicPdfFilename({ kind: 'DAILY_SALES', date: targetDate })
    });
  };

  const handlePrintSalesReport = () => {
    printWithDynamicTitle(buildDynamicPdfFilename({ kind: 'DAILY_SALES', date: targetDate }));
  };

  const shopIdentity = getShopPdfIdentity(currentShop);

  return (
    <div id="unified-print-area" className="space-y-6 a4-print-container">
      {/* Unified Print-Only CA-Grade Two-Column Shop Header (Page 1 Top Only) */}
      <div className="hidden print:block">
        <BrandedReportHeader
          currentShop={currentShop}
          reportTitle="Daily Sales & Cash Counter Report"
          reportDate={targetDate}
          referenceCode={`RPT-SLS-${targetDate.replace(/-/g, '')}`}
        />
      </div>

      {/* Top Header & Date Filter */}
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
                <Receipt className="w-4 h-4 text-blue-600" />
                <span>Daily Sales &amp; Cash Counter Report · {targetDate}</span>
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
              onClick={handleExportSalesToExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Export Daily Cash Register & Sales to Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export to Excel</span>
            </button>

            <button
              onClick={handleDownloadPdf}
              className="bg-[#005A9C] hover:bg-blue-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Download Daily Sales Report directly as clean PDF"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </button>

            <button
              onClick={handlePrintSalesReport}
              className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Print Daily Sales Report"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>

            <button
              onClick={loadDailySales}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              title="Refresh Sales Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Revenue KPI Cards (Non-Overlapping 5-Column Grid in Print) */}
        <div className="unified-kpi-grid-5 grid grid-cols-2 md:grid-cols-5 gap-3 pt-4 print:pt-0">
          <div className="unified-kpi-card bg-blue-50/70 border border-blue-200 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-blue-700 uppercase">Total Net Revenue</div>
            <div className="text-xl font-black font-mono text-blue-900 mt-0.5 print:text-sm">
              ₹{(summary?.totalAmount || 0).toFixed(2)}
            </div>
            <div className="text-[10px] text-blue-600 font-medium print:hidden">
              {summary?.totalBills || 0} valid bills completed
            </div>
          </div>

          <div className="unified-kpi-card bg-emerald-50/60 border border-emerald-200 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-emerald-700 uppercase flex items-center gap-1">
              <Banknote className="w-3.5 h-3.5 no-print" /> Cash Drawer
            </div>
            <div className="text-lg font-black font-mono text-emerald-800 mt-0.5 print:text-sm">
              ₹{(summary?.cashAmount || 0).toFixed(2)}
            </div>
            <div className="text-[10px] text-emerald-600 print:hidden">Cash in hand</div>
          </div>

          <div className="unified-kpi-card bg-indigo-50/60 border border-indigo-200 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-indigo-700 uppercase flex items-center gap-1">
              <QrCode className="w-3.5 h-3.5 no-print" /> UPI Payments
            </div>
            <div className="text-lg font-black font-mono text-indigo-900 mt-0.5 print:text-sm">
              ₹{(summary?.upiAmount || 0).toFixed(2)}
            </div>
            <div className="text-[10px] text-indigo-600 print:hidden">Direct to Bank</div>
          </div>

          <div className="unified-kpi-card bg-purple-50/60 border border-purple-200 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-purple-700 uppercase flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5 no-print" /> Card / POS
            </div>
            <div className="text-lg font-black font-mono text-purple-900 mt-0.5 print:text-sm">
              ₹{(summary?.cardAmount || 0).toFixed(2)}
            </div>
            <div className="text-[10px] text-purple-600 print:hidden">Debit / Credit Cards</div>
          </div>

          <div className="unified-kpi-card bg-amber-50/60 border border-amber-200 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-amber-700 uppercase flex items-center gap-1">
              <User className="w-3.5 h-3.5 no-print" /> Customer Credit
            </div>
            <div className="text-lg font-black font-mono text-amber-900 mt-0.5 print:text-sm">
              ₹{(summary?.creditAmount || 0).toFixed(2)}
            </div>
            <div className="text-[10px] text-amber-600 print:hidden">Khata balance</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:block">
        {/* Left Column: Bills Table (8 cols on screen, full width in print) */}
        <div className="lg:col-span-8 bg-white rounded-2xl shadow-xs border border-slate-200/80 p-5 print:p-0 print:border-0 print:shadow-none print:rounded-none">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 print:mb-2">
            <h3 className="font-extrabold text-sm text-slate-800">
              Customer Invoices for {targetDate} ({filteredBills.length})
            </h3>

            <div className="no-print relative min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search Bill # or customer phone..."
                value={billSearch}
                onChange={(e) => setBillSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="overflow-x-auto print:overflow-visible">
            <table className="unified-report-table w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 print-nowrap">Bill Number &amp; Time</th>
                  <th className="py-2.5 px-2">Customer</th>
                  <th className="py-2.5 px-2 text-center print-nowrap">Items</th>
                  <th className="py-2.5 px-2 print-nowrap">Payment</th>
                  <th className="py-2.5 px-2 text-right print-nowrap">Net Amount</th>
                  <th className="py-2.5 px-2 text-center print-nowrap">Status</th>
                  <th className="py-2.5 px-3 text-right no-print">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400 font-sans">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Loading sales bills...
                    </td>
                  </tr>
                ) : filteredBills.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400 font-sans">
                      No sales found for this date.
                    </td>
                  </tr>
                ) : (
                  filteredBills.map((bill) => (
                    <tr key={bill.id} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{bill.billNumber}</div>
                        <div className="text-[10px] text-slate-400 font-sans">
                          {new Date(bill.timestamp).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 font-sans">
                        {bill.customerName ? (
                          <div className="font-semibold text-slate-800">{bill.customerName}</div>
                        ) : (
                          <span className="text-slate-400">Walk-in</span>
                        )}
                        {bill.customerPhone && (
                          <div className="text-[10px] text-slate-500 font-mono">{bill.customerPhone}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center text-slate-700">
                        {bill.itemCount || bill.items.reduce((s, i) => s + i.quantity, 0)}
                      </td>
                      <td className="py-2.5 px-2 font-sans">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {bill.paymentMode}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-black text-slate-900 text-sm">
                        ₹{bill.finalAmount.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-2 text-center font-sans">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            bill.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800 line-through'
                          }`}
                        >
                          {bill.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-sans no-print">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onReprintBill(bill)}
                            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition"
                            title="Reprint Thermal Receipt (58mm/80mm)"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setSelectedBillForDetails(bill)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                            title="View Items Breakdown"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {bill.status === 'COMPLETED' && (
                            <button
                              onClick={() => {
                                setCancellingBillId(bill.id);
                              }}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition"
                              title="Cancel Bill & Return Stock"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Product Sales Summary / Best Sellers (4 cols, screen-only side panel) */}
        <div className="no-print lg:col-span-4 bg-white rounded-2xl shadow-xs border border-slate-200/80 p-5 flex flex-col">
          <h3 className="font-extrabold text-sm text-slate-800 mb-1 flex items-center gap-1.5">
            <ShoppingBag className="w-4 h-4 text-blue-600" />
            Product Sales Summary
          </h3>
          <p className="text-[11px] text-slate-400 mb-3">Units sold and revenue generated today</p>

          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[420px] pr-1">
            {!summary?.productSummaries || summary.productSummaries.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                No items sold today yet.
              </div>
            ) : (
              summary.productSummaries.map((p) => (
                <div key={p.productId} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-slate-800 line-clamp-1">{p.productName}</div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {p.quantitySold} units sold
                    </div>
                  </div>
                  <div className="text-right font-mono font-extrabold text-slate-900">
                    ₹{p.revenue.toFixed(2)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bill Items View Modal */}
      {selectedBillForDetails && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">
                  Invoice {selectedBillForDetails.billNumber}
                </h4>
                <div className="text-xs text-slate-400 font-mono">
                  {new Date(selectedBillForDetails.timestamp).toLocaleString('en-IN')}
                </div>
              </div>
              <button
                onClick={() => setSelectedBillForDetails(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="py-3 divide-y divide-slate-100 max-h-60 overflow-y-auto">
              {selectedBillForDetails.items.map((item, i) => (
                <div key={i} className="py-2 flex justify-between text-xs">
                  <div>
                    <div className="font-semibold text-slate-800">{item.productName}</div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {item.quantity} x ₹{item.unitPrice}
                    </div>
                  </div>
                  <div className="font-mono font-bold text-slate-900">₹{item.total.toFixed(2)}</div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-200 space-y-1 text-xs font-mono">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>₹{selectedBillForDetails.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-extrabold text-sm text-slate-900 pt-1">
                <span>Final Paid:</span>
                <span>₹{selectedBillForDetails.finalAmount.toFixed(2)}</span>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  onReprintBill(selectedBillForDetails);
                  setSelectedBillForDetails(null);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                Reprint Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bill Cancellation Dialog */}
      {cancellingBillId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5">
            <h4 className="font-bold text-slate-900 text-sm mb-1 text-rose-600 flex items-center gap-1.5">
              <XCircle className="w-4 h-4" />
              Cancel Sale & Restore Stock
            </h4>
            <p className="text-xs text-slate-500 mb-3">
              This will mark the bill as cancelled and return all item quantities back to available inventory.
            </p>

            <label className="block text-xs font-bold text-slate-700 mb-1">Reason for cancellation</label>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs mb-4 focus:ring-2 focus:ring-rose-500"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCancellingBillId(null)}
                className="px-3 py-1.5 text-slate-600 text-xs font-semibold rounded-lg"
              >
                Back
              </button>
              <button
                onClick={() => handleCancelBill(cancellingBillId)}
                className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-1.5 rounded-xl text-xs font-bold shadow-xs"
              >
                Confirm Cancellation
              </button>
            </div>
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
          <span>Daily Sales Report — {shopIdentity.displayName}</span>
          <span>{PDF_FOOTER_BRAND_CREDIT}</span>
        </div>
      </div>
    </div>
  );
};
