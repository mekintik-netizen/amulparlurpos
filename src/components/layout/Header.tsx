/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Main Application Header & Navigation Bar with Amul brand identity.
 */

import React from 'react';
import { 
  Barcode, 
  Package, 
  Receipt, 
  ShieldCheck, 
  FlaskConical, 
  ChevronDown,
  Truck,
  Calculator,
  Tag,
  LogOut,
  User,
  Shield,
  Store,
  LogIn,
  Sun,
  Moon,
  FileText,
  Database
} from 'lucide-react';
import { Shop } from '../../types/index.ts';
import { AuthSession } from '../../storage/auth.ts';
import { Theme } from '../../storage/theme.ts';

export type ActiveTab = 
  | 'POS' 
  | 'PURCHASES'
  | 'STOCK' 
  | 'SALES' 
  | 'REPORTS'
  | 'EXPENSES'
  | 'CATALOG'
  | 'BACKUP'
  | 'ADMIN';

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  shops: Shop[];
  currentShop: Shop | null;
  onSelectShop: (shop: Shop) => void;
  onOpenTests: () => void;
  onOpenBackup: () => void;
  currentUser?: AuthSession | null;
  onLogout?: () => void;
  onOpenShopLogin: () => void;
  onOpenAdminLogin: () => void;
  theme?: Theme;
  onToggleTheme?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  shops,
  currentShop,
  onSelectShop,
  onOpenTests,
  currentUser,
  onLogout,
  onOpenShopLogin,
  onOpenAdminLogin,
  theme = 'light',
  onToggleTheme
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';

  return (
    <header className="bg-[#005A9C] dark:bg-slate-900 text-white shadow-md border-b-2 border-[#E31837] dark:border-rose-600 no-print transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-white text-[#005A9C] font-black text-xl px-2.5 py-1 rounded-lg tracking-wider border-2 border-[#E31837] shadow-xs flex items-center gap-1.5">
              <span className="text-[#E31837]">Amul</span>
              <span className="text-xs font-bold uppercase text-slate-800 tracking-normal bg-slate-100 px-1 py-0.5 rounded">
                Parlour
              </span>
            </div>

            <div className="hidden 2xl:block">
              <div className="font-extrabold text-sm tracking-tight leading-tight flex items-center gap-1.5">
                The Taste of India
                <span className="text-[10px] font-normal text-blue-200">| Web POS Portal</span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1">
            <button
              onClick={() => onTabChange('POS')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'POS'
                  ? 'bg-white text-[#005A9C] shadow-sm'
                  : 'text-blue-100 hover:bg-blue-800/60'
              }`}
            >
              <Barcode className="w-4 h-4" />
              <span>POS Billing</span>
            </button>

            <button
              onClick={() => onTabChange('PURCHASES')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'PURCHASES'
                  ? 'bg-white text-[#005A9C] shadow-sm'
                  : 'text-blue-100 hover:bg-blue-800/60'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>Purchases</span>
            </button>

            <button
              onClick={() => onTabChange('STOCK')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'STOCK'
                  ? 'bg-white text-[#005A9C] shadow-sm'
                  : 'text-blue-100 hover:bg-blue-800/60'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Stock Reports</span>
            </button>

            <button
              onClick={() => onTabChange('SALES')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'SALES'
                  ? 'bg-white text-[#005A9C] shadow-sm'
                  : 'text-blue-100 hover:bg-blue-800/60'
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>Daily Sales</span>
            </button>

            <button
              onClick={() => onTabChange('REPORTS')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'REPORTS'
                  ? 'bg-white text-[#E31837] shadow-sm'
                  : 'text-amber-200 bg-blue-900/40 hover:bg-blue-800'
              }`}
            >
              <FileText className="w-4 h-4 text-amber-300" />
              <span>PDF Reports Hub</span>
            </button>

            <button
              onClick={() => onTabChange('EXPENSES')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'EXPENSES'
                  ? 'bg-white text-[#005A9C] shadow-sm'
                  : 'text-blue-100 hover:bg-blue-800/60'
              }`}
            >
              <Calculator className="w-4 h-4" />
              <span>P&L & Expenses</span>
            </button>

            <button
              onClick={() => onTabChange('CATALOG')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'CATALOG'
                  ? 'bg-white text-[#005A9C] shadow-sm'
                  : 'text-blue-100 hover:bg-blue-800/60'
              }`}
            >
              <Tag className="w-4 h-4" />
              <span>Catalog</span>
            </button>

            <button
              onClick={() => onTabChange('BACKUP')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'BACKUP'
                  ? 'bg-white text-[#005A9C] shadow-sm'
                  : 'text-blue-100 hover:bg-blue-800/60'
              }`}
              title="Backup, Restore & Offline Data Safety"
            >
              <Database className="w-4 h-4 text-emerald-300" />
              <span>Backup & Safety</span>
            </button>

            {/* Admin tab is prominent for Admin or accessible for authorized views */}
            <button
              onClick={() => onTabChange('ADMIN')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'ADMIN'
                  ? 'bg-white text-[#E31837] shadow-sm'
                  : isAdmin
                  ? 'text-amber-200 bg-blue-900/40 hover:bg-blue-800'
                  : 'text-blue-100 hover:bg-blue-800/60'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Admin & Shops</span>
            </button>

            {/* Dedicated Shop Login & Admin Login Buttons in Navigation */}
            <div className="h-6 w-px bg-white/20 mx-1 hidden sm:block" />

            <button
              onClick={onOpenShopLogin}
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer bg-white/10 hover:bg-white text-blue-100 hover:text-[#005A9C] border border-white/20 shadow-xs"
              title="Open Shop Counter Login"
            >
              <Store className="w-3.5 h-3.5 text-amber-300" />
              <span>Shop Login</span>
            </button>

            <button
              onClick={onOpenAdminLogin}
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer bg-[#E31837] hover:bg-[#B30E26] text-white border border-white/20 shadow-xs"
              title="Open Admin Headquarters Login"
            >
              <Shield className="w-3.5 h-3.5 text-amber-200" />
              <span>Admin Login</span>
            </button>
          </nav>

          {/* Right Controls: User Badge, Shop Switcher, Verification Suite, Logout */}
          <div className="flex items-center gap-2 shrink-0">
            {/* User Session Info Pill */}
            {currentUser && (
              <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 bg-blue-950/60 rounded-xl border border-blue-400/30 text-xs">
                {isAdmin ? (
                  <div className="w-5 h-5 rounded-full bg-[#E31837] flex items-center justify-center text-white">
                    <Shield className="w-3 h-3" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full bg-blue-700 flex items-center justify-center text-blue-200">
                    <User className="w-3 h-3" />
                  </div>
                )}
                <div className="leading-tight">
                  <div className="font-bold text-white text-[11px] truncate max-w-[100px]">
                    {currentUser.username}
                  </div>
                  <div className="text-[9px] text-blue-200">
                    {isAdmin ? 'HQ Admin' : currentUser.shopCode || 'Cashier'}
                  </div>
                </div>
              </div>
            )}

            {/* Shop Switcher (for Admins or selecting shop) */}
            {currentShop && (
              <div className="relative group">
                <select
                  value={currentShop.id}
                  disabled={!isAdmin && !!currentUser?.shopId}
                  onChange={(e) => {
                    const found = shops.find((s) => s.id === e.target.value);
                    if (found) onSelectShop(found);
                  }}
                  className={`bg-blue-950/70 border border-blue-400/40 text-white text-xs font-bold py-1.5 pl-2.5 pr-8 rounded-xl appearance-none transition ${
                    !isAdmin && currentUser?.shopId ? 'cursor-not-allowed opacity-90' : 'cursor-pointer hover:bg-blue-950'
                  } focus:outline-hidden focus:ring-2 focus:ring-white`}
                  title={!isAdmin && currentUser?.shopId ? 'Bound to logged-in cashier shop' : 'Select active shop'}
                >
                  {shops.map((s) => (
                    <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                      {s.shopCode} - {s.name.slice(0, 18)}...
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-blue-300 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
            )}

            {/* Global Theme Toggle Button */}
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                className="bg-white/10 hover:bg-white/20 active:bg-white/25 text-white p-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-white/20 shadow-2xs"
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-4 h-4 text-amber-300" />
                    <span className="hidden xl:inline text-[11px] font-semibold text-amber-100">Light</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-4 h-4 text-blue-200" />
                    <span className="hidden xl:inline text-[11px] font-semibold text-blue-100">Dark</span>
                  </>
                )}
              </button>
            )}

            {/* Run Automated Tests Button */}
            <button
              onClick={onOpenTests}
              className="bg-emerald-500 hover:bg-emerald-600 text-white p-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Run Automated Verification Test Suite"
            >
              <FlaskConical className="w-4 h-4" />
              <span className="hidden xl:inline">Verify</span>
            </button>

            {/* Logout / Switch User */}
            {onLogout && (
              <button
                onClick={onLogout}
                className="bg-white/10 hover:bg-rose-600 text-white p-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                title="Switch User / Logout"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline text-[11px]">Logout</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
