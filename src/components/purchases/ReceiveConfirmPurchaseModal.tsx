/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Receive & Confirm Pending Purchase Bill Modal ("બિલ જમા લો")
 * Opens for PENDING / DRAFT bills (such as orders converted from Smart Order):
 * - Pre-fills Supplier/Agency and ordered items.
 * - Requires Invoice/Bill Number (બિલ નંબર) & Invoice/Bill Date (બિલની તારીખ).
 * - Allows editing Received Qty, Purchase Rate, MRP, removing items, or adding extra catalog/new items.
 * - On "Confirm & Add to Stock / બિલ જમા કરો": transitions status -> CONFIRMED,
 *   increments currentStock once & syncs Products + PurchaseBill + Supplier to IndexedDB & Cloud Firestore.
 */

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  PackageCheck,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
import {
  PaymentMode,
  Product,
  ProductCategory,
  PurchaseBill,
  PurchaseItem,
  Shop,
  Supplier
} from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';
import { roundMoney3 } from '../../utils/smartOrderCalculator.ts';

interface ReceiveConfirmPurchaseModalProps {
  bill: PurchaseBill;
  shop: Shop;
  suppliers: Supplier[];
  products: Product[];
  onClose: () => void;
  onConfirmed: (updatedBill: PurchaseBill) => Promise<void> | void;
  onProductCreated: (product: Product) => void;
}

