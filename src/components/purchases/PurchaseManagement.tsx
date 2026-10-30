/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Purchase Bill Entry & Supplier Ledger Component
 * Enforces critical business rules:
 * - Confirmed purchases automatically increase stock exactly once.
 * - Draft or cancelled purchases must NOT increase stock.
 * - Supplier balance ledger and payment tracking.
 */

import React, { useState, useEffect } from 'react';
import { 
  Truck, 
  Plus, 
  Calendar, 
  Search, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Users, 
  FileText, 
  Building, 
  ArrowUpRight, 
  AlertCircle, 
  DollarSign, 
  RefreshCw,
  Eye,
  Trash2,
  Edit3
} from 'lucide-react';
import { Product, PurchaseBill, PurchaseItem, PurchaseBillStatus, PaymentMode, Shop, Supplier } from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';
import { isShopSubscriptionActive } from '../../storage/subscription.ts';

interface PurchaseManagementProps {
  currentShop: Shop;
  onStockUpdated?: () => void;
}

export const PurchaseManagement: React.FC<PurchaseManagementProps> = ({ currentShop, onStockUpdated }) => {
  const [activeSubTab, setActiveSubTab] = useState<'PURCHASES' | 'SUPPLIERS'>('PURCHASES');
  const [purchases, setPurchases] = useState<PurchaseBill[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // 1-Month Plan Subscription Check
  const subCheck = isShopSubscriptionActive(currentShop);

  // Purchase Modal State
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<PurchaseBill | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [purchaseStatus, setPurchaseStatus] = useState<PurchaseBillStatus>('CONFIRMED');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('BANK_TRANSFER');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);

  // Item row input state
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemQty, setItemQty] = useState<number>(10);
  const [itemRate, setItemRate] = useState<number>(0);

  // Supplier Modal State
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [supplierGstin, setSupplierGstin] = useState('');
  const [openingBalance, setOpeningBalance] = useState<number>(0);

  // Supplier Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [payingSupplier, setPayingSupplier] = useState<Supplier | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentReference, setPaymentReference] = useState('');

  // View purchase details modal
  const [viewingPurchase, setViewingPurchase] = useState<PurchaseBill | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [purList, supList, prodList] = await Promise.all([
        AppRepository.purchases.getByShop(currentShop.id),
        AppRepository.suppliers.getAll(currentShop.id),
        AppRepository.products.getByShop(currentShop.id)
      ]);
      setPurchases(purList);
      setSuppliers(supList);
      setProducts(prodList);
      if (supList.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(supList[0].id);
      }
      if (prodList.length > 0 && !selectedProductId) {
        setSelectedProductId(prodList[0].id);
        setItemRate(prodList[0].costPrice);
      }
    } catch (err) {
      console.error('Failed to load purchase data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentShop.id]);

  // When selected product changes in row, pre-fill rate
  useEffect(() => {
    const prod = products.find(p => p.id === selectedProductId);
    if (prod) {
      setItemRate(prod.costPrice);
    }
  }, [selectedProductId, products]);

  // Add Item to Purchase Items Table
  const handleAddItem = () => {
    const prod = products.find(p => p.id === selectedProductId);
    if (!prod || itemQty <= 0 || itemRate <= 0) return;

    const existingIndex = purchaseItems.findIndex(i => i.productId === prod.id);
    if (existingIndex >= 0) {
      const updated = [...purchaseItems];
      updated[existingIndex].quantity += itemQty;
      updated[existingIndex].purchaseRate = itemRate;
      updated[existingIndex].total = updated[existingIndex].quantity * itemRate;
      setPurchaseItems(updated);
    } else {
      const newItem: PurchaseItem = {
        productId: prod.id,
        productName: prod.name,
        barcode: prod.barcode,
        quantity: itemQty,
        unit: prod.unit,
        purchaseRate: itemRate,
        mrp: prod.mrp,
        total: itemQty * itemRate
      };
      setPurchaseItems([...purchaseItems, newItem]);
    }

    setItemQty(10);
  };

  const handleRemoveItem = (index: number) => {
    setPurchaseItems(purchaseItems.filter((_, idx) => idx !== index));
  };

  // Direct editing of item quantity in purchase bill
  const updateItemQuantity = (index: number, newQty: number) => {
    if (newQty < 1 || isNaN(newQty)) return;
    const updated = [...purchaseItems];
    updated[index].quantity = newQty;
    updated[index].total = newQty * updated[index].purchaseRate;
    setPurchaseItems(updated);
  };

  // Direct editing of item purchase price / rate in purchase bill
  const updateItemRate = (index: number, newRate: number) => {
    if (newRate < 0 || isNaN(newRate)) return;
    const updated = [...purchaseItems];
    updated[index].purchaseRate = newRate;
    updated[index].total = updated[index].quantity * newRate;
    setPurchaseItems(updated);
  };

  const openNewPurchaseModal = () => {
    if (!subCheck.isActive) {
      alert(`Cannot record new purchase: ${subCheck.message}. All previous purchases and supplier balances are preserved.`);
      return;
    }
    setEditingPurchase(null);
    setPurchaseItems([]);
    setInvoiceNumber(`INV-AMUL-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`);
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setPurchaseStatus('CONFIRMED');
    setPaymentMode('BANK_TRANSFER');
    setPaidAmount(0);
    setNotes('');
    if (suppliers.length > 0) setSelectedSupplierId(suppliers[0].id);
    if (products.length > 0) {
      setSelectedProductId(products[0].id);
      setItemRate(products[0].costPrice);
    }
    setIsPurchaseModalOpen(true);
  };

  const openEditPurchaseModal = (p: PurchaseBill) => {
    if (!subCheck.isActive) {
      alert(`Shop plan is expired (${subCheck.expiryFormatted || 'Expired'}). Editing purchases is locked in Read-Only mode.`);
      return;
    }
    setEditingPurchase(p);
    setInvoiceNumber(p.purchaseInvoiceNumber);
    setSelectedSupplierId(p.supplierId);
    setPurchaseDate(p.purchaseDate);
    setPurchaseStatus(p.status);
    setPaymentMode(p.paymentMode);
    setPaidAmount(p.paidAmount);
    setNotes(p.notes || '');
    setPurchaseItems(p.items.map(it => ({ ...it })));
    setIsPurchaseModalOpen(true);
  };

  // Totals
  const subtotal = purchaseItems.reduce((acc, item) => acc + item.total, 0);
  const totalAmount = subtotal;
  const dueAmount = Math.max(0, totalAmount - (paidAmount || 0));

  // Save or Update Purchase Bill
  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subCheck.isActive) {
      alert(`Cannot record purchase: ${subCheck.message}. All previous purchases and supplier balances remain safely preserved.`);
      return;
    }

    if (purchaseItems.length === 0) {
      alert('Please add at least one product item to the purchase bill.');
      return;
    }

    const supplier = suppliers.find(s => s.id === selectedSupplierId);
    if (!supplier) {
      alert('Please select a supplier.');
      return;
    }

    try {
      if (editingPurchase) {
        await AppRepository.purchases.updateBill(editingPurchase.id, currentShop.id, {
          purchaseInvoiceNumber: invoiceNumber.trim() || editingPurchase.purchaseInvoiceNumber,
          supplierId: supplier.id,
          supplierName: supplier.companyName || supplier.name,
          purchaseDate,
          items: purchaseItems,
          paidAmount: Math.min(paidAmount || 0, totalAmount),
          status: purchaseStatus,
          paymentMode,
          notes: notes.trim() || undefined
        });
      } else {
        const datePart = purchaseDate.replace(/-/g, '');
        const invNum = invoiceNumber.trim() || `PUR-${datePart}-${Math.floor(1000 + Math.random() * 9000)}`;
        const idempotencyKey = `pur-idemp-${currentShop.id}-${invNum}-${Date.now()}`;

        await AppRepository.purchases.createBill({
          purchaseInvoiceNumber: invNum,
          shopId: currentShop.id,
          supplierId: supplier.id,
          supplierName: supplier.companyName || supplier.name,
          purchaseDate,
          items: purchaseItems,
          itemCount: purchaseItems.reduce((sum, i) => sum + i.quantity, 0),
          subtotal,
          taxAmount: 0,
          otherCharges: 0,
          totalAmount,
          paidAmount: Math.min(paidAmount || 0, totalAmount),
          dueAmount,
          status: purchaseStatus,
          paymentMode,
          notes: notes.trim() || undefined,
          idempotencyKey,
          stockPosted: purchaseStatus === 'CONFIRMED'
        });
      }

      setIsPurchaseModalOpen(false);
      setEditingPurchase(null);
      setPurchaseItems([]);
      setInvoiceNumber('');
      setPaidAmount(0);
      setNotes('');
      await loadData();
      onStockUpdated?.();
    } catch (err: any) {
      alert(`Failed to save purchase bill: ${err.message}`);
    }
  };

  // Cancel Purchase Bill
  const handleCancelPurchase = async (billId: string) => {
    const reason = window.prompt('Enter reason for cancelling this purchase bill (Stock will be deducted back):');
    if (!reason) return;

    try {
      await AppRepository.purchases.cancelBill(billId, currentShop.id, reason);
      await loadData();
      onStockUpdated?.();
    } catch (err: any) {
      alert(`Failed to cancel purchase: ${err.message}`);
    }
  };

  // Save New Supplier
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim()) return;

    try {
      await AppRepository.suppliers.save({
        id: `sup-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        shopId: currentShop.id,
        name: supplierName.trim(),
        companyName: companyName.trim() || supplierName.trim(),
        phone: supplierPhone.trim(),
        email: supplierEmail.trim() || undefined,
        gstin: supplierGstin.trim() || undefined,
        currentBalance: openingBalance || 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      setIsSupplierModalOpen(false);
      setSupplierName('');
      setCompanyName('');
      setSupplierPhone('');
      setSupplierGstin('');
      setOpeningBalance(0);
      await loadData();
    } catch (err: any) {
      alert(`Failed to save supplier: ${err.message}`);
    }
  };

  // Record Supplier Payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingSupplier || paymentAmount <= 0) return;

    try {
      await AppRepository.suppliers.recordPayment({
        shopId: currentShop.id,
        supplierId: payingSupplier.id,
        supplierName: payingSupplier.companyName || payingSupplier.name,
        amount: paymentAmount,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMode: 'BANK_TRANSFER',
        referenceNumber: paymentReference.trim() || undefined,
        notes: `Paid to ${payingSupplier.name}`
      });

      setIsPaymentModalOpen(false);
      setPayingSupplier(null);
      setPaymentAmount(0);
      setPaymentReference('');
      await loadData();
    } catch (err: any) {
      alert(`Failed to record payment: ${err.message}`);
    }
  };

  const totalPayables = suppliers.reduce((sum, s) => sum + (s.currentBalance || 0), 0);
  const totalPurchasesAmount = purchases
    .filter(p => p.status === 'CONFIRMED')
    .reduce((sum, p) => sum + p.totalAmount, 0);

  return (
    <div className="space-y-6">
      {/* Top Banner & KPI Summary */}
      <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/80">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Truck className="w-5 h-5 text-blue-600" />
              Purchase Bills & Supplier Khata
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Log distributor supply delivery invoices, auto-increment inventory on confirmation, and track supplier payables.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openNewPurchaseModal}
              disabled={!subCheck.isActive}
              className={`text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm ${
                !subCheck.isActive
                  ? 'bg-amber-100 text-amber-800 border border-amber-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
              }`}
              title={!subCheck.isActive ? '1-Month Plan Expired — Read Only' : undefined}
            >
              <Plus className="w-4 h-4" />
              <span>{subCheck.isActive ? 'New Purchase Entry' : 'Plan Expired (Read-Only)'}</span>
            </button>

            <button
              onClick={() => setIsSupplierModalOpen(true)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl transition flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5 text-blue-600" />
              Add Supplier
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-slate-500 uppercase">Confirmed Purchases Total</div>
            <div className="text-lg font-black font-mono text-slate-900 mt-0.5">
              ₹{totalPurchasesAmount.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400">Total goods procured from Amul</div>
          </div>

          <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-rose-700 uppercase flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5" /> Total Supplier Payables
            </div>
            <div className="text-lg font-black font-mono text-rose-800 mt-0.5">
              ₹{totalPayables.toFixed(2)}
            </div>
            <div className="text-[10px] text-rose-600">Pending distributor payments</div>
          </div>

          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-blue-700 uppercase flex items-center gap-1">
              <Building className="w-3.5 h-3.5" /> Active Suppliers
            </div>
            <div className="text-lg font-black font-mono text-blue-800 mt-0.5">
              {suppliers.length} Distributors
            </div>
            <div className="text-[10px] text-blue-600">Supply routes & depots</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-5">
        <div className="flex gap-2 mb-4 border-b border-slate-200 pb-3">
          <button
            onClick={() => setActiveSubTab('PURCHASES')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeSubTab === 'PURCHASES'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Purchase Invoices ({purchases.length})
          </button>

          <button
            onClick={() => setActiveSubTab('SUPPLIERS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeSubTab === 'SUPPLIERS'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Supplier Ledger & Payables ({suppliers.length})
          </button>
        </div>

        {activeSubTab === 'PURCHASES' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Invoice # & Date</th>
                  <th className="py-2.5 px-3">Supplier</th>
                  <th className="py-2.5 px-2 text-center">Items / Units</th>
                  <th className="py-2.5 px-2 text-right">Total Amount</th>
                  <th className="py-2.5 px-2 text-right">Paid / Due</th>
                  <th className="py-2.5 px-2 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {purchases.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-slate-400 font-sans">
                      No purchase bills entered yet. Click "New Purchase Entry" to log incoming milk crates or cartons.
                    </td>
                  </tr>
                ) : (
                  purchases.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{p.purchaseInvoiceNumber}</div>
                        <div className="text-[10px] text-slate-400 font-sans">{p.purchaseDate}</div>
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <div className="font-semibold text-slate-800">{p.supplierName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{p.paymentMode}</div>
                      </td>
                      <td className="py-2.5 px-2 text-center text-slate-700">
                        {p.itemCount} units ({p.items.length} SKUs)
                      </td>
                      <td className="py-2.5 px-2 text-right font-black text-slate-900 text-sm">
                        ₹{p.totalAmount.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-sans">
                        <div className="text-emerald-700 font-mono font-bold">₹{p.paidAmount.toFixed(2)}</div>
                        {p.dueAmount > 0 && (
                          <div className="text-[10px] text-rose-600 font-mono font-bold">
                            Due: ₹{p.dueAmount.toFixed(2)}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center font-sans">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                            p.status === 'CONFIRMED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : p.status === 'DRAFT'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800 line-through'
                          }`}
                        >
                          {p.status === 'CONFIRMED' && <CheckCircle2 className="w-3 h-3" />}
                          {p.status === 'DRAFT' && <Clock className="w-3 h-3" />}
                          {p.status === 'CANCELLED' && <XCircle className="w-3 h-3" />}
                          {p.status}
                        </span>
                        {p.stockPosted && (
                          <div className="text-[9px] text-emerald-600 font-semibold mt-0.5">Stock Added</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-sans">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setViewingPurchase(p)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                            title="View Items"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {p.status !== 'CANCELLED' && (
                            <button
                              onClick={() => openEditPurchaseModal(p)}
                              className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition"
                              title="Edit Items, Quantity & Prices"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {p.status === 'CONFIRMED' && (
                            <button
                              onClick={() => handleCancelPurchase(p.id)}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition"
                              title="Cancel & Deduct Stock"
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
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Distributor / Supplier</th>
                  <th className="py-2.5 px-3">Contact & GSTIN</th>
                  <th className="py-2.5 px-3">Address</th>
                  <th className="py-2.5 px-3 text-right">Current Payable Balance</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {suppliers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-slate-400 font-sans">
                      No suppliers registered yet.
                    </td>
                  </tr>
                ) : (
                  suppliers.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3 font-sans">
                        <div className="font-bold text-slate-900">{s.companyName || s.name}</div>
                        <div className="text-[11px] text-slate-500">Contact: {s.name}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-slate-700">{s.phone}</div>
                        {s.gstin && <div className="text-[10px] text-slate-400">GST: {s.gstin}</div>}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-600 text-[11px]">
                        {s.address || 'Anand Depot'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className={`font-black text-sm ${s.currentBalance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                          ₹{(s.currentBalance || 0).toFixed(2)}
                        </div>
                        <div className="text-[9px] text-slate-400 font-sans">
                          {s.currentBalance > 0 ? 'Due to pay' : 'All clear'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-sans">
                        <button
                          onClick={() => {
                            setPayingSupplier(s);
                            setPaymentAmount(s.currentBalance || 0);
                            setIsPaymentModalOpen(true);
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
                        >
                          Record Payment
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Purchase Entry Modal */}
      {isPurchaseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 my-6 max-h-[92vh] flex flex-col">
            <h3 className="font-extrabold text-base text-slate-900 mb-1">
              {editingPurchase ? `Edit Purchase Bill #${editingPurchase.purchaseInvoiceNumber}` : 'New Purchase Bill Entry'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {editingPurchase 
                ? 'Directly edit item quantities and purchase rates. Inventory stock and supplier balances will be reconciled automatically.'
                : 'Enter distributor invoice details. Confirmed purchases increase stock immediately and update supplier balance.'}
            </p>

            <form onSubmit={handleSavePurchase} className="space-y-4 overflow-y-auto flex-1 pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Supplier / Depot</label>
                  <select
                    value={selectedSupplierId}
                    onChange={e => setSelectedSupplierId(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                  >
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.companyName || s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Invoice Number</label>
                  <input
                    type="text"
                    required
                    value={invoiceNumber}
                    onChange={e => setInvoiceNumber(e.target.value)}
                    placeholder="e.g. INV-AMUL-9821"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Purchase Date</label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={e => setPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Status Selector & Stock Posting Alert */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Purchase Bill Status</label>
                <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setPurchaseStatus('CONFIRMED')}
                    className={`py-2 rounded-lg transition ${
                      purchaseStatus === 'CONFIRMED'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white border border-slate-300 text-slate-700'
                    }`}
                  >
                    ✓ CONFIRMED (Adds to stock)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPurchaseStatus('DRAFT')}
                    className={`py-2 rounded-lg transition ${
                      purchaseStatus === 'DRAFT'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-white border border-slate-300 text-slate-700'
                    }`}
                  >
                    ⏳ DRAFT (No stock change)
                  </button>
                </div>
                <div className="text-[11px] text-slate-500 mt-2">
                  {purchaseStatus === 'CONFIRMED'
                    ? '• Stock will be automatically incremented in product inventory once saved.'
                    : '• Draft bills are saved without modifying current inventory until confirmed.'}
                </div>
              </div>

              {/* Add Product Items Row */}
              <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3 space-y-2">
                <div className="text-xs font-bold text-blue-900">Add Delivered Items</div>
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 sm:col-span-5">
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Product</label>
                    <select
                      value={selectedProductId}
                      onChange={e => setSelectedProductId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    >
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} (Cur: {p.currentStock})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-4 sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={itemQty}
                      onChange={e => setItemQty(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs"
                    />
                  </div>

                  <div className="col-span-4 sm:col-span-3">
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Cost Rate (₹)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={itemRate}
                      onChange={e => setItemRate(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs"
                    />
                  </div>

                  <div className="col-span-4 sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg text-xs font-bold transition"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 font-bold text-slate-600 border-b border-slate-200 text-[10px] uppercase">
                    <tr>
                      <th className="py-2 px-3">Item Name</th>
                      <th className="py-2 px-2 text-right">Qty (Editable)</th>
                      <th className="py-2 px-2 text-right">Cost Rate (₹)</th>
                      <th className="py-2 px-3 text-right">Total</th>
                      <th className="py-2 px-2 text-center">Del</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {purchaseItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-slate-400 font-sans">
                          No items added yet. Use the form above to add delivered products.
                        </td>
                      </tr>
                    ) : (
                      purchaseItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-sans font-semibold text-slate-800">
                            <div>{item.productName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">Barcode: {item.barcode}</div>
                          </td>
                          <td className="py-2 px-2 text-right">
                            <div className="inline-flex items-center gap-1 justify-end font-sans">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={e => updateItemQuantity(idx, Number(e.target.value))}
                                className="w-16 px-1.5 py-1 text-right bg-white border border-slate-300 rounded-md text-xs font-mono font-bold focus:ring-1 focus:ring-blue-500"
                              />
                              <span className="text-[10px] text-slate-500">{item.unit}</span>
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right">
                            <div className="inline-flex items-center gap-1 justify-end font-sans">
                              <span className="text-slate-400 text-[11px]">₹</span>
                              <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={item.purchaseRate}
                                onChange={e => updateItemRate(idx, Number(e.target.value))}
                                className="w-20 px-1.5 py-1 text-right bg-white border border-slate-300 rounded-md text-xs font-mono font-bold focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">
                            ₹{item.total.toFixed(2)}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="text-slate-400 hover:text-rose-600 transition p-1"
                              title="Remove line item"
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

              {/* Totals & Payments */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={e => setPaymentMode(e.target.value as PaymentMode)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                  >
                    <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CASH">Cash</option>
                    <option value="CREDIT">Distributor Credit (Pay later)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Paid Amount Now (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={totalAmount}
                    value={paidAmount}
                    onChange={e => setPaidAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Summary box */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs font-mono space-y-1">
                <div className="flex justify-between">
                  <span>Invoice Total:</span>
                  <span className="font-bold text-sm text-slate-900">₹{totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Paid Amount:</span>
                  <span>₹{(paidAmount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-rose-700 font-bold border-t border-slate-200 pt-1">
                  <span>Outstanding Due Balance:</span>
                  <span>₹{dueAmount.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPurchaseModalOpen(false);
                    setEditingPurchase(null);
                  }}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={purchaseItems.length === 0}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md disabled:bg-slate-300 transition cursor-pointer"
                >
                  {editingPurchase ? 'Update Purchase & Reconcile Stock' : 'Save & Post Purchase'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="font-extrabold text-base text-slate-900 mb-1">Register New Supplier / Depot</h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter Amul route distributor or cooperative union details.
            </p>

            <form onSubmit={handleSaveSupplier} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Contact Person Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Shailesh Bhai Patel"
                  value={supplierName}
                  onChange={e => setSupplierName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Company / Depot Name</label>
                <input
                  type="text"
                  placeholder="e.g. GCMMF Anand Central Depot"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    required
                    placeholder="+91 XXXXX XXXXX"
                    value={supplierPhone}
                    onChange={e => setSupplierPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">GSTIN</label>
                  <input
                    type="text"
                    placeholder="24AAAAA0000A1Z5"
                    value={supplierGstin}
                    onChange={e => setSupplierGstin(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Opening Payable Balance (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={openingBalance}
                  onChange={e => setOpeningBalance(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="px-4 py-2 text-slate-600 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment to Supplier Modal */}
      {isPaymentModalOpen && payingSupplier && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="font-extrabold text-base text-slate-900 mb-1">Record Supplier Payment</h3>
            <p className="text-xs text-slate-500 mb-4">
              Pay {payingSupplier.companyName || payingSupplier.name}. This reduces outstanding payable balance.
            </p>

            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Amount (₹)</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-sm font-bold text-blue-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Cheque / UTR / Reference #</label>
                <input
                  type="text"
                  placeholder="e.g. UTR-994820192"
                  value={paymentReference}
                  onChange={e => setPaymentReference(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 text-slate-600 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Purchase Modal */}
      {viewingPurchase && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">
                  Invoice {viewingPurchase.purchaseInvoiceNumber}
                </h4>
                <div className="text-xs text-slate-400 font-mono">
                  {viewingPurchase.supplierName} • {viewingPurchase.purchaseDate}
                </div>
              </div>
              <button onClick={() => setViewingPurchase(null)} className="text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>

            <div className="py-3 divide-y divide-slate-100 max-h-60 overflow-y-auto font-mono">
              {viewingPurchase.items.map((item, i) => (
                <div key={i} className="py-2 flex justify-between text-xs">
                  <div>
                    <div className="font-semibold text-slate-800 font-sans">{item.productName}</div>
                    <div className="text-[10px] text-slate-500">
                      {item.quantity} {item.unit} x ₹{item.purchaseRate}
                    </div>
                  </div>
                  <div className="font-bold text-slate-900">₹{item.total.toFixed(2)}</div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-200 space-y-1 text-xs font-mono">
              <div className="flex justify-between">
                <span>Total:</span>
                <span className="font-bold">₹{viewingPurchase.totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Paid:</span>
                <span>₹{viewingPurchase.paidAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-rose-700 font-bold">
                <span>Due:</span>
                <span>₹{viewingPurchase.dueAmount.toFixed(2)}</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              {viewingPurchase.status !== 'CANCELLED' ? (
                <button
                  onClick={() => {
                    const target = viewingPurchase;
                    setViewingPurchase(null);
                    openEditPurchaseModal(target);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Bill & Items</span>
                </button>
              ) : <div />}
              <button
                onClick={() => setViewingPurchase(null)}
                className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
