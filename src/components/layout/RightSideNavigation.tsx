/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Right-Side Functions Navigation Dock ("Jamni Baju List")
 * Provides a dedicated, high-accessibility vertical function bar on the right side
 * of the screen for fast counter operations, module switching, and system tools.
 */

import React, { useState } from 'react';
import { 
  Barcode, 
  Truck, 
  Package, 
  Receipt, 
  FileText, 
  Tag, 
  Wallet, 
  ShieldCheck, 
  ChevronRight, 
  ChevronLeft, 
  Sun, 
  Moon, 
  FlaskConical, 
  Database, 
  LogOut, 
  LogIn, 
  Store,
  Sparkles,
  Landmark
} from 'lucide-react';
import { ActiveTab } from './Header.tsx';
import { Shop } from '../../types/index.ts';
import { AuthSession } from '../../storage/auth.ts';
import { Theme } from '../../storage/theme.ts';
import { isShopSubscriptionActive } from '../../storage/subscription.ts';

interface RightSideNavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  currentShop: Shop | null;
  currentUser?: AuthSession | null;
  theme?: Theme;
  onToggleTheme?: () => void;
  onOpenTests: () => void;
  onOpenBackup: () => void;
  onLogout?: () => void;
  onOpenShopLogin: () => void;
  onOpenAdminLogin: () => void;
}

export const RightSideNavigation: React.FC<RightSideNavigationProps> = ({
  activeTab,
  onTabChange,
  currentShop,
  currentUser,
  theme = 'light',
  onToggleTheme,
  onOpenTests,
  onOpenBackup,
  onLogout,
  onOpenShopLogin,
  onOpenAdminLogin
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const subCheck = currentShop ? isShopSubscriptionActive(currentShop) : null;

  const navItems = [
    {
      key: 'POS' as ActiveTab,
      label: 'POS Billing',
      sub: 'Counter checkout',
      icon: Barcode,
      badge: 'Fast'
    },
    {
      key: 'PURCHASES' as ActiveTab,
      label: 'Purchases Khata',
      sub: 'Depot delivery bills',
      icon: Truck
    },
    {
      key: 'STOCK' as ActiveTab,
      label: 'Stock Audit',
      sub: 'Inventory & alerts',
      icon: Package
    },
    {
      key: 'SALES' as ActiveTab,
      label: 'Daily Sales',
      sub: 'Receipts & register',
      icon: Receipt
    },
    {
      key: 'REPORTS' as ActiveTab,
      label: 'PDF Reports Hub',
      sub: 'Official branded PDFs',
      icon: FileText,
      highlight: true
    },
    {
      key: 'EXPENSES' as ActiveTab,
      label: 'Expenses & Cash',
      sub: 'Overheads & P&L',
      icon: Wallet
    },
    {
      key: 'BANK' as ActiveTab,
      label: 'Bank Statement',
      sub: 'બેંક એન્ટ્રી & પાસબુક',
      icon: Landmark,
      badge: 'UPI'
    },
    {
      key: 'PROFILE' as ActiveTab,
      label: 'Shop Profile',
      sub: 'દુકાન & બેંક QR',
      icon: Store,
      badge: 'QR'
    },
    {
      key: 'CATALOG' as ActiveTab,
      label: 'Product Catalog',
      sub: 'Photos & barcodes',
      icon: Tag
    },
    {
      key: 'BACKUP' as ActiveTab,
      label: 'Backup & Safety',
      sub: 'JSON export & restore',
      icon: Database,
      badge: 'Safety'
    },
    {
      key: 'ADMIN' as ActiveTab,
      label: 'Admin Portal',
      sub: 'Shops & renewals',
      icon: ShieldCheck,
      adminOnly: true
    }
  ];

  return (
    <aside 
      className={`no-print shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all duration-300 flex flex-col justify-between shadow-sm z-30 select-none ${
        isExpanded ? 'w-64' : 'w-16'
      }`}
      aria-label="Right Navigation Functions Dock"
    >
      {/* Dock Header & Toggle */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        {isExpanded ? (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-2 h-2 rounded-full bg-[#E31837]" />
            <div className="flex flex-col">
              <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Functions List
              </span>
              <span className="text-[10px] text-slate-400 font-sans">
                Jamni Baju Navigation
              </span>
            </div>
          </div>
        ) : (
          <div className="w-2 h-2 rounded-full bg-[#E31837] mx-auto" />
        )}

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          title={isExpanded ? 'Collapse right navigation' : 'Expand right navigation'}
        >
          {isExpanded ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Main Function Navigation List */}
      <div className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;

          return (
            <button
              key={item.key}
              onClick={() => onTabChange(item.key)}
              title={`${item.label} (${item.sub})`}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition cursor-pointer relative group ${
                isActive
                  ? 'bg-[#005A9C] text-white shadow-xs font-bold'
                  : item.highlight
                  ? 'bg-red-50/80 hover:bg-red-100/90 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
              }`}
            >
              {/* Active Strip */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#E31837] rounded-r" />
              )}

              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : item.highlight ? 'text-[#E31837]' : 'text-slate-500 dark:text-slate-400'}`} />

              {isExpanded && (
                <div className="flex-1 truncate">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold truncate leading-tight">{item.label}</span>
                    {item.highlight && (
                      <span className="text-[9px] font-black uppercase tracking-wider bg-[#E31837] text-white px-1.5 py-0.2 rounded font-mono">
                        PDF
                      </span>
                    )}
                    {item.badge && !isActive && (
                      <span className="text-[9px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 px-1 py-0.2 rounded">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <div className={`text-[10px] truncate ${isActive ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'}`}>
                    {item.sub}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Utilities & System Controls */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2 bg-slate-50/70 dark:bg-slate-900/60">
        {/* Shop Subscription Status Badge in Expanded View */}
        {isExpanded && currentShop && subCheck && (
          <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px] truncate">
                {currentShop.name}
              </span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                subCheck.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {subCheck.isActive ? `${subCheck.daysRemaining}d` : 'Expired'}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              Code: {currentShop.shopCode}
            </div>
          </div>
        )}

        {/* Global Controls Row */}
        <div className="flex items-center justify-around gap-1 pt-1">
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>
          )}

          <button
            onClick={onOpenBackup}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Backup & Restore Snapshots"
          >
            <Database className="w-4 h-4 text-blue-600" />
          </button>

          <button
            onClick={onOpenTests}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Diagnostic Test Suite"
          >
            <FlaskConical className="w-4 h-4 text-purple-600" />
          </button>

          {currentUser ? (
            <button
              onClick={onLogout}
              className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition cursor-pointer"
              title={`Logout (${currentUser.username})`}
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onOpenShopLogin}
              className="p-2 rounded-xl text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition cursor-pointer"
              title="Login"
            >
              <LogIn className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
