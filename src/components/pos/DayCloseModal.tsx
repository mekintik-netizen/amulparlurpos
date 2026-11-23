/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Day Close Summary Modal
 * Aggregates daily sales (Cash/UPI/Card/Credit), expenses, net cash in drawer, and crate balance,
 * persists directly to Cloud Firestore (`shops/{shopId}/dayClose/{YYYY-MM-DD}`), and downloads
 * a 100% shop-branded A4 PDF (`Day-Close-Report-{DD-MM-YYYY}.pdf`).
 */

import React, { useState, useEffect } from 'react';
import { X, ClipboardCheck, Download, CloudUpload, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { DayCloseRecord, Shop } from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';
import { buildDynamicPdfFilename, downloadShopTablePdf } from '../../utils/shopPdfBranding.ts';
import { safeMoney } from '../../utils/posHelpers.ts';

interface DayCloseModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentShop: Shop;
}

export const DayCloseModal: React.FC<DayCloseModalProps> = ({
  isOpen,
  onClose,
  currentShop
}) => {
  const [targetDate, setTargetDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openingCash, setOpeningCash] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [metrics, setMetrics] = useState({
    totalBills: 0,
    totalSales: 0,
    cashSales: 0,
    upiSales: 0,
    cardSales: 0,
    creditSales: 0,
    totalExpenses: 0,
    netCrateBalance: 0
  });
  const [history, setHistory] = useState<DayCloseRecord[]>([]);

  const loadDaySummary = async (dateStr: string) => {
    try {
      setLoading(true);
      const [salesSummary, expenses, crateSummary, dayCloseHistory] = await Promise.all([
        AppRepository.reports.getDailySales(currentShop.id, dateStr),
        AppRepository.expenses.getByShop(currentShop.id, dateStr),
        AppRepository.crates.getSummary(currentShop.id),
        AppRepository.dayClose.getHistory(currentShop.id)
      ]);

      const totalExpenses = safeMoney(
        (expenses || []).reduce((acc, e) => acc + safeMoney(e.amount), 0)
      );

      setMetrics({
        totalBills: salesSummary?.totalBills || 0,
        totalSales: safeMoney(salesSummary?.totalAmount),
        cashSales: safeMoney(salesSummary?.cashAmount),
        upiSales: safeMoney(salesSummary?.upiAmount),
        cardSales: safeMoney(salesSummary?.cardAmount),
        creditSales: safeMoney(salesSummary?.creditAmount),
        totalExpenses,
        netCrateBalance: crateSummary?.netBalance || 0
      });

      setHistory(dayCloseHistory || []);
      const existingForDate = (dayCloseHistory || []).find((h) => h.date === dateStr);
      if (existingForDate) {
        setOpeningCash(safeMoney(existingForDate.openingCash));
        setNotes(existingForDate.notes || '');
      }
    } catch (err) {
      console.warn('[DayClose] Failed to load day summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && currentShop?.id) {
      loadDaySummary(targetDate);
    }
  }, [isOpen, currentShop?.id, targetDate]);

  if (!isOpen) return null;

  const netCashInDrawer = safeMoney(safeMoney(openingCash) + metrics.cashSales - metrics.totalExpenses);

  const buildRecord = (): DayCloseRecord => ({
    id: targetDate,
    shopId: currentShop.id,
    date: targetDate,
    totalBills: metrics.totalBills,
    totalSales: metrics.totalSales,
    cashSales: metrics.cashSales,
    upiSales: metrics.upiSales,
    cardSales: metrics.cardSales,
    creditSales: metrics.creditSales,
    totalExpenses: metrics.totalExpenses,
    openingCash: safeMoney(openingCash),
    netCashInDrawer,
    cratesNetBalance: metrics.netCrateBalance,
    notes: notes.trim() || undefined,
    closedBy: 'Counter Cashier',
    closedAt: new Date().toISOString()
  });

  const handleSaveDayClose = async () => {
    try {
      setSaving(true);
      setFeedback(null);
      const record = buildRecord();
      await AppRepository.dayClose.save(record);
      const updatedHistory = await AppRepository.dayClose.getHistory(currentShop.id);
      setHistory(updatedHistory);
      setFeedback({ text: `Day Close (${targetDate}) saved permanently to Cloud Firestore.`, type: 'success' });
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: any) {
      setFeedback({ text: err?.message || 'Failed to save Day Close to cloud.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = () => {
    const record = buildRecord();
    downloadShopTablePdf({
      shop: currentShop,
      documentTitle: 'Daily Counter Day-Close Summary',
      documentSubtitle: `Business Date: ${targetDate}`,
      metaRightLines: [
        `Ref: DAY-CLOSE-${targetDate.replace(/-/g, '')}`,
        `Closed At: ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`
      ],
      kpis: [
        { label: 'Total Sales', value: `INR ${record.totalSales.toFixed(2)}` },
        { label: 'Cash Sales', value: `INR ${record.cashSales.toFixed(2)}` },
        { label: 'UPI + Card', value: `INR ${(record.upiSales + record.cardSales).toFixed(2)}` },
        { label: 'Expenses', value: `INR ${record.totalExpenses.toFixed(2)}` },
        { label: 'Cash in Drawer', value: `INR ${record.netCashInDrawer.toFixed(2)}` }
      ],
      columns: [
        { label: 'Metric / Counter Head', width: 95 },
        { label: 'Details / Count', width: 45, align: 'center' },
        { label: 'Amount / Value', width: 42, align: 'right' }
      ],
      rows: [
        ['Total Valid Bills Completed', `${record.totalBills} bills`, `INR ${record.totalSales.toFixed(2)}`],
        ['Cash Counter Sales', 'CASH', `INR ${record.cashSales.toFixed(2)}`],
        ['UPI / QR Digital Collections', 'UPI', `INR ${record.upiSales.toFixed(2)}`],
        ['Card / POS Terminal Sales', 'CARD', `INR ${record.cardSales.toFixed(2)}`],
        ['Customer Credit (Khata)', 'CREDIT', `INR ${record.creditSales.toFixed(2)}`],
        ['Opening Cash Drawer Float', 'Opening', `INR ${safeMoney(record.openingCash).toFixed(2)}`],
        ['Less: Today Shop Expenses', 'Expenses', `- INR ${record.totalExpenses.toFixed(2)}`],
        ['Closing Net Cash in Drawer', 'Closing Cash', `INR ${record.netCashInDrawer.toFixed(2)}`],
        ['Dairy Crates Net Balance', 'Crates', `${record.cratesNetBalance} crates`]
      ],
      filename: buildDynamicPdfFilename({ kind: 'DAY_CLOSE', date: targetDate })
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ClipboardCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-extrabold text-sm">Day Close Summary (દિવસ પૂરો હિસાબ)</h3>
              <p className="text-[11px] text-slate-300">
                Counter cash reconciliation synced directly to Cloud Firestore
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs font-mono px-2.5 py-1 rounded-lg"
            />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
              Calculating day close summary...
            </div>
          ) : (
            <>
              {feedback && (
                <div
                  className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                    feedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{feedback.text}</span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <div className="text-[10px] font-bold uppercase text-blue-700">Total Sales</div>
                  <div className="text-lg font-black font-mono text-blue-900">₹{metrics.totalSales.toFixed(2)}</div>
                  <div className="text-[10px] text-blue-600">{metrics.totalBills} bills</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <div className="text-[10px] font-bold uppercase text-emerald-700">Cash Sales</div>
                  <div className="text-lg font-black font-mono text-emerald-900">₹{metrics.cashSales.toFixed(2)}</div>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                  <div className="text-[10px] font-bold uppercase text-indigo-700">UPI / Card</div>
                  <div className="text-lg font-black font-mono text-indigo-900">
                    ₹{(metrics.upiSales + metrics.cardSales).toFixed(2)}
                  </div>
                </div>
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
                  <div className="text-[10px] font-bold uppercase text-rose-700">Expenses</div>
                  <div className="text-lg font-black font-mono text-rose-900">₹{metrics.totalExpenses.toFixed(2)}</div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Opening Cash Float (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={openingCash}
                      onChange={(e) => setOpeningCash(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold"
                    />
                  </div>
                  <div className="bg-emerald-950 text-white rounded-xl p-3 flex flex-col justify-center">
                    <div className="text-[10px] font-bold uppercase text-emerald-300">
                      Net Cash in Drawer (Opening + Cash - Expenses)
                    </div>
                    <div className="text-xl font-black font-mono text-white">
                      ₹{netCashInDrawer.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 pt-1">
                  <span>Customer Credit (Khata): <strong className="font-mono text-amber-800">₹{metrics.creditSales.toFixed(2)}</strong></span>
                  <span>Net Dairy Crates Balance: <strong className="font-mono text-slate-900">{metrics.netCrateBalance} crates</strong></span>
                </div>

                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Closing remarks (e.g. Cash deposited to bank, shift handed over)..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Download Day Close PDF
                </button>
                <button
                  type="button"
                  onClick={handleSaveDayClose}
                  disabled={saving}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                  <span>Save Day Close to Cloud</span>
                </button>
              </div>

              {/* Recent Cloud Day Close History */}
              {history.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider mb-1.5">
                    Saved Cloud Day-Close Log ({history.length})
                  </h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-600 text-[10px] font-bold uppercase">
                        <tr>
                          <th className="py-1.5 px-3">Date</th>
                          <th className="py-1.5 px-2 text-right">Sales</th>
                          <th className="py-1.5 px-2 text-right">Expenses</th>
                          <th className="py-1.5 px-2 text-right">Net Cash</th>
                          <th className="py-1.5 px-3 text-right">Crates</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {history.slice(0, 7).map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50">
                            <td className="py-1.5 px-3 font-semibold text-slate-800">{row.date}</td>
                            <td className="py-1.5 px-2 text-right text-blue-800">₹{safeMoney(row.totalSales).toFixed(2)}</td>
                            <td className="py-1.5 px-2 text-right text-rose-700">₹{safeMoney(row.totalExpenses).toFixed(2)}</td>
                            <td className="py-1.5 px-2 text-right font-bold text-emerald-800">₹{safeMoney(row.netCashInDrawer).toFixed(2)}</td>
                            <td className="py-1.5 px-3 text-right text-slate-700">{row.cratesNetBalance}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
