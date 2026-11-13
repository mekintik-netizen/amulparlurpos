/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Product Catalog Management Component
 * Allows shop owner to create new products, edit pricing, assign barcodes,
 * set units, and configure low-stock thresholds.
 */

import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Barcode, 
  Tag, 
  AlertTriangle,
  CheckCircle2,
  Filter,
  AlertCircle,
  Image as ImageIcon,
  Upload,
  Sparkles,
  Check,
  X,
  CopyX,
  Layers,
  GitMerge,
  RefreshCw,
  FileSpreadsheet,
  Download
} from 'lucide-react';
import { Product, ProductCategory, Shop } from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';
import { isShopSubscriptionActive } from '../../storage/subscription.ts';
import { getAmulProductPresetImage, AMUL_PRODUCT_IMAGE_PRESETS } from '../../storage/productImages.ts';
import { detectDuplicateGroups, DuplicateGroup, normalizeBarcode, normalizeSku } from '../../storage/duplicateDetector.ts';
import { startShopRealtimeSync } from '../../storage/firestoreSync.ts';
import { ExcelProductImportModal } from './ExcelProductImportModal.tsx';
import { exportDataToExcel } from '../../utils/excelEngine.ts';

interface CatalogManagementProps {
  currentShop: Shop;
  onProductChanged?: () => void;
}

