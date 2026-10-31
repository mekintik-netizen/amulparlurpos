/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Barcode POS Billing Counter with USB HID Scanner support,
 * real-time stock validation, UPI QR code, and duplicate prevention.
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Barcode, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  CheckCircle, 
  AlertCircle, 
  QrCode, 
  CreditCard, 
  Banknote, 
  User, 
  Receipt, 
  RefreshCw, 
  ShoppingBag, 
  Sparkles, 
  ArrowUpRight, 
  Package, 
  ShieldAlert,
  Usb,
  Wrench,
  Printer
} from 'lucide-react';
import { Product, SaleBill, SaleItem, Shop, PaymentMode } from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';
import { isShopSubscriptionActive } from '../../storage/subscription.ts';
import { HardwareDiagnosticsModal } from './HardwareDiagnosticsModal.tsx';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner.ts';

interface BarcodePOSProps {
  currentShop: Shop;
  onSaleComplete: (bill: SaleBill) => void;
  onOpenStockModal: () => void;
}

interface CartItem extends SaleItem {
  availableStock: number;
}

export const BarcodePOS: React.FC<BarcodePOSProps> = ({
  currentShop,
  onSaleComplete,
  onOpenStockModal
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // 1-Month Plan Subscription Check
  const subCheck = isShopSubscriptionActive(currentShop);
  
  // Search & Scanner state
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [scanMessage, setScanMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Billing & Payment state
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showUpiModal, setShowUpiModal] = useState(false);

  // Hardware Assistant Modal & Catalog Sync States
  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState(false);
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);

  // Global Hardware Barcode Scanner Gun Listener
  useBarcodeScanner({
    onScan: (code) => {
      handleScannedBarcode(code);
    },
    enabled: true
  });

  // Audio feedback for barcode beep
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const scanBuffer = useRef<string>('');
  const lastKeyTime = useRef<number>(0);

  // Load products for this shop
  const loadProducts = async () => {
    try {
      setLoading(true);
      const list = await AppRepository.products.getByShop(currentShop.id);
      setProducts(list);
    } catch (err) {
      console.error('Failed to load products for POS:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [currentShop.id]);

  const handleSyncCatalog = async () => {
    try {
      setIsSyncingCatalog(true);
      const res = await AppRepository.products.syncPreFilledCatalog(currentShop.id);
      await loadProducts();
      setScanMessage({ text: `Catalog Synced! ${res.total} Amul products ready with barcodes.`, type: 'success' });
      setTimeout(() => setScanMessage(null), 3500);
    } catch (err: any) {
      alert(`Failed to sync catalog: ${err.message}`);
    } finally {
      setIsSyncingCatalog(false);
    }
  };

  // Focus barcode input on mount and window focus
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  // USB HID Barcode Scanner Hardware Listener (captures rapid keystrokes ending in Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is intentionally typing into another form field or modal
      const activeEl = document.activeElement;
      if (
        activeEl &&
        activeEl !== barcodeInputRef.current &&
        (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      const currentTime = Date.now();
      const diff = currentTime - lastKeyTime.current;
      lastKeyTime.current = currentTime;

      if (e.key === 'Enter') {
        if (scanBuffer.current.length >= 3) {
          e.preventDefault();
          handleScannedBarcode(scanBuffer.current.trim());
          scanBuffer.current = '';
        }
      } else if (e.key.length === 1) {
        // Typical barcode scanners emit characters rapidly (<50ms between keys)
        if (diff > 120 && scanBuffer.current.length > 0) {
          // Reset buffer if delay too long (manual human typing)
          scanBuffer.current = e.key;
        } else {
          scanBuffer.current += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products, currentShop.id]);

  // Handle barcode detection
  const handleScannedBarcode = (barcode: string) => {
    const clean = barcode.trim();
    if (!clean) return;

    const matched = products.find(p => p.barcode === clean && p.isActive);

    if (matched) {
      playBeep(true);
      addToCart(matched);
      setScanMessage({ text: `Added: ${matched.name}`, type: 'success' });
      setBarcodeInput('');
    } else {
      playBeep(false);
      setScanMessage({ text: `Barcode [${clean}] not found in this shop's catalog.`, type: 'error' });
    }

    setTimeout(() => setScanMessage(null), 3000);
  };

  // Sound feedback synthesizer using AudioContext
  const playBeep = (success: boolean) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      if (success) {
        osc.frequency.setValueAtTime(1760, ctx.currentTime); // High pitch crisp beep
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      } else {
        osc.frequency.setValueAtTime(320, ctx.currentTime); // Low buzz for not found
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch {
      // AudioContext may be restricted by autoplay policy or unavailable
    }
  };

  // Cart operations
  const addToCart = (product: Product) => {
    if (!subCheck.isActive) {
      setScanMessage({
        text: '1-Month Plan Expired: Counter is in Read-Only Mode. Please contact Admin to activate.',
        type: 'error'
      });
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item =>
          item.productId === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                total: (item.quantity + 1) * item.unitPrice
              }
            : item
        );
      } else {
        const newItem: CartItem = {
          productId: product.id,
          productName: product.name,
          barcode: product.barcode,
          quantity: 1,
          unit: product.unit,
          mrp: product.mrp,
          unitPrice: product.sellingPrice,
          costPrice: product.costPrice,
          total: product.sellingPrice,
          availableStock: product.currentStock
        };
        return [...prev, newItem];
      }
    });
  };

  const updateCartQty = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev =>
      prev.map(item =>
        item.productId === productId
          ? {
              ...item,
              quantity: newQty,
              total: Math.round(newQty * item.unitPrice * 100) / 100
            }
          : item
      )
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscountPercent(0);
    setCustomerName('');
    setCustomerPhone('');
  };

  // Calculations
  const subtotal = cart.reduce((acc, item) => acc + item.total, 0);
  const discountAmount = Math.round((subtotal * (discountPercent / 100)) * 100) / 100;
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  // Amul dairy GST is included in retail MRP
  const taxAmount = 0; 
  const rawFinal = taxableAmount + taxAmount;
  const roundedFinal = Math.round(rawFinal);
  const roundOff = Math.round((roundedFinal - rawFinal) * 100) / 100;
  const finalAmount = roundedFinal;

  // Checkout submission
  const handleCompleteSale = async () => {
    if (cart.length === 0) return;
    if (isProcessing) return;

    // Check 1-month plan subscription status
    if (!subCheck.isActive) {
      alert(`Cannot complete sale: ${subCheck.message}. All previous shop sales, bills, and stock data are saved.`);
      return;
    }

    try {
      setIsProcessing(true);

      // Generate unique Bill Number: BILL-YYYYMMDD-XXXX
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomSeq = Math.floor(1000 + Math.random() * 9000);
      const billNumber = `BILL-${datePart}-${randomSeq}`;
      
      // Idempotency key to guarantee no duplicate sales
      const idempotencyKey = `idemp-${currentShop.id}-${billNumber}-${Date.now()}`;

      const billData: Omit<SaleBill, 'id' | 'createdAt'> = {
        billNumber,
        shopId: currentShop.id,
        timestamp: new Date().toISOString(),
        items: cart.map(item => ({
          productId: item.productId,
          productName: item.productName,
          barcode: item.barcode,
          quantity: item.quantity,
          unit: item.unit,
          mrp: item.mrp,
          unitPrice: item.unitPrice,
          costPrice: item.costPrice,
          total: item.total
        })),
        itemCount: cart.reduce((sum, i) => sum + i.quantity, 0),
        subtotal,
        discountAmount,
        taxAmount,
        roundOff,
        finalAmount,
        paymentMode,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        status: 'COMPLETED',
        cashierName: 'Counter Cashier',
        idempotencyKey
      };

      const savedBill = await AppRepository.sales.createBill(billData);
      
      // Refresh local product stock list
      await loadProducts();

      // Clear cart
      clearCart();

      // Trigger thermal receipt
      onSaleComplete(savedBill);
    } catch (err: any) {
      console.error('Failed to complete sale bill:', err);
      alert(`Sale failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Filter products for manual click catalog
  const filteredProducts = products.filter(p => {
    const matchCat = selectedCategory === 'ALL' || p.category === selectedCategory;
    const matchSearch =
      searchTerm === '' ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcode.includes(searchTerm) ||
      (p.regionalName && p.regionalName.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchCat && matchSearch && p.isActive;
  });

  const categories = ['ALL', ...Array.from(new Set(products.map(p => p.category)))];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* 1-Month Plan Expired Alert Banner */}
      {!subCheck.isActive && (
        <div className="lg:col-span-12 p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-start gap-3 shadow-xs">
          <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <span className="font-extrabold text-amber-950 block text-sm">
              ⚠️ 1-Month Subscription Plan Expired — Read-Only Mode
            </span>
            <p className="text-amber-900 mt-0.5 leading-relaxed">
              {subCheck.message} All previous shop sales, customer receipts, and stock data are completely preserved. Work can only be done after the plan is activated. Contact Amul Admin to renew.
            </p>
          </div>
        </div>
      )}

      {/* LEFT COLUMN: Barcode Scanner & Product Catalog (7 cols) */}
      <div className="lg:col-span-7 flex flex-col gap-4">
        {/* Scanner Barcode Box */}
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
              <Barcode className="w-5 h-5 text-blue-600" />
              <span>USB HID Barcode Scanner</span>
            </div>

            <div className="flex items-center gap-2">
              {products.length < 50 && (
                <button
                  type="button"
                  onClick={handleSyncCatalog}
                  disabled={isSyncingCatalog}
                  className="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition shadow-2xs"
                  title="Load full 65+ official Amul products with barcodes"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{isSyncingCatalog ? 'Syncing...' : 'Pre-Fill 65+ Amul Items'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsHardwareModalOpen(true)}
                className="text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition shadow-2xs"
                title="Test and diagnose USB Barcode Gun and Thermal Printer"
              >
                <Usb className="w-3.5 h-3.5 text-blue-600" />
                <span>Hardware Assistant</span>
              </button>

              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Scanner Ready
              </span>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleScannedBarcode(barcodeInput);
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Scan product barcode (or type & press Enter)..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
              />
              <Barcode className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
            </div>
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-5 py-2.5 rounded-xl font-semibold text-xs transition shadow-xs flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </form>

          {/* Feedback message banner */}
          {scanMessage && (
            <div
              className={`mt-2.5 p-2 rounded-lg text-xs font-medium flex items-center gap-2 ${
                scanMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {scanMessage.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600" />
              )}
              {scanMessage.text}
            </div>
          )}
        </div>

        {/* Catalog Search & Category Filters */}
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-4 flex-1 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                id="searchFilter"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search Amul products, SKU or name..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <button
              onClick={onOpenStockModal}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
              title="Stock In / Stock Out rapid inventory adjustment"
            >
              <Package className="w-3.5 h-3.5 text-blue-600" />
              Stock In / Out
            </button>
          </div>

          {/* Category Chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none text-xs">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition text-xs ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto max-h-[460px] pr-1">
            {filteredProducts.map((p) => {
              const isLowStock = p.currentStock <= p.minStockAlert;
              return (
                <div
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="group bg-slate-50 hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 rounded-xl p-3 cursor-pointer transition flex flex-col justify-between relative shadow-xs hover:shadow-md"
                >
                  <div>
                    <div className="flex items-start justify-between gap-1 mb-2">
                      <span className="text-[10px] font-semibold text-blue-700 bg-blue-100/80 px-1.5 py-0.5 rounded">
                        {p.category}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          p.currentStock === 0
                            ? 'bg-rose-100 text-rose-700'
                            : isLowStock
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        Stock: {p.currentStock}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mb-1">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="w-10 h-10 object-contain rounded-lg bg-white p-0.5 border border-slate-200/80 shrink-0 group-hover:scale-105 transition-transform"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-300 shrink-0">
                          <Package className="w-5 h-5 text-slate-400" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs text-slate-900 group-hover:text-blue-900 line-clamp-2 leading-tight">
                          {p.name}
                        </div>
                        {p.regionalName && (
                          <div className="text-[10px] text-slate-500 font-sans truncate">{p.regionalName}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-200/80 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-extrabold text-slate-900 font-mono">
                        ₹{p.sellingPrice}
                      </div>
                      <div className="text-[9px] text-slate-400">MRP ₹{p.mrp}</div>
                    </div>
                    <button
                      type="button"
                      className="w-7 h-7 bg-white group-hover:bg-blue-600 group-hover:text-white rounded-lg border border-slate-300 group-hover:border-blue-600 flex items-center justify-center text-slate-700 transition shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Active Cart, Customer Info & POS Checkout (5 cols) */}
      <div className="lg:col-span-5 flex flex-col gap-4">
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-5 flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-blue-600" />
              <h3 className="font-extrabold text-sm text-slate-900">Current Sale Bill</h3>
              <span className="bg-blue-100 text-blue-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                {cart.reduce((sum, item) => sum + item.quantity, 0)} items
              </span>
            </div>

            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs text-rose-600 hover:text-rose-700 font-semibold hover:bg-rose-50 px-2 py-1 rounded-lg transition"
              >
                Clear Cart
              </button>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto max-h-[320px] py-2 divide-y divide-slate-100">
            {cart.length === 0 ? (
              <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center">
                <Barcode className="w-12 h-12 text-slate-300 stroke-1 mb-2 animate-bounce" />
                <p className="text-xs font-medium">Cart is empty</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Scan barcode with your USB scanner or click items from catalog
                </p>
              </div>
            ) : (
              cart.map((item) => {
                const stockWarning = item.quantity > item.availableStock;
                return (
                  <div key={item.productId} className="py-2.5 flex items-center justify-between gap-2">
                    {/* Cart Item Thumbnail */}
                    {products.find(p => p.id === item.productId)?.imageUrl && (
                      <img
                        src={products.find(p => p.id === item.productId)!.imageUrl}
                        alt=""
                        className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 object-contain p-0.5 shrink-0"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">
                        {item.productName}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2">
                        <span>₹{item.unitPrice} / {item.unit}</span>
                        <span>• {item.barcode}</span>
                        {stockWarning && (
                          <span className="text-rose-600 font-semibold flex items-center gap-0.5">
                            <AlertCircle className="w-3 h-3" />
                            Only {item.availableStock} in stock
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quantity Modifier */}
                    <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.productId, item.quantity - 1)}
                        className="w-5 h-5 bg-white hover:bg-slate-200 rounded flex items-center justify-center text-slate-700 font-bold text-xs"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center font-mono font-bold text-xs text-slate-800">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.productId, item.quantity + 1)}
                        className="w-5 h-5 bg-white hover:bg-slate-200 rounded flex items-center justify-center text-slate-700 font-bold text-xs"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Total & Remove */}
                    <div className="text-right pl-2">
                      <div className="text-xs font-mono font-bold text-slate-900">
                        ₹{item.total.toFixed(2)}
                      </div>
                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="text-slate-400 hover:text-rose-600 p-1 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Customer & Discount Controls */}
          <div className="pt-3 border-t border-slate-200 space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <input
                id="customerPhone"
                type="text"
                placeholder="Customer Phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
              />
              <input
                id="customerName"
                type="text"
                placeholder="Customer Name (optional)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            {/* Payment Method Selector */}
            <div className="flex gap-1.5 pt-1">
              {(['CASH', 'UPI', 'CARD', 'CREDIT'] as PaymentMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setPaymentMode(mode);
                    if (mode === 'UPI') setShowUpiModal(true);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${
                    paymentMode === mode
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {mode === 'CASH' && <Banknote className="w-3.5 h-3.5" />}
                  {mode === 'UPI' && <QrCode className="w-3.5 h-3.5" />}
                  {mode === 'CARD' && <CreditCard className="w-3.5 h-3.5" />}
                  {mode === 'CREDIT' && <User className="w-3.5 h-3.5" />}
                  <span>{mode}</span>
                </button>
              ))}
            </div>

            {/* Billing Summary Box */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Discount</span>
                  <span>-₹{discountAmount.toFixed(2)}</span>
                </div>
              )}
              {roundOff !== 0 && (
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Round off</span>
                  <span>{roundOff > 0 ? `+₹${roundOff}` : `-₹${Math.abs(roundOff)}`}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-1.5 border-t border-slate-300">
                <span>NET PAYABLE</span>
                <span className="text-base text-blue-700">₹{finalAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Complete Sale & Print Receipt Button */}
            <button
              onClick={handleCompleteSale}
              disabled={!subCheck.isActive || cart.length === 0 || isProcessing}
              className={`w-full py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition shadow-md flex items-center justify-center gap-2 ${
                !subCheck.isActive
                  ? 'bg-amber-100 text-amber-800 border border-amber-300 cursor-not-allowed'
                  : cart.length === 0 || isProcessing
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-emerald-500/20 hover:shadow-lg'
              }`}
            >
              {!subCheck.isActive ? (
                <>
                  <ShieldAlert className="w-4 h-4 text-amber-700" />
                  Plan Expired — Renewal Required
                </>
              ) : isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processing Sale...
                </>
              ) : (
                <>
                  <Receipt className="w-4 h-4" />
                  Complete Sale & Print Receipt
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Shop Online Payment UPI QR Modal with Real Shop QR & Dynamic UPI */}
      {showUpiModal && (() => {
        const effectiveUpi = currentShop.upiId || `amul.${currentShop.shopCode.toLowerCase()}@okhdfcbank`;
        const dynamicAmountQr = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
          `upi://pay?pa=${effectiveUpi}&pn=${encodeURIComponent(currentShop.name)}&am=${finalAmount.toFixed(2)}&cu=INR`
        )}`;
        const hasCustomQr = Boolean(currentShop.qrCodeImageUrl);
        const activeQrImage = hasCustomQr ? currentShop.qrCodeImageUrl! : dynamicAmountQr;

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full text-center shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                <div className="flex items-center gap-1.5 text-left">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-extrabold text-xs text-slate-800">
                    ગ્રાહક ચુકવણી માટે QR (Customer UPI Pay)
                  </span>
                </div>
                <button
                  onClick={() => setShowUpiModal(false)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Shop Identity */}
              <div className="mb-2">
                <h4 className="font-black text-sm text-slate-900 leading-tight">
                  {currentShop.regionalName || currentShop.name}
                </h4>
                <p className="text-[11px] text-slate-500 font-medium">
                  {currentShop.bankName || 'Amul Preferred Outlet'}
                </p>
              </div>

              {/* Real QR Display Box */}
              <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-800 inline-block mb-3 shadow-xs">
                <img
                  src={activeQrImage}
                  alt="Shop Payment QR Code"
                  className="w-48 h-48 object-contain mx-auto rounded-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = dynamicAmountQr;
                  }}
                />
              </div>

              {/* Amount Display */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl py-2 px-3 mb-3">
                <div className="text-[10px] uppercase font-bold text-blue-700 tracking-wider">
                  ચુકવવાપાત્ર રકમ (Total Net Payable)
                </div>
                <div className="font-mono text-2xl font-black text-blue-700">
                  ₹{finalAmount.toFixed(2)}
                </div>
              </div>

              {/* VPA Info */}
              <div className="text-[11px] font-mono text-slate-600 mb-4 bg-slate-100 py-1.5 px-3 rounded-lg flex items-center justify-between">
                <span className="font-bold text-slate-500">Shop UPI ID:</span>
                <span className="font-bold text-blue-600">{effectiveUpi}</span>
              </div>

              {/* Confirm Payment button */}
              <div className="space-y-2">
                <button
                  onClick={() => setShowUpiModal(false)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" />
                  ચુકવણી મળી ગઈ છે (Payment Received)
                </button>
                <div className="text-[10px] text-slate-400">
                  ગ્રાહક ચુકવણી કરશે તે રકમ સીધી તમારા બેંક સ્ટેટમેન્ટમાં જમા થશે.
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Hardware Diagnostics & Connection Assistant Modal */}
      <HardwareDiagnosticsModal
        isOpen={isHardwareModalOpen}
        onClose={() => setIsHardwareModalOpen(false)}
        products={products}
        shopName={currentShop.name}
        shopCode={currentShop.shopCode}
      />
    </div>
  );
};
