/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Standardized Shop-Only White-Label Report Header
 * Displays ONLY the logged-in shop's own business identity:
 * - Optional Custom Shop Logo (`currentShop.logoUrl`) if uploaded in Shop Profile
 *   (clean commercial typography with zero placeholder logo when absent)
 * - Bold uppercase Shop Name, Address, Phone, GSTIN, and FSSAI License
 * - Report title, audit period, and generation timestamp
 * Zero third-party software names, taglines, URLs, or app logos ever appear.
 */

import React from 'react';
import { Shop } from '../../types/index.ts';
import { Clock, MapPin, Phone, FileText } from 'lucide-react';
import { getShopPdfIdentity } from '../../utils/shopPdfBranding.ts';

interface BrandedReportHeaderProps {
  currentShop: Shop | null;
  reportTitle: string;
  reportSubtitle?: string;
  reportDate?: string;
  generatedAt?: string;
  referenceCode?: string;
}

export const BrandedReportHeader: React.FC<BrandedReportHeaderProps> = ({
  currentShop,
  reportTitle,
  reportSubtitle,
  reportDate,
  generatedAt,
  referenceCode
}) => {
  const identity = getShopPdfIdentity(currentShop);

  const currentTimestamp = generatedAt || new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  const formattedReportDate = reportDate ? new Date(reportDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }) : new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-5 shadow-xs transition-colors print:rounded-none print:border-0 print:border-b-2 print:border-slate-900 print:p-0 print:pb-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        {/* Left: Shop's Own Identity Only */}
        <div className="flex items-start gap-4">
          {/* Custom Shop Logo — rendered ONLY if uploaded by shop owner */}
          {identity.logoUrl && (
            <div className="shrink-0 flex flex-col items-center">
              <div className="bg-white p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
                <img
                  src={identity.logoUrl}
                  alt={identity.displayName}
                  className="h-14 w-14 sm:h-16 sm:w-16 rounded-lg object-contain print:h-16 print:w-16"
                  loading="eager"
                />
              </div>
            </div>
          )}

          {/* Shop Information */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black uppercase tracking-wide text-slate-900 dark:text-white leading-tight">
                {identity.displayName}
              </h2>
              {identity.shopCode && (
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {identity.shopCode}
                </span>
              )}
            </div>

            {identity.regionalName && (
              <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mt-0.5">
                {identity.regionalName}
              </div>
            )}

            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1">
              {identity.addressLine && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>{identity.addressLine}</span>
                </span>
              )}
              {identity.phoneLine && (
                <span className="flex items-center gap-1 font-mono">
                  <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>{identity.phoneLine}</span>
                </span>
              )}
              {identity.gstNumber && (
                <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  GSTIN: {identity.gstNumber}
                </span>
              )}
              {identity.fssaiNumber && (
                <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                  FSSAI: {identity.fssaiNumber}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Report Title, Code & Generation Timestamp */}
        <div className="md:text-right shrink-0 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700 print:bg-transparent print:border-slate-300">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center md:justify-end gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            <span>{reportTitle}</span>
          </div>

          <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5 font-sans">
            Period: {formattedReportDate}
          </div>

          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-1 flex items-center md:justify-end gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>Generated: {currentTimestamp}</span>
          </div>

          {referenceCode && (
            <div className="text-[9px] text-slate-500 font-mono mt-0.5">
              Ref: {referenceCode}
            </div>
          )}
        </div>
      </div>

      {/* Subtitle / Official Store Notice strip */}
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-sans">
        <div>
          {reportSubtitle || `Official Business Register — ${identity.displayName}`}
        </div>
        <div className="font-semibold font-mono text-[10px] text-slate-600 dark:text-slate-300 uppercase">
          {identity.displayName}
        </div>
      </div>
    </div>
  );
};
