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
  const [paidAmount, setPaidAmount] = useState<string | number>(0);
  const [notes, setNotes] = useState('');
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);

  // Searchable Product Catalog in Purchase Entry
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [itemQty, setItemQty] = useState<string | number>(10);
  const [itemRate, setItemRate] = useState<string | number>(0);
  const [itemMrp, setItemMrp] = useState<string | number>(0);
  const [itemSearchBarcode, setItemSearchBarcode] = useState('');
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);
  const qtyInputRef = React.useRef<HTMLInputElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Supplier Modal & Management State
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [supplierGstin, setSupplierGstin] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [openingBalance, setOpeningBalance] = useState<string | number>(0);

  // Supplier Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [payingSupplier, setPayingSupplier] = useState<Supplier | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string | number>(0);
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
    const numQty = parseFloat(String(itemQty)) || 0;
    const numRate = parseFloat(String(itemRate)) || 0;
    const numMrp = parseFloat(String(itemMrp)) || 0;
    if (!prod || numQty <= 0 || numRate <= 0) return;

    const existingIndex = purchaseItems.findIndex(i => i.productId === prod.id);
    if (existingIndex >= 0) {
      const updated = [...purchaseItems];
      updated[existingIndex].quantity = Math.round((updated[existingIndex].quantity + numQty) * 1000) / 1000;
      updated[existingIndex].purchaseRate = numRate;
      if (numMrp > 0) updated[existingIndex].mrp = numMrp;
      updated[existingIndex].total = Math.round(updated[existingIndex].quantity * numRate * 1000) / 1000;
      setPurchaseItems(updated);
    } else {
      const newItem: PurchaseItem = {
        productId: prod.id,
        productName: prod.name,
        barcode: prod.barcode,
        quantity: numQty,
        unit: prod.unit,
        purchaseRate: numRate,
        mrp: numMrp > 0 ? numMrp : prod.mrp,
        total: Math.round(numQty * numRate * 1000) / 1000
      };
      setPurchaseItems([...purchaseItems, newItem]);
    }

    setItemQty(10);
  };

  const handleRemoveItem = (index: number) => {
    setPurchaseItems(purchaseItems.filter((_, idx) => idx !== index));
  };

  // Direct editing of item quantity in purchase bill (supports fractional .000)
  const updateItemQuantity = (index: number, newQty: string | number) => {
    const parsed = typeof newQty === 'number' ? newQty : parseFloat(newQty);
    if (isNaN(parsed) || parsed <= 0) return;
    const updated = [...purchaseItems];
    updated[index].quantity = parsed;
    updated[index].total = Math.round(parsed * updated[index].purchaseRate * 1000) / 1000;
    setPurchaseItems(updated);
  };

  // Direct editing of item purchase price / rate in purchase bill (supports multi-decimal)
  const updateItemRate = (index: number, newRate: string | number) => {
    const parsed = typeof newRate === 'number' ? newRate : parseFloat(newRate);
    if (isNaN(parsed) || parsed < 0) return;
    const updated = [...purchaseItems];
    updated[index].purchaseRate = parsed;
    updated[index].total = Math.round(updated[index].quantity * parsed * 1000) / 1000;
    setPurchaseItems(updated);
  };

  // Direct editing of item MRP in purchase bill
  const updateItemMrp = (index: number, newMrp: string | number) => {
    const parsed = typeof newMrp === 'number' ? newMrp : parseFloat(newMrp);
    if (isNaN(parsed) || parsed < 0) return;
    const updated = [...purchaseItems];
    updated[index].mrp = parsed;
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

  // Totals & Exact Decimal Due Calculation
  const subtotal = purchaseItems.reduce((acc, item) => acc + item.total, 0);
  const totalAmount = Math.round(subtotal * 1000) / 1000;
  const numPaid = parseFloat(String(paidAmount)) || 0;
  const dueAmount = numPaid >= totalAmount - 0.0001 ? 0 : Math.max(0, Math.round((totalAmount - numPaid) * 1000) / 1000);

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
    const effectivePaid = Math.min(numPaid, totalAmount);
    const effectiveDue = effectivePaid >= totalAmount - 0.0001 ? 0 : Math.max(0, Math.round((totalAmount - effectivePaid) * 1000) / 1000);

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
          paidAmount: effectivePaid,
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
          paidAmount: effectivePaid,
          dueAmount: effectiveDue,
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

  // Dynamic Supplier Due Balance Calculation (returns 0.00 when all bills are paid)
  const getSupplierDueBalance = (supplier: Supplier, allPurchases: PurchaseBill[]): number => {
    const supplierPurchases = allPurchases.filter(p =>
      p.status !== 'CANCELLED' && (
        p.supplierId === supplier.id ||
        (supplier.companyName && (p.agencyName === supplier.companyName || p.supplierName === supplier.companyName)) ||
        (supplier.name && (p.agencyName === supplier.name || p.supplierName === supplier.name))
      )
    );

    if (supplierPurchases.length > 0) {
      const allFullyPaid = supplierPurchases.every(p =>
        (p.paidAmount >= p.totalAmount - 0.001) || (p.dueAmount !== undefined && p.dueAmount <= 0.001)
      );
      if (allFullyPaid) {
        return 0; // Strictly ₹0.00 when all bills/invoices are fully paid
      }

      const totalUnpaidDue = supplierPurchases.reduce((sum, p) => {
        const billPending = Math.max(0, p.totalAmount - (p.paidAmount || 0));
        const exactDue = p.dueAmount !== undefined ? Math.min(p.dueAmount, billPending) : billPending;
        return sum + (exactDue > 0.001 ? exactDue : 0);
      }, 0);

      return Math.max(0, Math.round(totalUnpaidDue * 1000) / 1000);
    }

    return Math.max(0, supplier.currentBalance || 0);
  };

  const openAddSupplierModal = () => {
    setEditingSupplier(null);
    setSupplierName('');
    setCompanyName('');
    setSupplierPhone('');
    setSupplierEmail('');
    setSupplierGstin('');
    setSupplierAddress('');
    setOpeningBalance(0);
    setIsSupplierModalOpen(true);
  };

  const openEditSupplierModal = (s: Supplier) => {
    setEditingSupplier(s);
    setSupplierName(s.name);
    setCompanyName(s.companyName || '');
    setSupplierPhone(s.phone);
    setSupplierEmail(s.email || '');
    setSupplierGstin(s.gstin || '');
    setSupplierAddress(s.address || '');
    setOpeningBalance(s.openingBalance || 0);
    setIsSupplierModalOpen(true);
  };

  // Save or Update Supplier / Agency
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim() && !companyName.trim()) {
      alert('Please enter a supplier contact person name or agency company name.');
      return;
    }

    const numOpening = parseFloat(String(openingBalance)) || 0;

    try {
      if (editingSupplier) {
        const updatedSupplier: Supplier = {
          ...editingSupplier,
          name: supplierName.trim() || companyName.trim() || 'Supplier',
          companyName: companyName.trim() || supplierName.trim() || 'Amul Agency',
          phone: supplierPhone.trim() || 'N/A',
          email: supplierEmail.trim() || undefined,
          address: supplierAddress.trim() || undefined,
          gstin: supplierGstin.trim() || undefined,
          openingBalance: numOpening,
          updatedAt: new Date().toISOString()
        };
        await AppRepository.suppliers.save(updatedSupplier);
      } else {
        const newSupplier: Supplier = {
          id: `sup-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          shopId: currentShop.id,
          name: supplierName.trim() || companyName.trim() || 'Supplier',
          companyName: companyName.trim() || supplierName.trim() || 'Amul Agency',
          phone: supplierPhone.trim() || 'N/A',
          email: supplierEmail.trim() || undefined,
          address: supplierAddress.trim() || undefined,
          gstin: supplierGstin.trim() || undefined,
          currentBalance: numOpening,
          openingBalance: numOpening,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await AppRepository.suppliers.save(newSupplier);
      }

      setIsSupplierModalOpen(false);
      setEditingSupplier(null);
      setSupplierName('');
      setCompanyName('');
      setSupplierPhone('');
      setSupplierEmail('');
      setSupplierGstin('');
      setSupplierAddress('');
      setOpeningBalance(0);
      await loadData();
    } catch (err: any) {
      alert(`Failed to save supplier: ${err.message}`);
    }
  };

  // Permanently Delete Supplier / Agency (safely preserves historical bills)
  const handleDeleteSupplier = async (supplierId: string) => {
    try {
      await AppRepository.suppliers.delete(supplierId);
      setDeletingSupplier(null);
      await loadData();
    } catch (err: any) {
      alert(`Failed to delete supplier: ${err.message}`);
    }
  };

  // Record Supplier Payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const numPayment = parseFloat(String(paymentAmount)) || 0;
    if (!payingSupplier || numPayment <= 0) return;

    try {
      await AppRepository.suppliers.recordPayment({
        shopId: currentShop.id,
        supplierId: payingSupplier.id,
        supplierName: payingSupplier.companyName || payingSupplier.name,
        amount: numPayment,
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

  const totalPayables = suppliers.reduce((sum, s) => sum + getSupplierDueBalance(s, purchases), 0);
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
              onClick={openAddSupplierModal}
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
          <div className="overflow-x-auto relative">
            <table className="w-full text-left text-xs min-w-[780px]">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Bill # &amp; Date / બિલ નંબર અને તારીખ</th>
                  <th className="py-2.5 px-3">Agency Name / એજન્સીનું નામ</th>
                  <th className="py-2.5 px-2 text-center">Items / Units</th>
                  <th className="py-2.5 px-2 text-right">Total Amount</th>
                  <th className="py-2.5 px-2 text-right">Paid / Due</th>
                  <th className="py-2.5 px-2 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right sticky right-0 bg-slate-50 z-10 shadow-[-6px_0_10px_-2px_rgba(0,0,0,0.07)] border-l border-slate-200">
                    Actions / બિલ પ્રિન્ટ
                  </th>
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
                    <tr key={p.id} className="hover:bg-slate-50/80 transition group">
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
                        {(p.paidAmount >= p.totalAmount - 0.001 || (p.dueAmount !== undefined && p
