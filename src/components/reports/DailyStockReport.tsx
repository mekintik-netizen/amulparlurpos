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
  Printer
} from 'lucide-react';
import { DailyStockReportRow, Product, Shop, StockMovement } from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';

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

  const loadReport = async () => {
    try {
      setLoading(true);
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
    } catch (err) {
      console.error('Failed to load stock report:', err);
    } finally {
      setLoading(false);
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
    loadReport();
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

    const csvData = rows.map((r) => [
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
      `Amul_Stock_Report_${currentShop.shopCode}_${targetDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered rows
  const filteredRows = rows.filter((r) => {
    const matchesSearch =
      searchTerm === '' ||
      r.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.barcode.includes(searchTerm) ||
      r.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLowStock = !showLowStockOnly || r.isLowStock;
    return matchesSearch && matchesLowStock;
  });

  const totalOpening = rows.reduce((acc, r) => acc + r.openingStock, 0);
  const totalIn = rows.reduce((acc, r) => acc + r.stockIn, 0);
  const totalSales = rows.reduce((acc, r) => acc + r.salesQty, 0);
  const totalOut = rows.reduce((acc, r) => acc + r.stockOut, 0);
  const totalClosing = rows.reduce((acc, r) => acc + r.closingStock, 0);
  const lowStockCount = rows.filter((r) => r.isLowStock).length;

  return (
    <div className="space-y-6">
      {/* Top Controls & KPI Summary */}
      <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/80">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3.5">
            <div className="bg-slate-50 p-1.5 rounded-xl border border-slate-200 shadow-2xs shrink-0">
              <img
                src="/assets/aistudio/images__2__c16e6a94.jpg"
                alt="Amul"
                className="h-10 sm:h-12 w-auto object-contain print:h-14"
                loading="eager"
              />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                Daily Inventory & Stock Audit Report
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {currentShop.name} ({currentShop.shopCode}) · Opening stock, deliveries, sales, and closing balance.
              </p>
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
              onClick={() => window.print()}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Print Stock Report"
            >
              <Printer className="w-4 h-4" />
              <span>Print Report</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-4">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500 uppercase">Opening Stock</div>
            <div className="text-lg font-black font-mono text-slate-800 mt-0.5">{totalOpening}</div>
            <div className="text-[10px] text-slate-400">Total units at start of day</div>
          </div>

          <div className="bg-emerald-50/60 rounded-xl p-3 border border-emerald-200">
            <div className="text-[11px] font-semibold text-emerald-700 uppercase flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> Stock In
            </div>
            <div className="text-lg font-black font-mono text-emerald-800 mt-0.5">+{totalIn}</div>
            <div className="text-[10px] text-emerald-600">Supply deliveries</div>
          </div>

          <div className="bg-blue-50/60 rounded-xl p-3 border border-blue-200">
            <div className="text-[11px] font-semibold text-blue-700 uppercase flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5" /> Sold (Sales)
            </div>
            <div className="text-lg font-black font-mono text-blue-800 mt-0.5">-{totalSales}</div>
            <div className="text-[10px] text-blue-600">Billed through POS</div>
          </div>

          <div className="bg-rose-50/60 rounded-xl p-3 border border-rose-200">
            <div className="text-[11px] font-semibold text-rose-700 uppercase">Stock Out / Leakage</div>
            <div className="text-lg font-black font-mono text-rose-800 mt-0.5">-{totalOut}</div>
            <div className="text-[10px] text-rose-600">Damage & adjustments</div>
          </div>

          <div className="bg-indigo-50/60 rounded-xl p-3 border border-indigo-200">
            <div className="text-[11px] font-semibold text-indigo-700 uppercase">Closing Stock</div>
            <div className="text-lg font-black font-mono text-indigo-900 mt-0.5">{totalClosing}</div>
            <div className="text-[10px] text-indigo-600">Current closing balance</div>
          </div>
        </div>

        {/* Low Stock Warning Banner if any */}
        {lowStockCount > 0 && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-800">
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
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-y border-slate-200">
                <tr>
                  <th className="py-3 px-3">Product Name & Code</th>
                  <th className="py-3 px-2">Category</th>
                  <th className="py-3 px-2 text-right">Opening</th>
                  <th className="py-3 px-2 text-right text-emerald-700">Stock In</th>
                  <th className="py-3 px-2 text-right text-blue-700">Sales Qty</th>
                  <th className="py-3 px-2 text-right text-rose-700">Stock Out</th>
                  <th className="py-3 px-3 text-right font-black">Closing Stock</th>
                  <th className="py-3 px-2 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
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
                    <tr key={r.productId} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3 font-sans">
                        <div className="font-bold text-slate-900">{r.productName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{r.barcode}</div>
                      </td>
                      <td className="py-2.5 px-2 font-sans">
                        <span className="bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded font-medium">
                          {r.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-700">{r.openingStock} {r.unit}</td>
                      <td className="py-2.5 px-2 text-right text-emerald-700 font-bold">
                        {r.stockIn > 0 ? `+${r.stockIn}` : '-'}
                      </td>
                      <td className="py-2.5 px-2 text-right text-blue-700 font-bold">
                        {r.salesQty > 0 ? `-${r.salesQty}` : '-'}
                      </td>
                      <td className="py-2.5 px-2 text-right text-rose-700 font-bold">
                        {r.stockOut > 0 ? `-${r.stockOut}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-slate-900 text-sm">
                        {r.closingStock} <span className="text-[10px] font-normal text-slate-500">{r.unit}</span>
                      </td>
                      <td className="py-2.5 px-2 text-center font-sans">
                        {r.isLowStock ? (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Low (≤{r.minStockAlert})
                          </span>
                        ) : (
                          <span className="bg-emerald-50 text-emerald-700 text-[10px] font-medium px-2 py-0.5 rounded-full">
                            Normal
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-sans">
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
                    step="0.1"
                    min="0.1"
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
                    step="0.1"
                    min="0.1"
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
                  <option value="Rate revision by Amul / GCMMF">Rate revision by Amul / GCMMF</option>
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
    </div>
  );
};
