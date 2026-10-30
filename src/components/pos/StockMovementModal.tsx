/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, PackagePlus, PackageMinus, Barcode, CheckCircle2 } from 'lucide-react';
import { Product, Shop, StockMovementType } from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';

interface StockMovementModalProps {
  currentShop: Shop;
  onClose: () => void;
  onSuccess: () => void;
}

export const StockMovementModal: React.FC<StockMovementModalProps> = ({
  currentShop,
  onClose,
  onSuccess
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [movementType, setMovementType] = useState<StockMovementType>('IN');
  const [quantity, setQuantity] = useState<number>(10);
  const [reason, setReason] = useState('Stock delivery from Amul Distributor');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    AppRepository.products.getByShop(currentShop.id).then((list) => {
      setProducts(list);
      if (list.length > 0) setSelectedProductId(list[0].id);
    });
  }, [currentShop.id]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || quantity <= 0) return;

    try {
      setIsSubmitting(true);
      await AppRepository.inventory.recordMovement({
        shopId: currentShop.id,
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        barcode: selectedProduct.barcode,
        movementType,
        quantity,
        unitPrice: selectedProduct.costPrice || selectedProduct.sellingPrice,
        reason: reason.trim() || 'Manual stock update',
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        createdBy: 'Shop Manager'
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      alert(`Failed to record stock movement: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {movementType === 'IN' ? (
              <PackagePlus className="w-5 h-5 text-emerald-400" />
            ) : (
              <PackageMinus className="w-5 h-5 text-rose-400" />
            )}
            <h3 className="font-bold text-sm">Stock In / Stock Out Management</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Movement Type Toggle */}
          <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setMovementType('IN');
                setReason('Stock delivery from Amul Distributor');
              }}
              className={`py-2 rounded-lg transition ${
                movementType === 'IN' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              + Stock In
            </button>
            <button
              type="button"
              onClick={() => {
                setMovementType('OUT');
                setReason('Damaged / Spoilage');
              }}
              className={`py-2 rounded-lg transition ${
                movementType === 'OUT' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              - Stock Out
            </button>
            <button
              type="button"
              onClick={() => {
                setMovementType('EXPIRY_DAMAGE');
                setReason('Expired Pouch Leaked');
              }}
              className={`py-2 rounded-lg transition ${
                movementType === 'EXPIRY_DAMAGE' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Expired / Leaked
            </button>
          </div>

          {/* Product Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Select Product</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Stock: {p.currentStock} {p.unit})
                </option>
              ))}
            </select>
          </div>

          {/* Quantity & Current Stock Display */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {movementType === 'IN' ? 'Quantity In' : 'Quantity Out'}
              </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Current Stock</label>
              <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-700">
                {selectedProduct?.currentStock || 0} {selectedProduct?.unit}
              </div>
            </div>
          </div>

          {/* Reason & Invoice Reference */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Reason / Note</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Delivery challan #9482, milk leakage, crate count"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Invoice / Delivery Challan # (Optional)
            </label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="e.g. AMUL-CHALLAN-8823"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-white transition flex items-center justify-center gap-2 ${
                movementType === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSubmitting ? 'Updating...' : `Confirm ${movementType === 'IN' ? 'Stock In' : 'Stock Out'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
