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
  Edit3,
  Barcode,
  Sparkles,
  Printer,
  Download,
  X
} from 'lucide-react';
import { Product, PurchaseBill, PurchaseItem, PurchaseBillStatus, PaymentMode, Shop, Supplier } from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';
import { isShopSubscriptionActive } from '../../storage/subscription.ts';
import { startShopRealtimeSync } from '../../storage/firestoreSync.ts';

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
  const [agencyName, setAgencyName] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [purchaseStatus, setPurchaseStatus] = useState<PurchaseBillStatus>('CONFIRMED');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('BANK_TRANSFER');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);

  // Searchable Product Catalog in Purchase Entry
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [itemQty, setItemQty] = useState<number>(10);
  const [itemRate, setItemRate] = useState<number>(0);
  const [itemMrp, setItemMrp] = useState<number>(0);
  const [itemSearchBarcode, setItemSearchBarcode] = useState('');
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);
  const qtyInputRef = React.useRef<HTMLInputElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

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
  // Dedicated A4 BILL PRINT modal state
  const [printingBill, setPrintingBill] = useState<PurchaseBill | null>(null);

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
        if (!agencyName) {
          setAgencyName(supList[0].companyName || supList[0].name);
        }
      }
      if (prodList.length > 0 && !selectedProductId) {
        setSelectedProductId(prodList[0].id);
        setItemRate(prodList[0].costPrice);
        setItemMrp(prodList[0].mrp);
      }
    } catch (err) {
      console.error('Failed to load purchase data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Real-time synchronization across devices and profiles
  useEffect(() => {
    loadData();
    const sync = startShopRealtimeSync(currentShop.id, () => {
      loadData();
    });
    return () => {
      sync.unsubscribeAll();
    };
  }, [currentShop.id]);

  // Click outside to close product catalog dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsProductDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter products based on search query in catalog
  const filteredCatalogProducts = React.useMemo(() => {
    const q = productSearchQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p => 
      p.name.toLowerCase().includes(q) ||
      (p.regionalName && p.regionalName.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q)) ||
      (p.barcode && p.barcode.toLowerCase().includes(q)) ||
      (p.sku && p.sku.toLowerCase().includes(q))
    );
  }, [products, productSearchQuery]);

  // When an item is picked from the searchable catalog
  const handleSelectCatalogProduct = (prod: Product) => {
    setSelectedProductId(prod.id);
    setItemRate(prod.costPrice);
    setItemMrp(prod.mrp);
    setProductSearchQuery('');
    setIsProductDropdownOpen(false);
    setTimeout(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 50);
  };

  // When selected product changes in row, pre-fill rate
  useEffect(() => {
    const prod = products.find(p => p.id === selectedProductId);
    if (prod) {
      setItemRate(prod.costPrice);
      if (prod.mrp) setItemMrp(prod.mrp);
    }
  }, [selectedProductId, products]);

  const handleSyncCatalog = async () => {
    try {
      setIsSyncingCatalog(true);
      const res = await AppRepository.products.syncPreFilledCatalog(currentShop.id);
      await loadData();
      if (onStockUpdated) onStockUpdated();
      alert(`Successfully synchronized ${res.total} Amul products with barcodes!`);
    } catch (err: any) {
      alert(`Failed to sync catalog: ${err.message}`);
    } finally {
      setIsSyncingCatalog(false);
    }
  };

  const handleBarcodeSearchInPurchase = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const matched = products.find(
      p => p.barcode === trimmed || p.name.toLowerCase().includes(trimmed.toLowerCase())
    );
    if (matched) {
      setSelectedProductId(matched.id);
      setItemRate(matched.costPrice);
      setItemMrp(matched.mrp);
      setItemSearchBarcode('');
      setTimeout(() => {
        qtyInputRef.current?.focus();
        qtyInputRef.current?.select();
      }, 50);
    }
  };

  // Add Item to Purchase Items Table
  const handleAddItem = () => {
    const prod = products.find(p => p.id === selectedProductId);
    if (!prod || itemQty <= 0 || itemRate <= 0) return;

    const existingIndex = purchaseItems.findIndex(i => i.productId === prod.id);
    if (existingIndex >= 0) {
      const updated = [...purchaseItems];
      updated[existingIndex].quantity += itemQty;
      updated[existingIndex].purchaseRate = itemRate;
      if (itemMrp > 0) updated[existingIndex].mrp = itemMrp;
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
        mrp: itemMrp > 0 ? itemMrp : prod.mrp,
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

  // Direct editing of item MRP in purchase bill
  const updateItemMrp = (index: number, newMrp: number) => {
    if (newMrp < 0 || isNaN(newMrp)) return;
    const updated = [...purchaseItems];
    updated[index].mrp = newMrp;
    setPurchaseItems(updated);
  };

  const openNewPurchaseModal = () => {
    if (!subCheck.isActive) {
      alert(`Cannot record new purchase: ${subCheck.message}. All previous purchases and supplier balances are preserved.`);
      return;
    }
    setEditingPurchase(null);
    setPurchaseItems([]);
    const autoInv = `INV-AMUL-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;
    setInvoiceNumber(autoInv);
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setPurchaseStatus('CONFIRMED');
    setPaymentMode('BANK_TRANSFER');
    setPaidAmount(0);
    setNotes('');
    setProductSearchQuery('');
    setIsProductDropdownOpen(false);
    if (suppliers.length > 0) {
      setSelectedSupplierId(suppliers[0].id);
      setAgencyName(suppliers[0].companyName || suppliers[0].name);
    } else {
      setSelectedSupplierId('');
      setAgencyName('Amul Dairy Distribution Agency');
    }
    if (products.length > 0) {
      setSelectedProductId(products[0].id);
      setItemRate(products[0].costPrice);
      setItemMrp(products[0].mrp);
    }
    setIsPurchaseModalOpen(true);
  };

  const openEditPurchaseModal = (p: PurchaseBill) => {
    if (!subCheck.isActive) {
      alert(`Shop plan is expired (${subCheck.expiryFormatted || 'Expired'}). Editing purchases is locked in Read-Only mode.`);
      return;
    }
    setEditingPurchase(p);
    setInvoiceNumber(p.billNumber || p.purchaseInvoiceNumber);
    setSelectedSupplierId(p.supplierId);
    setAgencyName(p.agencyName || p.supplierName);
    setPurchaseDate(p.purchaseDate);
    setPurchaseStatus(p.status);
    setPaymentMode(p.paymentMode);
    setPaidAmount(p.paidAmount);
    setNotes(p.notes || '');
    setProductSearchQuery('');
    setIsProductDropdownOpen(false);
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
    const chosenAgency = agencyName.trim() || (supplier ? (supplier.companyName || supplier.name) : 'Amul Agency');
    const chosenBillNumber = invoiceNumber.trim() || `PUR-${purchaseDate.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      if (editingPurchase) {
        await AppRepository.purchases.updateBill(editingPurchase.id, currentShop.id, {
          purchaseInvoiceNumber: chosenBillNumber,
          billNumber: chosenBillNumber,
          agencyName: chosenAgency,
          supplierId: supplier ? supplier.id : editingPurchase.supplierId,
          supplierName: chosenAgency,
          purchaseDate,
          items: purchaseItems,
          paidAmount: Math.min(paidAmount || 0, totalAmount),
          status: purchaseStatus,
          paymentMode,
          notes: notes.trim() || undefined
        });
      } else {
        const idempotencyKey = `pur-idemp-${currentShop.id}-${chosenBillNumber}-${Date.now()}`;

        await AppRepository.purchases.createBill({
          purchaseInvoiceNumber: chosenBillNumber,
          billNumber: chosenBillNumber,
          agencyName: chosenAgency,
          shopId: currentShop.id,
          supplierId: supplier ? supplier.id : `sup-${Date.now()}`,
          supplierName: chosenAgency,
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
            {products.length < 50 && (
              <button
                type="button"
                onClick={handleSyncCatalog}
                disabled={isSyncingCatalog}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                title="Populate full 65+ official Amul products with barcodes into shop"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isSyncingCatalog ? 'Syncing...' : 'Pre-Fill 65+ Amul Products'}</span>
              </button>
            )}

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
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
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
                  <th className="py-2.5 px-3">Bill # &amp; Date / બિલ નંબર અને તારીખ</th>
                  <th className="py-2.5 px-3">Agency Name / એજન્સીનું નામ</th>
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
                      કોઈ ખરીદી બીલ નથી / No purchase bills entered yet. Click "New Purchase Entry" to log incoming milk crates or cartons.
                    </td>
                  </tr>
                ) : (
                  purchases.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{p.billNumber || p.purchaseInvoiceNumber}</div>
                        <div className="text-[10px] text-slate-400 font-sans">{p.purchaseDate}</div>
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <div className="font-bold text-slate-800">{p.agencyName || p.supplierName}</div>
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
                            onClick={() => setPrintingBill(p)}
                            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#005A9C] border border-blue-200 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                            title="BILL PRINT"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>BILL PRINT</span>
                          </button>
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Agency Name / એજન્સીનું નામ
                  </label>
                  <div className="space-y-1">
                    <select
                      value={selectedSupplierId}
                      onChange={e => {
                        setSelectedSupplierId(e.target.value);
                        const sup = suppliers.find(s => s.id === e.target.value);
                        if (sup) {
                          setAgencyName(sup.companyName || sup.name);
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                    >
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.companyName || s.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={agencyName}
                      onChange={e => setAgencyName(e.target.value)}
                      placeholder="Or enter Agency Name (એજન્સીનું નામ)"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Bill Number / બિલ નંબર
                  </label>
                  <input
                    type="text"
                    required
                    value={invoiceNumber}
                    onChange={e => setInvoiceNumber(e.target.value)}
                    placeholder="e.g. INV-AMUL-9821 or 12345"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Purchase Date / ખરીદી તારીખ
                  </label>
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

              {/* Add Product Items Row (Searchable Product Catalog & Fast Stock Entry) */}
              <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <Search className="w-4 h-4 text-blue-600" />
                    <span>પ્રોડક્ટ પસંદગી અને ઉમેરો / Searchable Product Catalog</span>
                  </div>
                  <span className="text-[10px] text-blue-600 font-medium">
                    સર્ચ કરો અથવા બારકોડ સ્કેન કરો — જથ્થો (Qty) દાખલ કરી ઉમેરો
                  </span>
                </div>

                {/* Integrated Real-Time Item Search Bar */}
                <div className="relative" ref={dropdownRef}>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-blue-900 font-extrabold">
                      <Search className="w-3.5 h-3.5 text-blue-600" />
                      સર્ચ પ્રોડક્ટ / Search Product
                    </span>
                    {selectedProductId && (
                      <span className="text-[10px] text-slate-500 font-normal font-sans">
                        પસંદ કરેલ સ્ટોક: <strong className="text-blue-700 font-mono">
                          {products.find(p => p.id === selectedProductId)?.currentStock ?? 0} {products.find(p => p.id === selectedProductId)?.unit || 'units'}
                        </strong>
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      ref={searchInputRef}
                      type="text"
                      autoComplete="off"
                      value={productSearchQuery}
                      onChange={e => {
                        setProductSearchQuery(e.target.value);
                        setIsProductDropdownOpen(true);
                      }}
                      onFocus={() => setIsProductDropdownOpen(true)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (filteredCatalogProducts.length > 0) {
                            handleSelectCatalogProduct(filteredCatalogProducts[0]);
                          }
                        } else if (e.key === 'Escape') {
                          setIsProductDropdownOpen(false);
                        }
                      }}
                      placeholder="🔍 સર્ચ પ્રોડક્ટ / Search Product (નામ, ગુજરાતી નામ, કેટેગરી અથવા બારકોડ)..."
                      className="w-full pl-9 pr-8 py-2 bg-white border border-blue-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-hidden shadow-xs"
                    />
                    <Search className="w-4 h-4 text-blue-500 absolute left-3 top-2.5 pointer-events-none" />
                    {productSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setProductSearchQuery('');
                          searchInputRef.current?.focus();
                        }}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs p-1"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Autocomplete Dropdown List */}
                  {isProductDropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-slate-100">
                      {filteredCatalogProducts.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500">
                          કોઈ પ્રોડક્ટ મળી નથી / No products found for "{productSearchQuery}".
                        </div>
                      ) : (
                        filteredCatalogProducts.map(p => {
                          const isSelected = p.id === selectedProductId;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleSelectCatalogProduct(p)}
                              className={`w-full text-left px-3 py-2 flex items-center justify-between transition hover:bg-blue-50 cursor-pointer ${
                                isSelected ? 'bg-blue-50 font-bold text-blue-900' : 'text-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 truncate">
                                {p.imageUrl ? (
                                  <img src={p.imageUrl} alt="" className="w-7 h-7 object-contain rounded bg-slate-50 shrink-0 border border-slate-100" />
                                ) : (
                                  <div className="w-7 h-7 bg-blue-100 text-blue-700 rounded flex items-center justify-center font-bold text-xs shrink-0">
                                    {p.name.charAt(0)}
                                  </div>
                                )}
                                <div className="truncate">
                                  <div className="font-bold text-xs text-slate-900 truncate">
                                    {p.name}
                                    {p.regionalName && <span className="text-slate-500 ml-1.5 font-normal">({p.regionalName})</span>}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
                                    <span className="text-blue-600 font-semibold">{p.category}</span>
                                    {p.barcode && <span>• {p.barcode}</span>}
                                    <span>• સ્ટોક: {p.currentStock ?? 0} {p.unit}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-right shrink-0 ml-3 font-mono">
                                <div className="text-xs font-bold text-emerald-700">₹{p.costPrice.toFixed(2)}</div>
                                <div className="text-[10px] text-slate-400">MRP ₹{p.mrp.toFixed(2)}</div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Quick Barcode Scanner / Search Input */}
                <div className="relative">
                  <input
                    type="text"
                    value={itemSearchBarcode}
                    onChange={(e) => {
                      setItemSearchBarcode(e.target.value);
                      handleBarcodeSearchInPurchase(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleBarcodeSearchInPurchase(itemSearchBarcode);
                      }
                    }}
                    placeholder="⚡ અથવા બારકોડ ગનથી સ્કેન કરો (Barcode gun scan)..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                  <Barcode className="w-4 h-4 text-blue-500 absolute left-2.5 top-2" />
                </div>

                {/* Item Details Row (Selected Product, Quantity, Cost Rate, MRP & Add Button) */}
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 sm:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                      Selected Item / પસંદ કરેલ આઇટમ
                    </label>
                    <select
                      value={selectedProductId}
                      onChange={e => {
                        const found = products.find(p => p.id === e.target.value);
                        if (found) handleSelectCatalogProduct(found);
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800"
                    >
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.regionalName ? `(${p.regionalName})` : ''} · ₹{p.costPrice.toFixed(2)} [MRP ₹{p.mrp.toFixed(2)}]
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-4 sm:col-span-2">
                    <label className="block text-[10px] font-bold text-blue-800 mb-0.5">Quantity / જથ્થો *</label>
                    <input
                      ref={qtyInputRef}
                      type="number"
                      min="1"
                      value={itemQty}
                      onChange={e => setItemQty(Number(e.target.value))}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddItem();
                        }
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border-2 border-blue-400 rounded-lg font-mono text-xs font-bold text-blue-900 focus:ring-2 focus:ring-blue-600"
                      title="Press Enter after typing quantity to add"
                    />
                  </div>

                  <div className="col-span-4 sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Cost Rate / ખરીદ ભાવ (₹)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={itemRate}
                      onChange={e => setItemRate(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs font-bold text-slate-900"
                      title="Wholesale purchase price from distributor"
                    />
                  </div>

                  <div className="col-span-4 sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Retail MRP (₹)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={itemMrp}
                      onChange={e => setItemMrp(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs"
                      title="Printed Retail MRP"
                    />
                  </div>

                  <div className="col-span-12 sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white py-1.5 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>ઉમેરો / Add Item</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 font-bold text-slate-600 border-b border-slate-200 text-[10px] uppercase">
                    <tr>
                      <th className="py-2 px-3">Item Name &amp; Barcode</th>
                      <th className="py-2 px-2 text-right">Qty</th>
                      <th className="py-2 px-2 text-right">Cost Rate (₹)</th>
                      <th className="py-2 px-2 text-right">MRP (₹)</th>
                      <th className="py-2 px-3 text-right">Total</th>
                      <th className="py-2 px-2 text-center">Del</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {purchaseItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-slate-400 font-sans">
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
                                className="w-18 px-1.5 py-1 text-right bg-white border border-slate-300 rounded-md text-xs font-mono font-bold focus:ring-1 focus:ring-blue-500"
                                title="Wholesale dealer rate"
                              />
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right">
                            <div className="inline-flex items-center gap-1 justify-end font-sans">
                              <span className="text-slate-400 text-[11px]">₹</span>
                              <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={item.mrp}
                                onChange={e => updateItemMrp(idx, Number(e.target.value))}
                                className="w-18 px-1.5 py-1 text-right bg-white border border-slate-300 rounded-md text-xs font-mono text-slate-700 focus:ring-1 focus:ring-blue-500"
                                title="Printed MRP"
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
                              className="text-slate-400 hover:text-rose-600 transition p-1 cursor-pointer"
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
                <div className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">
                  બિલ નંબર / Bill Number
                </div>
                <h4 className="font-extrabold text-slate-900 text-sm">
                  {viewingPurchase.billNumber || viewingPurchase.purchaseInvoiceNumber}
                </h4>
                <div className="text-xs text-slate-600 font-sans mt-0.5">
                  <span className="font-bold text-slate-800">
                    {viewingPurchase.agencyName || viewingPurchase.supplierName}
                  </span> • <span className="font-mono text-slate-400">{viewingPurchase.purchaseDate}</span>
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const target = viewingPurchase;
                    setViewingPurchase(null);
                    setPrintingBill(target);
                  }}
                  className="bg-[#005A9C] hover:bg-blue-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>BILL PRINT</span>
                </button>
                {viewingPurchase.status !== 'CANCELLED' && (
                  <button
                    onClick={() => {
                      const target = viewingPurchase;
                      setViewingPurchase(null);
                      openEditPurchaseModal(target);
                    }}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Bill</span>
                  </button>
                )}
              </div>
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

      {/* Dedicated A4 Purchase Invoice - BILL PRINT Modal */}
      {printingBill && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:fixed print:inset-0">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 my-6 print:p-0 print:my-0 print:shadow-none print:max-w-none print:rounded-none">
            {/* Modal Controls (Hidden in Print) */}
            <div className="no-print flex items-center justify-between pb-4 mb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#005A9C] flex items-center justify-center font-bold">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    BILL PRINT PREVIEW / ખરીદી બિલ પ્રિન્ટ
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Clean A4 Purchase Invoice Format ready for thermal or A4 printing
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="bg-[#005A9C] hover:bg-blue-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>BILL PRINT</span>
                </button>
                <button
                  onClick={() => setPrintingBill(null)}
                  className="px-3 py-2 text-slate-500 hover:text-slate-800 text-xs font-bold transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Printable Document (Rendered for both Screen Preview & A4 Print) */}
            <div className="purchase-printable-bill p-6 border border-slate-200 rounded-xl print:border-none print:p-0 text-slate-900">
              {/* Header Title strictly labeled BILL PRINT */}
              <div className="text-center pb-4 mb-4 border-b-2 border-slate-900">
                <h1 className="text-2xl font-black tracking-widest text-slate-900 uppercase">
                  BILL PRINT
                </h1>
                <div className="text-xs font-bold text-slate-700 mt-0.5">
                  અમુલ પાર્લર ખરીદી ભરતિયું / AMUL PARLOUR PURCHASE INVOICE
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  GSTIN / Tax Invoice • Official Stock Delivery Copy
                </div>
              </div>

              {/* Parlour & Agency / Supplier Grid */}
              <div className="grid grid-cols-2 gap-4 pb-4 mb-4 border-b border-slate-200 text-xs">
                {/* Left: Parlour Details */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-sans">
                    ખરીદનાર પાર્લર / Consignee (Amul Parlour):
                  </span>
                  <div className="font-extrabold text-sm text-slate-900">
                    {currentShop.name}
                  </div>
                  {currentShop.address && (
                    <div className="text-slate-600 text-[11px] leading-tight">
                      {currentShop.address}
                    </div>
                  )}
                  <div className="text-slate-600 text-[11px] flex items-center gap-3 font-mono">
                    {(currentShop.gstNumber || (currentShop as any).gstin) && (
                      <span><strong>GSTIN:</strong> {currentShop.gstNumber || (currentShop as any).gstin}</span>
                    )}
                    {currentShop.phone && <span><strong>Ph:</strong> {currentShop.phone}</span>}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    <strong>Shop Code:</strong> {currentShop.shopCode}
                  </div>
                </div>

                {/* Right: Agency / Supplier & Bill Details */}
                <div className="space-y-1 text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-sans">
                    એજન્સી / સપ્લાયર / Agency &amp; Invoice:
                  </span>
                  <div className="font-extrabold text-sm text-[#005A9C]">
                    {printingBill.agencyName || printingBill.supplierName}
                  </div>
                  <div className="text-slate-700 text-xs font-mono">
                    <strong>બિલ નંબર / Bill No:</strong> <span className="font-bold">{printingBill.billNumber || printingBill.purchaseInvoiceNumber}</span>
                  </div>
                  <div className="text-slate-600 text-xs font-mono">
                    <strong>તારીખ / Date:</strong> {printingBill.purchaseDate}
                  </div>
                  <div className="text-slate-500 text-[11px] font-mono">
                    <strong>પેમેન્ટ મોડ / Mode:</strong> {printingBill.paymentMode} ({printingBill.status})
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-left text-xs mb-4 border border-slate-300">
                <thead className="bg-slate-100 font-bold text-slate-800 uppercase text-[10px] border-b border-slate-300">
                  <tr>
                    <th className="py-2 px-2.5 w-8 text-center border-r border-slate-300">#</th>
                    <th className="py-2 px-3 border-r border-slate-300">Item Description / આઇટમ</th>
                    <th className="py-2 px-2 border-r border-slate-300">Barcode</th>
                    <th className="py-2 px-2 text-right border-r border-slate-300">Qty</th>
                    <th className="py-2 px-2 text-center border-r border-slate-300">Unit</th>
                    <th className="py-2 px-2.5 text-right border-r border-slate-300">Cost Rate (₹)</th>
                    <th className="py-2 px-2 text-right border-r border-slate-300">MRP (₹)</th>
                    <th className="py-2 px-3 text-right">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  {printingBill.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2 px-2 text-center border-r border-slate-200 text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-3 font-sans font-semibold text-slate-900 border-r border-slate-200">
                        {item.productName}
                      </td>
                      <td className="py-2 px-2 text-slate-500 border-r border-slate-200 text-[11px]">
                        {item.barcode || '—'}
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-slate-900 border-r border-slate-200">
                        {item.quantity}
                      </td>
                      <td className="py-2 px-2 text-center text-slate-600 font-sans border-r border-slate-200 text-[11px]">
                        {item.unit}
                      </td>
                      <td className="py-2 px-2.5 text-right text-slate-800 border-r border-slate-200">
                        ₹{item.purchaseRate.toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-500 border-r border-slate-200">
                        ₹{item.mrp.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900">
                        ₹{item.total.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary & Totals */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-300 text-xs">
                <div className="space-y-1 text-slate-600 text-[11px]">
                  <div><strong>Total Item Lines:</strong> {printingBill.items.length} SKUs</div>
                  <div><strong>Total Delivered Quantity:</strong> {printingBill.itemCount} units</div>
                  {printingBill.notes && (
                    <div className="pt-2 italic text-slate-500">
                      <strong>Notes:</strong> {printingBill.notes}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 font-mono text-right">
                  <div className="flex justify-between text-slate-600 text-xs">
                    <span>Subtotal / કુલ રકમ:</span>
                    <span className="font-bold">₹{printingBill.subtotal.toFixed(2)}</span>
                  </div>
                  {printingBill.otherCharges > 0 && (
                    <div className="flex justify-between text-slate-600 text-xs">
                      <span>Other Charges / ભાડું વગેરે:</span>
                      <span>₹{printingBill.otherCharges.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black text-slate-900 border-t border-b border-slate-400 py-1">
                    <span>GRAND TOTAL / આખરી રકમ:</span>
                    <span>₹{printingBill.totalAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-800 text-xs">
                    <span>ચૂકવેલ રકમ / Paid:</span>
                    <span className="font-bold">₹{printingBill.paidAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-rose-800 text-xs font-bold">
                    <span>બાકી રકમ / Due Balance:</span>
                    <span>₹{printingBill.dueAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-8 pt-10 mt-6 border-t border-slate-300 text-xs text-center font-sans">
                <div>
                  <div className="border-t border-dashed border-slate-400 pt-1.5 font-bold text-slate-700">
                    Agency / Distributor Signature
                  </div>
                  <div className="text-[10px] text-slate-400">એજન્સી / ડિસ્ટ્રીબ્યુટર સહી</div>
                </div>
                <div>
                  <div className="border-t border-dashed border-slate-400 pt-1.5 font-bold text-slate-700">
                    Authorized Parlour Receiver Signature
                  </div>
                  <div className="text-[10px] text-slate-400">માલ સ્વીકારનાર પાર્લર પ્રતિનિધિ સહી</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
