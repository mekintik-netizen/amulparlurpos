/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Missed Daily Backup Alert Banner
 * Detects if the browser was closed or PC shut down during the scheduled 8:00 PM backup time
 * and prompts the user to capture an immediate snapshot.
 */

import React, { useState, useEffect } from 'react';
import { AlertCircle, Download, X, Clock } from 'lucide-react';
import { Shop } from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';

interface MissedBackupBannerProps {
  currentShop: Shop | null;
  onOpenBackupModal: () => void;
}

export const MissedBackupBanner: React.FC<MissedBackupBannerProps> = ({ currentShop, onOpenBackupModal }) => {
  const [isMissed, setIsMissed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!currentShop) return;

    AppRepository.system.checkMissedBackups(currentShop.id).then(res => {
      if (res.missed || res.shouldBackupToday) {
        setIsMissed(true);
      }
    });
  }, [currentShop?.id]);

  if (!isMissed || dismissed || !currentShop) return null;

  return (
    <div className="bg-amber-500 text-slate-950 px-4 py-2 border-b border-amber-600 font-sans text-xs no-print">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-medium">
          <AlertCircle className="w-4 h-4 text-slate-950 shrink-0" />
          <span>
            <strong>Scheduled Daily Backup Due:</strong> The scheduled 8:00 PM snapshot is pending for {currentShop.shopCode}.
            Take a backup now to ensure today's sales and stock movements are safely stored.
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenBackupModal}
            className="bg-slate-950 hover:bg-slate-800 text-white font-bold px-3 py-1 rounded-lg text-xs transition flex items-center gap-1 shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Backup Now
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-slate-900 hover:text-black p-1 transition"
            title="Dismiss notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
