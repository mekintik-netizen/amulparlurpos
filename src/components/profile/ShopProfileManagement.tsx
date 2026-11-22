/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Shop Profile & Bank QR Settings Management Component
 * Allows merchant to edit shop details, bank account info, UPI ID,
 * and upload the real shop payment QR code image with printable counter standee.
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Store, 
  Landmark, 
  QrCode, 
  Upload, 
  Trash2, 
  Save, 
  Printer, 
  CheckCircle2, 
  AlertCircle, 
  Phone, 
  Mail, 
  MapPin, 
  FileText, 
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Eye,
  CreditCard,
  Download,
  Monitor,
  Key,
  EyeOff,
  Sparkles
} from 'lucide-react';
import { Shop } from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';
import { subscribeToAdminAuthConfig, AdminAuthConfig } from '../../storage/firebase.ts';
import { downloadIcoFile } from '../../utils/icoConverter.ts';
import { encodeAiApiKey, maskApiKey } from '../../utils/aiKeyCodec.ts';
import { changeShopOwnPassword, getShopPasswordAgeDays } from '../../storage/auth.ts';
import {
  buildDynamicPdfFilename,
  printWithDynamicTitle,
  RECEIPT_FOOTER_BRAND_CREDIT
} from '../../utils/shopPdfBranding.ts';

interface ShopProfileManagementProps {
  currentShop: Shop;
  onShopUpdated: (updatedShop: Shop) => void;
}

