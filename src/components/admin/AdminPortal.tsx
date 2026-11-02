/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Admin Portal for Shop Provisioning, Approval & Subscription Management
 * Features:
 * - Direct authentication for registered Admin accounts (bypassing secondary PIN)
 * - Register new shops with auto-generated Shop IDs
 * - Subscription Plan Selection (Trial ₹0, Basic ₹300, Pro ₹500)
 * - Selecting/Confirming a plan directly verifies the Shop Owner's ID and activates the parlour
 * - Quick verification and plan upgrade modal
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  ShieldCheck, 
  Clock, 
  Ban, 
  CheckCircle2, 
  AlertCircle,
  Search, 
  Lock, 
  Check, 
  Store,
  Sparkles,
  BadgeCheck,
  Zap,
  ArrowRight,
  Key,
  Eye,
  EyeOff,
  CheckCircle,
  Calendar,
  RotateCcw,
  RefreshCw,
  X,
  Trash2,
  Upload,
  QrCode,
  LogOut,
  Printer
} from 'lucide-react';
import { Shop, ShopApprovalStatus, SubscriptionPlanId, SubscriptionStatus, SUBSCRIPTION_PLANS } from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';
import { AuthSession, canUserCreateShops, isMasterAdminInitialized, registerShopCashierAccount, adminResetShopPassword, clearActiveSession, generateSalt, hashPasswordWithSalt } from '../../storage/auth.ts';
import { isShopSubscriptionActive, activateOneMonthSubscription, renewShopSubscription } from '../../storage/subscription.ts';
import { getAdminAuthConfig, updateAdminAuthConfig, subscribeToAdminAuthConfig, AdminAuthConfig } from '../../storage/firebase.ts';
import { AdminOneTimeSetup } from './AdminOneTimeSetup.tsx';
import { MonthlyRevenueChart } from './MonthlyRevenueChart.tsx';
import { PrintSettingsTab } from './PrintSettingsTab.tsx';
import { SubscriptionDemoTab } from './SubscriptionDemoTab.tsx';
import amulLogo from '../../assets/logo.ts';