const PRODUCT_CATEGORIES: ProductCategory[] = [
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

const PRODUCT_UNITS: Product['unit'][] = [
  'Pouch',
  'Pack',
  'Cup',
  'Cone',
  'Tub',
  'Bottle',
  'Tin',
  'Brick',
  'Kg',
  'Litre',
  'Piece'
];

export const ReceiveConfirmPurchaseModal: React.FC<ReceiveConfirmPurchaseModalProps> = ({
  bill,
  shop,
  suppliers,
  products,
  onClose,
  onConfirmed,
  onProductCreated
}) => {
  const originalRef = bill.billNumber || bill.purchaseInvoiceNumber || '';
  const isOrderPlaceholder = /^(ORD-|SMART-)/i.test(originalRef);

  const [selectedSupplierId, setSelectedSupplierId] = useState(bill.supplierId || '');
  const [agencyName, setAgencyName] = useState(bill.agencyName || bill.supplierName || '');
  const [billNumber, setBillNumber] = useState(isOrderPlaceholder ? '' : originalRef);
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<PurchaseItem[]>(() => bill.items.map(it => ({ ...it })));
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(bill.paymentMode || 'CREDIT');
  const [paidAmount, setPaidAmount] = useState<string | number>(bill.paidAmount || 0);
  const [notes, setNotes] = useState(bill.notes || '');

  // "+ Add Item / નવી આઈટમ ઉમેરો" Search & Quick-Add state
  const [showAddItemPanel, setShowAddItemPanel] = useState(false);
  const [addItemMode, setAddItemMode] = useState<'CATALOG' | 'NEW_PRODUCT'>('CATALOG');
  const [catalogSearch, setCatalogSearch] = useState('');

  // Quick-create new product fields
  const [newProdName, setNewProdName] = useState('');
  const [newProdRegional, setNewProdRegional] = useState('');
  const [newProdBarcode, setNewProdBarcode] = useState('');
  const [newProdCategory, setNewProdCategory] = useState<ProductCategory>('Milk');
  const [newProdUnit, setNewProdUnit] = useState<Product['unit']>('Pack');
  const [newProdQty, setNewProdQty] = useState<string | number>(10);
  const [newProdRate, setNewProdRate] = useState<string | number>(0);
  const [newProdMrp, setNewProdMrp] = useState<string | number>(0);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  const matchingCatalogProducts = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    const list = !q
      ? products
      : products.filter(
          p =>
            p.name.toLowerCase().includes(q) ||
            (p.regionalName && p.regionalName.toLowerCase().includes(q)) ||
            (p.barcode && p.barcode.toLowerCase().includes(q)) ||
            p.category.toLowerCase().includes(q)
        );
    return list.slice(0, 25);
  }, [products, catalogSearch]);

  const grandTotal = useMemo(
    () => roundMoney3(items.reduce((sum, it) => sum + (Number(it.total) || 0), 0)),
    [items]
  );

  const numPaid = Math.min(grandTotal, Math.max(0, parseFloat(String(paidAmount)) || 0));
  const dueAmount =
    numPaid >= grandTotal - 0.0001 ? 0 : Math.max(0, roundMoney3(grandTotal - numPaid));

  const handleUpdateQty = (idx: number, raw: string) => {
    const parsed = raw === '' ? 0 : Math.max(0, parseFloat(raw) || 0);
    setItems(prev =>
      prev.map((it, i) =>
        i === idx
          ? {
              ...it,
              quantity: parsed,
              total: roundMoney3(parsed * it.purchaseRate)
            }
          : it
      )
    );
  };

  const handleUpdateRate = (idx: number, raw: string) => {
    const parsed = raw === '' ? 0 : Math.max(0, parseFloat(raw) || 0);
    setItems(prev =>
      prev.map((it, i) =>
        i === idx
          ? {
              ...it,
              purchaseRate: parsed,
              total: roundMoney3(it.quantity * parsed)
            }
          : it
      )
    );
  };

  const handleUpdateMrp = (idx: number, raw: string) => {
    const parsed = raw === '' ? 0 : Math.max(0, parseFloat(raw) || 0);
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, mrp: parsed } : it)));
  };

  const handleRemoveItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAddCatalogProduct = (prod: Product) => {
    setErrorMsg('');
    const existingIdx = items.findIndex(it => it.productId === prod.id);
    if (existingIdx >= 0) {
      setItems(prev =>
        prev.map((it, i) => {
          if (i !== existingIdx) return it;
          const nextQty = roundMoney3(it.quantity + 1);
          return {
            ...it,
            quantity: nextQty,
            total: roundMoney3(nextQty * it.purchaseRate)
          };
        })
      );
    } else {
      const rate = Number(prod.costPrice) || 0;
      const newItem: PurchaseItem = {
        productId: prod.id,
        productName: prod.name,
        barcode: prod.barcode || '',
        quantity: 1,
        unit: prod.unit,
        purchaseRate: rate,
        mrp: Number(prod.mrp) || rate,
        total: roundMoney3(rate)
      };
      setItems(prev => [...prev, newItem]);
    }
    setCatalogSearch('');
  };

  const handleQuickCreateAndAddProduct = async () => {
    const trimmedName = newProdName.trim();
    const qty = parseFloat(String(newProdQty)) || 0;
    const rate = parseFloat(String(newProdRate)) || 0;
    const mrp = parseFloat(String(newProdMrp)) || rate;

    if (!trimmedName) {
      setErrorMsg('કૃપા કરીને નવી પ્રોડક્ટનું નામ દાખલ કરો.');
      return;
    }
    if (qty <= 0) {
      setErrorMsg('નવી પ્રોડક્ટ માટે પ્રાપ્ત જથ્થો (Qty) 0 કરતાં વધુ હોવો જોઈએ.');
      return;
    }

    try {
      setIsCreatingProduct(true);
      setErrorMsg('');
      const nowIso = new Date().toISOString();
      const barcode = newProdBarcode.trim() || `AMUL-${Date.now().toString().slice(-8)}`;
      const sku = trimmedName
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 18);

      const newProduct: Product = {
        id: `prod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        shopId: shop.id,
        barcode,
        sku: sku || barcode,
        name: trimmedName,
        regionalName: newProdRegional.trim() || undefined,
        category: newProdCategory,
        unit: newProdUnit,
        mrp,
        costPrice: rate,
        sellingPrice: mrp,
        // Start with 0 stock; Confirm & Add to Stock increments it atomically once
        currentStock: 0,
        minStockAlert: 5,
        isActive: true,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      const saved = await AppRepository.products.save(newProduct);
      onProductCreated(saved);

      setItems(prev => [
        ...prev,
        {
          productId: saved.id,
          productName: saved.name,
          barcode: saved.barcode,
          quantity: qty,
          unit: saved.unit,
          purchaseRate: rate,
          mrp,
          total: roundMoney3(qty * rate)
        }
      ]);

      setNewProdName('');
      setNewProdRegional('');
      setNewProdBarcode('');
      setNewProdQty(10);
      setNewProdRate(0);
      setNewProdMrp(0);
      setShowAddItemPanel(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'નવી પ્રોડક્ટ સેવ કરવામાં ભૂલ આવી.');
    } finally {
      setIsCreatingProduct(false);
    }
  };

  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanBillNo = billNumber.trim();
    if (!cleanBillNo) {
      setErrorMsg('કૃપા કરીને એજન્સીનો બિલ નંબર (Invoice / Bill Number) દાખલ કરો.');
      return;
    }
    if (!purchaseDate) {
      setErrorMsg('કૃપા કરીને બિલની તારીખ (Bill Date) પસંદ કરો.');
      return;
    }
    if (items.length === 0) {
      setErrorMsg('બિલ જમા કરવા માટે ઓછામાં ઓછી એક આઈટમ હોવી જરૂરી છે.');
      return;
    }
    if (items.some(it => (Number(it.quantity) || 0) <= 0)) {
      setErrorMsg('દરેક આઈટમનો જથ્થો (Received Qty) 0 કરતાં વધુ હોવો જોઈએ.');
      return;
    }

    const chosenSupplier = suppliers.find(s => s.id === selectedSupplierId);
    const chosenAgency =
      agencyName.trim() ||
      (chosenSupplier ? chosenSupplier.companyName || chosenSupplier.name : bill.agencyName || bill.supplierName);

    try {
      setIsConfirming(true);
      const updated = await AppRepository.purchases.updateBill(bill.id, shop.id, {
        purchaseInvoiceNumber: cleanBillNo,
        billNumber: cleanBillNo,
        agencyName: chosenAgency,
        supplierId: chosenSupplier ? chosenSupplier.id : selectedSupplierId || bill.supplierId,
        supplierName: chosenAgency,
        purchaseDate,
        items,
        paymentMode,
        paidAmount: numPaid,
        status: 'CONFIRMED',
        notes: notes.trim() || undefined
      });
      await onConfirmed(updated);
    } catch (err: any) {
      setErrorMsg(err?.message || 'બિલ કન્ફર્મ કરવામાં ભૂલ આવી.');
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-4xl w-full p-5 sm:p-6 my-4 max-h-[94vh] flex flex-col border border-slate-200 dark:border-slate-700">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex flex-wrap items-center gap-2">
                <span>Receive &amp; Confirm Purchase Bill</span>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                  બિલ જમા લો
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Order Ref: <strong className="font-mono">{originalRef}</strong> — Verify delivered quantities, rates &amp; invoice number to add stock and update Supplier Khata.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleConfirmSubmit} className="space-y-4 overflow-y-auto flex-1 pr-1 pt-4">
          {errorMsg && (
            <div
              role="alert"
              className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs font-bold text-rose-800 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Invoice & Supplier Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Supplier / Agency *
              </label>
              <select
                value={selectedSupplierId}
                onChange={e => {
                  const id = e.target.value;
                  setSelectedSupplierId(id);
                  const found = suppliers.find(s => s.id === id);
                  if (found) setAgencyName(found.companyName || found.name);
                }}
                className="w-full px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold mb-1.5"
              >
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.companyName || s.name}
                  </option>
                ))}
                {!suppliers.some(s => s.id === selectedSupplierId) && agencyName && (
                  <option value={selectedSupplierId}>{agencyName}</option>
                )}
              </select>
              <input
                type="text"
                value={agencyName}
                onChange={e => setAgencyName(e.target.value)}
                placeholder="Agency / એજન્સીનું નામ"
                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Invoice / Bill Number (બિલ નંબર) *
              </label>
              <input
                type="text"
                required
                autoFocus
                value={billNumber}
                onChange={e => {
                  setBillNumber(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="Enter Invoice / Bill No. (e.g. INV-4521)"
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border-2 border-emerald-400 rounded-xl font-mono text-xs font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
              {isOrderPlaceholder && (
                <div className="text-[10px] text-amber-700 mt-1 font-semibold">
                  Order Ref: {originalRef} (Enter supplier's actual bill #)
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Invoice / Bill Date (બિલની તારીખ) *
              </label>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={e => setPurchaseDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* "+ Add Item / નવી આઈટમ ઉમેરો" Trigger + Search / Quick-Add Panel */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                Delivered Items ({items.length} SKUs) — Edit Qty, Purchase Rate &amp; MRP if changed
              </div>
              <button
                type="button"
                onClick={() => setShowAddItemPanel(v => !v)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Item / નવી આઈટમ ઉમેરો</span>
              </button>
            </div>

            {showAddItemPanel && (
              <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAddItemMode('CATALOG')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition ${
                        addItemMode === 'CATALOG'
                          ? 'bg-[#005A9C] text-white'
                          : 'bg-white text-slate-700 border border-slate-200'
                      }`}
                    >
                      Search Catalog / કેટલોગમાંથી ઉમેરો
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddItemMode('NEW_PRODUCT')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition ${
                        addItemMode === 'NEW_PRODUCT'
                          ? 'bg-[#E31837] text-white'
                          : 'bg-white text-slate-700 border border-slate-200'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Quick-Create New Product</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddItemPanel(false)}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 px-2 py-1 cursor-pointer"
                  >
                    Close
                  </button>
                </div>

                {addItemMode === 'CATALOG' ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-blue-500 absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        type="text"
                        value={catalogSearch}
                        onChange={e => setCatalogSearch(e.target.value)}
                        placeholder="Search Product Name, Gujarati name, Barcode or Category to add..."
                        className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-blue-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>
                    <div className="max-h-44 overflow-y-auto bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                      {matchingCatalogProducts.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-500">
                          No matching products found. Switch to "Quick-Create New Product" to add it.
                        </div>
                      ) : (
                        matchingCatalogProducts.map(p => (
                          <div
                            key={p.id}
                            className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-blue-50/70 dark:hover:bg-slate-800 text-xs"
                          >
                            <div className="truncate">
                              <div className="font-bold text-slate-900 dark:text-white truncate">
                                {p.name}{' '}
                                {p.regionalName && (
                                  <span className="text-slate-500 font-normal">({p.regionalName})</span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {p.category} • Stock: {p.currentStock} {p.unit} • Rate ₹{p.costPrice.toFixed(2)} • MRP ₹{p.mrp.toFixed(2)}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAddCatalogProduct(p)}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold shrink-0 cursor-pointer"
                            >
                              + Add
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Product Name *</label>
                      <input
                        type="text"
                        value={newProdName}
                        onChange={e => setNewProdName(e.target.value)}
                        placeholder="e.g. Amul Kool Kesar 200ml"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Gujarati Name (Optional)</label>
                      <input
                        type="text"
                        value={newProdRegional}
                        onChange={e => setNewProdRegional(e.target.value)}
                        placeholder="e.g. અમૂલ કૂલ કેસર"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Barcode (Auto if blank)</label>
                      <input
                        type="text"
                        value={newProdBarcode}
                        onChange={e => setNewProdBarcode(e.target.value)}
                        placeholder="8901262..."
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Category</label>
                      <select
                        value={newProdCategory}
                        onChange={e => setNewProdCategory(e.target.value as ProductCategory)}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold"
                      >
                        {PRODUCT_CATEGORIES.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Unit</label>
                      <select
                        value={newProdUnit}
                        onChange={e => setNewProdUnit(e.target.value as Product['unit'])}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold"
                      >
                        {PRODUCT_UNITS.map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Received Qty *</label>
                      <input
                        type="number"
                        step="any"
                        min="0.001"
                        value={newProdQty}
                        onChange={e => setNewProdQty(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-blue-300 rounded-lg text-xs font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Purchase Rate (₹) *</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={newProdRate}
                        onChange={e => setNewProdRate(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">MRP (₹)</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={newProdMrp}
                        onChange={e => setNewProdMrp(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                    <div className="col-span-2 flex items-end justify-end">
                      <button
                        type="button"
                        disabled={isCreatingProduct}
                        onClick={handleQuickCreateAndAddProduct}
                        className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer transition disabled:opacity-60"
                      >
                        {isCreatingProduct ? 'Creating...' : 'Create Product & Add to Bill'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Editable Items Table */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[620px]">
              <thead className="bg-slate-50 dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 text-[10px] uppercase">
                <tr>
                  <th className="py-2 px-3">Item Name &amp; Barcode</th>
                  <th className="py-2 px-2 text-right">Received Qty (જથ્થો)</th>
                  <th className="py-2 px-2 text-right">Purchase Rate (ખરીદ ભાવ ₹)</th>
                  <th className="py-2 px-2 text-right">MRP (₹)</th>
                  <th className="py-2 px-3 text-right">Line Total</th>
                  <th className="py-2 px-2 text-center">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-5 text-center text-slate-400 font-sans">
                      No items in this bill. Use "+ Add Item / નવી આઈટમ ઉમેરો" above to add items.
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => (
                    <tr key={`${item.productId}-${idx}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 font-sans">
                        <div className="font-bold text-slate-900 dark:text-white">{item.productName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{item.barcode || 'No barcode'}</div>
                      </td>
                      <td className="py-2 px-2 text-right">
                        <div className="inline-flex items-center gap-1 justify-end font-sans">
                          <input
                            type="number"
                            step="any"
                            min="0.001"
                            value={item.quantity}
                            onChange={e => handleUpdateQty(idx, e.target.value)}
                            className="w-20 px-1.5 py-1 text-right bg-white dark:bg-slate-900 border border-emerald-400 rounded-md text-xs font-mono font-bold focus:ring-1 focus:ring-emerald-500"
                          />
                          <span className="text-[10px] text-slate-500">{item.unit}</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right">
                        <div className="inline-flex items-center gap-0.5 justify-end font-sans">
                          <span className="text-slate-400 text-[11px]">₹</span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={item.purchaseRate}
                            onChange={e => handleUpdateRate(idx, e.target.value)}
                            className="w-20 px-1.5 py-1 text-right bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-xs font-mono font-bold"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right">
                        <div className="inline-flex items-center gap-0.5 justify-end font-sans">
                          <span className="text-slate-400 text-[11px]">₹</span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={item.mrp}
                            onChange={e => handleUpdateMrp(idx, e.target.value)}
                            className="w-20 px-1.5 py-1 text-right bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-xs font-mono"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-black text-slate-900 dark:text-white">
                        ₹{item.total.toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                          title="Remove item"
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

          {/* Payment & Grand Total Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Payment Mode
              </label>
              <select
                value={paymentMode}
                onChange={e => setPaymentMode(e.target.value as PaymentMode)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold"
              >
                <option value="CREDIT">Distributor Credit (Pay later)</option>
                <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                <option value="UPI">UPI</option>
                <option value="CASH">Cash</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                <span>Paid Amount Now (₹)</span>
                <button
                  type="button"
                  onClick={() => setPaidAmount(grandTotal)}
                  className="text-[10px] text-blue-600 hover:underline font-extrabold cursor-pointer"
                >
                  Pay Full
                </button>
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={paidAmount}
                onChange={e => setPaidAmount(e.target.value === '' ? '' : e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Notes (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Delivery remarks..."
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs"
              />
            </div>
          </div>

          <div className="bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl p-3.5 border border-emerald-200 dark:border-emerald-800 text-xs font-mono space-y-1">
            <div className="flex justify-between">
              <span className="font-sans font-bold text-slate-700 dark:text-slate-200">
                Grand Total (Confirming Stock Value):
              </span>
              <span className="font-black text-base text-slate-900 dark:text-white">
                ₹{grandTotal.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-emerald-700 dark:text-emerald-300">
              <span>Paid Now:</span>
              <span className="font-bold">₹{numPaid.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-rose-700 dark:text-rose-300 font-bold border-t border-emerald-200/70 pt-1">
              <span>Balance Added to Supplier Khata:</span>
              <span>₹{dueAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={isConfirming}
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-900 text-xs font-bold rounded-xl hover:bg-slate-100 cursor-pointer transition"
            >
              Cancel / રદ કરો
            </button>
            <button
              type="submit"
              disabled={isConfirming || items.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-slate-300 text-white px-5 py-2.5 rounded-xl text-xs font-extrabold shadow-md flex items-center gap-1.5 cursor-pointer transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isConfirming
                  ? 'Adding Stock & Confirming...'
                  : 'Confirm & Add to Stock / બિલ જમા કરો'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
