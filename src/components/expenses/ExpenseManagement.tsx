/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Operating Expenses & Financial Reconciliation Component
 * Accurately calculates:
 * - Gross Profit = Sales Revenue - Cost of Goods Sold (COGS)
 * - Net Operating Profit = Gross Profit - Operating Expenses
 * - Cash in Drawer vs UPI in Bank
 */

import React, { useState, useEffect } from 'react';
import { 
  Calculator, 
  Plus, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Zap, 
  DollarSign, 
  Building2, 
  Trash2, 
  AlertCircle,
  Receipt,
  PieChart,
  Printer,
  Download
} from 'lucide-react';
import { DailyFinancialSummary, Expense, ExpenseCategory, PaymentMode, Shop } from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';
import { isShopSubscriptionActive } from '../../storage/subscription.ts';
import { BrandedReportHeader } from '../common/BrandedReportHeader.tsx';
import {
  buildDynamicPdfFilename,
  downloadShopTablePdf,
  getShopPdfIdentity,
  PDF_FOOTER_BRAND_CREDIT,
  printWithDynamicTitle
} from '../../utils/shopPdfBranding.ts';

interface ExpenseManagementProps {
  currentShop: Shop;
}

export const ExpenseManagement: React.FC<ExpenseManagementProps> = ({ currentShop }) => {
  const subCheck = isShopSubscriptionActive(currentShop);
  const [targetDate, setTargetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [financials, setFinancials] = useState<DailyFinancialSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // New Expense Form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('Electricity & Cold Storage');
  const [amount, setAmount] = useState<number>(150);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [notes, setNotes] = useState('');

  const loadFinancials = async () => {
    try {
      setLoading(true);
      const [fin, expList] = await Promise.all([
        AppRepository.reports.getDailyFinancials(currentShop.id, targetDate),
        AppRepository.expenses.getByShop(currentShop.id, targetDate)
      ]);
      setFinancials(fin);
      setExpenses(expList);
    } catch (err) {
      console.error('Failed to load financials:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinancials();
  }, [currentShop.id, targetDate]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subCheck.isActive) {
      alert(`Shop plan is expired (${subCheck.expiryFormatted || 'Expired'}). Please contact Admin to activate the 30-day plan.`);
      return;
    }
    if (amount <= 0) return;

    try {
      await AppRepository.expenses.create({
        shopId: currentShop.id,
        date: targetDate,
        category,
        amount,
        paymentMode,
        notes: notes.trim() || undefined,
        createdBy: 'Counter Manager'
      });

      setIsModalOpen(false);
      setAmount(150);
      setNotes('');
      await loadFinancials();
    } catch (err: any) {
      alert(`Failed to save expense: ${err.message}`);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!subCheck.isActive) {
      alert(`Shop plan is expired. Expense modification is blocked in Read-Only mode.`);
      return;
    }
    if (!window.confirm('Delete this expense record?')) return;
    try {
      await AppRepository.expenses.delete(id);
      await loadFinancials();
    } catch (err: any) {
      alert(`Failed to delete expense: ${err.message}`);
    }
  };

  const categories: ExpenseCategory[] = [
    'Electricity & Cold Storage',
    'Rent',
    'Staff Wages',
    'Transport & Delivery',
    'Packaging & Ice Bags',
    'Maintenance & Repairs',
    'Miscellaneous'
  ];

  const handleDownloadPdf = () => {
    downloadShopTablePdf({
      shop: currentShop,
      documentTitle: 'Expenses & Cash Summary',
      documentSubtitle: `Date: ${targetDate}`,
      metaRightLines: [
        `Ref: RPT-EXP-${targetDate.replace(/-/g, '')}`,
        `Generated: ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`
      ],
      kpis: [
        { label: 'Sales Revenue', value: `INR ${(financials?.salesRevenue || 0).toFixed(2)}` },
        { label: 'COGS', value: `INR ${(financials?.costOfGoodsSold || 0).toFixed(2)}` },
        { label: 'Gross Profit', value: `INR ${(financials?.grossProfit || 0).toFixed(2)}` },
        { label: 'Expenses', value: `INR ${(financials?.expensesTotal || 0).toFixed(2)}` },
        { label: 'Net Profit', value: `INR ${(financials?.netOperatingProfit || 0).toFixed(2)}` }
      ],
      columns: [
        { label: 'Expense Category', width: 34 },
        { label: 'Notes / Purpose', width: 44 },
        { label: 'Mode', width: 16, align: 'center' },
        { label: 'Recorded By', width: 20 },
        { label: 'Amount (INR)', width: 22, align: 'right' }
      ],
      rows: expenses.map((e) => [
        e.category,
        e.notes || '-',
        e.paymentMode,
        e.createdBy,
        e.amount.toFixed(2)
      ]),
      emptyMessage: `No operating expenses logged on ${targetDate}.`,
      filename: buildDynamicPdfFilename({ kind: 'EXPENSES', date: targetDate })
    });
  };

  const handlePrintExpensesReport = () => {
    printWithDynamicTitle(buildDynamicPdfFilename({ kind: 'EXPENSES', date: targetDate }));
  };

  return (
    <div id="unified-print-area" className="space-y-6 a4-print-container">
      {/* Plan Expired Warning Banner (Hidden in Print) */}
      {!subCheck.isActive && (
        <div
          data-trial-banner="true"
          className="no-print bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl p-4 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-amber-900">
                Shop Plan Expired (Read-Only Mode)
              </h4>
              <p className="text-xs text-amber-700 mt-0.5">
                Expired on {subCheck.expiryFormatted}. All historical P&L reports and expenses remain safely preserved. To log new operating expenses, contact Admin to activate the 30-day plan.
              </p>
            </div>
          </div>
          <span className="shrink-0 text-xs font-bold bg-amber-600 text-white px-3 py-1.5 rounded-lg shadow-xs">
            Read-Only
          </span>
        </div>
      )}

      {/* Unified Print-Only CA-Grade Two-Column Shop Header (Page 1 Top Only) */}
      <div className="hidden print:block">
        <BrandedReportHeader
          currentShop={currentShop}
          reportTitle="Expenses & Cash Register Report"
          reportDate={targetDate}
          referenceCode={`RPT-EXP-${targetDate.replace(/-/g, '')}`}
        />
      </div>

      {/* Top Controls & Financial KPI Summary */}
      <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/80 print:rounded-none print:border-0 print:p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 no-print">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-blue-600" />
              Daily Financial Summary &amp; Profit / Loss Reconciliation
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Strictly distinguishes sales revenue from true operating profit based on Cost of Goods Sold (COGS) and operational costs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5">
              <Calendar className="w-4 h-4 text-slate-500" />
              <input
                type="date"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-hidden"
              />
            </div>

            <button
              type="button"
              onClick={handleDownloadPdf}
              className="bg-[#005A9C] hover:bg-blue-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Download Expenses & Cash Report directly as clean PDF"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </button>

            <button
              type="button"
              onClick={handlePrintExpensesReport}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Print Expenses & Cash Report"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>

            <button
              onClick={() => {
                if (!subCheck.isActive) {
                  alert(`Shop plan is expired (${subCheck.expiryFormatted || 'Expired'}). New expense logging is disabled.`);
                  return;
                }
                setIsModalOpen(true);
              }}
              disabled={!subCheck.isActive}
              className={`${
                subCheck.isActive
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              } text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm`}
            >
              <Plus className="w-4 h-4" />
              {subCheck.isActive ? 'Log Operating Expense' : 'Plan Expired (Read-Only)'}
            </button>
          </div>
        </div>

        {/* P&L Flow Breakdown Cards (Non-Overlapping 5-Column Grid in Print) */}
        <div className="unified-kpi-grid-5 grid grid-cols-2 md:grid-cols-5 gap-3 pt-4 print:pt-0">
          <div className="unified-kpi-card bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-slate-500 uppercase">1. Gross Sales</div>
            <div className="text-lg font-black font-mono text-slate-900 mt-0.5 print:text-sm">
              ₹{(financials?.salesRevenue || 0).toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 print:hidden">Total customer collections</div>
          </div>

          <div className="unified-kpi-card bg-amber-50/70 border border-amber-200 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-amber-700 uppercase flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 no-print" /> 2. COGS
            </div>
            <div className="text-lg font-black font-mono text-amber-900 mt-0.5 print:text-sm">
              -₹{(financials?.costOfGoodsSold || 0).toFixed(2)}
            </div>
            <div className="text-[10px] text-amber-600 print:hidden">Wholesale cost of milk/ice cream sold</div>
          </div>

          <div className="unified-kpi-card bg-blue-50/70 border border-blue-200 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-blue-700 uppercase flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 no-print" /> 3. Gross Profit
            </div>
            <div className="text-lg font-black font-mono text-blue-900 mt-0.5 print:text-sm">
              ₹{(financials?.grossProfit || 0).toFixed(2)}
            </div>
            <div className="text-[10px] text-blue-600 print:hidden">Margin before shop expenses</div>
          </div>

          <div className="unified-kpi-card bg-rose-50/70 border border-rose-200 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-rose-700 uppercase">4. Expenses</div>
            <div className="text-lg font-black font-mono text-rose-800 mt-0.5 print:text-sm">
              -₹{(financials?.expensesTotal || 0).toFixed(2)}
            </div>
            <div className="text-[10px] text-rose-600 print:hidden">Electricity, refrigeration &amp; rent</div>
          </div>

          <div className={`unified-kpi-card rounded-xl p-3 border ${(financials?.netOperatingProfit || 0) >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-100 border-rose-300'}`}>
            <div className="text-[11px] font-semibold text-emerald-800 uppercase flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 no-print" /> 5. Net Profit
            </div>
            <div className={`text-xl font-black font-mono mt-0.5 print:text-sm ${(financials?.netOperatingProfit || 0) >= 0 ? 'text-emerald-900' : 'text-rose-900'}`}>
              ₹{(financials?.netOperatingProfit || 0).toFixed(2)}
            </div>
            <div className="text-[10px] text-emerald-700 print:hidden">Actual daily earnings</div>
          </div>
        </div>
      </div>

      {/* Cash Drawer & Expenses Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:block">
        {/* Expenses List (8 cols on screen, full width in print) */}
        <div className="lg:col-span-8 bg-white rounded-2xl shadow-xs border border-slate-200/80 p-5 print:p-0 print:border-0 print:shadow-none print:rounded-none">
          <div className="flex items-center justify-between mb-4 print:mb-2">
            <h3 className="font-extrabold text-sm text-slate-800">
              Operating Expenses for {targetDate} ({expenses.length})
            </h3>
            <span className="text-xs font-mono font-bold text-slate-600 print-nowrap">
              Total: ₹{(financials?.expensesTotal || 0).toFixed(2)}
            </span>
          </div>

          <div className="overflow-x-auto print:overflow-visible">
            <table className="unified-report-table w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Expense Category</th>
                  <th className="py-2.5 px-3">Notes / Purpose</th>
                  <th className="py-2.5 px-2 print-nowrap">Payment</th>
                  <th className="py-2.5 px-3 text-right print-nowrap">Amount</th>
                  <th className="py-2.5 px-2 text-center no-print">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-slate-400 font-sans">
                      No operating expenses logged for this date.
                    </td>
                  </tr>
                ) : (
                  expenses.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3 font-sans font-semibold text-slate-800">
                        {e.category}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-600 text-[11px]">
                        {e.notes || '-'}
                      </td>
                      <td className="py-2.5 px-2 font-sans print-nowrap">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 print:bg-transparent print:p-0">
                          {e.paymentMode}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-rose-700 text-sm print-nowrap">
                        ₹{e.amount.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-2 text-center font-sans no-print">
                        <button
                          onClick={() => handleDeleteExpense(e.id)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cash Drawer & Liquidity Balances (4 cols, hidden side panel in print) */}
        <div className="no-print lg:col-span-4 bg-white rounded-2xl shadow-xs border border-slate-200/80 p-5 space-y-4">
          <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-1.5">
            <PieChart className="w-4 h-4 text-blue-600" />
            Liquidity & Cash Drawer
          </h3>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-slate-200">
              <span className="font-sans font-semibold text-slate-600">Cash in Till:</span>
              <span className="font-bold text-sm text-slate-900">
                ₹{(financials?.cashInHand || 0).toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between items-center pb-2 border-b border-slate-200">
              <span className="font-sans font-semibold text-slate-600">UPI Bank Receipts:</span>
              <span className="font-bold text-sm text-indigo-700">
                ₹{(financials?.upiInBank || 0).toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between items-center pb-2 border-b border-slate-200">
              <span className="font-sans font-semibold text-slate-600">Distributor Payables:</span>
              <span className="font-bold text-sm text-rose-700">
                ₹{(financials?.supplierPayables || 0).toFixed(2)}
              </span>
            </div>

            <div className="text-[10px] font-sans text-slate-500 pt-1 leading-relaxed">
              * Cash receipts from sales minus any cash operating expenses paid out of the counter drawer today.
            </div>
          </div>
        </div>
      </div>

      {/* Print-Only Commercial Signatory & Subtle Text-Only Footer Attribution (No Logo Image) */}
      <div className="unified-print-footer hidden print:block pt-10 mt-6 border-t border-slate-300 text-xs text-slate-700">
        <div className="flex items-end justify-between">
          <div className="w-44 text-center border-t border-dashed border-slate-500 pt-1.5 font-bold">
            Prepared By
          </div>
          <div className="w-48 text-center border-t border-dashed border-slate-500 pt-1.5 font-bold">
            Authorized Signatory
            <div className="text-[10px] font-normal text-slate-500">
              For {getShopPdfIdentity(currentShop).displayName}
            </div>
          </div>
        </div>
        <div className="mt-4 pt-2 border-t border-slate-200 flex items-center justify-between text-[9px] text-slate-400">
          <span>Expenses &amp; Cash Statement — {getShopPdfIdentity(currentShop).displayName}</span>
          <span>{PDF_FOOTER_BRAND_CREDIT}</span>
        </div>
      </div>

      {/* Log Expense Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="font-extrabold text-base text-slate-900 mb-1">Log Daily Operating Expense</h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter refrigeration, wages, rent or packaging expenses.
            </p>

            <form onSubmit={handleAddExpense} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Expense Category</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                >
                  {categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Amount (₹)</label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  required
                  value={amount || ''}
                  onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-sm font-bold text-blue-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Mode</label>
                <select
                  value={paymentMode}
                  onChange={e => setPaymentMode(e.target.value as PaymentMode)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                >
                  <option value="CASH">Cash (From counter till)</option>
                  <option value="UPI">UPI / Online</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Dry ice blocks, freezer cleaning"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
