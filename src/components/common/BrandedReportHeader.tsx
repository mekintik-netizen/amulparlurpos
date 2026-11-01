/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standardized Branded Report Header
 * Renders official Amul corporate identity, shop metadata, and live generation timestamps.
 * Standard for both screen viewing and PDF/print export across all reports.
 */

import React from 'react';
import { Shop } from '../../types/index.ts';
import { Calendar, Clock, MapPin, Phone, ShieldCheck, FileText } from 'lucide-react';
import amulLogo from '../../assets/logo.ts';

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
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-5 shadow-xs transition-colors">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        {/* Left: Official Amul Brand Badge & Shop Details */}
        <div className="flex items-start gap-4">
          {/* Official Amul Brand Artwork */}
          <div className="shrink-0 flex flex-col items-center">
            <div className="bg-white p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
              <img
                src={amulLogo}
                alt="Amul - The Taste of India"
                className="h-14 sm:h-16 w-auto object-contain print:h-16"
                loading="eager"
              />
            </div>
            <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-widest font-mono">
              The Taste of India
            </span>
          </div>

          {/* Shop Information */}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                {currentShop?.name || 'Amul Preferred Outlet'}
              </h2>
              {currentShop?.shopCode && (
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {currentShop.shopCode}
                </span>
              )}
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {currentShop?.address && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>{currentShop.address}, {currentShop.city} - {currentShop.pincode}</span>
                </span>
              )}
              {currentShop?.phone && (
                <span className="flex items-center gap-1 font-mono">
                  <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>{currentShop.phone}</span>
                </span>
              )}
              {currentShop?.gstNumber && (
                <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  GST: {currentShop.gstNumber}
                </span>
              )}
              {currentShop?.fssaiNumber && (
                <span className="font-mono text-[11px] text-slate-500">
                  FSSAI: {currentShop.fssaiNumber}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Report Title, Code & Generation Timestamp */}
        <div className="md:text-right shrink-0 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center md:justify-end gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            <span>{reportTitle}</span>
          </div>

          <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5 font-sans">
            Audit Period: {formattedReportDate}
          </div>

          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-1 flex items-center md:justify-end gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>Generated: {currentTimestamp}</span>
          </div>

          {referenceCode && (
            <div className="text-[9px] text-slate-400 font-mono mt-0.5">
              Ref: {referenceCode}
            </div>
          )}
        </div>
      </div>

      {/* Subtitle / Notice strip */}
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-sans">
        <div>
          {reportSubtitle || 'Official Audit Record · Authorized by Gujarat Co-operative Milk Marketing Federation (GCMMF)'}
        </div>
        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold font-mono text-[10px]">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Certified Parlour Register</span>
        </div>
      </div>
    </div>
  );
};
