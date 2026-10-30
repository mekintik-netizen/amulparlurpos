/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Database, ShieldAlert, Laptop, CheckCircle2, Clock } from 'lucide-react';
import { Shop } from '../../types/index.ts';
import { isBackendConnected } from '../../storage/repositories.ts';

interface LocalModeNoticeProps {
  currentShop: Shop | null;
  onOpenBackupModal: () => void;
}

export const LocalModeNotice: React.FC<LocalModeNoticeProps> = ({ currentShop, onOpenBackupModal }) => {
  const backendActive = isBackendConnected();

  return (
    <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white border-b border-blue-800/60 px-4 py-2.5 text-xs">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <div className="flex items-center gap-2">
            <span className="font-bold tracking-wider uppercase text-blue-200 flex items-center gap-1.5">
              <Laptop className="w-3.5 h-3.5" />
              {backendActive ? 'Connected to Shared Backend' : 'Local-First Mode (IndexedDB)'}
            </span>
            <span className="hidden md:inline text-slate-300">
              | Data isolated to this Windows PC browser profile. 3-project contract ready.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {currentShop && (
            <div className="flex items-center gap-2">
              <span className="bg-blue-950/80 border border-blue-700/60 text-blue-200 px-2 py-0.5 rounded font-mono font-medium">
                {currentShop.shopCode}
              </span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 ${
                currentShop.approvalStatus === 'APPROVED' 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {currentShop.approvalStatus === 'APPROVED' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {currentShop.approvalStatus}
              </span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                currentShop.subscriptionStatus === 'ACTIVE'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              }`}>
                Plan: {currentShop.subscriptionPlanId} ({currentShop.subscriptionStatus})
              </span>
            </div>
          )}

          <button
            onClick={onOpenBackupModal}
            className="bg-white/10 hover:bg-white/20 text-white px-2.5 py-1 rounded text-xs transition flex items-center gap-1.5 border border-white/15"
            title="Backup & Restore IndexedDB data"
          >
            <Database className="w-3 h-3" />
            <span className="hidden sm:inline">Backup / Restore</span>
          </button>
        </div>
      </div>
    </div>
  );
};
