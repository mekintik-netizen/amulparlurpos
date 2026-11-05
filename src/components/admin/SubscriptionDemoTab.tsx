/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Subscription Demo & Settings Component (Admin HQ Tab)
 * - Live interactive preview of the exact customer subscription expiry popup & 10-day warning
 * - Live edit form to customize the Gujarati text, ₹500 fee, UPI ID, and WhatsApp number
 * - Real-time persistence to Cloud Firestore (`adminSettings/subscriptionConfig`)
 */

import React, { useState, useEffect } from 'react';
import { 
  Eye, 
  Settings, 
  Save, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle, 
  QrCode, 
  MessageCircle, 
  DollarSign, 
  Smartphone, 
  Building, 
  RefreshCw, 
  Sparkles, 
  Upload, 
  ShieldAlert,
  Info
} from 'lucide-react';
import { 
  Shop, 
  SubscriptionSettingsConfig, 
  DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG 
} from '../../types/index.ts';
import { 
  getSubscriptionSettingsConfig, 
  saveSubscriptionSettingsConfig, 
  resetSubscriptionSettingsConfig 
} from '../../storage/subscriptionSettings.ts';
import { SubscriptionExpiredLockOverlay } from '../common/SubscriptionExpiredLockOverlay.tsx';

interface SubscriptionDemoTabProps {
  shops: Shop[];
  adminUsername?: string;
}

