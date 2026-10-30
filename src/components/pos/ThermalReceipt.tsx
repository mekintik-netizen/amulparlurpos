/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Production-Grade Thermal Receipt Printer Component
 * Compatible with USB & Bluetooth 58mm (2-inch) and 80mm (3-inch) POS Roll Printers.
 * Uses native browser-based printing via window.print() and verified @media print CSS.
 * 
 * Features:
 * - Print-only isolation: hides modals, backgrounds, buttons, and website navigation.
 * - 58mm & 80mm calibrated widths to prevent text clipping and blank pages.
 * - Truthful printing: explains Windows 11 USB/Bluetooth driver & pairing requirements.
 * - Anti-duplicate print debounce protection.
 * - Integrated Windows 11 Printer Setup Guide & Calibration Test Receipt.
 */

import React, { useState, useRef } from 'react';
import { 
  Printer, 
  X, 
  HelpCircle, 
  Usb, 
  Bluetooth, 
  CheckCircle2, 
  AlertTriangle, 
  FileText,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { SaleBill, Shop } from '../../types/index.ts';

interface ThermalReceiptProps {
  bill: SaleBill | null;
  shop: Shop | null;
  paperWidth: '58mm' | '80mm';
  onClose: () => void;
  onPaperWidthChange: (width: '58mm' | '80mm') => void;
}

export const ThermalReceipt: React.FC<ThermalReceiptProps> = ({
  bill,
  shop,
  paperWidth,
  onClose,
  onPaperWidthChange
}) => {
  const [isPrinting, setIsPrinting] = useState(false);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [isTestReceiptMode, setIsTestReceiptMode] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!bill || !shop) return null;

  // Debounced safe print trigger to prevent duplicate print windows
  const handlePrint = () => {
    if (isPrinting) return;
    setIsPrinting(true);

    try {
      window.print();
    } catch (err) {
      console.error('Print trigger failed:', err);
    } finally {
      // Re-enable after print dialog closes
      setTimeout(() => {
        setIsPrinting(false);
      }, 1000);
    }
  };

  const activeBill = isTestReceiptMode
    ? {
        ...bill,
        billNumber: 'TEST-ROLL-CALIBRATION',
        items: [
          {
            productId: 'test-1',
            productName: 'Amul Taaza Milk 500ml',
            barcode: '8901262010014',
            quantity: 2,
            unit: 'Pouch',
            mrp: 27,
            unitPrice: 27,
            costPrice: 24.5,
            total: 54
          },
          {
            productId: 'test-2',
            productName: 'Amul Butter 100g Pack',
            barcode: '8901262010151',
            quantity: 1,
            unit: 'Pack',
            mrp: 60,
            unitPrice: 60,
            costPrice: 54,
            total: 60
          }
        ],
        itemCount: 3,
        subtotal: 114,
        discountAmount: 0,
        taxAmount: 0,
        roundOff: 0,
        finalAmount: 114,
        paymentMode: 'CASH' as const,
        status: 'COMPLETED' as const,
        notes: 'Printer Alignment Test'
      }
    : bill;

  const formattedDate = new Date(activeBill.timestamp).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  return (
    <div
      id="thermal-modal-overlay"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div
        id="thermal-modal-card"
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[96vh]"
      >
        {/* Modal Controls Header (Hidden in Print) */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-sm">Thermal Receipt Preview</h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Paper Width Toggle */}
            <div className="bg-slate-800 p-0.5 rounded-lg border border-slate-700 flex text-xs font-semibold">
              <button
                type="button"
                onClick={() => onPaperWidthChange('58mm')}
                className={`px-2.5 py-1 rounded-md transition ${
                  paperWidth === '58mm' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
              >
                58mm (2")
              </button>
              <button
                type="button"
                onClick={() => onPaperWidthChange('80mm')}
                className={`px-2.5 py-1 rounded-md transition ${
                  paperWidth === '80mm' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
              >
                80mm (3")
              </button>
            </div>

            <button
              onClick={() => setShowSetupGuide(!showSetupGuide)}
              className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition ${
                showSetupGuide
                  ? 'bg-amber-500 text-slate-950 border-amber-500'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
              }`}
              title="Windows 11 USB & Bluetooth Printer Setup Instructions"
            >
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Printer Guide</span>
            </button>

            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Windows 11 Printer Instructions Panel (Collapsible, Hidden in Print) */}
        {showSetupGuide && (
          <div className="bg-slate-50 border-b border-slate-200 p-4 text-xs space-y-3 overflow-y-auto max-h-64 no-print font-sans">
            <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
              <HelpCircle className="w-4 h-4 text-blue-600" />
              Windows 11 Thermal Printer Configuration Checklist
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-800 flex items-center gap-1 mb-1">
                  <Usb className="w-3.5 h-3.5 text-blue-600" />
                  A. USB Thermal Printer
                </div>
                <p className="text-slate-600 leading-relaxed">
                  1. Connect printer via USB to Windows 11 PC.<br />
                  2. Install manufacturer driver (e.g. POS-58 / POS-80 / Xprinter / Epson).<br />
                  3. Verify in <em>Windows Settings &gt; Bluetooth & devices &gt; Printers</em>.
                </p>
              </div>

              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-800 flex items-center gap-1 mb-1">
                  <Bluetooth className="w-3.5 h-3.5 text-blue-600" />
                  B. Bluetooth Thermal Printer
                </div>
                <p className="text-slate-600 leading-relaxed">
                  1. Turn on printer pairing mode.<br />
                  2. In Windows 11: <em>Settings &gt; Bluetooth & devices &gt; Add device</em>.<br />
                  3. Pair PIN (usually <code>0000</code> or <code>1234</code>). Windows creates standard spooler port.
                </p>
              </div>
            </div>

            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-2.5 text-[11px] text-blue-900 space-y-1">
              <div className="font-bold text-blue-950">
                C & D. Critical Chrome / Edge Print Dialog Settings:
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                <li><strong>Destination:</strong> Select your thermal printer (e.g. "POS-58", "POS-80", or "Microsoft Print to PDF").</li>
                <li><strong>Paper size:</strong> Choose matching roll size (<em>58mm x Receipt</em> or <em>80mm x Receipt</em>).</li>
                <li><strong>Margins:</strong> Set to <strong>"None"</strong> or <strong>"Minimum"</strong> (prevents clipping).</li>
                <li><strong>Headers and footers:</strong> <strong>Uncheck</strong> (prevents browser printing URLs and dates).</li>
                <li><strong>Scale:</strong> Set to <strong>100%</strong> or <strong>Default</strong>.</li>
              </ul>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setIsTestReceiptMode(!isTestReceiptMode)}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition border ${
                  isTestReceiptMode
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {isTestReceiptMode ? '✓ Viewing Calibration Test Receipt' : 'Switch to Test Calibration Receipt'}
              </button>

              <button
                onClick={() => setShowSetupGuide(false)}
                className="text-slate-500 hover:text-slate-800 font-semibold"
              >
                Dismiss Guide
              </button>
            </div>
          </div>
        )}

        {/* Paper Container Preview */}
        <div id="thermal-paper-scroll" className="p-6 bg-slate-200 overflow-y-auto flex-1 flex justify-center">
          <div
            id="thermal-receipt-container"
            ref={receiptRef}
            style={{ fontFamily: "'Courier New', Courier, monospace" }}
            className={`bg-white text-black p-4 shadow-md font-mono border border-slate-300 ${
              paperWidth === '58mm' ? 'receipt-58mm' : 'receipt-80mm'
            }`}
          >
            {/* Header */}
            <div className="text-center pb-2 border-b border-dashed border-black">
              <div className="font-extrabold text-sm uppercase tracking-tight text-black">
                AMUL PARLOUR
              </div>
              <div className="font-bold text-xs mt-0.5 text-black">{shop.name}</div>
              <div className="text-[10px] text-black mt-0.5 leading-tight">
                {shop.address}, {shop.city}
              </div>
              <div className="text-[10px] text-black">Phone: {shop.phone}</div>
              <div className="text-[10px] font-semibold text-black mt-0.5">
                Shop ID: {shop.shopCode}
              </div>
              {shop.gstNumber && <div className="text-[10px] text-black">GSTIN: {shop.gstNumber}</div>}
              {shop.fssaiNumber && <div className="text-[10px] text-black">FSSAI: {shop.fssaiNumber}</div>}
            </div>

            {/* Bill Meta */}
            <div className="py-2 text-[10px] border-b border-dashed border-black space-y-0.5 text-black">
              <div className="flex justify-between font-bold">
                <span>Bill: {activeBill.billNumber}</span>
                <span>{activeBill.paymentMode}</span>
              </div>
              <div className="flex justify-between text-black">
                <span>Date: {formattedDate}</span>
                <span>Counter: {activeBill.cashierName}</span>
              </div>
              {activeBill.customerName && (
                <div className="flex justify-between text-black">
                  <span>Customer: {activeBill.customerName}</span>
                  {activeBill.customerPhone && <span>{activeBill.customerPhone}</span>}
                </div>
              )}
            </div>

            {/* Items Table (Calibrated for 58mm and 80mm roll widths) */}
            <div className="py-2 text-[11px] border-b border-dashed border-black text-black">
              {paperWidth === '58mm' ? (
                /* Compact 58mm Roll Layout: Product name on top, details on second line */
                <div className="space-y-1.5 text-[10px]">
                  <div className="flex justify-between font-bold uppercase border-b border-black pb-0.5 text-[9px]">
                    <span>Item & Qty x Rate</span>
                    <span className="text-right">Amt (Rs.)</span>
                  </div>
                  {activeBill.items.map((item, idx) => (
                    <div key={idx} className="leading-tight">
                      <div className="font-bold text-black break-words">
                        {item.productName}
                      </div>
                      <div className="flex justify-between text-[9px] text-black">
                        <span>
                          {item.quantity} {item.unit} x Rs.{item.unitPrice.toFixed(1)}
                        </span>
                        <span className="font-bold text-black">
                          Rs.{item.total.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Standard 80mm Roll Layout: 4-Column Table */
                <div>
                  <div className="grid grid-cols-12 font-bold pb-1 text-[10px] uppercase border-b border-black">
                    <span className="col-span-6">Item</span>
                    <span className="col-span-2 text-right">Qty</span>
                    <span className="col-span-2 text-right">Rate</span>
                    <span className="col-span-2 text-right">Amt</span>
                  </div>
                  <div className="space-y-1.5 pt-1 text-[10px]">
                    {activeBill.items.map((item, idx) => (
                      <div key={idx} className="grid grid-cols-12 items-start text-black">
                        <div className="col-span-6 font-semibold leading-tight break-words">
                          <div>{item.productName}</div>
                          <div className="text-[9px] text-black">{item.barcode}</div>
                        </div>
                        <span className="col-span-2 text-right font-mono">{item.quantity}</span>
                        <span className="col-span-2 text-right font-mono">Rs.{item.unitPrice.toFixed(1)}</span>
                        <span className="col-span-2 text-right font-bold font-mono">Rs.{item.total.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="py-2 text-[10px] space-y-1 border-b border-dashed border-black font-mono text-black">
              <div className="flex justify-between">
                <span>Total Items / Qty:</span>
                <span>
                  {activeBill.items.length} items / {activeBill.items.reduce((acc, i) => acc + i.quantity, 0)} pcs
                </span>
              </div>
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>Rs.{activeBill.subtotal.toFixed(2)}</span>
              </div>
              {activeBill.discountAmount > 0 && (
                <div className="flex justify-between text-black">
                  <span>Discount:</span>
                  <span>-Rs.{activeBill.discountAmount.toFixed(2)}</span>
                </div>
              )}
              {activeBill.taxAmount > 0 && (
                <div className="flex justify-between text-black">
                  <span>GST (Inclusive):</span>
                  <span>Rs.{activeBill.taxAmount.toFixed(2)}</span>
                </div>
              )}
              {activeBill.roundOff !== 0 && (
                <div className="flex justify-between text-black">
                  <span>Round Off:</span>
                  <span>
                    {activeBill.roundOff > 0
                      ? `+Rs.${activeBill.roundOff.toFixed(2)}`
                      : `-Rs.${Math.abs(activeBill.roundOff).toFixed(2)}`}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-xs pt-1 border-t border-black">
                <span>NET PAYABLE:</span>
                <span className="text-sm">Rs.{activeBill.finalAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Status & Barcode simulation */}
            <div className="text-center py-2 text-[9px] text-black space-y-1">
              <div className="font-semibold text-black uppercase">
                Payment: {activeBill.paymentMode} {activeBill.status === 'COMPLETED' ? '• PAID' : `• ${activeBill.status}`}
              </div>
              {activeBill.status === 'CANCELLED' && (
                <div className="text-black font-bold border border-black p-1">
                  *** CANCELLED SALE ***
                </div>
              )}
              <div className="pt-1 font-mono text-[10px] tracking-widest uppercase">
                * {activeBill.billNumber} *
              </div>
              <div className="text-[9px] text-black pt-1 leading-tight">
                Thank you for choosing Amul!
                <br />
                The Taste of India • Pure Milk Products
              </div>
            </div>
          </div>
        </div>

        {/* Action Footer (Hidden in Print) */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="text-xs text-slate-500">
            Uses your browser's printer dialog. Connect your USB or paired Bluetooth thermal printer.
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-900 text-xs font-semibold rounded-lg hover:bg-slate-100 transition"
            >
              Close
            </button>
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-lg shadow-md hover:shadow-lg transition flex items-center gap-2 disabled:bg-slate-400"
            >
              <Printer className="w-4 h-4" />
              {isPrinting ? 'Opening Print Dialog...' : `Print Receipt (${paperWidth})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