export const CatalogManagement: React.FC<CatalogManagementProps> = ({ currentShop, onProductChanged }) => {
  const subCheck = isShopSubscriptionActive(currentShop);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [catalogSubTab, setCatalogSubTab] = useState<'ALL' | 'DUPLICATES'>('ALL');
  const [duplicateActionNotice, setDuplicateActionNotice] = useState<string | null>(null);
  const [duplicateFilter, setDuplicateFilter] = useState<'ALL' | 'BARCODE' | 'SKU' | 'NAME'>('ALL');
  const [duplicateSearchTerm, setDuplicateSearchTerm] = useState('');
  const [isMergingAll, setIsMergingAll] = useState(false);

  // Inline Price Editing State
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [inlineCost, setInlineCost] = useState<number>(0);
  const [inlineSelling, setInlineSelling] = useState<number>(0);
  const [inlineMrp, setInlineMrp] = useState<number>(0);
  const [priceSaveNotice, setPriceSaveNotice] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Export current catalog to Excel
  const handleExportProductsToExcel = () => {
    if (products.length === 0) {
      alert('No products available to export.');
      return;
    }
    const data = products.map(p => ({
      'Product Name': p.name,
      'Regional / Gujarati Name': p.regionalName || '',
      'Category': p.category,
      'Barcode': p.barcode,
      'SKU': p.sku,
      'Unit': p.unit,
      'Cost Price (₹)': p.costPrice,
      'Selling Price (₹)': p.sellingPrice,
      'MRP (₹)': p.mrp,
      'Current Stock': p.currentStock,
      'Min Stock Alert': p.minStockAlert,
      'Status': p.currentStock <= 0 ? 'Out of Stock' : p.currentStock <= p.minStockAlert ? 'Low Stock' : 'In Stock'
    }));

    exportDataToExcel({
      filename: `${currentShop.shopCode}_Amul_Products_Catalog_${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetName: 'Products Catalog',
      data
    });
  };

  // Form State
  const [name, setName] = useState('');
  const [regionalName, setRegionalName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState<ProductCategory>('Milk');
  const [unit, setUnit] = useState<Product['unit']>('Pouch');
  const [costPrice, setCostPrice] = useState<number>(24);
  const [sellingPrice, setSellingPrice] = useState<number>(27);
  const [mrp, setMrp] = useState<number>(27);
  const [currentStock, setCurrentStock] = useState<number>(50);
  const [minStockAlert, setMinStockAlert] = useState<number>(15);
  const [imageUrl, setImageUrl] = useState<string>('');

  const loadProducts = async () => {
    try {
      setLoading(true);
      const list = await AppRepository.products.getByShop(currentShop.id);
      setProducts(list);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  };

  // Real-time synchronization for catalog & inventory updates across devices
  useEffect(() => {
    loadProducts();
    const sync = startShopRealtimeSync(currentShop.id, () => {
      loadProducts();
      onProductChanged?.();
    });
    return () => {
      sync.unsubscribeAll();
    };
  }, [currentShop.id]);

  // Scan live inventory for duplicates sharing identical or similar names, barcodes, or SKUs
  const duplicateGroups: DuplicateGroup[] = React.useMemo(() => {
    return detectDuplicateGroups(products);
  }, [products]);

  const barcodeMatchesCount = React.useMemo(() => {
    return duplicateGroups.filter(g => g.matchType === 'BARCODE' || g.sharedBarcode).length;
  }, [duplicateGroups]);

  const skuMatchesCount = React.useMemo(() => {
    return duplicateGroups.filter(g => g.matchType === 'SKU' || g.sharedSku).length;
  }, [duplicateGroups]);

  const nameMatchesCount = React.useMemo(() => {
    return duplicateGroups.filter(g => g.matchType === 'NAME').length;
  }, [duplicateGroups]);

  const filteredDuplicateGroups = React.useMemo(() => {
    let list = duplicateGroups;
    if (duplicateFilter === 'BARCODE') {
      list = list.filter(g => g.matchType === 'BARCODE' || g.sharedBarcode);
    } else if (duplicateFilter === 'SKU') {
      list = list.filter(g => g.matchType === 'SKU' || g.sharedSku);
    } else if (duplicateFilter === 'NAME') {
      list = list.filter(g => g.matchType === 'NAME');
    }

    if (duplicateSearchTerm.trim()) {
      const q = duplicateSearchTerm.trim().toLowerCase();
      list = list.filter(g =>
        (g.sharedBarcode && g.sharedBarcode.toLowerCase().includes(q)) ||
        (g.sharedSku && g.sharedSku.toLowerCase().includes(q)) ||
        g.title.toLowerCase().includes(q) ||
        g.items.some(it =>
          it.name.toLowerCase().includes(q) ||
          (it.barcode && it.barcode.toLowerCase().includes(q)) ||
          (it.sku && it.sku.toLowerCase().includes(q))
        )
      );
    }

    return list;
  }, [duplicateGroups, duplicateFilter, duplicateSearchTerm]);

  const startInlinePriceEdit = (p: Product) => {
    if (!subCheck.isActive) {
      alert(`Shop plan is expired (${subCheck.expiryFormatted || 'Expired'}). Editing pricing is locked.`);
      return;
    }
    setEditingPriceId(p.id);
    setInlineCost(p.costPrice);
    setInlineSelling(p.sellingPrice);
    setInlineMrp(p.mrp);
  };

  const cancelInlinePriceEdit = () => {
    setEditingPriceId(null);
  };

  const saveInlinePrice = async (p: Product) => {
    if (!subCheck.isActive) {
      alert(`Shop plan is expired. Pricing changes cannot be saved.`);
      return;
    }
    if (inlineCost < 0 || inlineSelling < 0 || inlineMrp < 0 || isNaN(inlineCost) || isNaN(inlineSelling) || isNaN(inlineMrp)) {
      alert('Please enter valid positive price numbers.');
      return;
    }

    try {
      const updated: Product = {
        ...p,
        costPrice: inlineCost,
        sellingPrice: inlineSelling,
        mrp: inlineMrp,
        updatedAt: new Date().toISOString()
      };
      await AppRepository.products.save(updated);
      setEditingPriceId(null);
      setPriceSaveNotice(`ભાવ સફળતાપૂર્વક અપડેટ થયો: ${p.name} (Wholesale ₹${inlineCost.toFixed(2)} | MRP ₹${inlineMrp.toFixed(2)})`);
      setTimeout(() => setPriceSaveNotice(null), 3500);
      await loadProducts();
      if (onProductChanged) onProductChanged();
    } catch (err: any) {
      alert(`Failed to save price: ${err.message}`);
    }
  };

  const handlePrefillZeroStock = async (forceOverwrite = false) => {
    try {
      setLoading(true);
      const list = await AppRepository.products.prefillMasterCatalog(currentShop.id, forceOverwrite);
      setProducts(list);
      if (onProductChanged) onProductChanged();
      setPriceSaveNotice(`અમુલ માસ્ટર કેટલોગ 65+ આઇટમ્સ અને બારકોડ સાથે 0 સ્ટોકમાં સફળતાપૂર્વક અપડેટ થયું! (${list.length} Items ready with 0 stock)`);
      setTimeout(() => setPriceSaveNotice(null), 5000);
    } catch (err: any) {
      alert(`Failed to prefill catalog: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const generateBarcode = () => {
    // Generate valid 13-digit EAN-style barcode starting with 8901262 (Amul prefix)
    const rand = Math.floor(100000 + Math.random() * 900000);
    return `8901262${rand}`;
  };

  const openNewProductModal = () => {
    if (!subCheck.isActive) {
      alert(`Shop plan is expired (${subCheck.expiryFormatted || 'Expired'}). Adding new products is disabled. Please contact Admin to activate the 30-day plan.`);
      return;
    }
    setEditingProduct(null);
    setName('');
    setRegionalName('');
    setBarcode(generateBarcode());
    setSku(`AMUL-${Math.floor(100 + Math.random() * 900)}`);
    setCategory('Milk');
    setUnit('Pouch');
    setCostPrice(25);
    setSellingPrice(28);
    setMrp(28);
    setCurrentStock(40);
    setMinStockAlert(15);
    setImageUrl(AMUL_PRODUCT_IMAGE_PRESETS.TAAZA_MILK.dataUrl);
    setIsModalOpen(true);
  };

  const openEditProductModal = (p: Product) => {
    if (!subCheck.isActive) {
      alert(`Shop plan is expired (${subCheck.expiryFormatted || 'Expired'}). Product editing is locked in Read-Only mode.`);
      return;
    }
    setEditingProduct(p);
    setName(p.name);
    setRegionalName(p.regionalName || '');
    setBarcode(p.barcode);
    setSku(p.sku);
    setCategory(p.category);
    setUnit(p.unit);
    setCostPrice(p.costPrice);
    setSellingPrice(p.sellingPrice);
    setMrp(p.mrp);
    setCurrentStock(p.currentStock);
    setMinStockAlert(p.minStockAlert);
    setImageUrl(p.imageUrl || getAmulProductPresetImage(p.name, p.category));
    setIsModalOpen(true);
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setImageUrl(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subCheck.isActive) {
      alert(`Shop plan is expired. Modifications cannot be saved.`);
      return;
    }
    if (!name.trim() || !barcode.trim()) return;

    try {
      const nowIso = new Date().toISOString();
      const productData: Product = {
        id: editingProduct ? editingProduct.id : `prod-${currentShop.id}-${Date.now()}`,
        shopId: currentShop.id,
        name: name.trim(),
        regionalName: regionalName.trim() || undefined,
        barcode: barcode.trim(),
        sku: sku.trim() || `SKU-${Date.now()}`,
        category,
        unit,
        costPrice,
        sellingPrice,
        mrp,
        currentStock,
        minStockAlert,
        imageUrl: imageUrl || getAmulProductPresetImage(name.trim(), category),
        isActive: true,
        createdAt: editingProduct ? editingProduct.createdAt : nowIso,
        updatedAt: nowIso
      };

      await AppRepository.products.save(productData);
      setIsModalOpen(false);
      await loadProducts();
      onProductChanged?.();
    } catch (err: any) {
      alert(`Failed to save product: ${err.message}`);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!subCheck.isActive) {
      alert(`Shop plan is expired. Catalog changes are blocked in Read-Only mode.`);
      return;
    }
    if (!window.confirm('Delete this product from catalog? Past sales records will retain historical details.')) return;
    try {
      await AppRepository.products.delete(productId, currentShop.id);
      setProducts(prev => prev.filter(p => p.id !== productId));
      await loadProducts();
      onProductChanged?.();
    } catch (err: any) {
      alert(`Failed to delete product: ${err.message}`);
    }
  };

  const handleDeleteDuplicate = async (productId: string, productName: string) => {
    if (!subCheck.isActive) {
      alert(`Shop plan is expired (${subCheck.expiryFormatted || 'Expired'}). Deleting items is locked in Read-Only mode.`);
      return;
    }
    if (!window.confirm(`Are you sure you want to delete duplicate item "${productName}"? This change will synchronize across all devices immediately.`)) {
      return;
    }

    try {
      await AppRepository.products.delete(productId, currentShop.id);
      setProducts(prev => prev.filter(p => p.id !== productId));
      await loadProducts();
      onProductChanged?.();
      setDuplicateActionNotice(`ડુપ્લિકેટ આઇટમ "${productName}" સફળતાપૂર્વક ડિલીટ થઈ ગઈ છે. સ્ટોક રિપોર્ટ અપડેટ થઈ ગયો.`);
      setTimeout(() => setDuplicateActionNotice(null), 4500);
    } catch (err: any) {
      alert(`Failed to delete duplicate product: ${err.message}`);
    }
  };

  const handleMergeDuplicateStock = async (keeper: Product, duplicate: Product) => {
    if (!subCheck.isActive) {
      alert(`Shop plan is expired. Merging items is locked in Read-Only mode.`);
      return;
    }
    const dupStock = duplicate.currentStock || 0;
    const confirmMsg = dupStock > 0
      ? `ડુપ્લિકેટ આઇટમ "${duplicate.name}" નો ${dupStock} ${duplicate.unit || 'units'} સ્ટોક મુખ્ય આઇટમ "${keeper.name}" માં મર્જ કરીને ડુપ્લિકેટ આઇટમ ડિલીટ કરવી છે?`
      : `ડુપ્લિકેટ આઇટમ "${duplicate.name}" ડિલીટ કરી મુખ્ય આઇટમ "${keeper.name}" રાખવી છે?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const { primary: updatedKeeper } = await AppRepository.products.mergeDuplicates(
        currentShop.id,
        keeper,
        [duplicate]
      );

      setProducts(prev =>
        prev
          .filter(p => p.id !== duplicate.id)
          .map(p => (p.id === updatedKeeper.id ? updatedKeeper : p))
      );
      await loadProducts();
      onProductChanged?.();
      setDuplicateActionNotice(`સ્ટોક સફળતાપૂર્વક મર્જ થયો! ${dupStock} ${duplicate.unit || 'units'} મુખ્ય આઇટમમાં ઉમેરાયા અને ડુપ્લિકેટ કાયમ માટે દૂર થઈ.`);
      setTimeout(() => setDuplicateActionNotice(null), 4500);
    } catch (err: any) {
      alert(`Failed to merge duplicate items: ${err.message}`);
    }
  };

  const handleAutoMergeAllDuplicates = async () => {
    if (!subCheck.isActive) {
      alert('Shop plan is expired.');
      return;
    }
    if (duplicateGroups.length === 0) return;
    if (!window.confirm(`તમામ ${duplicateGroups.length} ડુપ્લિકેટ ગ્રૂપમાંથી સ્ટોક આપોઆપ મુખ્ય આઇટમમાં મર્જ કરીને વધારાની ડુપ્લિકેટ્સ ડિલીટ કરવી છે? આ પ્રક્રિયા પછી તમારો કેટલોગ સંપૂર્ણપણે સચોટ અને યુનિક થઈ જશે.`)) {
      return;
    }

    setIsMergingAll(true);
    try {
      const groupsCount = duplicateGroups.length;
      for (const group of duplicateGroups) {
        const redundantItems = group.items.filter(it => it.id !== group.primaryItem.id);
        if (redundantItems.length === 0) continue;
        await AppRepository.products.mergeDuplicates(
          currentShop.id,
          group.primaryItem,
          redundantItems
        );
      }

      await loadProducts();
      onProductChanged?.();
      setDuplicateActionNotice(`તમામ ${groupsCount} ડુપ્લિકેટ ગ્રૂપ્સ સફળતાપૂર્વક મર્જ થઈ ગયા અને સ્ટોક સચોટ થઈ ગયો.`);
      setTimeout(() => setDuplicateActionNotice(null), 5000);
    } catch (err: any) {
      alert(`Failed to auto-merge duplicates: ${err.message}`);
    } finally {
      setIsMergingAll(false);
    }
  };

  const categories: ProductCategory[] = [
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

  const units: Product['unit'][] = [
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

  const filtered = products.filter(p => {
    const matchCat = categoryFilter === 'ALL' || p.category === categoryFilter;
    const matchSearch =
      searchTerm === '' ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcode.includes(searchTerm) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Plan Expired Warning Banner */}
      {!subCheck.isActive && (
        <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-amber-900">
                Shop Plan Expired (Read-Only Mode)
              </h4>
              <p className="text-xs text-amber-700 mt-0.5">
                Expired on {subCheck.expiryFormatted}. Product catalog and price lists remain fully preserved and searchable. To add or modify products, contact Admin to activate the 30-day plan.
              </p>
            </div>
          </div>
          <span className="shrink-0 text-xs font-bold bg-amber-600 text-white px-3 py-1.5 rounded-lg shadow-xs">
            Read-Only
          </span>
        </div>
      )}

      {/* Header & Controls */}
      <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            Amul Product Catalog & Shelf Management
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure product SKUs, assign barcodes for USB scanners, update retail MRPs and minimum stock thresholds.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsExcelModalOpen(true)}
            disabled={!subCheck.isActive}
            className={`${
              subCheck.isActive
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            } text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm`}
            title="Upload Excel (.xlsx or .csv) to bulk add or update products and stock"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Import Products from Excel</span>
          </button>

          <button
            onClick={handleExportProductsToExcel}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="Export all current products and stock to an Excel (.xlsx) file"
          >
            <Download className="w-4 h-4" />
            <span>Export to Excel</span>
          </button>

          <button
            onClick={() => {
              if (products.length > 0) {
                if (window.confirm('તમામ 65+ અમુલ પ્રોડક્ટ્સને 0 શરૂઆત સ્ટોક (Zero Stock) સાથે રીસેટ/અપડેટ કરવા માંગો છો?')) {
                  handlePrefillZeroStock(true);
                }
              } else {
                handlePrefillZeroStock(false);
              }
            }}
            disabled={loading}
            className="bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
            title="Populate complete official Amul product lineup with 0 stock and barcodes"
          >
            <Sparkles className="w-4 h-4" />
            <span>Pre-Fill (0 Stock)</span>
          </button>

          <button
            onClick={openNewProductModal}
            disabled={!subCheck.isActive}
            className={`${
              subCheck.isActive
                ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            } text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm`}
          >
            <Plus className="w-4 h-4" />
            {subCheck.isActive ? 'Add New Product' : 'Plan Expired (Read-Only)'}
          </button>
        </div>
      </div>

      {/* Catalog Table Card */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-5">
        {/* Main Sub-Tabs: All Products vs Duplicate Items */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCatalogSubTab('ALL')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                catalogSubTab === 'ALL'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>બધી પ્રોડક્ટ્સ / All Products ({products.length})</span>
            </button>

            <button
              onClick={() => setCatalogSubTab('DUPLICATES')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                catalogSubTab === 'DUPLICATES'
                  ? 'bg-rose-600 text-white shadow-xs ring-2 ring-rose-300'
                  : duplicateGroups.length > 0
                  ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <CopyX className="w-4 h-4" />
              <span>ડુપ્લિકેટ આઇટમ્સ / Duplicate Items</span>
              {duplicateGroups.length > 0 ? (
                <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black animate-pulse">
                  {duplicateGroups.length} Groups
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  0 Clean
                </span>
              )}
            </button>
          </div>

          {duplicateActionNotice && (
            <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-1.5 shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{duplicateActionNotice}</span>
            </div>
          )}
        </div>

        {catalogSubTab === 'DUPLICATES' ? (
          <div className="space-y-4">
            {/* Duplicate Scanner Header Banner */}
            <div className="bg-gradient-to-r from-rose-50 via-amber-50 to-orange-50 border border-rose-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                    <CopyX className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                      <span>ડુપ્લિકેટ આઇટમ્સ સ્કેનર / Duplicate Items Detector</span>
                      <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                        Barcode &amp; SKU Scanner
                      </span>
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      સરખા બારકોડ (Barcode), SKU અથવા નામ ધરાવતી આઇટમ્સ. ડુપ્લિકેટ એન્ટ્રી ડિલીટ અથવા મર્જ કરી સ્ટોક સચોટ રાખો.
                    </p>
                  </div>
                </div>
              </div>

              {duplicateGroups.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAutoMergeAllDuplicates}
                    disabled={isMergingAll || !subCheck.isActive}
                    className="bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                    title="Combine all duplicate stocks into primary items and delete redundant copies"
                  >
                    <GitMerge className="w-4 h-4" />
                    <span>{isMergingAll ? 'મર્જ થઈ રહ્યું છે...' : 'તમામ ડુપ્લિકેટ્સ મર્જ કરો / Auto-Merge All'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Filter Pills & Barcode/Name Search Bar */}
            {duplicateGroups.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 border border-slate-200 p-3 rounded-xl">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5" />
                    <span>ફિલ્ટર:</span>
                  </span>
                  <button
                    onClick={() => setDuplicateFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      duplicateFilter === 'ALL'
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <span>બધા ડુપ્લિકેટ્સ ({duplicateGroups.length})</span>
                  </button>

                  <button
                    onClick={() => setDuplicateFilter('BARCODE')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      duplicateFilter === 'BARCODE'
                        ? 'bg-rose-600 text-white shadow-xs ring-1 ring-rose-400'
                        : 'bg-white text-rose-700 hover:bg-rose-50 border border-rose-200'
                    }`}
                  >
                    <Barcode className="w-3.5 h-3.5" />
                    <span>બારકોડ મેચ / Barcode ({barcodeMatchesCount})</span>
                  </button>

                  <button
                    onClick={() => setDuplicateFilter('SKU')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      duplicateFilter === 'SKU'
                        ? 'bg-amber-600 text-white shadow-xs ring-1 ring-amber-400'
                        : 'bg-white text-amber-700 hover:bg-amber-50 border border-amber-200'
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span>SKU મેચ / SKU ({skuMatchesCount})</span>
                  </button>

                  <button
                    onClick={() => setDuplicateFilter('NAME')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      duplicateFilter === 'NAME'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <span>નામ મેચ / Name ({nameMatchesCount})</span>
                  </button>
                </div>

                <div className="relative min-w-[220px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="બારકોડ અથવા પ્રોડક્ટ શોધો / Search Barcode..."
                    value={duplicateSearchTerm}
                    onChange={e => setDuplicateSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-rose-500 placeholder:text-slate-400"
                  />
                  {duplicateSearchTerm && (
                    <button
                      onClick={() => setDuplicateSearchTerm('')}
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Empty State: No Duplicates in Catalog */}
            {duplicateGroups.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-10 text-center space-y-3">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs border border-emerald-200">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">
                    કોઈ ડુપ્લિકેટ આઇટમ મળી નથી! (No Duplicate Items Found)
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                    તમારો કેટલોગ સંપૂર્ણપણે ક્લીન અને સચોટ છે. કોઈ સરખા બારકોડ, SKU અથવા નામ ધરાવતી વધારાની આઇટમ્સ નથી.
                  </p>
                </div>
                <button
                  onClick={() => setCatalogSubTab('ALL')}
                  className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition cursor-pointer shadow-xs"
                >
                  સામાન્ય કેટલોગ પર પાછા જાઓ / View All Products
                </button>
              </div>
            ) : filteredDuplicateGroups.length === 0 ? (
              /* Filter / Search yielded no results */
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center space-y-2">
                <div className="w-10 h-10 bg-slate-200 text-slate-500 rounded-xl flex items-center justify-center mx-auto">
                  <Filter className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-slate-800">
                  પસંદ કરેલ ફિલ્ટરમાં કોઈ ડુપ્લિકેટ આઇટમ નથી (No Matching Duplicate Groups)
                </h4>
                <p className="text-[11px] text-slate-500">
                  કૃપા કરીને અન્ય ફિલ્ટર પસંદ કરો અથવા સર્ચ ટર્મ સાફ કરો.
                </p>
                <button
                  onClick={() => { setDuplicateFilter('ALL'); setDuplicateSearchTerm(''); }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer pt-1 inline-block"
                >
                  બધા ડુપ્લિકેટ્સ બતાવો / Reset Filters
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredDuplicateGroups.map((group, groupIdx) => (
                  <div
                    key={group.id}
                    className="border-2 border-rose-200 bg-white rounded-xl p-4 shadow-xs space-y-3"
                  >
                    {/* Group Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-rose-100">
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-full bg-rose-100 text-rose-800 font-black text-xs flex items-center justify-center shrink-0">
                          {groupIdx + 1}
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-900">
                              {group.title}
                            </span>
                            {group.sharedBarcode && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-xs font-mono font-black shadow-2xs">
                                <Barcode className="w-3.5 h-3.5 text-rose-600" />
                                <span>Barcode: {group.sharedBarcode}</span>
                              </span>
                            )}
                            {group.sharedSku && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-mono font-bold">
                                <Tag className="w-3 h-3 text-amber-600" />
                                <span>SKU: {group.sharedSku}</span>
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              કારણ: {group.reasonLabel}
                            </span>
                            <span>• {group.items.length} Duplicate Copies</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                          કુલ સ્ટોક: <strong className="text-blue-700">{group.totalStock}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Duplicate Items Grid Comparison */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {group.items.map((item) => {
                        const isPrimary = item.id === group.primaryItem.id;
                        const isBarcodeMatch = Boolean(
                          group.sharedBarcode &&
                          normalizeBarcode(item.barcode) === normalizeBarcode(group.sharedBarcode)
                        );
                        const isSkuMatch = Boolean(
                          group.sharedSku &&
                          normalizeSku(item.sku) === normalizeSku(group.sharedSku)
                        );

                        return (
                          <div
                            key={item.id}
                            className={`p-3 rounded-xl border transition flex flex-col justify-between ${
                              isPrimary
                                ? 'bg-emerald-50/60 border-emerald-300 ring-1 ring-emerald-300'
                                : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 p-0.5 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                                    <img
                                      src={item.imageUrl || getAmulProductPresetImage(item.name, item.category)}
                                      alt=""
                                      className="w-full h-full object-contain"
                                    />
                                  </div>
                                  <div className="truncate">
                                    <div className="font-bold text-xs text-slate-900 truncate">
                                      {item.name}
                                    </div>
                                    {item.regionalName && (
                                      <div className="text-[10px] text-slate-500 truncate">
                                        {item.regionalName}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {isPrimary ? (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold uppercase shrink-0">
                                    ✓ રાખવા માટે ભલામણ (Primary)
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-300 text-[10px] font-bold uppercase shrink-0">
                                    ડુપ્લિકેટ (Redundant)
                                  </span>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-white p-2 rounded-lg border border-slate-100 mb-3">
                                <div className={isBarcodeMatch ? 'p-1 rounded bg-rose-50/80 border border-rose-200' : ''}>
                                  <span className="text-slate-400 block text-[9px] uppercase font-sans flex items-center gap-1">
                                    <Barcode className="w-3 h-3 text-rose-600" />
                                    <span>Barcode:</span>
                                  </span>
                                  <span className={`font-bold font-mono ${isBarcodeMatch ? 'text-rose-800' : 'text-slate-800'}`}>
                                    {item.barcode || '—'}
                                  </span>
                                </div>
                                <div className={isSkuMatch ? 'p-1 rounded bg-amber-50/80 border border-amber-200' : ''}>
                                  <span className="text-slate-400 block text-[9px] uppercase font-sans flex items-center gap-1">
                                    <Tag className="w-3 h-3 text-amber-600" />
                                    <span>SKU:</span>
                                  </span>
                                  <span className={`font-bold font-mono ${isSkuMatch ? 'text-amber-800' : 'text-slate-800'}`}>
                                    {item.sku || '—'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-400 block text-[9px] uppercase font-sans">સ્ટોક (Stock):</span>
                                  <span className="font-black text-blue-700 text-xs">
                                    {item.currentStock ?? 0} {item.unit || 'units'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-400 block text-[9px] uppercase font-sans">કિંમત (Cost/MRP):</span>
                                  <span className="font-bold text-slate-700">₹{item.costPrice} / ₹{item.mrp}</span>
                                </div>
                              </div>
                            </div>

                            {/* Item Actions */}
                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/80">
                              <button
                                onClick={() => openEditProductModal(item)}
                                className="p-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition cursor-pointer"
                                title="Edit Product Details"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              {!isPrimary && (
                                <>
                                  <button
                                    onClick={() => handleMergeDuplicateStock(group.primaryItem, item)}
                                    className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                    title="Add this duplicate's stock to the primary item and delete this duplicate"
                                  >
                                    <GitMerge className="w-3.5 h-3.5" />
                                    <span>સ્ટોક મર્જ કરી ડિલીટ</span>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteDuplicate(item.id, item.name)}
                                    className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                    title="Delete this duplicate immediately"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>ડિલીટ / Delete</span>
                                  </button>
                                </>
                              )}

                              {isPrimary && (
                                <button
                                  onClick={() => handleDeleteDuplicate(item.id, item.name)}
                                  className="px-2 py-1 text-slate-400 hover:text-rose-600 text-[11px] font-semibold transition cursor-pointer"
                                  title="Delete Item"
                                >
                                  દૂર કરો
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex gap-1.5 overflow-x-auto pb-1 max-w-xl">
                {['ALL', ...categories].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition ${
                      categoryFilter === cat
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="relative min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search product name, barcode..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {priceSaveNotice && (
              <div className="mb-4 p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2 shadow-2xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{priceSaveNotice}</span>
              </div>
            )}

            <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-y border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Product Photo &amp; Details</th>
                <th className="py-2.5 px-2">Category</th>
                <th className="py-2.5 px-2 text-right">Cost (Wholesale)</th>
                <th className="py-2.5 px-2 text-right">Selling Price</th>
                <th className="py-2.5 px-2 text-right">MRP</th>
                <th className="py-2.5 px-3 text-right">Current Stock</th>
                <th className="py-2.5 px-2 text-center">Alert Level</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filtered.map(p => {
                const isLow = p.currentStock <= p.minStockAlert;
                const isEditingThis = editingPriceId === p.id;
                return (
                  <tr key={p.id} className={`transition ${isEditingThis ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}>
                    <td className="py-2.5 px-3 font-sans">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                          <img
                            src={p.imageUrl || getAmulProductPresetImage(p.name, p.category)}
                            alt={p.name}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = getAmulProductPresetImage(p.name, p.category);
                            }}
                          />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900">{p.name}</div>
                          {p.regionalName && <div className="text-[11px] text-slate-500">{p.regionalName}</div>}
                          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                            <Barcode className="w-3 h-3 text-slate-400" />
                            <span>{p.barcode}</span>
                            <span>• SKU: {p.sku}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 font-sans">
                      <span className="bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded font-medium">
                        {p.category}
                      </span>
                    </td>

                    {/* Wholesale Cost Price Cell (Editable) */}
                    <td className="py-2.5 px-2 text-right">
                      {isEditingThis ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-slate-400 text-[10px]">₹</span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={inlineCost}
                            onChange={e => setInlineCost(Number(e.target.value))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveInlinePrice(p);
                              if (e.key === 'Escape') cancelInlinePriceEdit();
                            }}
                            className="w-16 px-1.5 py-1 text-right bg-white border border-blue-400 rounded-md font-mono text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                            title="Wholesale Cost Rate (Enter to save)"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <span
                          onClick={() => startInlinePriceEdit(p)}
                          className="cursor-pointer text-slate-600 hover:text-blue-700 font-mono hover:underline"
                          title="Click to edit Wholesale Cost Price"
                        >
                          ₹{p.costPrice.toFixed(2)}
                        </span>
                      )}
                    </td>

                    {/* Selling Price Cell (Editable) */}
                    <td className="py-2.5 px-2 text-right">
                      {isEditingThis ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-slate-400 text-[10px]">₹</span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={inlineSelling}
                            onChange={e => setInlineSelling(Number(e.target.value))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveInlinePrice(p);
                              if (e.key === 'Escape') cancelInlinePriceEdit();
                            }}
                            className="w-16 px-1.5 py-1 text-right bg-white border border-blue-400 rounded-md font-mono text-xs font-bold text-blue-700 focus:ring-2 focus:ring-blue-500"
                            title="Retail Selling Price (Enter to save)"
                          />
                        </div>
                      ) : (
                        <span
                          onClick={() => startInlinePriceEdit(p)}
                          className="cursor-pointer font-bold text-blue-700 hover:text-blue-900 font-mono hover:underline"
                          title="Click to edit Selling Price"
                        >
                          ₹{p.sellingPrice.toFixed(2)}
                        </span>
                      )}
                    </td>

                    {/* MRP Cell (Editable) */}
                    <td className="py-2.5 px-2 text-right">
                      {isEditingThis ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-slate-400 text-[10px]">₹</span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={inlineMrp}
                            onChange={e => setInlineMrp(Number(e.target.value))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveInlinePrice(p);
                              if (e.key === 'Escape') cancelInlinePriceEdit();
                            }}
                            className="w-16 px-1.5 py-1 text-right bg-white border border-blue-400 rounded-md font-mono text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                            title="Printed MRP (Enter to save)"
                          />
                        </div>
                      ) : (
                        <span
                          onClick={() => startInlinePriceEdit(p)}
                          className="cursor-pointer text-slate-800 hover:text-blue-700 font-mono hover:underline"
                          title="Click to edit MRP"
                        >
                          ₹{p.mrp.toFixed(2)}
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right font-black text-slate-900 text-sm">
                      {p.currentStock} <span className="text-[10px] font-normal text-slate-500 font-sans">{p.unit}</span>
                    </td>
                    <td className="py-2.5 px-2 text-center font-sans">
                      {isLow ? (
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Low (≤{p.minStockAlert})
                        </span>
                      ) : (
                        <span className="bg-emerald-50 text-emerald-700 text-[10px] font-medium px-2 py-0.5 rounded-full">
                          OK ({p.minStockAlert})
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right font-sans">
                      {isEditingThis ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => saveInlinePrice(p)}
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition shadow-xs cursor-pointer"
                            title="Save Prices (Enter)"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={cancelInlinePriceEdit}
                            className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition cursor-pointer"
                            title="Cancel (Esc)"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => startInlinePriceEdit(p)}
                            className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            title="Quick Edit Prices (Wholesale &amp; MRP)"
                          >
                            <Tag className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEditProductModal(p)}
                            className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            title="Edit Full Product Details"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(p.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Delete Product"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="py-12 text-center">
              <div className="w-14 h-14 bg-blue-50 text-[#005A9C] rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Package className="w-7 h-7" />
              </div>
              <h3 className="font-extrabold text-sm text-slate-800">
                {products.length === 0 ? 'કેટલોગમાં કોઈ પ્રોડક્ટ નથી (Catalog is Blank)' : 'કોઈ મેળ ખાતી પ્રોડક્ટ નથી (No Products Found)'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                {products.length === 0
                  ? 'તમારી દુકાનમાં 65+ અમુલ આઇટમ્સ (દૂધ, દહીં, ઘી, બટર, ચીઝ, આઈસ્ક્રીમ) 0 નંગ સ્ટોક સાથે ઉમેરો જેથી માલ ખરીદી (Purchase) અને બિલિંગમાં સરળતા રહે.'
                  : 'કૃપા કરીને સર્ચ ટર્મ અથવા કેટેગરી ફિલ્ટર બદલીને ફરી તપાસો.'}
              </p>
              {products.length === 0 && (
                <button
                  onClick={() => handlePrefillZeroStock(false)}
                  disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm transition inline-flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Pre-fill Master Amul Catalog (0 Stock) • 65+ આઇટમ્સ ભરો</span>
                </button>
              )}
            </div>
          )}
        </div>
          </>
        )}
      </div>

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 my-6">
            <h3 className="font-extrabold text-base text-slate-900 mb-1">
              {editingProduct ? `Edit Product: ${editingProduct.name}` : 'Add New Amul Product to Catalog'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter product barcode, pricing, packaging unit, and stock alerts.
            </p>

            <form onSubmit={handleSaveProduct} className="space-y-3.5">
              {/* Product Photo Upload & Presets Section */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-blue-600" />
                    <span>Product Photo / Image</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">Offline IndexedDB Storage</span>
                </label>

                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl bg-white border-2 border-slate-200 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
                    <img
                      src={imageUrl || getAmulProductPresetImage(name || 'Amul', category)}
                      alt="Product preview"
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = getAmulProductPresetImage(name, category);
                      }}
                    />
                  </div>

                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-2xs">
                        <Upload className="w-3.5 h-3.5 text-blue-600" />
                        <span>Upload Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageFileUpload}
                          className="hidden"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => setImageUrl(getAmulProductPresetImage(name, category))}
                        className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                      >
                        Auto-match Preset
                      </button>
                    </div>

                    <input
                      type="text"
                      placeholder="Or paste image URL (https://...)"
                      value={imageUrl.startsWith('data:') ? 'Custom local image uploaded ✓' : imageUrl}
                      onChange={e => setImageUrl(e.target.value)}
                      className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-[11px] font-mono text-slate-700"
                    />
                  </div>
                </div>

                {/* Quick Dairy Presets */}
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Choose Amul Preset:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(AMUL_PRODUCT_IMAGE_PRESETS).map(([key, preset]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setImageUrl(preset.dataUrl)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded transition cursor-pointer ${
                          imageUrl === preset.dataUrl
                            ? 'bg-[#005A9C] text-white shadow-2xs'
                            : 'bg-white hover:bg-slate-200 border border-slate-200 text-slate-700'
                        }`}
                      >
                        {preset.name.split('(')[0].trim()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Product Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Amul Taaza Toned Milk (500ml)"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Regional Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. અમૂલ તાઝા દૂધ"
                  value={regionalName}
                  onChange={e => setRegionalName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Barcode (EAN-13)</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      required
                      value={barcode}
                      onChange={e => setBarcode(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setBarcode(generateBarcode())}
                      className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition"
                      title="Generate test barcode"
                    >
                      Gen
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">SKU Code</label>
                  <input
                    type="text"
                    value={sku}
                    onChange={e => setSku(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as ProductCategory)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                  >
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Packaging Unit</label>
                  <select
                    value={unit}
                    onChange={e => setUnit(e.target.value as Product['unit'])}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                  >
                    {units.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cost Price (₹)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={costPrice}
                    onChange={e => setCostPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Selling Price (₹)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={sellingPrice}
                    onChange={e => setSellingPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs font-bold text-blue-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Printed MRP (₹)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={mrp}
                    onChange={e => setMrp(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Current Stock Quantity</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={currentStock}
                    onChange={e => setCurrentStock(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Low-Stock Alert Level</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={minStockAlert}
                    onChange={e => setMinStockAlert(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs text-amber-700 font-bold"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
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
                  {editingProduct ? 'Save Changes' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Excel Product Bulk Import Modal */}
      <ExcelProductImportModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        currentShop={currentShop}
        onImportComplete={({ added, updated }) => {
          loadProducts();
          onProductChanged?.();
          setPriceSaveNotice(`Excel Import Success: ${added} new products added, ${updated} existing products updated!`);
          setTimeout(() => setPriceSaveNotice(null), 5000);
        }}
      />
    </div>
  );
};