export const ShopProfileManagement: React.FC<ShopProfileManagementProps> = ({
  currentShop,
  onShopUpdated
}) => {
  // Form fields
  const [name, setName] = useState(currentShop.name || '');
  const [regionalName, setRegionalName] = useState(currentShop.regionalName || '');
  const [ownerName, setOwnerName] = useState(currentShop.ownerName || '');
  const [phone, setPhone] = useState(currentShop.phone || '');
  const [email, setEmail] = useState(currentShop.email || '');
  const [address, setAddress] = useState(currentShop.address || '');
  const [city, setCity] = useState(currentShop.city || '');
  const [state, setState] = useState(currentShop.state || 'Gujarat');
  const [pincode, setPincode] = useState(currentShop.pincode || '');
  const [gstNumber, setGstNumber] = useState(currentShop.gstNumber || '');
  const [fssaiNumber, setFssaiNumber] = useState(currentShop.fssaiNumber || '');

  // Banking & UPI fields
  const [bankName, setBankName] = useState(currentShop.bankName || '');
  const [accountHolderName, setAccountHolderName] = useState(currentShop.accountHolderName || '');
  const [accountNumber, setAccountNumber] = useState(currentShop.accountNumber || '');
  const [ifscCode, setIfscCode] = useState(currentShop.ifscCode || '');
  const [upiId, setUpiId] = useState(currentShop.upiId || '');
  const [qrCodeImageUrl, setQrCodeImageUrl] = useState<string>(currentShop.qrCodeImageUrl || '');
  const [logoUrl, setLogoUrl] = useState<string>(currentShop.logoUrl || '');

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showStandeeModal, setShowStandeeModal] = useState(false);
  const [adminAuthConfig, setAdminAuthConfig] = useState<AdminAuthConfig | null>(null);
  const [icoDownloadMessage, setIcoDownloadMessage] = useState<string | null>(null);

  // Optional Shop-level Gemini API Key (obfuscated on save, never stored plaintext)
  const [shopGeminiKeyInput, setShopGeminiKeyInput] = useState('');
  const [showShopGeminiKey, setShowShopGeminiKey] = useState(false);
  const [clearShopGeminiKey, setClearShopGeminiKey] = useState(false);

  // Change Shop Password state
  const [currentShopPwd, setCurrentShopPwd] = useState('');
  const [newShopPwd, setNewShopPwd] = useState('');
  const [confirmShopPwd, setConfirmShopPwd] = useState('');
  const [showCurrentShopPwd, setShowCurrentShopPwd] = useState(false);
  const [showNewShopPwd, setShowNewShopPwd] = useState(false);
  const [showConfirmShopPwd, setShowConfirmShopPwd] = useState(false);
  const [changingShopPwd, setChangingShopPwd] = useState(false);
  const [shopPwdError, setShopPwdError] = useState<string | null>(null);
  const [shopPwdSuccess, setShopPwdSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = subscribeToAdminAuthConfig((cfg) => {
      setAdminAuthConfig(cfg);
    });
    return () => unsub();
  }, []);

  const handleDownloadDesktopIco = async () => {
    try {
      await downloadIcoFile(adminAuthConfig?.desktopIconIcoBase64, 'parlourpro-pos.ico');
      setIcoDownloadMessage('parlourpro-pos.ico downloaded! Right-click your Chrome desktop shortcut -> Properties -> Change Icon to apply.');
      setTimeout(() => setIcoDownloadMessage(null), 5000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to download Windows desktop .ico icon.');
    }
  };

  // Sync state if shop changes
  useEffect(() => {
    setName(currentShop.name || '');
    setRegionalName(currentShop.regionalName || '');
    setOwnerName(currentShop.ownerName || '');
    setPhone(currentShop.phone || '');
    setEmail(currentShop.email || '');
    setAddress(currentShop.address || '');
    setCity(currentShop.city || '');
    setState(currentShop.state || 'Gujarat');
    setPincode(currentShop.pincode || '');
    setGstNumber(currentShop.gstNumber || '');
    setFssaiNumber(currentShop.fssaiNumber || '');
    setBankName(currentShop.bankName || '');
    setAccountHolderName(currentShop.accountHolderName || '');
    setAccountNumber(currentShop.accountNumber || '');
    setIfscCode(currentShop.ifscCode || '');
    setUpiId(currentShop.upiId || '');
    setQrCodeImageUrl(currentShop.qrCodeImageUrl || '');
    setLogoUrl(currentShop.logoUrl || '');
    setShopGeminiKeyInput('');
    setClearShopGeminiKey(false);
  }, [currentShop.id]);

  // Handle custom Shop Logo image upload (used on shop's PDFs & invoices)
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload a valid logo image (PNG, JPG, or WEBP).');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage('Shop logo image size should be less than 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setLogoUrl(result);
      setErrorMessage(null);
    };
    reader.readAsDataURL(file);
  };

  // Handle QR image file upload
  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload a valid image file (PNG, JPG, or WEBP).');
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setErrorMessage('Image size should be less than 3 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setQrCodeImageUrl(result);
      setErrorMessage(null);
    };
    reader.readAsDataURL(file);
  };

  // Generate dynamic QR URL from UPI ID
  const effectiveUpi = upiId.trim() || `amul.${currentShop.shopCode.toLowerCase()}@okhdfcbank`;
  const dynamicQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
    `upi://pay?pa=${effectiveUpi}&pn=${encodeURIComponent(name || currentShop.name)}&cu=INR`
  )}`;

  const displayQrUrl = qrCodeImageUrl || dynamicQrUrl;

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Shop name cannot be empty.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);

      const trimmedAiKey = shopGeminiKeyInput.trim();
      let nextEncodedKey = currentShop.encodedGeminiApiKey;
      let nextMaskedKey = currentShop.maskedGeminiApiKey;
      if (clearShopGeminiKey) {
        nextEncodedKey = undefined;
        nextMaskedKey = undefined;
      } else if (trimmedAiKey) {
        nextEncodedKey = encodeAiApiKey(trimmedAiKey);
        nextMaskedKey = maskApiKey(trimmedAiKey);
      }

      const updated: Shop = {
        ...currentShop,
        name: name.trim(),
        regionalName: regionalName.trim() || undefined,
        ownerName: ownerName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        gstNumber: gstNumber.trim() || undefined,
        fssaiNumber: fssaiNumber.trim() || undefined,
        bankName: bankName.trim() || undefined,
        accountHolderName: accountHolderName.trim() || undefined,
        accountNumber: accountNumber.trim() || undefined,
        ifscCode: ifscCode.trim().toUpperCase() || undefined,
        upiId: upiId.trim() || undefined,
        qrCodeImageUrl: qrCodeImageUrl.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
        encodedGeminiApiKey: nextEncodedKey,
        maskedGeminiApiKey: nextMaskedKey,
        updatedAt: new Date().toISOString()
      };

      const saved = await AppRepository.shops.save(updated);
      onShopUpdated(saved);
      setShopGeminiKeyInput('');
      setClearShopGeminiKey(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      console.error('Failed to save shop profile:', err);
      setErrorMessage(err?.message || 'Failed to save shop details.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrintStandee = () => {
    printWithDynamicTitle(
      buildDynamicPdfFilename({
        kind: 'CUSTOM_REPORT',
        reportName: 'Payment-Standee',
        date: new Date()
      })
    );
  };

  const handleChangeShopPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setShopPwdError(null);
    setShopPwdSuccess(null);

    if (!currentShopPwd) {
      setShopPwdError('કૃપા કરીને હાલનો પાસવર્ડ દાખલ કરો (Enter current password).');
      return;
    }
    if (!newShopPwd || newShopPwd.length < 6) {
      setShopPwdError('નવો પાસવર્ડ ઓછામાં ઓછો ૬ અક્ષરનો હોવો જોઈએ (Min 6 characters).');
      return;
    }
    if (newShopPwd !== confirmShopPwd) {
      setShopPwdError('નવો પાસવર્ડ અને કન્ફર્મ પાસવર્ડ સરખા નથી.');
      return;
    }

    setChangingShopPwd(true);
    try {
      const updated = await changeShopOwnPassword({
        shop: currentShop,
        currentPassword: currentShopPwd,
        newPassword: newShopPwd
      });
      setCurrentShopPwd('');
      setNewShopPwd('');
      setConfirmShopPwd('');
      onShopUpdated(updated);
      setShopPwdSuccess('તમારો શોપ લોગિન પાસવર્ડ સફળતાપૂર્વક અપડેટ થઈ ગયો છે (Salted SHA-256).');
      setTimeout(() => setShopPwdSuccess(null), 5000);
    } catch (err: unknown) {
      setShopPwdError(err instanceof Error ? err.message : 'પાસવર્ડ અપડેટ કરવામાં સમસ્યા આવી.');
    } finally {
      setChangingShopPwd(false);
    }
  };

  const passwordAgeInfo = getShopPasswordAgeDays(currentShop);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Page Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-blue-100 dark:bg-blue-900/40 text-[#005A9C] dark:text-blue-300 text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wide">
              Shop Settings
            </span>
            <span className="text-xs font-mono font-bold text-slate-500">
              {currentShop.shopCode}
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Store className="w-5 h-5 text-[#005A9C]" />
            દુકાન પ્રોફાઇલ & પેમેન્ટ QR સેટિંગ્સ
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Edit parlour identity, bank account details, and manage the official customer UPI scan-to-pay QR code.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowStandeeModal(true)}
            className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            કાઉન્ટર સ્ટેન્ડી પ્રિન્ટ (Print Standee)
          </button>

          <button
            type="button"
            onClick={() => handleSave()}
            disabled={isSaving}
            className="px-4 py-2 bg-[#005A9C] hover:bg-blue-800 active:bg-blue-900 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            સાચવો (Save Changes)
          </button>
        </div>
      </div>

      {/* Notifications */}
      {saveSuccess && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 p-4 rounded-xl text-xs flex items-center gap-2.5 shadow-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <p className="font-bold">દુકાન પ્રોફાઇલ અને બેંક QR સફળતાપૂર્વક અપડેટ થઈ ગયા છે!</p>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
              POS કાઉન્ટર બિલિંગમાં હવે આ જ QR કોડ ગ્રાહક ચુકવણી માટે દર્શાવાશે.
            </p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 p-4 rounded-xl text-xs flex items-center gap-2.5 shadow-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Shop Identity & Legal Details */}
        <div className="lg:col-span-7 space-y-6">
          {/* Shop Information Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Store className="w-4 h-4 text-[#005A9C]" />
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                દુકાન વિગતો (Parlour Information)
              </h3>
            </div>

            <div className="space-y-3">
              {/* Custom Shop Logo Upload (Optional — printed ONLY on this shop's PDFs & receipts) */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={name || 'Shop Logo'}
                      className="h-14 w-14 rounded-xl object-contain bg-white border border-slate-200 p-1 shrink-0"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-400 shrink-0">
                      <Store className="w-6 h-6" />
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                      દુકાનનો પોતાનો લોગો (Custom Shop Logo for PDFs &amp; Bills)
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Optional: Upload your own shop logo (PNG/JPG, max 2 MB). If empty, PDFs &amp; bills print clean shop typography with no placeholder logo.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{logoUrl ? 'Change Logo' : 'Upload Logo'}</span>
                  </button>
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl('')}
                      className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
                      title="Remove Custom Shop Logo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  દુકાનનું નામ (Shop Name in English) *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Shreenathji Parlour - Main Market"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ગુજરાતી નામ (Shop Regional Name)
                </label>
                <input
                  type="text"
                  value={regionalName}
                  onChange={(e) => setRegionalName(e.target.value)}
                  placeholder="દા.ત. પાર્લરપ્રો આઉટલેટ - મેઈન માર્કેટ"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    માલિકનું નામ (Owner / Franchisee Name) *
                  </label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="e.g. Rajesh Patel"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    મોબાઇલ નંબર (Contact Phone) *
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98250 12345"
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ઇમેઇલ (Email Address)
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="shop@parlourpro.in"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  સરનામું (Address)
                </label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Shop No., Street, Landmark"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden resize-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    શહેર (City)
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Anand"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    રાજ્ય (State)
                  </label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="Gujarat"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    પીનકોડ (Pincode)
                  </label>
                  <input
                    type="text"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    placeholder="388001"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Legal Registrations (GST & FSSAI) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <FileText className="w-4 h-4 text-[#005A9C]" />
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                લાયસન્સ અને ટેક્સ નોંધણી (Statutory & FSSAI)
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  GSTIN નંબર (GST Number)
                </label>
                <input
                  type="text"
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                  placeholder="24AAAAA0000A1Z5"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono uppercase focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  બિલિંગ અને A4 ટેક્સ ઇન્વોઇસ પર છપાશે
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  FSSAI લાયસન્સ નંબર (Food Safety Lic.)
                </label>
                <input
                  type="text"
                  value={fssaiNumber}
                  onChange={(e) => setFssaiNumber(e.target.value)}
                  placeholder="10721001000234"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  ડેરી ઉત્પાદનોના વેચાણ માટે માન્ય FSSAI
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Bank Account & Payment QR Manager */}
        <div className="lg:col-span-5 space-y-6">
          {/* Bank Account Details */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-emerald-600" />
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  બેંક ખાતાની વિગત (Bank Details)
                </h3>
              </div>
              <span className="text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded font-bold">
                વેપારી ખાતું
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  બેંકનું નામ (Bank Name)
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. State Bank of India (SBI) / Bank of Baroda"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ખાતાધારકનું નામ (Account Holder Name)
                </label>
                <input
                  type="text"
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  placeholder="e.g. Rajesh Patel (ParlourPro Outlet)"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    ખાતા નંબર (Account Number)
                  </label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="384910204928"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    IFSC કોડ (IFSC Code)
                  </label>
                  <input
                    type="text"
                    value={ifscCode}
                    onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                    placeholder="SBIN0000315"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono uppercase focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  દુકાનનો UPI ID / VPA (Shop UPI ID) *
                </label>
                <div className="relative">
                  <CreditCard className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="parlourpro.shop@sbi અથવા 9825012345@paytm"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden text-blue-700 dark:text-blue-400 font-bold"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  ગ્રાહક આ UPI ID પર સીધું પેમેન્ટ કરશે (GPay, PhonePe, Paytm, BHIM)
                </span>
              </div>
            </div>
          </div>

          {/* Shop Online Payment QR Code Manager */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-[#005A9C]" />
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  ઓનલાઇન પેમેન્ટ QR કોડ (Online Payment QR)
                </h3>
              </div>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded">
                POS કાઉન્ટર QR
              </span>
            </div>

            {/* QR Preview Card */}
            <div className="flex flex-col items-center bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
              <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-300 dark:border-slate-600 mb-3 relative group">
                <img
                  src={displayQrUrl}
                  alt="Shop Payment QR Code"
                  className="w-44 h-44 object-contain rounded-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = dynamicQrUrl;
                  }}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition rounded-2xl flex items-center justify-center gap-2 pointer-events-none">
                  <span className="text-[11px] font-bold text-white bg-black/70 px-2.5 py-1 rounded-lg backdrop-blur-xs">
                    {qrCodeImageUrl ? 'તમારો અસલી QR (Custom)' : 'ઓટો UPI QR (Generated)'}
                  </span>
                </div>
              </div>

              <div className="text-xs font-extrabold text-slate-900 dark:text-white mb-0.5">
                {name || currentShop.name}
              </div>
              <div className="text-[11px] font-mono text-blue-600 dark:text-blue-400 font-semibold mb-3">
                {effectiveUpi}
              </div>

              {/* Upload & Reset Buttons */}
              <div className="flex items-center gap-2 w-full justify-center">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleQrUpload}
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Upload className="w-3.5 h-3.5" />
                  દુકાનનો QR ફોટો અપલોડ કરો
                </button>

                {qrCodeImageUrl && (
                  <button
                    type="button"
                    onClick={() => setQrCodeImageUrl('')}
                    className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition cursor-pointer"
                    title="Remove custom QR and reset to dynamic UPI QR"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <span className="text-[10px] text-slate-400 mt-2">
                તમારા બેંક અથવા પેમેન્ટ સ્ટેન્ડીનો ફોટો અપલોડ કરો (PNG, JPG)
              </span>
            </div>
          </div>

          {/* Windows Chrome Desktop Shortcut & Official .ico Download Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-[#005A9C]" />
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  વિન્ડોઝ ડેસ્કટોપ આઇકોન (Desktop Shortcut .ico)
                </h3>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded">
                Chrome &amp; Windows
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-[#005A9C] dark:text-blue-400 shrink-0 shadow-2xs flex items-center justify-center">
                <Monitor className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 flex-1">
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Install directly from Chrome (<strong>Install ParlourPro POS</strong>) or download the multi-size Windows <code className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-1 rounded">.ico</code> logo for your PC desktop shortcut.
                </p>
                <button
                  type="button"
                  onClick={handleDownloadDesktopIco}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Windows Desktop Icon (.ico)</span>
                </button>
              </div>
            </div>

            {icoDownloadMessage && (
              <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-2.5 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{icoDownloadMessage}</span>
              </div>
            )}
          </div>

          {/* Optional Shop-Level Gemini AI Key Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  ParlourPro AI — Gemini API Key (વૈકલ્પિક)
                </h3>
              </div>
              {currentShop.maskedGeminiApiKey && !clearShopGeminiKey ? (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded font-mono">
                  Active: {currentShop.maskedGeminiApiKey}
                </span>
              ) : (
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                  Optional
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              જો Master Admin એ API Key સેટ ન કરી હોય, તો તમે તમારી પોતાની Gemini API Key અહીં સેટ કરી શકો છો (ખાલી હોય તો પણ ParlourPro AI Local BI મોડ ચાલુ જ રહેશે).
            </p>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Key className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                <input
                  type={showShopGeminiKey ? 'text' : 'password'}
                  value={shopGeminiKeyInput}
                  onChange={(e) => {
                    setShopGeminiKeyInput(e.target.value);
                    if (clearShopGeminiKey) setClearShopGeminiKey(false);
                  }}
                  placeholder={
                    currentShop.maskedGeminiApiKey && !clearShopGeminiKey
                      ? `સાચવેલ Key: ${currentShop.maskedGeminiApiKey} (બદલવા નવી Key લખો)`
                      : 'Gemini API Key પેસ્ટ કરો (દા.ત. AIza...)'
                  }
                  className="w-full pl-8 pr-9 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowShopGeminiKey((v) => !v)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  title={showShopGeminiKey ? 'Hide key' : 'Show key'}
                >
                  {showShopGeminiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              {currentShop.encodedGeminiApiKey && !clearShopGeminiKey && (
                <button
                  type="button"
                  onClick={() => {
                    setClearShopGeminiKey(true);
                    setShopGeminiKeyInput('');
                  }}
                  className="px-2.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-[11px] font-bold transition cursor-pointer shrink-0"
                  title="Remove saved Shop Gemini key on Save"
                >
                  દૂર કરો
                </button>
              )}
            </div>

            {clearShopGeminiKey && (
              <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5">
                Shop Gemini Key દૂર કરવા માટે ઉપર "સાચવો (Save Changes)" બટન દબાવો.
              </div>
            )}
          </div>
        </div>
      </form>

      {/* Shop Account Password Security & 90-Day Rotation Card */}
      <form
        onSubmit={handleChangeShopPassword}
        autoComplete="off"
        className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-[#005A9C] dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-800 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                દુકાન લોગિન પાસવર્ડ બદલો (Change Shop Password)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                સુરક્ષા માટે દર ૩ મહિને (90 દિવસ) શોપ પાસવર્ડ બદલવાની ભલામણ છે.
              </p>
            </div>
          </div>

          <span
            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${
              passwordAgeInfo.isRotationDue
                ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
            }`}
          >
            {passwordAgeInfo.hasTimestamp
              ? passwordAgeInfo.isRotationDue
                ? `${passwordAgeInfo.daysSinceUpdate} દિવસ જૂનો — બદલવાની સલાહ`
                : `Updated ${passwordAgeInfo.daysSinceUpdate}d ago (SHA-256)`
              : 'SHA-256 Protected'}
          </span>
        </div>

        {shopPwdError && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{shopPwdError}</span>
          </div>
        )}

        {shopPwdSuccess && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{shopPwdSuccess}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              હાલનો પાસવર્ડ (Current Password) *
            </label>
            <div className="relative">
              <input
                type={showCurrentShopPwd ? 'text' : 'password'}
                value={currentShopPwd}
                onChange={(e) => setCurrentShopPwd(e.target.value)}
                placeholder="Enter current password"
                autoComplete="current-password"
                className="w-full px-3 pr-9 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentShopPwd((v) => !v)}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label={showCurrentShopPwd ? 'Hide current password' : 'Show current password'}
              >
                {showCurrentShopPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              નવો પાસવર્ડ (New Password, min 6) *
            </label>
            <div className="relative">
              <input
                type={showNewShopPwd ? 'text' : 'password'}
                value={newShopPwd}
                onChange={(e) => setNewShopPwd(e.target.value)}
                placeholder="Min 6 characters"
                autoComplete="new-password"
                minLength={6}
                className="w-full px-3 pr-9 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                required
              />
              <button
                type="button"
                onClick={() => setShowNewShopPwd((v) => !v)}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label={showNewShopPwd ? 'Hide new password' : 'Show new password'}
              >
                {showNewShopPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              નવો પાસવર્ડ કન્ફર્મ કરો (Confirm Password) *
            </label>
            <div className="relative">
              <input
                type={showConfirmShopPwd ? 'text' : 'password'}
                value={confirmShopPwd}
                onChange={(e) => setConfirmShopPwd(e.target.value)}
                placeholder="Re-enter new password"
                autoComplete="new-password"
                minLength={6}
                className="w-full px-3 pr-9 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmShopPwd((v) => !v)}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label={showConfirmShopPwd ? 'Hide confirm password' : 'Show confirm password'}
              >
                {showConfirmShopPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={changingShopPwd}
            className="px-4 py-2 bg-[#005A9C] hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Key className="w-3.5 h-3.5" />
            <span>{changingShopPwd ? 'પાસવર્ડ અપડેટ થાય છે...' : 'Change Shop Password'}</span>
          </button>
        </div>
      </form>

      {/* Printable Counter Standee Modal */}
      {showStandeeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200">
            {/* Action Bar */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 no-print">
              <span className="text-xs font-extrabold text-slate-700">
                કાઉન્ટર સ્ટેન્ડી કાર્ડ (Counter Standee Card)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintStandee}
                  className="px-3 py-1.5 bg-[#005A9C] hover:bg-blue-800 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  પ્રિન્ટ (Print)
                </button>
                <button
                  onClick={() => setShowStandeeModal(false)}
                  className="px-2.5 py-1.5 text-slate-500 hover:text-slate-800 font-bold text-xs rounded-xl cursor-pointer"
                >
                  બંધ કરો (Close)
                </button>
              </div>
            </div>

            {/* Standee Content Card Designed for Shop Counter Display (100% Shop Identity Only) */}
            <div className="border-4 border-slate-900 rounded-2xl p-6 text-center bg-white shadow-md">
              {/* Shop Header — Custom Shop Logo ONLY if uploaded, otherwise clean uppercase typography */}
              <div className="flex flex-col items-center justify-center mb-4 border-b-2 border-slate-900 pb-3">
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt={(name || currentShop.name || 'Shop').toUpperCase()}
                    className="h-14 w-14 rounded-xl object-contain mb-2"
                  />
                )}
                <h3 className="font-black uppercase tracking-wide text-slate-900 text-lg leading-tight">
                  {(name || currentShop.name || '').toUpperCase()}
                </h3>
                {regionalName && (
                  <div className="text-xs font-bold text-slate-700 mt-0.5">
                    {regionalName}
                  </div>
                )}
                {address && (
                  <div className="text-[11px] text-slate-600 mt-1">
                    {address}{city ? `, ${city}` : ''}{pincode ? ` - ${pincode}` : ''}
                  </div>
                )}
                <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                  {phone || currentShop.phone}
                  {gstNumber ? ` • GSTIN: ${gstNumber}` : ''}
                  {fssaiNumber ? ` • FSSAI: ${fssaiNumber}` : ''}
                </div>
              </div>

              {/* Crisp QR Code Frame */}
              <div className="inline-block p-4 bg-slate-50 border-2 border-slate-800 rounded-2xl mb-4 shadow-xs">
                <img
                  src={displayQrUrl}
                  alt="Scan to Pay QR Code"
                  className="w-52 h-52 object-contain mx-auto"
                />
              </div>

              {/* Scan & Pay Instructions */}
              <div className="space-y-1 mb-4">
                <div className="text-xs font-black uppercase tracking-wide text-slate-800">
                  કોઈપણ UPI એપથી સ્કેન કરો અને ચુકવણી કરો
                </div>
                <div className="text-[11px] text-slate-500">
                  Scan to Pay with any UPI App
                </div>
                <div className="font-mono text-xs font-black text-blue-700 bg-blue-50 py-1 px-3 rounded-lg inline-block mt-1">
                  VPA: {effectiveUpi}
                </div>
              </div>

              {/* Accepted Apps Badges */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-center gap-2 text-[10px] font-bold text-slate-600">
                <span className="bg-slate-100 px-2 py-0.5 rounded">GPay</span>
                <span className="bg-slate-100 px-2 py-0.5 rounded">PhonePe</span>
                <span className="bg-slate-100 px-2 py-0.5 rounded">Paytm</span>
                <span className="bg-slate-100 px-2 py-0.5 rounded">BHIM</span>
              </div>
              <div className="mt-3 text-[9px] text-slate-400 font-sans">
                {RECEIPT_FOOTER_BRAND_CREDIT}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
