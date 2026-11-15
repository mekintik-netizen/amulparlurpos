/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Smart Order (ઓટો ઓર્ડર & પર્ચેઝ લિસ્ટ) Module
 * - Strictly analyzes actual POS sales invoices (7 / 15 / 30 Days) and only includes products with totalSoldQty > 0 by default.
 * - Optional unchecked-by-default toggle reveals 0-sale low-stock items (CurrentStock <= minStockAlert).
 * - Pre-selects only items where Recommended Order Qty > 0.
 * - Supports WhatsApp order sharing, PDF order export, and 1-click conversion into a PENDING Purchase Bill
 *   (strictly without incrementing currentStock until the bill is physically received and confirmed).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Download,
  FilePlus2,
  MessageCircle,
  Package,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  Truck
} from 'lucide-react';
import {
  Product,
  PurchaseBill,
  PurchaseItem,
  SaleBill,
  Shop,
  SmartOrderBufferPercent,
  SmartOrderCycleDays,
  SmartOrderSuggestion,
  Supplier
} from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';
import { isShopSubscriptionActive } from '../../storage/subscription.ts';
import { startShopRealtimeSync } from '../../storage/firestoreSync.ts';
import {
  buildWhatsAppShareUrl,
  calculateSmartOrderSuggestions,
  downloadSmartOrderPdf,
  formatSmartOrderWhatsAppText,
  roundMoney3
} from '../../utils/smartOrderCalculator.ts';

interface SmartOrderManagementProps {
  currentShop: Shop;
  onOpenPurchases: () => void;
}

const CYCLE_OPTIONS: { days: SmartOrderCycleDays; title: string; guj: string }[] = [
  { days: 7, title: 'Weekly (7 Days)', guj: 'અઠવાડિક' },
  { days: 15, title: 'Fortnightly (15 Days)', guj: '૧૫ દિવસ' },
  { days: 30, title: 'Monthly (30 Days)', guj: 'માસિક' }
];

const BUFFER_OPTIONS: SmartOrderBufferPercent[] = [0, 10, 20];

