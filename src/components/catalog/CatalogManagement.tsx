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
  Sparkles
} from 'lucide-react';
import { Product, ProductCategory, Shop } from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';
import { isShopSubscriptionActive } from '../../storage/subscription.ts';
import { getAmulProductPresetImage, AMUL_PRODUCT_IMAGE_PRESETS } from '../../storage/productImages.ts';

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

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

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

  useEffect(() => {
    loadProducts();
  }, [currentShop.id]);

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
      await AppRepository.products.delete(productId);
      await loadProducts();
      onProductChanged?.();
    } catch (err: any) {
      alert(`Failed to delete product: ${err.message}`);
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

        <button
          onClick={openNewProductModal}
          disabled={!subCheck.isActive}
          className={`${
            subCheck.isActive
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-slate-300 text-slate-500 cursor-not-allowed'
          } text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm`}
        >
          <Plus className="w-4 h-4" />
          {subCheck.isActive ? 'Add New Product' : 'Plan Expired (Read-Only)'}
        </button>
      </div>

      {/* Catalog Table Card */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-5">
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
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition">
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
                    <td className="py-2.5 px-2 text-right text-slate-600">₹{p.costPrice.toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-right font-bold text-blue-700">₹{p.sellingPrice.toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-right text-slate-800">₹{p.mrp.toFixed(2)}</td>
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
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditProductModal(p)}
                          className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
                          title="Edit Product"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(p.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Delete Product"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
                    step="0.1"
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
                    step="0.1"
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
                    step="0.1"
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
    </div>
  );
};
