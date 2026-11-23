/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dairy Crate In/Out Tracker Modal
 * Real-time Cloud Firestore tracker (`shops/{shopId}/crates`) with atomic `crateBalance` updates.
 */

import React, { useState, useEffect } from 'react';
import { X, Box, ArrowDownLeft, ArrowUpRight, Trash2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { CrateMovementType, CrateSummary, Shop } from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';

interface CrateTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentShop: Shop;
}

export const CrateTrackerModal: React.FC<CrateTrackerModalProps> = ({
  isOpen,
  onClose,
  currentShop
}) => {
  const [summary, setSummary] = useState<CrateSummary>({
    totalIn: 0,
    totalOut: 0,
    netBalance: 0,
    transactions: []
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [supplierName, setSupplierName] = useState('Dairy Agency / Distributor');
  const [movementType, setMovementType] = useState<CrateMovementType>('IN');
  const [quantity, setQuantity] = useState<number>(5);
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!isOpen || !currentShop?.id) return;
    setLoading(true);
    let active = true;

    AppRepository.crates
      .getSummary(currentShop.id)
      .then((res) => {
        if (active) {
          setSummary(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    const unsub = AppRepository.crates.subscribe(currentShop.id, (liveSummary) => {
      if (active) {
        setSummary(liveSummary);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      unsub();
    };
  }, [isOpen, currentShop?.id]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Math.round(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) {
      setFeedback({ text: 'Please enter a valid crate quantity (1 or more).', type: 'error' });
      return;
    }

    try {
      setSaving(true);
      setFeedback(null);
      await AppRepository.crates.record({
        shopId: currentShop.id,
        date: new Date().toISOString().slice(0, 10),
        agencyName: supplierName.trim() || 'Dairy Agency',
        type: movementType,
        quantity: qty,
        notes: notes.trim() || undefined,
        createdBy: 'Counter Cashier'
      });
      setNotes('');
      setQuantity(5);
      setFeedback({
        text: `${movementType === 'IN' ? 'Received' : 'Returned'} ${qty} crates synced to Cloud Firestore.`,
        type: 'success'
      });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setFeedback({ text: err?.message || 'Failed to save crate entry to cloud.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, type: CrateMovementType, qty: number) => {
    try {
      await AppRepository.crates.delete(currentShop.id, id, type, qty);
      setFeedback({ text: 'Crate entry removed and balance updated in Cloud Firestore.', type: 'success' });
      setTimeout(() => setFeedback(null), 2500);
    } catch (err: any) {
      setFeedback({ text: err?.message || 'Failed to delete crate entry.', type: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-[#005A9C] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Box className="w-5 h-5 text-amber-300" />
            <div>
              <h3 className="font-extrabold text-sm">Crate In / Out Tracker (ક્રેટ હિસાબ)</h3>
              <p className="text-[11px] text-blue-100">
                Real-time Cloud Firestore ledger for {currentShop.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/15 text-blue-100 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Live Cloud KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <div className="text-[10px] font-bold uppercase text-emerald-700">Crates In (આવ્યા)</div>
              <div className="text-xl font-black font-mono text-emerald-900 mt-0.5">{summary.totalIn}</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <div className="text-[10px] font-bold uppercase text-blue-700">Crates Out (પરત)</div>
              <div className="text-xl font-black font-mono text-blue-900 mt-0.5">{summary.totalOut}</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <div className="text-[10px] font-bold uppercase text-amber-800">Net Balance (દુકાન પાસે)</div>
              <div className="text-xl font-black font-mono text-amber-950 mt-0.5">{summary.netBalance}</div>
            </div>
          </div>

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

          {/* Entry Form */}
          <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Movement Type</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMovementType('IN')}
                    className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
                      movementType === 'IN'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    IN (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovementType('OUT')}
                    className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
                      movementType === 'OUT'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    OUT (-)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Agency / Party Name</label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="e.g. Milk Agency"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Crate Quantity</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 0))}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional note (e.g. Morning milk van, driver name)..."
                className="flex-1 min-w-[200px] px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-[#005A9C] hover:bg-blue-800 disabled:bg-slate-400 text-white text-xs font-bold rounded-lg shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Save to Cloud</span>
              </button>
            </div>
          </form>

          {/* History Table */}
          <div>
            <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">
              Recent Cloud Crate Log ({summary.transactions.length})
            </h4>
            {loading ? (
              <div className="text-center py-8 text-xs text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1" />
                Loading crate ledger from Cloud Firestore...
              </div>
            ) : summary.transactions.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No crate entries logged yet. Add your first delivery or empty crate return above.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 text-[10px] font-bold uppercase">
                    <tr>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-2">Agency</th>
                      <th className="py-2 px-2 text-center">Type</th>
                      <th className="py-2 px-2 text-right">Qty</th>
                      <th className="py-2 px-2">Notes</th>
                      <th className="py-2 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-600">{tx.date}</td>
                        <td className="py-2 px-2 font-semibold text-slate-800">{tx.agencyName}</td>
                        <td className="py-2 px-2 text-center">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              tx.type === 'IN'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-slate-900">
                          {tx.type === 'IN' ? '+' : '-'}
                          {tx.quantity}
                        </td>
                        <td className="py-2 px-2 text-[11px] text-slate-500 truncate max-w-[150px]">
                          {tx.notes || '—'}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDelete(tx.id, tx.type, tx.quantity)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                            title="Delete entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