export const SmartOrderManagement: React.FC<SmartOrderManagementProps> = ({
  currentShop,
  onOpenPurchases
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SaleBill[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const [cycleDays, setCycleDays] = useState<SmartOrderCycleDays>(7);
  const [bufferPercent, setBufferPercent] = useState<SmartOrderBufferPercent>(10);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [customAgencyName, setCustomAgencyName] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [includeZeroSaleLowStock, setIncludeZeroSaleLowStock] = useState(false);

  const [rows, setRows] = useState<SmartOrderSuggestion[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
    createdBill?: PurchaseBill;
  } | null>(null);

  const subCheck = isShopSubscriptionActive(currentShop);

  const loadData = async () => {
    try {
      setLoading(true);
      const [prodList, saleList, supList] = await Promise.all([
        AppRepository.products.getByShop(currentShop.id),
        AppRepository.sales.getByShop(currentShop.id),
        AppRepository.suppliers.getAll(currentShop.id)
      ]);
      setProducts(prodList);
      setSales(saleList);
      setSuppliers(supList);
      if (supList.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(supList[0].id);
        setCustomAgencyName(supList[0].companyName || supList[0].name);
      } else if (supList.length === 0 && !customAgencyName) {
        setCustomAgencyName('Amul Dairy Depot');
      }
    } catch (err) {
      console.error('[SmartOrder] Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const sync = startShopRealtimeSync(currentShop.id, () => {
      loadData();
    });
    return () => {
      sync.unsubscribeAll();
    };
  }, [currentShop.id]);

  // Recompute suggestions whenever catalog, sales history, cycle, buffer, or low-stock toggle changes
  useEffect(() => {
    const computed = calculateSmartOrderSuggestions({
      products,
      sales,
      cycleDays,
      bufferPercent,
      includeZeroSaleLowStock
    });
    setRows(computed);
  }, [products, sales, cycleDays, bufferPercent, includeZeroSaleLowStock]);

  const zeroSaleLowStockCount = useMemo(() => {
    if (includeZeroSaleLowStock) {
      return rows.filter(r => r.totalSoldInCycle <= 0 && r.isLowStock).length;
    }
    const withLowStock = calculateSmartOrderSuggestions({
      products,
      sales,
      cycleDays,
      bufferPercent,
      includeZeroSaleLowStock: true
    });
    return withLowStock.filter(r => r.totalSoldInCycle <= 0 && r.isLowStock).length;
  }, [products, sales, cycleDays, bufferPercent, includeZeroSaleLowStock, rows]);

  const activeSupplier = useMemo(
    () => suppliers.find(s => s.id === selectedSupplierId) || null,
    [suppliers, selectedSupplierId]
  );

  const resolvedSupplierName = useMemo(() => {
    if (customAgencyName.trim()) return customAgencyName.trim();
    if (activeSupplier) return activeSupplier.companyName || activeSupplier.name;
    return 'Amul Dairy Depot';
  }, [customAgencyName, activeSupplier]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [products]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter(row => {
      if (selectedCategory !== 'ALL' && row.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      return (
        row.productName.toLowerCase().includes(q) ||
        (row.regionalName && row.regionalName.toLowerCase().includes(q)) ||
        (row.barcode && row.barcode.toLowerCase().includes(q)) ||
        row.category.toLowerCase().includes(q)
      );
    });
  }, [rows, searchQuery, selectedCategory]);

  const selectedItems = useMemo(
    () => rows.filter(r => r.selected && r.orderQty > 0),
    [rows]
  );

  const summary = useMemo(() => {
    const soldSkuCount = rows.filter(r => r.totalSoldInCycle > 0).length;
    const needReorderCount = rows.filter(r => r.suggestedQty > 0).length;
    const selectedCount = selectedItems.length;
    const totalOrderUnits = selectedItems.reduce((sum, r) => sum + r.orderQty, 0);
    const estimatedValue = selectedItems.reduce((sum, r) => sum + r.orderQty * r.purchaseRate, 0);
    return {
      soldSkuCount,
      needReorderCount,
      selectedCount,
      totalOrderUnits: roundMoney3(totalOrderUnits),
      estimatedValue: roundMoney3(estimatedValue)
    };
  }, [rows, selectedItems]);

  const toggleSelectRow = (productId: string) => {
    setRows(prev =>
      prev.map(r => {
        if (r.productId !== productId) return r;
        const nextSelected = !r.selected;
        const nextQty =
          nextSelected && r.orderQty <= 0
            ? r.suggestedQty > 0
              ? r.suggestedQty
              : Math.max(1, r.minStockAlert - r.currentStock)
            : r.orderQty;
        return {
          ...r,
          selected: nextSelected,
          orderQty: nextQty,
          estimatedTotal: roundMoney3(nextQty * r.purchaseRate)
        };
      })
    );
  };

  const handleOrderQtyChange = (productId: string, rawVal: string) => {
    const parsed = rawVal === '' ? 0 : Math.max(0, parseFloat(rawVal) || 0);
    setRows(prev =>
      prev.map(r => {
        if (r.productId !== productId) return r;
        return {
          ...r,
          orderQty: parsed,
          selected: parsed > 0 ? true : r.selected,
          estimatedTotal: roundMoney3(parsed * r.purchaseRate)
        };
      })
    );
  };

  const handlePurchaseRateChange = (productId: string, rawVal: string) => {
    const parsed = rawVal === '' ? 0 : Math.max(0, parseFloat(rawVal) || 0);
    setRows(prev =>
      prev.map(r => {
        if (r.productId !== productId) return r;
        return {
          ...r,
          purchaseRate: parsed,
          estimatedTotal: roundMoney3(r.orderQty * parsed)
        };
      })
    );
  };

  const handleSelectAllFiltered = (checked: boolean) => {
    const visibleIds = new Set(filteredRows.map(r => r.productId));
    setRows(prev =>
      prev.map(r => {
        if (!visibleIds.has(r.productId)) return r;
        const nextQty =
          checked && r.orderQty <= 0
            ? r.suggestedQty > 0
              ? r.suggestedQty
              : Math.max(1, r.minStockAlert - r.currentStock)
            : r.orderQty;
        return {
          ...r,
          selected: checked,
          orderQty: nextQty,
          estimatedTotal: roundMoney3(nextQty * r.purchaseRate)
        };
      })
    );
  };

  const allVisibleSelected =
    filteredRows.length > 0 && filteredRows.every(r => r.selected);

  const whatsappMessage = useMemo(
    () =>
      formatSmartOrderWhatsAppText({
        shop: currentShop,
        supplierName: resolvedSupplierName,
        cycleDays,
        bufferPercent,
        items: rows
      }),
    [currentShop, resolvedSupplierName, cycleDays, bufferPercent, rows]
  );

  const whatsappUrl = useMemo(
    () => buildWhatsAppShareUrl(activeSupplier?.phone, whatsappMessage),
    [activeSupplier?.phone, whatsappMessage]
  );

  const handleWhatsAppShareClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (selectedItems.length === 0) {
      e.preventDefault();
      setStatusMessage({
        type: 'error',
        text: 'કૃપા કરીને ઓર્ડર માટે ઓછામાં ઓછી એક આઇટમ અને જથ્થો (Order Qty > 0) પસંદ કરો.'
      });
      return;
    }
    try {
      await navigator.clipboard?.writeText(whatsappMessage);
      setStatusMessage({
        type: 'info',
        text: `WhatsApp ઓર્ડર લિસ્ટ (${selectedItems.length} આઇટમ્સ) ક્લિપબોર્ડ પર કોપી થઈ ગયું છે અને WhatsApp માં ખુલી રહ્યું છે.`
      });
    } catch {
      setStatusMessage({
        type: 'info',
        text: `WhatsApp માં ${selectedItems.length} આઇટમ્સનો ઓર્ડર મોકલાઈ રહ્યો છે.`
      });
    }
  };

  const handleDownloadPdf = () => {
    if (selectedItems.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'PDF ડાઉનલોડ કરવા માટે ઓછામાં ઓછી એક આઇટમ પસંદ કરો.'
      });
      return;
    }
    downloadSmartOrderPdf({
      shop: currentShop,
      supplierName: resolvedSupplierName,
      cycleDays,
      bufferPercent,
      items: rows
    });
    setStatusMessage({
      type: 'success',
      text: `Smart Order PDF (${selectedItems.length} આઇટમ્સ) સફળતાપૂર્વક ડાઉનલોડ થઈ ગઈ છે.`
    });
  };

  const handleConvertToPendingBill = async () => {
    if (!subCheck.isActive) {
      setStatusMessage({
        type: 'error',
        text: `Cannot create purchase order: ${subCheck.message}.`
      });
      return;
    }
    if (selectedItems.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'પર્ચેઝ બિલમાં મોકલવા માટે ઓછામાં ઓછી એક આઇટમ (Order Qty > 0) પસંદ કરો.'
      });
      return;
    }

    try {
      setIsConverting(true);
      setStatusMessage(null);

      const items: PurchaseItem[] = selectedItems.map(item => ({
        productId: item.productId,
        productName: item.productName,
        barcode: item.barcode,
        quantity: item.orderQty,
        unit: item.unit,
        purchaseRate: item.purchaseRate,
        mrp: item.mrp || item.product.mrp || item.purchaseRate,
        total: roundMoney3(item.orderQty * item.purchaseRate)
      }));

      const subtotal = roundMoney3(items.reduce((sum, i) => sum + i.total, 0));
      const todayIso = new Date().toISOString().slice(0, 10);
      const orderRef = `ORD-${todayIso.replace(/-/g, '').slice(2)}-${Math.floor(100 + Math.random() * 900)}`;

      const created = await AppRepository.purchases.createBill({
        purchaseInvoiceNumber: orderRef,
        billNumber: orderRef,
        agencyName: resolvedSupplierName,
        shopId: currentShop.id,
        supplierId: activeSupplier ? activeSupplier.id : `sup-${Date.now()}`,
        supplierName: resolvedSupplierName,
        purchaseDate: todayIso,
        items,
        itemCount: roundMoney3(items.reduce((sum, i) => sum + i.quantity, 0)),
        subtotal,
        taxAmount: 0,
        otherCharges: 0,
        totalAmount: subtotal,
        paidAmount: 0,
        dueAmount: subtotal,
        status: 'PENDING',
        paymentMode: 'CREDIT',
        stockPosted: false,
        notes: `Smart Order (${cycleDays}d cycle, +${bufferPercent}% buffer) — Awaiting physical stock delivery`,
        idempotencyKey: `smart-ord-${currentShop.id}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
      });

      setStatusMessage({
        type: 'success',
        text: `Pending Purchase Bill #${created.billNumber || created.purchaseInvoiceNumber} Purchases Khata માં સેવ થઈ ગયું છે! (માલ આવે ત્યારે "Receive & Confirm Bill" થી સ્ટોકમાં જમા લો.)`,
        createdBill: created
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Pending બિલ બનાવવામાં ભૂલ: ${err?.message || 'Unknown error'}`
      });
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & KPI Overview */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-xs border border-slate-200/80 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-[#005A9C]" />
              <span>Smart Order</span>
              <span className="text-xs font-bold text-[#E31837] bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 px-2 py-0.5 rounded-lg">
                ઓટો ઓર્ડર &amp; પર્ચેઝ લિસ્ટ
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              છેલ્લા {cycleDays} દિવસના POS વેચાણ (રોજિંદા વેચાણ) મુજબ જ ઓટોમેટિક ખરીદી લિસ્ટ — WhatsApp, PDF અથવા Pending Purchase Bill માં મોકલો.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={onOpenPurchases}
              className="px-3.5 py-2 bg-[#005A9C] hover:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Purchases Khata</span>
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-4">
          <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl p-3">
            <div className="text-[11px] font-bold text-blue-700 dark:text-blue-300 uppercase flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> Sold SKUs (Last {cycleDays}d)
            </div>
            <div className="text-lg font-black font-mono text-blue-900 dark:text-white mt-0.5">
              {summary.soldSkuCount} Items
            </div>
            <div className="text-[10px] text-blue-600 dark:text-blue-400">
              Actual POS sales recorded
            </div>
          </div>

          <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-3">
            <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 uppercase flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Need Reorder (Rec &gt; 0)
            </div>
            <div className="text-lg font-black font-mono text-amber-900 dark:text-white mt-0.5">
              {summary.needReorderCount} Items
            </div>
            <div className="text-[10px] text-amber-700 dark:text-amber-400">
              Pre-checked for {cycleDays}-day demand
            </div>
          </div>

          <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl p-3">
            <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase flex items-center gap-1">
              <Package className="w-3.5 h-3.5" /> Selected for Order
            </div>
            <div className="text-lg font-black font-mono text-emerald-900 dark:text-white mt-0.5">
              {summary.selectedCount} SKUs ({summary.totalOrderUnits} Qty)
            </div>
            <div className="text-[10px] text-emerald-700 dark:text-emerald-400">
              Checked items ready to order
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
            <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#E31837]" /> Estimated Order Value
            </div>
            <div className="text-lg font-black font-mono text-slate-900 dark:text-white mt-0.5">
              ₹{summary.estimatedValue.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              At current purchase cost rates
            </div>
          </div>
        </div>
      </div>

      {/* Inline Status / Feedback Banner */}
      {statusMessage && (
        <div
          role="status"
          className={`rounded-2xl p-4 border flex flex-wrap items-center justify-between gap-3 shadow-xs ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : statusMessage.type === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-blue-50 border-blue-300 text-blue-900'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs font-bold">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          {statusMessage.createdBill && (
            <button
              type="button"
              onClick={onOpenPurchases}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition"
            >
              <span>Purchases Khata ખોલો (Receive &amp; Confirm)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Cycle, Buffer, Supplier & Search Controls */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-xs border border-slate-200/80 dark:border-slate-800 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          {/* Replenishment Cycle Selector */}
          <div className="lg:col-span-5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Replenishment Cycle / ઓર્ડર સમયગાળો
            </label>
            <div className="grid grid-cols-3 gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              {CYCLE_OPTIONS.map(opt => {
                const active = cycleDays === opt.days;
                return (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => setCycleDays(opt.days)}
                    className={`py-2 px-2 rounded-lg text-center transition cursor-pointer ${
                      active
                        ? 'bg-[#005A9C] text-white shadow-xs'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700'
                    }`}
                  >
                    <div className="text-[11px] font-extrabold leading-tight">{opt.title}</div>
                    <div className={`text-[10px] ${active ? 'text-blue-100' : 'text-slate-500'}`}>
                      {opt.guj}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Safety Buffer */}
          <div className="lg:col-span-3">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Safety Buffer / વધારાનો સ્ટોક
            </label>
            <div className="grid grid-cols-3 gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              {BUFFER_OPTIONS.map(buf => {
                const active = bufferPercent === buf;
                return (
                  <button
                    key={buf}
                    type="button"
                    onClick={() => setBufferPercent(buf)}
                    className={`py-2.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                      active
                        ? 'bg-[#E31837] text-white shadow-xs'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700'
                    }`}
                  >
                    {buf === 0 ? '0%' : `+${buf}%`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Supplier / Agency Selector */}
          <div className="lg:col-span-4">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Supplier / Agency / સપ્લાયર એજન્સી
            </label>
            <div className="flex gap-2">
              <select
                value={selectedSupplierId}
                onChange={e => {
                  const id = e.target.value;
                  setSelectedSupplierId(id);
                  const found = suppliers.find(s => s.id === id);
                  if (found) setCustomAgencyName(found.companyName || found.name);
                }}
                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100"
              >
                {suppliers.length === 0 ? (
                  <option value="">Default Amul Agency</option>
                ) : (
                  suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.companyName || s.name} {s.phone ? `(${s.phone})` : ''}
                    </option>
                  ))
                )}
              </select>
              <input
                type="text"
                value={customAgencyName}
                onChange={e => setCustomAgencyName(e.target.value)}
                placeholder="Agency Name"
                className="w-40 px-2.5 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold"
              />
            </div>
          </div>
        </div>

        {/* Search, Category Filter & Catalog Mode */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search item, Gujarati name, barcode..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat === 'ALL' ? 'All Categories' : cat}
                </option>
              ))}
            </select>

            <div className="inline-flex items-center gap-2.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold select-none">
              <button
                id="toggle-zero-sale-low-stock"
                type="button"
                role="switch"
                aria-checked={includeZeroSaleLowStock}
                onClick={() => setIncludeZeroSaleLowStock(prev => !prev)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                  includeZeroSaleLowStock ? 'bg-[#005A9C]' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    includeZeroSaleLowStock ? 'translate-x-4.5' : 'translate-x-1'
                  }`}
                />
              </button>
              <label
                htmlFor="toggle-zero-sale-low-stock"
                className="text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Also show 0-sale low stock items (ઓછા સ્ટોક વાળી અન્ય આઈટમ બતાવો)
                {zeroSaleLowStockCount > 0 ? (
                  <span className="ml-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                    {zeroSaleLowStockCount}
                  </span>
                ) : null}
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSelectAllFiltered(!allVisibleSelected)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold cursor-pointer transition"
            >
              {allVisibleSelected ? 'Deselect All Visible' : 'Select All Visible'}
            </button>
          </div>
        </div>
      </div>

      {/* Editable Order Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[920px]">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={e => handleSelectAllFiltered(e.target.checked)}
                    aria-label="Select all visible smart order items"
                    className="rounded border-slate-300 text-[#005A9C] focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-3">Product Name</th>
                <th className="py-3 px-2 text-right">
                  Last {cycleDays}d Sold Qty
                  <div className="text-[9px] font-semibold text-slate-400 normal-case">કુલ વેચાણ</div>
                </th>
                <th className="py-3 px-2 text-right">
                  Avg Daily Sale
                  <div className="text-[9px] font-semibold text-slate-400 normal-case">રોજનું વેચાણ</div>
                </th>
                <th className="py-3 px-2 text-right">
                  Current Stock
                  <div className="text-[9px] font-semibold text-slate-400 normal-case">હાલનો સ્ટોક</div>
                </th>
                <th className="py-3 px-2 text-right">
                  Recommended Order Qty
                  <div className="text-[9px] font-semibold text-slate-400 normal-case">મંગાવવાનો જથ્થો</div>
                </th>
                <th className="py-3 px-2 text-right">Order Qty (Edit)</th>
                <th className="py-3 px-2 text-right">Purchase Rate (₹)</th>
                <th className="py-3 px-3 text-right">Estimated Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 px-4 text-center text-slate-500 font-sans">
                    {rows.length === 0 ? (
                      <div className="max-w-md mx-auto space-y-1.5">
                        <div className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
                          પસંદ કરેલ દિવસોમાં કોઈ વેચાણ નોંધાયું નથી
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          No POS sales were recorded in the last {cycleDays} days. Try selecting 15 or 30 days, or enable &ldquo;Also show 0-sale low stock items&rdquo; above.
                        </div>
                      </div>
                    ) : (
                      <span>શોધ અથવા કેટેગરી મુજબ કોઈ આઈટમ મળી નથી.</span>
                    )}
                  </td>
                </tr>
              ) : (
                filteredRows.map(row => {
                  const isZeroStock = row.currentStock <= 0;
                  return (
                    <tr
                      key={row.productId}
                      className={`transition ${
                        row.selected
                          ? 'bg-blue-50/35 dark:bg-blue-950/20 hover:bg-blue-50/70'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={() => toggleSelectRow(row.productId)}
                          aria-label={`Select ${row.productName}`}
                          className="rounded border-slate-300 text-[#005A9C] focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {row.productName}
                          </span>
                          {isZeroStock ? (
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">
                              OUT OF STOCK
                            </span>
                          ) : row.isLowStock ? (
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                              LOW STOCK
                            </span>
                          ) : null}
                          {row.totalSoldInCycle === 0 ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              0 SALE
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[10px] text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                          {row.regionalName && <span>{row.regionalName}</span>}
                          <span className="text-blue-700 dark:text-blue-400 font-semibold">{row.category}</span>
                          {row.barcode && <span className="font-mono">• {row.barcode}</span>}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {row.totalSoldInCycle}
                        </div>
                        <div className="text-[10px] text-slate-400 font-sans">
                          in {cycleDays} days
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          {row.avgDailySales.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-sans">
                          per day
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <span
                          className={`font-bold ${
                            isZeroStock
                              ? 'text-rose-600'
                              : row.isLowStock
                              ? 'text-amber-700'
                              : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {row.currentStock}
                        </span>{' '}
                        <span className="text-[10px] text-slate-400 font-sans">{row.unit}</span>
                        <div className="text-[9px] text-slate-400 font-sans">
                          Min: {row.minStockAlert}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-lg font-extrabold ${
                            row.suggestedQty > 0
                              ? 'bg-blue-100 text-[#005A9C]'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {row.suggestedQty}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <div className="inline-flex items-center gap-1 justify-end font-sans">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={row.orderQty}
                            onChange={e => handleOrderQtyChange(row.productId, e.target.value)}
                            className="w-20 px-2 py-1 text-right bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                          />
                          <span className="text-[10px] text-slate-500">{row.unit}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <div className="inline-flex items-center gap-0.5 justify-end font-sans">
                          <span className="text-slate-400 text-[11px]">₹</span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={row.purchaseRate}
                            onChange={e => handlePurchaseRateChange(row.productId, e.target.value)}
                            className="w-20 px-2 py-1 text-right bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                          />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-slate-900 dark:text-white">
                        ₹{(row.orderQty * row.purchaseRate).toFixed(2)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Sticky Action Bar */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-sans">
            <span className="font-bold text-slate-700 dark:text-slate-200">
              Selected: {summary.selectedCount} items ({summary.totalOrderUnits} units)
            </span>
            <span className="mx-2 text-slate-300">|</span>
            <span className="font-black font-mono text-sm text-[#005A9C] dark:text-blue-300">
              Est. Total: ₹{summary.estimatedValue.toFixed(2)}
            </span>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Notice: Converting creates a PENDING Purchase Bill without changing current stock until delivery is confirmed.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleWhatsAppShareClick}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Send Order on WhatsApp</span>
            </a>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={selectedItems.length === 0}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span>Download Order PDF</span>
            </button>

            <button
              type="button"
              onClick={handleConvertToPendingBill}
              disabled={isConverting || selectedItems.length === 0 || !subCheck.isActive}
              className="px-5 py-2.5 bg-[#005A9C] hover:bg-blue-800 disabled:bg-slate-300 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md transition cursor-pointer disabled:cursor-not-allowed"
            >
              <FilePlus2 className="w-4 h-4" />
              <span>
                {isConverting
                  ? 'Saving Pending Bill...'
                  : 'Convert to Purchase Bill / ઓર્ડર ને પર્ચેઝ બિલમાં મોકલો'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
