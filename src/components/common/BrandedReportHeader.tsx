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
    <div className="unified-print-header bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-5 shadow-xs transition-colors print:rounded-none print:border-0 print:border-b-2 print:border-slate-900 print:p-0 print:pb-3 print:mb-3 print:shadow-none">
      <div className="flex flex-col md:flex-row print:flex-row md:items-start print:items-start justify-between gap-4 w-full">
        {/* Left Side: 100% Individual Shop Identity */}
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          {/* Custom Shop Logo — rendered ONLY if uploaded by shop owner */}
          {identity.logoUrl && (
            <div className="shrink-0 flex flex-col items-center">
              <div className="bg-white p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs print:rounded-md print:shadow-none">
                <img
                  src={identity.logoUrl}
                  alt={identity.displayName}
                  className="h-14 w-14 sm:h-16 sm:w-16 rounded-lg object-contain print:h-14 print:w-14"
                  loading="eager"
                />
              </div>
            </div>
          )}

          {/* Shop Information */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black uppercase tracking-wide text-slate-900 dark:text-white leading-tight print:text-lg print:text-slate-900">
                {identity.displayName}
              </h2>
              {identity.shopCode && (
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 print:bg-slate-100 print:text-slate-800">
                  {identity.shopCode}
                </span>
              )}
            </div>

            {identity.regionalName && (
              <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mt-0.5 print:text-slate-700">
                {identity.regionalName}
              </div>
            )}

            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 print:text-[10px] print:text-slate-700">
              {identity.addressLine && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400 shrink-0 no-print" />
                  <span>{identity.addressLine}</span>
                </span>
              )}
              {identity.phoneLine && (
                <span className="flex items-center gap-1 font-mono print-nowrap">
                  <Phone className="w-3 h-3 text-slate-400 shrink-0 no-print" />
                  <span>Mob: {identity.phoneLine}</span>
                </span>
              )}
            </div>

            {(identity.gstNumber || identity.fssaiNumber) && (
              <div className="text-[11px] font-mono text-slate-700 dark:text-slate-300 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 print:text-[10px] print:text-slate-800">
                {identity.gstNumber && <span className="font-semibold print-nowrap">GSTIN: {identity.gstNumber}</span>}
                {identity.fssaiNumber && <span className="print-nowrap">FSSAI: {identity.fssaiNumber}</span>}
              </div>
            )}

            {reportSubtitle && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 print:hidden">
                {reportSubtitle}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Official Report Metadata Box */}
        <div className="md:text-right print:text-right shrink-0 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 print:bg-slate-50 print:border-slate-300 print:rounded-md print:px-3 print:py-2">
          <div className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center md:justify-end print:justify-end gap-1.5 print:text-[10.5px]">
            <FileText className="w-3.5 h-3.5 no-print" />
            <span>{reportTitle}</span>
          </div>

          <div className="text-xs font-extrabold text-slate-800 dark:text-white mt-0.5 font-sans print-nowrap print:text-[10px]">
            Period: {formattedReportDate}
          </div>

          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 flex items-center md:justify-end print:justify-end gap-1 print-nowrap print:text-[9px] print:text-slate-600">
            <Clock className="w-3 h-3 text-slate-400 no-print" />
            <span>Generated: {currentTimestamp}</span>
          </div>

          {referenceCode && (
            <div className="text-[9.5px] text-slate-600 dark:text-slate-400 font-mono font-bold mt-0.5 print-nowrap print:text-[9px]">
              Ref: {referenceCode}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