export const SubscriptionDemoTab: React.FC<SubscriptionDemoTabProps> = ({
  shops,
  adminUsername = 'Master Admin'
}) => {
  const [config, setConfig] = useState<SubscriptionSettingsConfig>(DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Demo Preview State
  const [selectedShopId, setSelectedShopId] = useState<string>(shops[0]?.id || 'demo-shop');
  const [previewMode, setPreviewMode] = useState<'EXPIRED' | 'WARNING_10_DAYS'>('EXPIRED');
  const [previewTier, setPreviewTier] = useState<'NEW_SHOP' | 'EXISTING_SHOP'>('NEW_SHOP');
  const [customQrPreview, setCustomQrPreview] = useState<string>('');

  // Load config on mount
  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const loaded = await getSubscriptionSettingsConfig();
        if (isMounted) {
          setConfig(loaded);
          if (loaded.upiQrImageUrl) {
            setCustomQrPreview(loaded.upiQrImageUrl);
          }
        }
      } catch (err: any) {
        console.warn('Failed to load subscription settings:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const selectedShop: Shop = shops.find(s => s.id === selectedShopId) || {
    id: 'demo-shop',
    shopCode: 'AP-2026-1001',
    name: 'અમૂલ પ્રેફર્ડ આઉટલેટ (Amul Preferred Outlet - Anand)',
    regionalName: 'અમૂલ પાર્લર આણંદ',
    ownerName: 'રાજેશભાઈ પટેલ (Rajesh Patel)',
    phone: '+91 98980 12345',
    email: 'anand.outlet@amulparlour.in',
    address: 'ડેરી રોડ, અમુલ સર્કલ, આણંદ',
    city: 'આણંદ (Anand)',
    state: 'ગુજરાત (Gujarat)',
    pincode: '388001',
    approvalStatus: 'APPROVED',
    subscriptionPlanId: 'BASIC',
    subscriptionStatus: 'EXPIRED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const handleTextChange = (key: keyof SubscriptionSettingsConfig, value: any) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleCustomQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        setSaveError('QR image file is too large. Please select an image under 1MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setCustomQrPreview(dataUrl);
        handleTextChange('upiQrImageUrl', dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(null);
    setSaveError(null);

    try {
      await saveSubscriptionSettingsConfig(config, adminUsername);
      setSaveSuccess('સબ્સ્ક્રિપ્શન સેટિંગ્સ સફળતાપૂર્વક ક્લાઉડ ફાયરસ્ટોરમાં સેવ થઈ ગઈ છે! બધા દુકાનદારોની સ્ક્રીન પર નવી વિગતો તુરંત અપડેટ થઈ જશે.');
      setTimeout(() => setSaveSuccess(null), 6000);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save subscription settings to Cloud Firestore.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('શું તમે ખરેખર ડિફોલ્ટ સેટિંગ્સ (₹૫૦૦ અને અધિકૃત ગુજરાતી મેસેજ) પર રીસેટ કરવા માંગો છો?')) {
      return;
    }

    setIsSaving(true);
    setSaveSuccess(null);
    setSaveError(null);

    try {
      const resetConfig = await resetSubscriptionSettingsConfig(adminUsername);
      setConfig(resetConfig);
      setCustomQrPreview('');
      setSaveSuccess('સેટિંગ્સ ડિફોલ્ટ રૂપરેખાંકન પર રીસેટ કરવામાં આવી છે.');
      setTimeout(() => setSaveSuccess(null), 5000);
    } catch (err: any) {
      setSaveError('Failed to reset subscription settings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
        <div className="text-sm font-bold text-slate-700">સબ્સ્ક્રિપ્શન સેટિંગ્સ લોડ થઈ રહી છે...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner Notice */}
      <div className="bg-linear-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-3xl p-6 shadow-md border border-blue-800">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20 text-yellow-300">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-yellow-400 text-yellow-950 uppercase mb-1 font-mono">
                Admin Control Room
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
                સબ્સ્ક્રિપ્શન ડેમો &amp; સેટિંગ્સ (Subscription Demo &amp; Settings)
              </h2>
              <p className="text-xs text-blue-200 mt-1 max-w-2xl leading-relaxed">
                અહીંથી તમે દુકાનદારનું ૧ મહિનાનું સબ્સ્ક્રિપ્શન પૂરું થાય ત્યારે દેખાતો પોપઅપ લાઈવ જોઈ શકો છો તેમજ 
                ગુજરાતી મેસેજ, ₹૫૦૦ માસિક ફી, UPI QR કોડ અને WhatsApp નંબર સરળતાથી બદલી શકો છો.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
            >
              <Save className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />
              <span>{isSaving ? 'સેવિંગ...' : 'સેવ કરો (Save Settings)'}</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={isSaving}
              className="px-3 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer border border-white/20"
              title="Reset to official defaults"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>ડિફોલ્ટ</span>
            </button>
          </div>
        </div>

        {/* Feedback Messages */}
        {saveSuccess && (
          <div className="mt-4 p-3 bg-emerald-500/20 border border-emerald-400/40 rounded-xl text-xs text-emerald-200 flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>{saveSuccess}</span>
          </div>
        )}

        {saveError && (
          <div className="mt-4 p-3 bg-rose-500/20 border border-rose-400/40 rounded-xl text-xs text-rose-200 flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}
      </div>

      {/* Main 2-Column Layout: Left Live Preview Box vs Right Settings Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive Live Preview Box (5 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm">
                <Eye className="w-4 h-4 text-blue-600" />
                <span>લાઈવ ડેમો પ્રિવ્યુ (Live Popup Preview)</span>
              </div>

              {/* Preview Mode Switcher (Expired vs 10-Days Warning) */}
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Shop Tier Switcher (New Shop vs Existing Shop) */}
                <div className="flex items-center gap-1 bg-blue-50 p-1 rounded-xl border border-blue-200">
                  <button
                    type="button"
                    onClick={() => setPreviewTier('NEW_SHOP')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-black transition cursor-pointer ${
                      previewTier === 'NEW_SHOP'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-blue-800 hover:text-blue-950'
                    }`}
                  >
                    નવું પાર્લર (₹3,000)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTier('EXISTING_SHOP')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-black transition cursor-pointer ${
                      previewTier === 'EXISTING_SHOP'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-blue-800 hover:text-blue-950'
                    }`}
                  >
                    ચાલુ પાર્લર (₹500)
                  </button>
                </div>

                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setPreviewMode('EXPIRED')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      previewMode === 'EXPIRED'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    સમાપ્ત (Expired)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('WARNING_10_DAYS')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      previewMode === 'WARNING_10_DAYS'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ૧૦ દિવસ બાકી
                  </button>
                </div>
              </div>
            </div>

            {/* Shop Selector for Preview */}
            <div className="mt-3 mb-4 flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500 shrink-0">ટેસ્ટ પાર્લર:</label>
              <select
                value={selectedShopId}
                onChange={(e) => setSelectedShopId(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
              >
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.shopCode})
                  </option>
                ))}
                {shops.length === 0 && (
                  <option value="demo-shop">અમૂલ પ્રેફર્ડ આઉટલેટ (AP-2026-1001)</option>
                )}
              </select>
            </div>

            {/* Simulated Device Screen Container */}
            <div className="p-3 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner overflow-hidden">
              <div className="text-[10px] text-slate-400 font-mono text-center mb-2">
                • Shop Counter Billing Interface (Screen Simulation) •
              </div>

              {/* Render the actual SubscriptionExpiredLockOverlay in preview mode */}
              <SubscriptionExpiredLockOverlay
                currentShop={selectedShop}
                isPreview={true}
                previewMode={previewMode}
                shopTypeOverride={previewTier}
                customSettings={config}
                onCheckStatus={() => alert('ડેમો ચેક સ્ટેટસ: લાઈવ સિસ્ટમમાં આ બટન એડમિન દ્વારા વધારાયેલ નવી એક્સપાયરી ડેટ ચકાસીને તુરંત એક્સેસ ખોલી આપે છે.')}
                onLogout={() => alert('ડેમો લોગઆઉટ ક્લિક થયું.')}
              />
            </div>

            <div className="mt-3 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-600" />
              <span>જમણી બાજુના ફોર્મમાં કરેલો કોઈપણ ફેરફાર અહીં તુરંત લાઈવ દેખાશે.</span>
            </div>
          </div>
        </div>

        {/* Right Column: Edit Message & Settings Form (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-900 font-extrabold text-sm">
                <Settings className="w-4 h-4 text-blue-600" />
                <span>સબ્સ્ક્રિપ્શન મેસેજ અને પેમેન્ટ સેટિંગ્સ એડિટર</span>
              </div>
              <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Cloud Firestore Sync
              </span>
            </div>

            {/* 1. Monthly Fee & Setup Fee */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-blue-600" />
                  <span>માસિક ફી (Monthly Fee)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 font-bold text-slate-500 font-mono text-sm">
                    {config.currencySymbol || '₹'}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={config.monthlyFee}
                    onChange={(e) => handleTextChange('monthlyFee', parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-3 py-2 text-sm font-mono font-black text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    placeholder="500"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">ચાલુ પાર્લર: ₹500 / મહિનો</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
                  <span>સેટઅપ ફી (Setup Fee)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 font-bold text-slate-500 font-mono text-sm">
                    {config.currencySymbol || '₹'}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={config.setupFee ?? 2500}
                    onChange={(e) => handleTextChange('setupFee', parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-3 py-2 text-sm font-mono font-black text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    placeholder="2500"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">નવું પાર્લર વન-ટાઇમ: ₹2500</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                  <span>૧૦ દિવસ બાકી લિમિટ</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={config.warningDaysThreshold}
                    onChange={(e) => handleTextChange('warningDaysThreshold', parseInt(e.target.value) || 10)}
                    className="w-full px-3 py-2 text-sm font-mono font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">દિવસ</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">૧૦ દિવસ પહેલા ચેતવણી દર્શાવો</span>
              </div>
            </div>

            {/* 2. Header Title */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                પોપઅપ હેડર ટાઇટલ (Header Title)
              </label>
              <input
                type="text"
                value={config.headerTitle}
                onChange={(e) => handleTextChange('headerTitle', e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                placeholder="⚠️ સબ્સ્ક્રિપ્શન સમાપ્ત થઈ ગયું છે (Subscription Expired)"
              />
            </div>

            {/* 3. New Shop Message (First Month Onboarding) */}
            <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200">
              <label className="block text-xs font-black text-blue-900 mb-1 flex items-center justify-between">
                <span>૧. નવા પાર્લર માટે સંદેશ (New Shop - First Month / ₹3,000)</span>
                <span className="text-[10px] font-mono text-blue-700 font-bold">₹2500 સેટઅપ + ₹500 સબ્સ્ક્રિપ્શન</span>
              </label>
              <textarea
                rows={3}
                value={config.newShopMessageGujarati || '⚠️ તમારું ૧ મહિનાનું ફ્રી ટ્રાયલ પૂરું થયું છે. સેટઅપ ચાર્જ ₹૨૫૦૦ + સબ્સ્ક્રિપ્શન ચાર્જ ₹૫૦૦ મળીને પહેલા મહિને કુલ ₹૩૦૦૦ નું પેમેન્ટ કરવાનું રહેશે. ત્યારપછીના મહિનાથી દર મહિને માત્ર ₹૫૦૦ સબ્સ્ક્રિપ્શન ચાર્જ આવશે.'}
                onChange={(e) => handleTextChange('newShopMessageGujarati', e.target.value)}
                className="w-full p-2.5 text-xs font-medium text-slate-900 bg-white border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden leading-relaxed"
              />
            </div>

            {/* 4. Main Gujarati Expiry Message (Existing Shop) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                ૨. ચાલુ પાર્લર માટે રિન્યુઅલ સંદેશ (Regular Shop Renewal / ₹500)
              </label>
              <textarea
                rows={3}
                value={config.messageGujarati}
                onChange={(e) => handleTextChange('messageGujarati', e.target.value)}
                className="w-full p-3 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden leading-relaxed"
                placeholder="તમારો ૧ મહિનાનો સબ્સ્ક્રિપ્શન સમય પૂરો થઈ ગયો છે..."
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                ચાલુ દુકાનદારને ₹૫૦૦ નું પેમેન્ટ કરી સોફ્ટવેર ચાલુ રાખવા માટેની સ્પષ્ટ સૂચના.
              </span>
            </div>

            {/* 4. 10-Days Warning Message */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                ૧૦ દિવસ અગાઉનો ચેતવણી સંદેશ (10-Day Warning Notice)
              </label>
              <textarea
                rows={2}
                value={config.warningMessageGujarati}
                onChange={(e) => handleTextChange('warningMessageGujarati', e.target.value)}
                className="w-full p-3 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden leading-relaxed"
                placeholder="તમારો ૧ મહિનાનો સબ્સ્ક્રિપ્શન સમય ટૂંક સમયમાં પૂરો થઈ રહ્યો છે..."
              />
            </div>

            {/* 5. UPI ID & Payee Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-blue-600" />
                  <span>Admin UPI ID (પેમેન્ટ મેળવવા માટે)</span>
                </label>
                <input
                  type="text"
                  value={config.upiId}
                  onChange={(e) => handleTextChange('upiId', e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  placeholder="amulparlour.admin@okhdfcbank"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-blue-600" />
                  <span>પેયી નામ (Payee Name)</span>
                </label>
                <input
                  type="text"
                  value={config.payeeName}
                  onChange={(e) => handleTextChange('payeeName', e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  placeholder="Amul HQ Admin"
                />
              </div>
            </div>

            {/* 6. WhatsApp Number & Support Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>WhatsApp નંબર (સ્ક્રીનશોટ મેળવવા)</span>
                </label>
                <input
                  type="text"
                  value={config.whatsappNumber}
                  onChange={(e) => handleTextChange('whatsappNumber', e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  placeholder="+919173598234"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">આ નંબર પર સીધો WhatsApp ચેટ શરૂ થશે.</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                  <span>હેલ્પલાઇન ફોન નંબર (Phone Hotline)</span>
                </label>
                <input
                  type="text"
                  value={config.adminPhone}
                  onChange={(e) => handleTextChange('adminPhone', e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  placeholder="+919173598234"
                />
              </div>
            </div>

            {/* 7. WhatsApp Confirmation Template */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                WhatsApp પ્રી-ફિલ્ડ મેસેજ ટેમ્પલેટ (WhatsApp Message Template)
              </label>
              <textarea
                rows={2}
                value={config.whatsappMessageTemplate}
                onChange={(e) => handleTextChange('whatsappMessageTemplate', e.target.value)}
                className="w-full p-2.5 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                placeholder="નમસ્તે એડમિન..."
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                વેરિયેબલ્સ: <code className="font-mono text-blue-600">{'{shopName}'}</code>, <code className="font-mono text-blue-600">{'{shopCode}'}</code>, <code className="font-mono text-blue-600">{'{amount}'}</code>
              </span>
            </div>

            {/* 8. Custom QR Code Image Upload or URL */}
            <div className="pt-2 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-blue-600" />
                  <span>કસ્ટમ QR કોડ ઇમેજ અપલોડ (Custom QR Image - Optional)</span>
                </span>
                {customQrPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomQrPreview('');
                      handleTextChange('upiQrImageUrl', '');
                    }}
                    className="text-[10px] text-rose-600 hover:underline font-bold"
                  >
                    દૂર કરો (Remove)
                  </button>
                )}
              </label>

              <div className="flex items-center gap-3">
                <label className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer border border-slate-200">
                  <Upload className="w-3.5 h-3.5" />
                  <span>QR ફોટો પસંદ કરો (PNG / JPG)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCustomQrUpload}
                    className="hidden"
                  />
                </label>
                <span className="text-[11px] text-slate-400">
                  {customQrPreview ? '✓ કસ્ટમ QR લોડ થયેલ છે' : 'અથવા ડાયનેમિક UPI QR આપમેળે જનરેટ થશે'}
                </span>
              </div>
            </div>

            {/* Bottom Save Action Button */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleReset}
                disabled={isSaving}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition cursor-pointer"
              >
                રીસેટ કરો (Reset Defaults)
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs rounded-xl transition flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Save className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />
                <span>{isSaving ? 'સેવ થઈ રહ્યું છે...' : 'સેટિંગ્સ સેવ કરો (Save Settings)'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
