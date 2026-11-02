/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Admin Print Settings Customizer Tab
 * Allows Master Admin to customize thermal receipt headers, footers, layout spacing,
 * and roll compactness dynamically with real-time Firestore persistence and live receipt preview.
 */

import React, { useState, useEffect } from 'react';
import { 
  Printer, 
  Save, 
  RotateCcw, 
  CheckCircle2, 
  Eye, 
  Sparkles, 
  FileText, 
  Sliders, 
  HelpCircle,
  AlertCircle,
  Layers,
  Scissors
} from 'lucide-react';
import { PrintSettingsConfig, DEFAULT_PRINT_SETTINGS_CONFIG, Shop, SaleBill } from '../../types/index.ts';
import { getPrintSettingsConfig, savePrintSettingsConfig, resetPrintSettingsConfig } from '../../storage/printSettings.ts';

interface PrintSettingsTabProps {
  currentShop?: Shop | null;
  adminUsername?: string;
}

export const PrintSettingsTab: React.FC<PrintSettingsTabProps> = ({
  currentShop,
  adminUsername = 'Master Admin'
}) => {
  const [config, setConfig] = useState<PrintSettingsConfig>(DEFAULT_PRINT_SETTINGS_CONFIG);
  const [previewWidth, setPreviewWidth] = useState<'58mm' | '80mm'>('58mm');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeSubSection, setActiveSubSection] = useState<'HEADER' | 'FOOTER' | 'LAYOUT'>('HEADER');

  // Load configuration on mount
  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const loaded = await getPrintSettingsConfig();
        if (isMounted) {
          setConfig(loaded);
          setPreviewWidth(loaded.paperWidth || '58mm');
        }
      } catch (err: any) {
        console.warn('Could not load print settings:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggle = (key: keyof PrintSettingsConfig) => {
    setConfig((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleTextChange = (key: keyof PrintSettingsConfig, value: string) => {
    setConfig((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(null);
    setSaveError(null);

    try {
      await savePrintSettingsConfig(config, adminUsername);
      setSaveSuccess('Print settings successfully saved to Cloud Firestore! All connected shop counters are updated instantly.');
      setTimeout(() => setSaveSuccess(null), 5000);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save print settings to Firestore.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset all print settings to official Amul default recommendations?')) {
      return;
    }

    setIsSaving(true);
    try {
      const reset = await resetPrintSettingsConfig(adminUsername);
      setConfig(reset);
      setPreviewWidth(reset.paperWidth || '58mm');
      setSaveSuccess('Print settings reset to Amul defaults.');
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to reset settings.');
    } finally {
      setIsSaving(false);
    }
  };

  // Sample Shop & Bill for Live Preview
  const previewShop: Shop = currentShop || {
    id: 'demo-shop',
    shopCode: 'AP-GJ-0101',
    name: 'Amul Preferred Parlour - City Center',
    ownerName: 'Pravin Patel',
    phone: '+91 98250 98765',
    email: 'city.center@amul.in',
    address: 'Shop 12, Ground Floor, Amul Complex',
    city: 'Anand',
    state: 'Gujarat',
    pincode: '388001',
    gstNumber: '24AAAAA0000A1Z5',
    fssaiNumber: '10722001000123',
    approvalStatus: 'APPROVED',
    subscriptionPlanId: 'PRO',
    subscriptionStatus: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const previewBill: SaleBill = {
    id: 'preview-bill-1',
    billNumber: 'BILL-20261102-0042',
    shopId: previewShop.id,
    timestamp: new Date().toISOString(),
    items: [
      {
        productId: 'item-1',
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
        productId: 'item-2',
        productName: 'Amul Pasteurized Butter 100g',
        barcode: '8901262010151',
        quantity: 1,
        unit: 'Pack',
        mrp: 60,
        unitPrice: 60,
        costPrice: 54,
        total: 60
      },
      {
        productId: 'item-3',
        productName: 'Amul Cheese Slices 200g',
        barcode: '8901262020021',
        quantity: 1,
        unit: 'Pack',
        mrp: 145,
        unitPrice: 145,
        costPrice: 130,
        total: 145
      }
    ],
    itemCount: 4,
    subtotal: 259,
    discountAmount: 9,
    taxAmount: 12.5,
    roundOff: 0,
    finalAmount: 250,
    paymentMode: 'UPI',
    customerName: 'Rahul Shah',
    customerPhone: '+91 91735 98234',
    status: 'COMPLETED',
    cashierName: 'Counter 1',
    idempotencyKey: 'preview-key',
    createdAt: new Date().toISOString()
  };

  const handleTestPrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center text-slate-500 text-sm">
        <Printer className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
        Loading print customizer configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 text-[#005A9C] flex items-center justify-center border border-blue-200 shrink-0">
            <Printer className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span>Print Settings & Bill Customizer</span>
              <span className="text-xs font-bold text-slate-500 font-sans">
                | પ્રિન્ટ સેટિંગ્સ
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                Firestore Live Sync
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Customize customer receipt headers, contact details, footers, and spacing. Saved changes instantly apply to all shop counters.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleReset}
            disabled={isSaving}
            className="px-3.5 py-2 text-slate-600 hover:text-slate-900 text-xs font-bold rounded-xl border border-slate-300 hover:bg-slate-50 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Reset to official Amul defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-[#005A9C] hover:bg-blue-800 active:bg-blue-900 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:bg-slate-400"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving to Firestore...' : 'Save Print Settings'}</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {saveSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {saveError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Main Grid: Left Controls (55%) + Right Live Preview (45%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Controls Column */}
        <div className="lg:col-span-7 space-y-5">
          {/* Sub-Section Navigation */}
          <div className="bg-slate-100 p-1 rounded-xl flex gap-1 text-xs font-bold text-slate-600">
            <button
              type="button"
              onClick={() => setActiveSubSection('HEADER')}
              className={`flex-1 py-2 px-3 rounded-lg transition text-center cursor-pointer ${
                activeSubSection === 'HEADER'
                  ? 'bg-white text-blue-700 shadow-xs font-extrabold'
                  : 'hover:text-slate-900'
              }`}
            >
              1. Header Customization
            </button>
            <button
              type="button"
              onClick={() => setActiveSubSection('FOOTER')}
              className={`flex-1 py-2 px-3 rounded-lg transition text-center cursor-pointer ${
                activeSubSection === 'FOOTER'
                  ? 'bg-white text-blue-700 shadow-xs font-extrabold'
                  : 'hover:text-slate-900'
              }`}
            >
              2. Footer Customization
            </button>
            <button
              type="button"
              onClick={() => setActiveSubSection('LAYOUT')}
              className={`flex-1 py-2 px-3 rounded-lg transition text-center cursor-pointer ${
                activeSubSection === 'LAYOUT'
                  ? 'bg-white text-blue-700 shadow-xs font-extrabold'
                  : 'hover:text-slate-900'
              }`}
            >
              3. Layout & Compactness
            </button>
          </div>

          {/* Section 1: Header Customization */}
          {activeSubSection === 'HEADER' && (
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  <span>Bill Header Elements & Contact Info</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enable or disable elements displayed on the top section of customer receipts, or set custom overrides.
                </p>
              </div>

              {/* 1. Brand Logo / Header Title */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800">Show Brand Title / Banner</label>
                    <p className="text-[11px] text-slate-500">Prints brand heading at the very top of the receipt</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.showHeaderLogo}
                    onChange={() => handleToggle('showHeaderLogo')}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>
                {config.showHeaderLogo && (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600">Header Title Text</label>
                    <input
                      type="text"
                      value={config.headerTitle}
                      onChange={(e) => handleTextChange('headerTitle', e.target.value)}
                      placeholder="e.g. AMUL PARLOUR"
                      className="w-full mt-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold uppercase focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* 2. Shop Name */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800">Show Shop Name</label>
                    <p className="text-[11px] text-slate-500">Displays parlour store name under the brand header</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.showShopName}
                    onChange={() => handleToggle('showShopName')}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>
                {config.showShopName && (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600">
                      Custom Shop Name Override <span className="text-slate-400 font-normal">(Optional: leave blank to use shop's registered name)</span>
                    </label>
                    <input
                      type="text"
                      value={config.customShopName || ''}
                      onChange={(e) => handleTextChange('customShopName', e.target.value)}
                      placeholder={previewShop.name}
                      className="w-full mt-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* 3. Address & City */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800">Show Shop Address</label>
                    <p className="text-[11px] text-slate-500">Prints address and city on receipt header</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.showAddress}
                    onChange={() => handleToggle('showAddress')}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>
                {config.showAddress && (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600">
                      Custom Address Override <span className="text-slate-400 font-normal">(Optional: leave blank to use shop profile address)</span>
                    </label>
                    <input
                      type="text"
                      value={config.customAddress || ''}
                      onChange={(e) => handleTextChange('customAddress', e.target.value)}
                      placeholder={`${previewShop.address}, ${previewShop.city}`}
                      className="w-full mt-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* 4. Phone Number */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800">Show Contact Phone</label>
                    <p className="text-[11px] text-slate-500">Displays parlour customer inquiry phone number</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.showPhone}
                    onChange={() => handleToggle('showPhone')}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>
                {config.showPhone && (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600">
                      Custom Phone Override <span className="text-slate-400 font-normal">(Optional: leave blank to use shop phone)</span>
                    </label>
                    <input
                      type="text"
                      value={config.customPhone || ''}
                      onChange={(e) => handleTextChange('customPhone', e.target.value)}
                      placeholder={previewShop.phone}
                      className="w-full mt-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* 5. Shop ID & GSTIN / FSSAI */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800">Show Shop ID Code</label>
                    <p className="text-[11px] text-slate-500">Prints unique franchise shop code (e.g. {previewShop.shopCode})</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.showShopId}
                    onChange={() => handleToggle('showShopId')}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>

                <div className="border-t border-slate-200/60 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <label className="text-xs font-bold text-slate-800">Show GSTIN & FSSAI Numbers</label>
                      <p className="text-[11px] text-slate-500">Legal compliance numbers on customer bill</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.showGstFssai}
                      onChange={() => handleToggle('showGstFssai')}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                  </div>
                  {config.showGstFssai && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-600">GSTIN Override</label>
                        <input
                          type="text"
                          value={config.customGst || ''}
                          onChange={(e) => handleTextChange('customGst', e.target.value)}
                          placeholder={previewShop.gstNumber || '24AAAAA0000A1Z5'}
                          className="w-full mt-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono uppercase focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-600">FSSAI License Override</label>
                        <input
                          type="text"
                          value={config.customFssai || ''}
                          onChange={(e) => handleTextChange('customFssai', e.target.value)}
                          placeholder={previewShop.fssaiNumber || '10722001000123'}
                          className="w-full mt-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Section 2: Footer Customization */}
          {activeSubSection === 'FOOTER' && (
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>Bill Footer Notes & Customer Disclaimers</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure thank-you messages, brand slogans, and store return/exchange policies on receipts.
                </p>
              </div>

              {/* Footer Note 1 */}
              <div>
                <label className="text-xs font-bold text-slate-800">
                  Primary Customer Greeting (Note 1)
                </label>
                <input
                  type="text"
                  value={config.footerNote1}
                  onChange={(e) => handleTextChange('footerNote1', e.target.value)}
                  placeholder="e.g. Thank you! Please visit again"
                  className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Footer Note 2 */}
              <div>
                <label className="text-xs font-bold text-slate-800">
                  Brand Slogan / Tagline (Note 2)
                </label>
                <input
                  type="text"
                  value={config.footerNote2}
                  onChange={(e) => handleTextChange('footerNote2', e.target.value)}
                  placeholder="e.g. The Taste of India • Pure Milk Products"
                  className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Footer Note 3 */}
              <div>
                <label className="text-xs font-bold text-slate-800">
                  Return / Exchange Policy / Terms (Note 3)
                </label>
                <input
                  type="text"
                  value={config.footerNote3 || ''}
                  onChange={(e) => handleTextChange('footerNote3', e.target.value)}
                  placeholder="e.g. Goods once sold will not be taken back"
                  className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Toggles */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800">Show Payment Mode & Paid Status</label>
                    <p className="text-[11px] text-slate-500">Prints e.g. "Payment: CASH • PAID"</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.showPaymentMode}
                    onChange={() => handleToggle('showPaymentMode')}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>

                <div className="border-t border-slate-200/60 pt-3 flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800">Show Bill Number & Barcode Tracker</label>
                    <p className="text-[11px] text-slate-500">Prints formatted bill number e.g. * BILL-20261102-0042 *</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.showBarcodeSimulation}
                    onChange={() => handleToggle('showBarcodeSimulation')}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section 3: Layout Spacing & Compactness */}
          {activeSubSection === 'LAYOUT' && (
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-blue-600" />
                  <span>Layout Spacing, Margins & Paper Saver Compactness</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Eliminate blank gaps and extra paper feed to print receipts compactly without wasting expensive thermal rolls.
                </p>
              </div>

              {/* Ultra Compact Mode Toggle */}
              <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-blue-950">Ultra-Compact Paper Saver Mode</span>
                    <span className="text-[9px] font-bold uppercase bg-blue-600 text-white px-2 py-0.5 rounded-full">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-blue-900/80 mt-0.5">
                    Removes superfluous blank lines and margins. Saves up to 35% thermal paper roll per 100 customer receipts.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={config.compactMode}
                  onChange={() => handleToggle('compactMode')}
                  className="w-5 h-5 text-blue-600 rounded cursor-pointer"
                />
              </div>

              {/* Header Spacing Options */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800">Header Vertical Spacing</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['tight', 'normal', 'relaxed'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, headerSpacing: mode }))}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                        config.headerSpacing === mode
                          ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-xs font-bold capitalize text-slate-900">{mode} Spacing</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {mode === 'tight' && 'Zero extra blank gaps'}
                        {mode === 'normal' && 'Standard POS layout'}
                        {mode === 'relaxed' && 'Spaced-out header'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Margin Size */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800">Receipt Container Margin / Padding</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['compact', 'normal'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, marginSize: m }))}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                        config.marginSize === m
                          ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-xs font-bold capitalize text-slate-900">
                        {m === 'compact' ? 'Compact Margins (8px)' : 'Normal Margins (16px)'}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {m === 'compact' ? 'Fits tightly on small thermal rolls' : 'Spacious borders'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Default Paper Roll Width */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800">Default Paper Roll Width</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['58mm', '80mm'] as const).map((width) => (
                    <button
                      key={width}
                      type="button"
                      onClick={() => {
                        setConfig((prev) => ({ ...prev, paperWidth: width }));
                        setPreviewWidth(width);
                      }}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                        config.paperWidth === width
                          ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900">
                        {width === '58mm' ? '58mm (2-inch POS Roll)' : '80mm (3-inch POS Roll)'}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {width === '58mm' ? 'Standard compact thermal counter' : 'Wide desktop receipt printer'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Live Interactive Thermal Receipt Preview */}
        <div className="lg:col-span-5 sticky top-4">
          <div className="bg-slate-900 rounded-2xl shadow-xl border border-slate-800 overflow-hidden text-white">
            {/* Preview Header Bar */}
            <div className="px-4 py-3 bg-slate-950 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-400" />
                <span className="font-extrabold text-xs">Live Receipt Preview</span>
                <span className="text-[10px] text-emerald-400 font-mono font-bold">Realtime</span>
              </div>

              {/* Width Switcher */}
              <div className="bg-slate-800 p-0.5 rounded-lg border border-slate-700 flex text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setPreviewWidth('58mm')}
                  className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                    previewWidth === '58mm' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  58mm
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewWidth('80mm')}
                  className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                    previewWidth === '80mm' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  80mm
                </button>
              </div>
            </div>

            {/* Paper Scroll Container with authentic thermal background */}
            <div className="p-4 bg-slate-700/60 overflow-y-auto max-h-[560px] flex justify-center">
              <div
                id="admin-live-receipt-preview"
                style={{ fontFamily: "'Courier New', Courier, monospace" }}
                className={`bg-white text-black shadow-2xl font-mono border border-slate-300 select-none ${
                  config.marginSize === 'compact' ? 'p-2.5' : 'p-4'
                } ${config.compactMode ? 'leading-tight text-[9.5px]' : 'leading-normal text-[10px]'} ${
                  previewWidth === '58mm' ? 'w-[260px]' : 'w-[360px]'
                }`}
              >
                {/* Header */}
                <div
                  className={`text-center border-b border-dashed border-black ${
                    config.headerSpacing === 'tight'
                      ? 'pb-1 space-y-0.5'
                      : config.headerSpacing === 'relaxed'
                      ? 'pb-3 space-y-1.5'
                      : 'pb-2 space-y-1'
                  }`}
                >
                  {config.showHeaderLogo && (
                    <div className="font-extrabold text-xs uppercase tracking-tight text-black">
                      {config.headerTitle || 'AMUL PARLOUR'}
                    </div>
                  )}
                  {config.showShopName && (
                    <div className="font-bold text-[11px] mt-0.5 text-black">
                      {config.customShopName || previewShop.name}
                    </div>
                  )}
                  {config.showAddress && (
                    <div className="text-[9.5px] text-black mt-0.5 leading-tight">
                      {config.customAddress || `${previewShop.address}, ${previewShop.city}`}
                    </div>
                  )}
                  {config.showPhone && (
                    <div className="text-[9.5px] text-black">
                      Phone: {config.customPhone || previewShop.phone}
                    </div>
                  )}
                  {config.showShopId && (
                    <div className="text-[9.5px] font-semibold text-black mt-0.5">
                      Shop ID: {previewShop.shopCode}
                    </div>
                  )}
                  {config.showGstFssai && (
                    <>
                      {(config.customGst || previewShop.gstNumber) && (
                        <div className="text-[9px] text-black">
                          GSTIN: {config.customGst || previewShop.gstNumber}
                        </div>
                      )}
                      {(config.customFssai || previewShop.fssaiNumber) && (
                        <div className="text-[9px] text-black">
                          FSSAI: {config.customFssai || previewShop.fssaiNumber}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Bill Meta */}
                <div className="py-1.5 text-[9.5px] border-b border-dashed border-black space-y-0.5 text-black">
                  <div className="flex justify-between font-bold">
                    <span>Bill: {previewBill.billNumber}</span>
                    <span>{previewBill.paymentMode}</span>
                  </div>
                  <div className="flex justify-between text-black">
                    <span>Date: 02 Nov 2026, 10:45 AM</span>
                    <span>Counter: {previewBill.cashierName}</span>
                  </div>
                  <div className="flex justify-between text-black">
                    <span>Customer: {previewBill.customerName}</span>
                    <span>{previewBill.customerPhone}</span>
                  </div>
                </div>

                {/* Items */}
                <div className="py-1.5 text-[9.5px] border-b border-dashed border-black text-black">
                  {previewWidth === '58mm' ? (
                    <div className="space-y-1 text-[9px]">
                      <div className="flex justify-between font-bold uppercase border-b border-black pb-0.5">
                        <span>Item & Qty x Rate</span>
                        <span className="text-right">Amt (Rs.)</span>
                      </div>
                      {previewBill.items.map((item, idx) => (
                        <div key={idx} className="leading-tight">
                          <div className="font-bold text-black break-words">{item.productName}</div>
                          <div className="flex justify-between text-[8.5px] text-black">
                            <span>{item.quantity} {item.unit} x Rs.{item.unitPrice}</span>
                            <span className="font-bold text-black">Rs.{item.total.toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <div className="grid grid-cols-12 font-bold pb-0.5 text-[9px] uppercase border-b border-black">
                        <span className="col-span-6">Item</span>
                        <span className="col-span-2 text-right">Qty</span>
                        <span className="col-span-2 text-right">Rate</span>
                        <span className="col-span-2 text-right">Amt</span>
                      </div>
                      <div className="space-y-1 pt-1 text-[9px]">
                        {previewBill.items.map((item, idx) => (
                          <div key={idx} className="grid grid-cols-12 items-start text-black">
                            <div className="col-span-6 font-semibold leading-tight">{item.productName}</div>
                            <span className="col-span-2 text-right font-mono">{item.quantity}</span>
                            <span className="col-span-2 text-right font-mono">Rs.{item.unitPrice}</span>
                            <span className="col-span-2 text-right font-bold font-mono">Rs.{item.total.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Totals */}
                <div className="py-1.5 text-[9.5px] space-y-0.5 border-b border-dashed border-black font-mono text-black">
                  <div className="flex justify-between">
                    <span>Total Items / Qty:</span>
                    <span>3 items / 4 pcs</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>Rs.{previewBill.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Discount:</span>
                    <span>-Rs.{previewBill.discountAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-extrabold text-xs pt-0.5 border-t border-black">
                    <span>NET PAYABLE:</span>
                    <span className="text-xs">Rs.{previewBill.finalAmount.toFixed(2)}</span>
                  </div>
                </div>

                {/* Footer Notes */}
                <div className="text-center py-1.5 text-[8.5px] text-black space-y-1">
                  {config.showPaymentMode && (
                    <div className="font-semibold text-black uppercase">
                      Payment: {previewBill.paymentMode} • PAID
                    </div>
                  )}
                  {config.showBarcodeSimulation && (
                    <div className="pt-0.5 font-mono text-[9px] tracking-widest uppercase">
                      * {previewBill.billNumber} *
                    </div>
                  )}
                  {(config.footerNote1 || config.footerNote2 || config.footerNote3) && (
                    <div className="text-[8.5px] text-black pt-0.5 leading-tight space-y-0.5">
                      {config.footerNote1 && <div>{config.footerNote1}</div>}
                      {config.footerNote2 && <div>{config.footerNote2}</div>}
                      {config.footerNote3 && (
                        <div className="text-[7.5px] text-slate-700 italic">{config.footerNote3}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Test Print Dialog Button */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400 text-[11px]">Preview reflects live changes</span>
              <button
                type="button"
                onClick={handleTestPrint}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Test Print</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