interface AdminPortalProps {
  onSelectShop: (shop: Shop) => void;
  activeShopId: string;
  currentUser?: AuthSession | null;
  onShopsUpdated?: () => void;
  onLogout?: () => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({ 
  onSelectShop, 
  activeShopId,
  currentUser,
  onShopsUpdated,
  onLogout
}) => {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Auto-authenticate if logged in with an ADMIN session
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    return currentUser?.role === 'ADMIN';
  });
  
  const [adminPin, setAdminPin] = useState('');
  const [adminError, setAdminError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ShopApprovalStatus>('ALL');
  const [adminSubTab, setAdminSubTab] = useState<'SHOPS' | 'PRINT_SETTINGS' | 'SUBSCRIPTION_DEMO' | 'REVENUE' | 'QR'>('SHOPS');

  // Modal State for New/Edit Shop
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);

  // Quick Plan & Verification Modal
  const [quickVerifyShop, setQuickVerifyShop] = useState<Shop | null>(null);
  const [selectedPlanForQuickVerify, setSelectedPlanForQuickVerify] = useState<SubscriptionPlanId>('TRIAL');

  // Form State
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Gujarat');
  const [pincode, setPincode] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [fssaiNumber, setFssaiNumber] = useState('');
  const [ownerIdentityNumber, setOwnerIdentityNumber] = useState('');
  const [generatedShopCode, setGeneratedShopCode] = useState('');
  const [approvalStatus, setApprovalStatus] = useState<ShopApprovalStatus>('PENDING');
  const [subscriptionPlanId, setSubscriptionPlanId] = useState<SubscriptionPlanId>('TRIAL');
  const [verifyOwnerWithPlan, setVerifyOwnerWithPlan] = useState(true);
  const [shopAuthError, setShopAuthError] = useState<string | null>(null);
  const [isOneTimeSetupOpen, setIsOneTimeSetupOpen] = useState(false);

  // Cashier Account Form State for New Shop
  const [createCashierAccount, setCreateCashierAccount] = useState(true);
  const [cashierUsername, setCashierUsername] = useState('');
  const [cashierPassword, setCashierPassword] = useState('amul123');
  const [showCashierPassword, setShowCashierPassword] = useState(false);
  const [newCredentialsAlert, setNewCredentialsAlert] = useState<{
    shopCode: string;
    shopName: string;
    username: string;
    password: string;
  } | null>(null);
  const [showCredentialPassword, setShowCredentialPassword] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Shop Password Reset by Admin state
  const [resetPasswordShop, setResetPasswordShop] = useState<Shop | null>(null);
  const [newShopPassword, setNewShopPassword] = useState('');
  const [showNewShopPassword, setShowNewShopPassword] = useState(false);
  const [isResettingShopPassword, setIsResettingShopPassword] = useState(false);
  const [resetShopPasswordSuccess, setResetShopPasswordSuccess] = useState<string | null>(null);
  const [resetShopPasswordError, setResetShopPasswordError] = useState<string | null>(null);

  // Dynamic Master Admin Payment QR state
  const [adminAuthConfig, setAdminAuthConfig] = useState<AdminAuthConfig | null>(null);
  const [paymentQrUrl, setPaymentQrUrl] = useState<string>('');
  const [isSavingQr, setIsSavingQr] = useState(false);
  const [qrToast, setQrToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shop Deletion State & Confirmation
  const [shopToDelete, setShopToDelete] = useState<Shop | null>(null);
  const [isDeletingShop, setIsDeletingShop] = useState(false);

  // Keep admin session synced
  useEffect(() => {
    if (currentUser?.role === 'ADMIN') {
      setIsAdminAuthenticated(true);
    }
  }, [currentUser]);

  // Sync Master Admin Auth Config (including Payment QR) from Firestore in real-time
  useEffect(() => {
    const unsub = subscribeToAdminAuthConfig((cfg) => {
      setAdminAuthConfig(cfg);
      if (cfg?.paymentQrUrl) {
        setPaymentQrUrl(cfg.paymentQrUrl);
      }
    });
    return () => unsub();
  }, []);

  const handleQrFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG, JPG, WebP).');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Image size exceeds 2MB limit. Please upload a smaller QR image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setPaymentQrUrl(base64);
      try {
        setIsSavingQr(true);
        await updateAdminAuthConfig({ paymentQrUrl: base64 });
        setQrToast('Master Payment QR updated and synced to Cloud Firestore!');
        setTimeout(() => setQrToast(null), 4000);
      } catch (err: any) {
        alert(`Failed to save QR code to Firestore: ${err?.message || err}`);
      } finally {
        setIsSavingQr(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteShopConfirm = async () => {
    if (!shopToDelete) return;
    try {
      setIsDeletingShop(true);
      await AppRepository.shops.delete(shopToDelete.id);
      setToastMessage(`Shop "${shopToDelete.name}" (${shopToDelete.shopCode}) deleted successfully.`);
      setTimeout(() => setToastMessage(null), 4000);
      setShopToDelete(null);
      await loadShops();
      if (onShopsUpdated) onShopsUpdated();
    } catch (err: any) {
      alert(`Failed to delete shop: ${err?.message || err}`);
    } finally {
      setIsDeletingShop(false);
    }
  };

  const handleAdminLogout = () => {
    clearActiveSession();
    setIsAdminAuthenticated(false);
    if (onLogout) {
      onLogout();
    }
  };

  const loadShops = async () => {
    try {
      setLoading(true);
      const list = await AppRepository.shops.getAll();
      setShops(list);
    } catch (err) {
      console.error('Failed to load shops:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShops();
  }, []);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPin === 'admin123' || adminPin === '8888') {
      setIsAdminAuthenticated(true);
      setAdminError('');
    } else {
      setAdminError('Invalid Admin PIN. (In local test mode, use: 8888 or admin123)');
    }
  };

  const generateShopId = () => {
    const year = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `AP-${year}-${rand}`;
  };

  const openNewShopModal = async () => {
    const authCheck = await canUserCreateShops(currentUser);
    if (!authCheck.allowed) {
      setShopAuthError(authCheck.reason || 'Only initialized administrators can create shops.');
      return;
    }

    setShopAuthError(null);
    setEditingShop(null);
    setShopName('');
    setOwnerName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setCity('');
    setState('Gujarat');
    setPincode('');
    setGstNumber('');
    setFssaiNumber('');
    setOwnerIdentityNumber('');
    const newCode = generateShopId();
    setGeneratedShopCode(newCode);
    setApprovalStatus('APPROVED'); // Pre-set for quick streamlined setup with verification
    setSubscriptionPlanId('BASIC');
    setVerifyOwnerWithPlan(true);
    setCreateCashierAccount(true);
    setCashierUsername(newCode.toLowerCase().replace(/[^a-z0-9]/g, ''));
    setCashierPassword('amul123');
    setIsModalOpen(true);
  };

  const openEditShopModal = (shop: Shop) => {
    setEditingShop(shop);
    setShopName(shop.name);
    setOwnerName(shop.ownerName);
    setPhone(shop.phone);
    setEmail(shop.email);
    setAddress(shop.address);
    setCity(shop.city);
    setState(shop.state);
    setPincode(shop.pincode);
    setGstNumber(shop.gstNumber || '');
    setFssaiNumber(shop.fssaiNumber || '');
    setOwnerIdentityNumber(shop.ownerIdentityNumber || '');
    setGeneratedShopCode(shop.shopCode);
    setApprovalStatus(shop.approvalStatus);
    setSubscriptionPlanId(shop.subscriptionPlanId);
    setVerifyOwnerWithPlan(shop.ownerIdVerified || false);
    setIsModalOpen(true);
  };

  const handleSaveShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName || !ownerName || !phone) return;

    if (!editingShop) {
      const authCheck = await canUserCreateShops(currentUser);
      if (!authCheck.allowed) {
        alert(authCheck.reason || 'Only initialized administrators can create shops.');
        return;
      }
    }

    try {
      const now = new Date().toISOString();
      const plan = SUBSCRIPTION_PLANS[subscriptionPlanId];

      let startDate: string | undefined = editingShop?.subscriptionStartDate;
      let expiryDate: string | undefined = editingShop?.subscriptionExpiryDate;
      let isVerified = editingShop?.ownerIdVerified || false;
      let verifiedAt = editingShop?.ownerVerifiedAt;
      let verifiedBy = editingShop?.verifiedByAdmin;
      let finalApproval = approvalStatus;
      let finalSubStatus: SubscriptionStatus = editingShop?.subscriptionStatus || 'ACTIVE';

      // Guarantee 1-Month (30 Days) subscription is immediately active for newly registered shops
      if (!editingShop) {
        isVerified = true;
        verifiedAt = now;
        verifiedBy = currentUser?.username || 'admin';
        finalApproval = 'APPROVED';
        finalSubStatus = 'ACTIVE';
        startDate = now;
        expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      } else if (verifyOwnerWithPlan) {
        isVerified = true;
        verifiedAt = now;
        verifiedBy = currentUser?.username || 'admin';
        finalApproval = 'APPROVED';
        finalSubStatus = 'ACTIVE';
        startDate = startDate || now;
        expiryDate = expiryDate || new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000).toISOString();
      }

      let shopSalt = editingShop?.salt;
      let shopPasswordHash = editingShop?.passwordHash;
      let shopCashierPwd = editingShop?.cashierPassword;
      let shopCashierUser = editingShop?.cashierUsername;

      if (!editingShop) {
        const cleanUser = cashierUsername.trim().toLowerCase() || (generatedShopCode || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const pwd = cashierPassword.trim() || 'amul123';
        shopSalt = generateSalt();
        shopPasswordHash = await hashPasswordWithSalt(pwd, shopSalt);
        shopCashierPwd = pwd;
        shopCashierUser = cleanUser;
      }

      const shopData: Shop = {
        id: editingShop ? editingShop.id : `shop-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        shopCode: generatedShopCode || generateShopId(),
        name: shopName.trim(),
        ownerName: ownerName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        gstNumber: gstNumber.trim() || undefined,
        fssaiNumber: fssaiNumber.trim() || undefined,
        ownerIdentityNumber: ownerIdentityNumber.trim() || undefined,
        approvalStatus: finalApproval,
        subscriptionPlanId,
        subscriptionStatus: finalSubStatus,
        subscriptionStartDate: startDate,
        subscriptionExpiryDate: expiryDate,
        planStartDate: startDate,
        planEndDate: expiryDate,
        status: finalApproval === 'APPROVED' ? 'active' : 'suspended',
        cashierUsername: shopCashierUser,
        cashierPassword: shopCashierPwd,
        salt: shopSalt,
        passwordHash: shopPasswordHash,
        ownerIdVerified: isVerified,
        ownerVerifiedAt: verifiedAt,
        verifiedByAdmin: verifiedBy,
        createdAt: editingShop ? editingShop.createdAt : now,
        updatedAt: now
      };

      await AppRepository.shops.save(shopData);

      // Automatically prefill authentic Amul catalog (65+ items with 0 stock) & default suppliers for new shop
      if (!editingShop) {
        await AppRepository.products.prefillMasterCatalog(shopData.id, false);
      }

      // If registering a new shop and cashier account creation is enabled
      if (!editingShop && createCashierAccount && cashierUsername.trim()) {
        const cleanUser = cashierUsername.trim().toLowerCase();
        const pwd = cashierPassword.trim() || 'amul123';
        try {
          await registerShopCashierAccount({
            username: cleanUser,
            fullName: ownerName.trim() || `Cashier (${shopData.shopCode})`,
            password: pwd,
            shopId: shopData.id,
            shopCode: shopData.shopCode
          });
          setNewCredentialsAlert({
            shopCode: shopData.shopCode,
            shopName: shopData.name,
            username: cleanUser,
            password: pwd
          });
        } catch (authErr: any) {
          console.warn('Could not auto-register cashier account:', authErr);
        }
      }

      await loadShops();
      if (onShopsUpdated) onShopsUpdated();
      setIsModalOpen(false);
    } catch (err: any) {
      alert(`Failed to save shop: ${err.message}`);
    }
  };

  // Direct 1-Click 1-Month Plan Activation / Renewal Action
  const handleActivateOneMonthPlan = async (shop: Shop) => {
    try {
      const updatedShop = activateOneMonthSubscription(shop, currentUser?.username || 'admin');
      await AppRepository.shops.save(updatedShop);
      await loadShops();
      if (onShopsUpdated) onShopsUpdated();
      setToastMessage(`1-Month Plan Activated for ${shop.name} (${shop.shopCode}). Counter is now active for 30 days.`);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      alert(`Failed to activate 1-month plan: ${err.message}`);
    }
  };

  // Direct 30-Day Subscription Renewal Action
  const handleRenewSubscription = async (shop: Shop) => {
    try {
      const updatedShop = renewShopSubscription(shop, 30, currentUser?.username || 'admin');
      await AppRepository.shops.save(updatedShop);
      await loadShops();
      if (onShopsUpdated) onShopsUpdated();
      const subInfo = isShopSubscriptionActive(updatedShop);
      setToastMessage(`Renewed subscription for ${shop.name} (${shop.shopCode}) by +30 days! Expiry: ${subInfo.formattedExpiryDate || 'Active'}.`);
      setTimeout(() => setToastMessage(null), 4500);
    } catch (err: any) {
      alert(`Failed to renew subscription: ${err.message}`);
    }
  };

  // Quick Plan Verification Action
  const handleQuickVerifyAndSetPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickVerifyShop) return;

    try {
      const now = new Date().toISOString();
      const plan = SUBSCRIPTION_PLANS[selectedPlanForQuickVerify];
      const expiryDate = new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000).toISOString();

      const updatedShop: Shop = {
        ...quickVerifyShop,
        subscriptionPlanId: selectedPlanForQuickVerify,
        subscriptionStatus: 'ACTIVE',
        approvalStatus: 'APPROVED',
        ownerIdVerified: true,
        ownerVerifiedAt: now,
        verifiedByAdmin: currentUser?.username || 'admin',
        subscriptionStartDate: now,
        subscriptionExpiryDate: expiryDate,
        updatedAt: now
      };

      await AppRepository.shops.save(updatedShop);
      await loadShops();
      if (onShopsUpdated) onShopsUpdated();
      setQuickVerifyShop(null);
    } catch (err: any) {
      alert(`Verification failed: ${err.message}`);
    }
  };

  const handleAdminResetShopPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordShop) return;
    setResetShopPasswordError(null);
    setResetShopPasswordSuccess(null);

    if (!newShopPassword || newShopPassword.length < 4) {
      setResetShopPasswordError('New password must be at least 4 characters.');
      return;
    }

    setIsResettingShopPassword(true);
    try {
      const res = await adminResetShopPassword({
        adminSession: currentUser || null,
        shopCode: resetPasswordShop.shopCode,
        newPassword: newShopPassword
      });

      setResetShopPasswordSuccess(`Password for cashier @${res.username} (${resetPasswordShop.shopCode}) was updated successfully!`);
      setTimeout(() => {
        setResetPasswordShop(null);
        setNewShopPassword('');
        setResetShopPasswordSuccess(null);
      }, 2000);
    } catch (err: any) {
      setResetShopPasswordError(err?.message || 'Failed to update shop password.');
    } finally {
      setIsResettingShopPassword(false);
    }
  };

  const filteredShops = shops.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.ownerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.shopCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.phone.includes(searchTerm);
    const matchesStatus = statusFilter === 'ALL' || s.approvalStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {!isAdminAuthenticated ? (
        /* Admin Login Screen (For fallback pin access) */
        <div className="bg-white dark:bg-black rounded-2xl shadow-xs border border-slate-200 dark:border-neutral-800 p-8 max-w-md mx-auto text-center">
          <div className="w-12 h-12 bg-neutral-100 dark:bg-neutral-900 text-slate-800 dark:text-neutral-200 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-200 dark:border-neutral-800">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Amul Admin Verification</h3>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mb-6">
            Enter Admin PIN to manage parlour franchises, approve shops, and configure subscription plans.
          </p>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <input
                type="password"
                placeholder="Enter Admin PIN"
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
                className="w-full text-center tracking-widest text-lg font-mono px-4 py-3 bg-slate-50 dark:bg-neutral-950 text-slate-900 dark:text-white border border-slate-300 dark:border-neutral-800 rounded-xl focus:ring-2 focus:ring-black dark:focus:ring-white focus:outline-hidden"
              />
              {adminError && <div className="text-xs text-rose-600 dark:text-rose-400 mt-2 font-medium">{adminError}</div>}
            </div>

            <button
              type="submit"
              className="w-full bg-black hover:bg-neutral-900 active:bg-neutral-950 text-white border border-neutral-800 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition shadow-md cursor-pointer"
            >
              Access Admin Portal
            </button>

            <button
              type="button"
              onClick={() => {
                setAdminPin('8888');
                setIsAdminAuthenticated(true);
              }}
              className="w-full bg-black hover:bg-neutral-900 active:bg-neutral-950 text-neutral-300 hover:text-white py-2.5 px-3 rounded-xl font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2 border border-neutral-800 shadow-sm"
            >
              <span>1-Click Demo: Unlock Admin Dashboard</span>
            </button>
          </form>
        </div>
      ) : (
        /* Authenticated Admin Dashboard */
        <div className="space-y-6">
          {/* Shop Creation Authorization Error Banner */}
          {shopAuthError && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-800 animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                <div>
                  <div className="font-bold">Shop Creation Restricted</div>
                  <p className="text-[11px] text-rose-700">{shopAuthError}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsOneTimeSetupOpen(true)}
                  className="bg-[#E31837] hover:bg-[#B30E26] text-white font-bold text-xs px-3 py-1.5 rounded-xl transition cursor-pointer shadow-xs"
                >
                  Run One-Time Admin Setup
                </button>
                <button
                  type="button"
                  onClick={() => setShopAuthError(null)}
                  className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Top Bar with Register Shop Action & Official Brand Artwork */}
          <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="bg-slate-50 p-1.5 rounded-xl border border-slate-200 shadow-2xs shrink-0 hidden sm:block">
                <img
                  src={amulLogo}
                  alt="Amul"
                  className="h-10 w-auto object-contain"
                  loading="eager"
                />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Store className="w-5 h-5 text-blue-600" />
                  Amul Parlour Franchise & Shop Management
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Register new shops as Admin, assign plans, and verify shop owner credentials.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={openNewShopModal}
                className="bg-[#005A9C] hover:bg-blue-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Register New Shop</span>
              </button>

              <button
                onClick={handleAdminLogout}
                className="bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                title="Logout Master Admin and wipe all active session tokens"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout Admin</span>
              </button>
            </div>
          </div>

          {/* Admin HQ Navigation Sub-Tabs */}
          <div className="bg-white rounded-2xl p-2 shadow-xs border border-slate-200/80 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAdminSubTab('SHOPS')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                adminSubTab === 'SHOPS'
                  ? 'bg-[#005A9C] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Store className="w-4 h-4" />
              <span>Shops & Franchises (દુકાન વ્યવસ્થાપન)</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                adminSubTab === 'SHOPS' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
                {shops.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAdminSubTab('PRINT_SETTINGS')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                adminSubTab === 'PRINT_SETTINGS'
                  ? 'bg-[#005A9C] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>Print Settings (પ્રિન્ટ સેટિંગ્સ)</span>
              <span className="text-[10px] font-bold uppercase font-mono px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                Live Sync
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAdminSubTab('SUBSCRIPTION_DEMO')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                adminSubTab === 'SUBSCRIPTION_DEMO'
                  ? 'bg-[#005A9C] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>સબ્સ્ક્રિપ્શન ડેમો & સેટિંગ્સ / Subscription Demo & Settings</span>
              <span className="text-[10px] font-bold uppercase font-mono px-1.5 py-0.5 bg-yellow-100 text-yellow-900 rounded">
                ₹500 Preview
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAdminSubTab('REVENUE')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                adminSubTab === 'REVENUE'
                  ? 'bg-[#005A9C] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Revenue Analytics (આવક)</span>
            </button>

            <button
              type="button"
              onClick={() => setAdminSubTab('QR')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                adminSubTab === 'QR'
                  ? 'bg-[#005A9C] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>Payment QR (યુપીઆઈ ક્યુઆર)</span>
            </button>
          </div>

          {/* Sub-Tab 1: Dedicated Print Settings Tab & Customizer */}
          {adminSubTab === 'PRINT_SETTINGS' && (
            <PrintSettingsTab
              currentShop={shops.find((s) => s.id === activeShopId) || shops[0]}
              adminUsername={currentUser?.username || 'Master Admin'}
            />
          )}

          {/* Sub-Tab 2: Dedicated Subscription Demo & Settings Tab */}
          {adminSubTab === 'SUBSCRIPTION_DEMO' && (
            <SubscriptionDemoTab
              shops={shops}
              adminUsername={currentUser?.username || 'Master Admin'}
            />
          )}

          {/* Sub-Tab 2: Master Admin Dynamic Payment QR Upload Section (Synced with Firestore) */}
          {adminSubTab === 'QR' && (
            <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/80 animate-in fade-in">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#005A9C] flex items-center justify-center border border-blue-200 shrink-0">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                      <span>Admin Master Subscription UPI QR Code</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                        Live Cloud Sync
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Upload your UPI / GPay / PhonePe QR code. When any parlour subscription expires, this QR is dynamically shown to the counter cashier with renewal contact info (<strong className="text-slate-800">+919173598234</strong>).
                    </p>
                    {qrToast && (
                      <div className="mt-2 text-xs font-bold text-emerald-700 flex items-center gap-1.5 bg-emerald-50 p-2 rounded-lg border border-emerald-200 animate-in fade-in duration-200">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{qrToast}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  {paymentQrUrl ? (
                    <div className="relative group w-16 h-16 rounded-xl border-2 border-dashed border-blue-300 p-1 bg-white overflow-hidden shadow-2xs">
                      <img 
                        src={paymentQrUrl} 
                        alt="Current Master Payment QR" 
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 bg-slate-50 text-[10px] text-center p-1">
                      No QR Set
                    </div>
                  )}

                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleQrFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSavingQr}
                      className="bg-[#005A9C] hover:bg-blue-800 disabled:bg-slate-400 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isSavingQr ? 'Saving QR...' : (paymentQrUrl ? 'Change QR Image' : 'Upload QR Image')}</span>
                    </button>
                    <div className="text-[10px] text-slate-400 mt-1 font-mono text-center">PNG, JPG &lt; 2MB</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sub-Tab 3: Executive Revenue Analytics (Recharts 12-Month Trends) */}
          {adminSubTab === 'REVENUE' && (
            <MonthlyRevenueChart
              shops={shops}
              activeShopId={activeShopId}
            />
          )}

          {/* Sub-Tab 4: Shops & Franchises Table */}
          {adminSubTab === 'SHOPS' && (
            <>
              {/* Subscription Plans Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(Object.keys(SUBSCRIPTION_PLANS) as SubscriptionPlanId[]).map((key) => {
              const plan = SUBSCRIPTION_PLANS[key];
              return (
                <div key={key} className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-extrabold text-sm text-slate-900">{plan.name}</span>
                      <span className="font-mono font-black text-[#005A9C] text-base">
                        ₹{plan.price} / {plan.durationDays}d
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">{plan.description}</p>
                    <ul className="text-[11px] text-slate-600 space-y-1.5 mb-4">
                      {plan.features.map((f, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-2 font-mono flex items-center justify-between">
                    <span>Capacity: {plan.maxProducts} SKUs</span>
                    <span className="text-blue-600 font-semibold">Verifies Owner ID</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Shops Table */}
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex gap-2">
                {(['ALL', 'APPROVED', 'PENDING', 'SUSPENDED'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      statusFilter === st
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <div className="relative min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search shop name, owner, ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-y border-slate-200">
                  <tr>
                    <th className="py-3 px-3">Shop ID & Name</th>
                    <th className="py-3 px-2">Owner & Contact</th>
                    <th className="py-3 px-2 text-center">Owner Verification</th>
                    <th className="py-3 px-2 text-center">Plan</th>
                    <th className="py-3 px-3 text-center">Subscription Expiry Date</th>
                    <th className="py-3 px-3 text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredShops.map((shop) => (
                    <tr key={shop.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-3">
                        <div className="font-mono font-bold text-blue-700">{shop.shopCode}</div>
                        <div className="font-bold text-slate-900 mt-0.5">{shop.name}</div>
                        <div className="text-[10px] text-slate-400">{shop.city}, {shop.state}</div>
                        {shop.id === activeShopId && (
                          <span className="inline-block bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full mt-1">
                            Current Active Counter
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <div className="font-semibold text-slate-800">{shop.ownerName}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{shop.phone}</div>
                        {shop.ownerIdentityNumber && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            ID: {shop.ownerIdentityNumber}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {shop.ownerIdVerified ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                              <BadgeCheck className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Verified Owner</span>
                            </span>
                            {shop.verifiedByAdmin && (
                              <span className="text-[9px] text-slate-400 mt-0.5">
                                by {shop.verifiedByAdmin}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="inline-flex flex-col items-center gap-1">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>Pending Verification</span>
                            </span>
                            <button
                              onClick={() => {
                                setQuickVerifyShop(shop);
                                setSelectedPlanForQuickVerify(shop.subscriptionPlanId || 'TRIAL');
                              }}
                              className="text-[10px] font-bold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                            >
                              Verify & Set Plan
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="font-bold text-slate-800 text-xs">{shop.subscriptionPlanId || '1-MONTH'}</div>
                        <div className="text-[10px] text-slate-400 capitalize">{shop.subscriptionStatus?.toLowerCase() || 'active'}</div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {(() => {
                          const sub = isShopSubscriptionActive(shop);
                          if (sub.isActive) {
                            return (
                              <div className="inline-flex flex-col items-center">
                                <div className="font-mono font-bold text-xs text-slate-900 flex items-center gap-1">
                                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                                  <span>{sub.formattedExpiryDate}</span>
                                </div>
                                <span className="text-[10px] text-emerald-700 font-bold mt-0.5">
                                  Active · {sub.daysRemaining}d left
                                </span>
                              </div>
                            );
                          }
                          return (
                            <div className="inline-flex flex-col items-center">
                              <div className="font-mono font-bold text-xs text-rose-700 flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-rose-500" />
                                <span>{sub.formattedExpiryDate || 'Expired'}</span>
                              </div>
                              <span className="text-[10px] text-rose-600 font-bold mt-0.5">
                                Expired (Read-Only)
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* Dedicated 30-Day Renewal Button */}
                          <button
                            onClick={() => handleRenewSubscription(shop)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 shadow-xs"
                            title="Renew and extend subscription access by 30 days"
                          >
                            <RefreshCw className="w-3 h-3 text-emerald-100" />
                            <span>Renew (+30 Days)</span>
                          </button>
                          <button
                            onClick={() => {
                              setQuickVerifyShop(shop);
                              setSelectedPlanForQuickVerify(shop.subscriptionPlanId || 'BASIC');
                            }}
                            className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                            title="Assign Plan and Verify Owner"
                          >
                            <Zap className="w-3 h-3 text-amber-600" />
                            <span>Plan</span>
                          </button>
                          <button
                            onClick={() => openEditShopModal(shop)}
                            className="px-2 py-1 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg text-xs font-semibold transition cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setResetPasswordShop(shop);
                              setNewShopPassword('');
                              setResetShopPasswordError(null);
                              setResetShopPasswordSuccess(null);
                            }}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 border border-slate-300 shadow-2xs"
                            title={`Reset password for ${shop.name} cashier`}
                          >
                            <Key className="w-3 h-3 text-slate-600" />
                            <span>Password</span>
                          </button>
                          <button
                            onClick={() => onSelectShop(shop)}
                            className="bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer"
                          >
                            Switch POS
                          </button>
                          <button
                            onClick={() => setShopToDelete(shop)}
                            className="px-2 py-1 text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 shadow-2xs"
                            title={`Delete parlour ${shop.name} (${shop.shopCode})`}
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>
          )}
        </div>
      )}

      {/* Quick Plan & Owner Verification Modal */}
      {quickVerifyShop && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-2.5 mb-2 text-amber-700">
              <Zap className="w-5 h-5 text-amber-600" />
              <h3 className="font-extrabold text-base text-slate-900">
                Set Plan & Verify Owner ID
              </h3>
            </div>
            
            <p className="text-xs text-slate-500 mb-4">
              Select a subscription plan for <strong className="text-slate-800">{quickVerifyShop.name}</strong> ({quickVerifyShop.shopCode}). Confirming verifies franchisee owner <strong className="text-slate-800">{quickVerifyShop.ownerName}</strong> and activates the parlour.
            </p>

            <form onSubmit={handleQuickVerifyAndSetPlan} className="space-y-3">
              <div className="space-y-2">
                {(Object.keys(SUBSCRIPTION_PLANS) as SubscriptionPlanId[]).map((planId) => {
                  const p = SUBSCRIPTION_PLANS[planId];
                  const isSelected = selectedPlanForQuickVerify === planId;
                  return (
                    <div
                      key={planId}
                      onClick={() => setSelectedPlanForQuickVerify(planId)}
                      className={`p-3 rounded-2xl border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? 'border-[#005A9C] bg-blue-50/70 ring-2 ring-[#005A9C]/20 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{p.name}</span>
                        <span className="font-mono font-bold text-blue-700">₹{p.price} / 30 Days</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{p.description}</p>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-900 flex items-start gap-2">
                <BadgeCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Owner Certification:</strong> Applying this plan verifies owner identity ({quickVerifyShop.ownerName}) and activates 30-day operating status.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickVerifyShop(null)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-gradient-to-r from-[#005A9C] to-[#003870] hover:brightness-110 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <BadgeCheck className="w-4 h-4" />
                  <span>Verify Owner & Apply Plan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Register / Edit Shop Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full p-6 my-8 animate-in fade-in duration-200">
            <h3 className="font-extrabold text-base text-slate-900 mb-1">
              {editingShop ? `Edit Shop: ${editingShop.shopCode}` : 'Admin: Register New Amul Franchise Parlour'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter franchisee owner details, select subscription tier, and verify owner identity.
            </p>

            <form onSubmit={handleSaveShop} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Unique Shop ID</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={generatedShopCode}
                      onChange={(e) => setGeneratedShopCode(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-xl font-mono text-xs font-bold text-blue-700 focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setGeneratedShopCode(generateShopId())}
                      className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                    >
                      Gen
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Shop / Outlet Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Amul Anand Main Parlour"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Franchisee Owner</label>
                  <input
                    type="text"
                    required
                    placeholder="Full name"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    required
                    placeholder="+91 XXXXX XXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="shop@amulparlour.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Owner Identity Document / ID #</label>
                  <input
                    type="text"
                    placeholder="Aadhaar / PAN / Franchise Ref #"
                    value={ownerIdentityNumber}
                    onChange={(e) => setOwnerIdentityNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">GST / FSSAI Number (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 24AAAAA0000A1Z5"
                    value={gstNumber}
                    onChange={(e) => setGstNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    placeholder="City"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">State</label>
                  <input
                    type="text"
                    placeholder="State"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pincode</label>
                  <input
                    type="text"
                    placeholder="Pincode"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Shop Counter Login Credentials Setup */}
              {!editingShop && (
                <div className="p-4 bg-slate-100 dark:bg-neutral-950 border border-slate-300 dark:border-neutral-800 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-slate-800 dark:text-neutral-200" />
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        Create Shop Counter Login (Cashier ID & Password)
                      </span>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-neutral-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createCashierAccount}
                        onChange={(e) => setCreateCashierAccount(e.target.checked)}
                        className="rounded text-black focus:ring-black cursor-pointer"
                      />
                      <span className="text-[11px] font-bold text-slate-900 dark:text-white">Generate Cashier ID</span>
                    </label>
                  </div>

                  {createCashierAccount && (
                    <div className="space-y-3 pt-1">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-neutral-300 mb-1">
                            Cashier Username / Login ID <span className="text-rose-500">*</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2 text-xs font-bold text-slate-400">@</span>
                            <input
                              type="text"
                              value={cashierUsername}
                              onChange={(e) => setCashierUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                              placeholder="e.g. anand_pos"
                              className="w-full pl-7 pr-3 py-2 bg-white dark:bg-black text-slate-900 dark:text-white border border-slate-300 dark:border-neutral-800 rounded-xl text-xs font-mono focus:ring-2 focus:ring-black dark:focus:ring-white"
                              required={createCashierAccount}
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-neutral-300 mb-1">
                            Initial Login Password <span className="text-rose-500">*</span>
                          </label>
                          <div className="relative">
                            <input
                              type={showCashierPassword ? 'text' : 'password'}
                              value={cashierPassword}
                              onChange={(e) => setCashierPassword(e.target.value)}
                              placeholder="Min 4 characters"
                              className="w-full px-3 py-2 bg-white dark:bg-black text-slate-900 dark:text-white border border-slate-300 dark:border-neutral-800 rounded-xl text-xs pr-8 focus:ring-2 focus:ring-black dark:focus:ring-white"
                              required={createCashierAccount}
                            />
                            <button
                              type="button"
                              onClick={() => setShowCashierPassword(!showCashierPassword)}
                              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:text-neutral-400 dark:hover:text-white cursor-pointer"
                            >
                              {showCashierPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-500 dark:text-neutral-400 leading-normal">
                        The shop operator can log in immediately using this ID and password at the Shop Counter.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Subscription Plan Selection & Owner ID Verification */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900">
                    Select Subscription Plan for Shop
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Verifies Owner ID
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(SUBSCRIPTION_PLANS) as SubscriptionPlanId[]).map((planKey) => {
                    const p = SUBSCRIPTION_PLANS[planKey];
                    const selected = subscriptionPlanId === planKey;
                    return (
                      <div
                        key={planKey}
                        onClick={() => {
                          setSubscriptionPlanId(planKey);
                          setVerifyOwnerWithPlan(true);
                        }}
                        className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                          selected
                            ? 'border-[#005A9C] bg-blue-50/80 ring-2 ring-[#005A9C]/20 shadow-xs'
                            : 'border-slate-200 bg-white hover:bg-slate-100'
                        }`}
                      >
                        <div className="font-bold text-xs text-slate-800">{p.name}</div>
                        <div className="font-mono font-bold text-blue-700 text-xs mt-0.5">₹{p.price}</div>
                        <div className="text-[9px] text-slate-500 mt-1">{p.maxProducts} SKUs</div>
                      </div>
                    );
                  })}
                </div>

                {/* Owner ID Verification Checkbox */}
                <div className="pt-2 border-t border-slate-200 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="verifyOwnerCheck"
                    checked={verifyOwnerWithPlan}
                    onChange={(e) => setVerifyOwnerWithPlan(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="verifyOwnerCheck" className="text-xs text-slate-700 cursor-pointer">
                    <span className="font-bold text-slate-900">Verify Shop Owner ID with this plan</span>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Approves the shop, records verification by Admin ({currentUser?.username || 'admin'}), and activates the 30-day subscription.
                    </p>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-black hover:bg-neutral-900 active:bg-neutral-950 text-white border border-neutral-800 px-5 py-2 rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingShop ? 'Save Changes' : 'Register & Verify Shop'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* One-Time Master Admin Setup Modal */}
      {isOneTimeSetupOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <AdminOneTimeSetup
            onSetupComplete={() => {
              setIsOneTimeSetupOpen(false);
              setShopAuthError(null);
              if (onShopsUpdated) onShopsUpdated();
            }}
            onCancel={() => setIsOneTimeSetupOpen(false)}
          />
        </div>
      )}

      {/* Newly Created Shop Credentials Alert Modal - Blacked-out styling & masked password */}
      {newCredentialsAlert && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-black text-white rounded-3xl shadow-2xl max-w-md w-full p-6 text-center space-y-4 border border-neutral-800 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-neutral-900 text-white rounded-2xl flex items-center justify-center mx-auto border border-neutral-800 shadow-inner">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>

            <div>
              <h3 className="font-extrabold text-base text-white">
                New Shop & Cashier Account Created
              </h3>
              <p className="text-xs text-neutral-400 mt-1">
                Shop profile for <strong className="text-white">{newCredentialsAlert.shopName}</strong> has been registered and activated with 1-Month Plan.
              </p>
            </div>

            {/* Blacked-out Credentials Card */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 text-left font-mono text-xs space-y-2.5">
              <div className="flex justify-between items-center border-b border-neutral-850 pb-2">
                <span className="text-neutral-400 font-sans text-[11px]">Shop Code:</span>
                <span className="font-bold text-white bg-black px-2.5 py-1 rounded-lg border border-neutral-800">
                  {newCredentialsAlert.shopCode}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-neutral-850 pb-2">
                <span className="text-neutral-400 font-sans text-[11px]">Cashier ID:</span>
                <span className="font-bold text-white bg-black px-2.5 py-1 rounded-lg border border-neutral-800">
                  @{newCredentialsAlert.username}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-neutral-850 pb-2">
                <span className="text-neutral-400 font-sans text-[11px]">Initial Password:</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-white bg-black px-2.5 py-1 rounded-lg border border-neutral-800 tracking-wider">
                    {showCredentialPassword ? newCredentialsAlert.password : '••••••••'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCredentialPassword(!showCredentialPassword)}
                    className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-900 transition cursor-pointer"
                    title={showCredentialPassword ? "Mask password" : "Show password"}
                  >
                    {showCredentialPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center text-[11px] pt-0.5">
                <span className="text-neutral-400 font-sans">1-Month Plan:</span>
                <span className="font-bold text-white bg-black px-2.5 py-1 rounded-lg border border-neutral-800 font-sans">
                  Active (30 Days)
                </span>
              </div>
            </div>

            <p className="text-[10px] text-neutral-400">
              Share these credentials with the parlour franchisee operator for logging in at the Shop Counter.
            </p>

            <button
              onClick={() => {
                setNewCredentialsAlert(null);
                setShowCredentialPassword(false);
              }}
              className="w-full py-2.5 px-4 bg-white hover:bg-neutral-200 text-black rounded-xl font-bold text-xs transition cursor-pointer shadow-sm"
            >
              Done & Close
            </button>
          </div>
        </div>
      )}

      {/* Admin Reset Shop Password Modal */}
      {resetPasswordShop && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center border border-slate-700">
                  <Key className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">
                    Reset Shop Password
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {resetPasswordShop.name} ({resetPasswordShop.shopCode})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetPasswordShop(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleAdminResetShopPassword} className="p-6 space-y-4">
              {resetShopPasswordSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2 text-xs text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{resetShopPasswordSuccess}</span>
                </div>
              )}

              {resetShopPasswordError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-700">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{resetShopPasswordError}</span>
                </div>
              )}

              <p className="text-xs text-slate-600 leading-relaxed">
                As an authorized Administrator, you can assign a fresh password for this shop's cashier terminal. The new password will take effect immediately.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  New Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showNewShopPassword ? 'text' : 'password'}
                    value={newShopPassword}
                    onChange={(e) => setNewShopPassword(e.target.value)}
                    placeholder="Enter new shop password (min 4 chars)"
                    className="w-full text-xs pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-black"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewShopPassword(!showNewShopPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showNewShopPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Recommend at least 6 characters. Give this password to the shop owner.
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetPasswordShop(null)}
                  className="w-1/3 py-2.5 px-3 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResettingShopPassword}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-black hover:bg-neutral-800 text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isResettingShopPassword ? 'Updating Password...' : 'Save New Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Shop Confirmation Modal */}
      {shopToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            
            <h3 className="font-extrabold text-base text-slate-900 mb-1">
              Delete Parlour & Franchise Data?
            </h3>
            
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-slate-900">{shopToDelete.name}</strong> ({shopToDelete.shopCode})?
              <br /><br />
              <span className="text-rose-700 font-semibold bg-rose-50 p-2 rounded-lg border border-rose-200 block">
                Warning: This removes the shop record from IndexedDB and Cloud Firestore.
              </span>
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShopToDelete(null)}
                disabled={isDeletingShop}
                className="w-1/3 py-2.5 px-3 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteShopConfirm}
                disabled={isDeletingShop}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
              >
                {isDeletingShop ? 'Deleting Shop...' : 'Yes, Delete Parlour'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-slate-700 flex items-center gap-2.5 text-xs animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
