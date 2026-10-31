/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Hardware Diagnostics & Setup Assistant Modal
 * Helps shopkeepers verify, calibrate, and troubleshoot:
 * 1. USB/Bluetooth Barcode Scanner Guns (Live Scan Test + Product Match + Audio Beep)
 * 2. 58mm & 80mm Thermal Receipt Printers (Clean 1-Click Hardware Test Print)
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Usb, 
  Printer, 
  Barcode, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle, 
  Volume2, 
  Settings, 
  RefreshCw,
  ExternalLink,
  Info
} from 'lucide-react';
import { Product } from '../../types/index.ts';
import { playScannerBeep } from '../../hooks/useBarcodeScanner.ts';

interface HardwareDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  shopName: string;
  shopCode: string;
}

export const HardwareDiagnosticsModal: React.FC<HardwareDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  products,
  shopName,
  shopCode
}) => {
  const [activeTab, setActiveTab] = useState<'SCANNER' | 'PRINTER'>('SCANNER');
  
  // Scanner Test States
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const [lastScanSpeedMs, setLastScanSpeedMs] = useState<number | null>(null);
  const [matchedProduct, setMatchedProduct] = useState<Product | null>(null);
  const [scanHistory, setScanHistory] = useState<Array<{ code: string; time: string; name?: string }>>([]);
  const [testManualCode, setTestManualCode] = useState('');
  const testInputRef = useRef<HTMLInputElement>(null);

  // Printer Test States
  const [testPaperWidth, setTestPaperWidth] = useState<'58mm' | '80mm'>('80mm');
  const [testPrintSuccess, setTestPrintSuccess] = useState(false);

  // Buffer for scanner test
  const scanBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    if (isOpen && activeTab === 'SCANNER') {
      setTimeout(() => {
        testInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, activeTab]);

  // Scanner test listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore navigation or modifier keys
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;

      const now = Date.now();
      const timeSinceLastKey = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        const code = scanBufferRef.current.trim();
        scanBufferRef.current = '';

        if (code.length >= 6) {
          playScannerBeep();
          setLastScannedCode(code);
          setLastScanSpeedMs(timeSinceLastKey);
          
          const found = products.find(p => p.barcode === code || p.sku === code);
          setMatchedProduct(found || null);

          setScanHistory(prev => [
            { code, time: new Date().toLocaleTimeString(), name: found?.name },
            ...prev.slice(0, 4)
          ]);
        }
        return;
      }

      if (timeSinceLastKey > 60 && scanBufferRef.current.length > 0) {
        scanBufferRef.current = '';
      }

      if (e.key.length === 1) {
        scanBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, products]);

  // Execute clean thermal test print
  const handlePrintTestTicket = () => {
    const is58 = testPaperWidth === '58mm';
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) {
      alert('Please allow popups to execute the hardware thermal test print.');
      return;
    }

    const testTime = new Date().toLocaleString('en-IN');
    const widthStyle = is58 ? 'width: 58mm; max-width: 58mm;' : 'width: 80mm; max-width: 80mm;';

    const testHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Amul POS Thermal Printer Test</title>
        <style>
          @page {
            size: auto;
            margin: 0mm;
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            background: #fff;
            color: #000;
            margin: 0;
            padding: 4mm;
            font-size: ${is58 ? '10px' : '12px'};
            line-height: 1.25;
            -webkit-print-color-adjust: exact;
          }
          .ticket {
            ${widthStyle}
            margin: 0 auto;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .double { font-size: ${is58 ? '13px' : '15px'}; font-weight: 900; }
          .divider { border-top: 1px dashed #000; margin: 4px 0; }
          .flex-between { display: flex; justify-content: space-between; }
          .cut-margin { height: 18mm; }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="center double">*** AMUL PARLOUR ***</div>
          <div class="center bold">HARDWARE TEST TICKET</div>
          <div class="center">The Taste of India</div>
          <div class="divider"></div>
          <div>Outlet: ${shopName}</div>
          <div>Code  : ${shopCode}</div>
          <div>Date  : ${testTime}</div>
          <div>Width : ${testPaperWidth} Thermal Paper</div>
          <div class="divider"></div>
          <div class="center bold">DRIVER ALIGNMENT TEST</div>
          <div>[01] 1234567890 ABCDEFGHIJKLMNOP</div>
          <div>[02] Clean ASCII Text: OK</div>
          <div>[03] Line Feed & Margin: OK</div>
          <div>[04] Currency Test: Rs. 100.00</div>
          <div class="divider"></div>
          <div class="center bold">BARCODE SCANNER TEST CODE:</div>
          <div class="center bold double">* 8901262010014 *</div>
          <div class="center">Amul Taaza Milk 500ml</div>
          <div class="divider"></div>
          <div class="center bold">*** PRINTER READY ***</div>
          <div class="center">POS System is ready for live billing</div>
          <div class="cut-margin"></div>
        </div>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 800);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(testHtml);
    printWindow.document.close();

    setTestPrintSuccess(true);
    setTimeout(() => setTestPrintSuccess(false), 5000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 font-sans select-none">
      <div className="bg-white dark:bg-neutral-950 border border-slate-300 dark:border-neutral-800 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-neutral-800 flex items-center justify-between bg-slate-50 dark:bg-neutral-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#005A9C] text-white rounded-xl shadow-xs">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                Hardware Connection Assistant
                <span className="text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                  Diagnostic Utility
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-neutral-400">
                Test and calibrate your USB Barcode Scanner Gun and Thermal Receipt Printer
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200 dark:bg-neutral-800 hover:bg-slate-300 dark:hover:bg-neutral-700 flex items-center justify-center text-slate-700 dark:text-neutral-300 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 dark:border-neutral-800 bg-slate-100/70 dark:bg-neutral-900 px-6 pt-3 gap-2">
          <button
            onClick={() => setActiveTab('SCANNER')}
            className={`pb-3 px-4 text-xs font-bold transition-all flex items-center gap-2 border-b-2 cursor-pointer ${
              activeTab === 'SCANNER'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-extrabold'
                : 'border-transparent text-slate-500 dark:text-neutral-400 hover:text-slate-800'
            }`}
          >
            <Barcode className="w-4 h-4" />
            <span>Barcode Scanner Gun (USB / BT)</span>
          </button>

          <button
            onClick={() => setActiveTab('PRINTER')}
            className={`pb-3 px-4 text-xs font-bold transition-all flex items-center gap-2 border-b-2 cursor-pointer ${
              activeTab === 'PRINTER'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-extrabold'
                : 'border-transparent text-slate-500 dark:text-neutral-400 hover:text-slate-800'
            }`}
          >
            <Printer className="w-4 h-4" />
            <span>Thermal Receipt Printer (58mm / 80mm)</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* TAB 1: SCANNER TEST */}
          {activeTab === 'SCANNER' && (
            <div className="space-y-5">
              
              {/* Live Scanner Testing Box */}
              <div className="bg-slate-50 dark:bg-neutral-900 border-2 border-dashed border-blue-400 dark:border-blue-700 rounded-2xl p-5 text-center">
                <div className="inline-flex items-center justify-center p-3 bg-blue-100 dark:bg-blue-950/60 text-blue-600 rounded-2xl mb-2">
                  <Barcode className="w-7 h-7 animate-pulse" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Live Scanner Gun Detector
                </h4>
                <p className="text-xs text-slate-600 dark:text-neutral-400 mt-1 max-w-md mx-auto">
                  Hold your barcode gun, point it at any Amul product barcode (or test code below), and pull the trigger.
                </p>

                {/* Scanned Feedback */}
                {lastScannedCode ? (
                  <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl text-left flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 font-mono">
                          Scanned Code: {lastScannedCode}
                        </span>
                        <span className="text-[10px] bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200 px-2 py-0.5 rounded-full font-bold">
                          Gun Speed: {lastScanSpeedMs || 15}ms (Valid Hardware Gun)
                        </span>
                      </div>

                      {matchedProduct ? (
                        <div className="mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-900 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white">{matchedProduct.name}</span>
                            <span className="text-slate-500 dark:text-neutral-400 ml-2">({matchedProduct.category})</span>
                          </div>
                          <span className="font-bold font-mono text-emerald-700 dark:text-emerald-400">
                            MRP: ₹{matchedProduct.mrp.toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                          Barcode captured successfully, but item is not yet in this shop's catalog.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 py-3 px-4 bg-white dark:bg-neutral-950 border border-slate-200 dark:border-neutral-800 rounded-xl text-xs text-slate-400 dark:text-neutral-500 font-mono">
                    Waiting for hardware scan... [Listening to USB / BT Gun Keystrokes]
                  </div>
                )}

                {/* Quick Test Barcode to Scan from Screen */}
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-neutral-800 flex flex-wrap items-center justify-center gap-4 text-xs">
                  <span className="text-slate-500 font-medium">Sample Amul Barcodes for Screen Test:</span>
                  <code className="bg-slate-200 dark:bg-neutral-800 px-2 py-1 rounded font-bold font-mono text-slate-800 dark:text-slate-200">
                    8901262010014 (Taaza 500ml)
                  </code>
                  <code className="bg-slate-200 dark:bg-neutral-800 px-2 py-1 rounded font-bold font-mono text-slate-800 dark:text-slate-200">
                    8901262010021 (Gold 500ml)
                  </code>
                </div>
              </div>

              {/* Troubleshooting Instructions (Gujarati & English) */}
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-2xl p-4 text-xs text-amber-900 dark:text-amber-200 space-y-2">
                <div className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                  <Info className="w-4 h-4 shrink-0" />
                  <span>સ્કેનર ગન કનેક્ટ કરવાની સરળ રીત (Troubleshooting Tips):</span>
                </div>
                <ul className="list-disc pl-5 space-y-1.5 leading-relaxed text-[11px]">
                  <li>
                    <strong>USB પોર્ટ ચેક કરો:</strong> સ્કેનિંગ ગનનો USB કેબલ લેપટોપમાં ભરાવો. ગનમાં સામાન્ય રીતે લાલ/લીલી લાઈટ અને 'બીપ' અવાજ આવશે.
                  </li>
                  <li>
                    <strong>HID Keyboard Mode:</strong> બધી સ્કેનર ગન કીબોર્ડ તરીકે કામ કરે છે. ચેક કરવા માટે લેપટોપમાં <em>Notepad</em> ખોલીને કોઈ પ્રોડક્ટનો બારકોડ સ્કેન કરો. જો ત્યાં નંબર ટાઇપ થતો હોય તો ગન 100% ચાલુ છે.
                  </li>
                  <li>
                    <strong>ગ્લોબલ સ્કેનિંગ સુવિધા:</strong> આ સિસ્ટમમાં ગ્લોબલ લિસનર સેટ કરેલું છે, એટલે કે તમે સ્ક્રીન પર ગમે ત્યાં હોવ તો પણ ગનથી સ્કેન કરશો એટલે પ્રોડક્ટ સીધી બિલમાં ઍડ થઈ જશે!
                  </li>
                </ul>
              </div>

            </div>
          )}

          {/* TAB 2: THERMAL PRINTER TEST */}
          {activeTab === 'PRINTER' && (
            <div className="space-y-5">
              
              {/* Paper Width Selector */}
              <div className="bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-2xl p-4">
                <label className="block text-xs font-bold text-slate-800 dark:text-neutral-200 mb-2">
                  તમારા થર્મલ પ્રિન્ટરનું પેપર માપ સિલેક્ટ કરો (Select Receipt Paper Width):
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTestPaperWidth('80mm')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                      testPaperWidth === '80mm'
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-bold'
                        : 'border-slate-300 dark:border-neutral-800 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-neutral-300'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold">80mm Paper (3-inch Standard)</div>
                      <div className="text-[10px] text-slate-500 dark:text-neutral-400">TVS, Epson, Xprinter, Everycom POS</div>
                    </div>
                    {testPaperWidth === '80mm' && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setTestPaperWidth('58mm')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                      testPaperWidth === '58mm'
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-bold'
                        : 'border-slate-300 dark:border-neutral-800 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-neutral-300'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold">58mm Paper (2-inch Compact)</div>
                      <div className="text-[10px] text-slate-500 dark:text-neutral-400">Bluetooth / Compact Handheld POS</div>
                    </div>
                    {testPaperWidth === '58mm' && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                  </button>
                </div>
              </div>

              {/* 1-Click Test Print Trigger */}
              <div className="bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-2xl p-5 text-center">
                <Printer className="w-8 h-8 text-[#005A9C] mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  1-Click Thermal Printer Test Ticket
                </h4>
                <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1 max-w-sm mx-auto mb-4">
                  Sends a clean diagnostic ticket (ASCII / Courier font) with zero binary codes to verify printing and paper feed.
                </p>

                <button
                  type="button"
                  onClick={handlePrintTestTicket}
                  className="bg-[#005A9C] hover:bg-blue-800 active:bg-blue-950 text-white font-bold text-xs px-6 py-3 rounded-xl transition shadow-md flex items-center justify-center gap-2 mx-auto cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Diagnostic Test Ticket ({testPaperWidth})</span>
                </button>

                {testPrintSuccess && (
                  <div className="mt-3 text-xs text-emerald-700 dark:text-emerald-400 font-bold flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Test ticket dispatched to printer! Check your thermal paper.</span>
                  </div>
                )}
              </div>

              {/* Step-by-Step Printer Driver Guide */}
              <div className="bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-2xl p-4 text-xs space-y-2.5">
                <div className="font-bold text-slate-800 dark:text-neutral-200 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-blue-600" />
                  <span>થર્મલ પ્રિન્ટરમાં બ્લેન્ક અથવા બાઈનરી કોડ આવતો અટકાવવાની રીત (Windows Setup):</span>
                </div>
                <div className="text-[11px] text-slate-600 dark:text-neutral-400 space-y-1.5 pl-2 leading-relaxed">
                  <p>
                    1. <strong>Windows Printers & Scanners</strong> માં જઈ તમારા પ્રિન્ટર પર ક્લિક કરી <em>Printer Properties</em> ખોલો.
                  </p>
                  <p>
                    2. <strong>Paper Size</strong> માં <em>Letter / A4</em> ના બદલે <strong>80mm x 297mm</strong> અથવા <strong>Roll Paper</strong> સિલેક્ટ કરો.
                  </p>
                  <p>
                    3. <strong>Silent Printing (સુપરફાસ્ટ બિલિંગ):</strong> Chrome બ્રાઉઝરના શોર્ટકટમાં <code>--kiosk-printing</code> ઉમેરવાથી કોઈ પણ પ્રિન્ટ ડાયલોગ વગર સીધી જ 1 સેકન્ડમાં પ્રિન્ટ નીકળી જશે!
                  </p>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-100 dark:bg-neutral-900 border-t border-slate-200 dark:border-neutral-800 flex justify-between items-center text-xs">
          <div className="text-slate-500 dark:text-neutral-400">
            Current Shop: <strong>{shopName}</strong> ({shopCode})
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl font-bold cursor-pointer transition"
          >
            Done / Close
          </button>
        </div>

      </div>
    </div>
  );
};
