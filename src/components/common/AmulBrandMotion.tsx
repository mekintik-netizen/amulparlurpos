/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Amul Brand Motion & Transition Suite
 * Features:
 * - 100% hardware-accelerated CSS/SVG vector animations (zero external Lottie bundle lag)
 * - Concentric dairy milk ripple rings & soft pulsing Amul Red/Dairy Blue aura
 * - Iconic Amul logo emblem with golden dairy crest & subtle rhythmic breathing motion
 * - Full prefers-reduced-motion support
 * - Seamless zero-shift dashboard entrance transition upon successful login
 */

import React from 'react';
import { LOGO_ROUND_URL } from '../../assets/logo.ts';

export interface AmulBrandLogoMotionProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  showTagline?: boolean;
  showRegionalText?: boolean;
  isPulsing?: boolean;
  className?: string;
}

export const AmulBrandLogoMotion: React.FC<AmulBrandLogoMotionProps> = ({
  size = 'md',
  showTagline = true,
  showRegionalText = false,
  isPulsing = true,
  className = ''
}) => {
  // Dimension tokens
  const dimensions = {
    sm: { plaque: 'w-14 h-14', logo: 'h-10 w-10', rings: 'w-24 h-24', text: 'text-[10px]' },
    md: { plaque: 'w-20 h-20', logo: 'h-14 w-14', rings: 'w-32 h-32', text: 'text-xs' },
    lg: { plaque: 'w-24 h-24', logo: 'h-20 w-20', rings: 'w-44 h-44', text: 'text-sm' },
    xl: { plaque: 'w-28 h-28', logo: 'h-24 w-24', rings: 'w-56 h-56', text: 'text-base' },
    hero: { plaque: 'w-36 h-36', logo: 'h-32 w-32', rings: 'w-72 h-72', text: 'text-lg' }
  }[size];

  return (
    <div className={`relative flex flex-col items-center justify-center select-none ${className}`}>
      <style>{`
        @keyframes amul-breathe {
          0%, 100% {
            transform: scale(1);
            filter: drop-shadow(0 4px 12px rgba(0, 90, 156, 0.25));
          }
          50% {
            transform: scale(1.035);
            filter: drop-shadow(0 8px 24px rgba(0, 90, 156, 0.45));
          }
        }
        @keyframes amul-ripple {
          0% {
            transform: scale(0.85);
            opacity: 0.7;
          }
          50% {
            opacity: 0.35;
          }
          100% {
            transform: scale(1.45);
            opacity: 0;
          }
        }
        @keyframes amul-ripple-outer {
          0% {
            transform: scale(0.9);
            opacity: 0.5;
          }
          60% {
            opacity: 0.2;
          }
          100% {
            transform: scale(1.75);
            opacity: 0;
          }
        }
        .amul-motion-breathe {
          animation: amul-breathe 3.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .amul-motion-ripple-1 {
          animation: amul-ripple 3.2s cubic-bezier(0, 0.2, 0.8, 1) infinite;
        }
        .amul-motion-ripple-2 {
          animation: amul-ripple-outer 3.2s cubic-bezier(0, 0.2, 0.8, 1) infinite 1.2s;
        }
        @media (prefers-reduced-motion: reduce) {
          .amul-motion-breathe,
          .amul-motion-ripple-1,
          .amul-motion-ripple-2 {
            animation: none !important;
          }
        }
      `}</style>

      {/* Ripple Rings & Ambient Radial Aura */}
      <div className="relative flex items-center justify-center">
        {isPulsing && (
          <>
            {/* Concentric Ripple 1 */}
            <div
              className={`absolute ${dimensions.rings} rounded-full border-2 border-[#005A9C]/25 dark:border-sky-400/35 amul-motion-ripple-1 pointer-events-none`}
            />
            {/* Concentric Ripple 2 */}
            <div
              className={`absolute ${dimensions.rings} rounded-full border border-amber-400/25 dark:border-amber-300/25 amul-motion-ripple-2 pointer-events-none`}
            />
            {/* Ambient Radial Soft Glow */}
            <div className="absolute -inset-4 bg-gradient-to-r from-[#005A9C]/20 via-sky-400/15 to-amber-400/20 rounded-full blur-xl pointer-events-none" />
          </>
        )}

        {/* Central Round Emblem */}
        <div
          className={`relative z-10 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700/80 rounded-full p-1.5 shadow-md flex items-center justify-center ${
            isPulsing ? 'amul-motion-breathe' : ''
          }`}
        >
          <img
            src={LOGO_ROUND_URL}
            alt="ParlourPro POS — Smart Billing & Inventory"
            className={`${dimensions.logo} rounded-full object-contain transition-transform duration-300`}
            loading="eager"
          />
        </div>
      </div>

      {/* Welcoming Tagline & Typography */}
      {showTagline && (
        <div className="text-center mt-3 space-y-0.5">
          <div className={`font-black text-slate-900 dark:text-white tracking-tight ${dimensions.text}`}>
            ParlourPro POS
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
            Smart Billing &amp; Inventory
          </div>
        </div>
      )}

      {showRegionalText && (
        <div className="mt-1 text-[11px] font-semibold text-blue-700 dark:text-blue-400 font-sans">
          પાર્લરપ્રો POS - સ્માર્ટ બિલિંગ અને ઇન્વેન્ટરી
        </div>
      )}
    </div>
  );
};

/**
 * Startup Splash Component shown during app boot.
 */
export interface AmulStartupSplashProps {
  statusText?: string;
  subText?: string;
}

export const AmulStartupSplash: React.FC<AmulStartupSplashProps> = ({
  statusText = 'Opening ParlourPro POS...',
  subText = 'સ્માર્ટ બિલિંગ અને ઇન્વેન્ટરી કાઉન્ટર શરૂ થઈ રહ્યું છે'
}) => {
  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center font-sans select-none animate-fadeIn"
      role="status"
      aria-label="ParlourPro POS Initializing"
    >
      <div className="relative max-w-sm w-full bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 sm:p-9 shadow-xl backdrop-blur-md">
        {/* Animated Brand Emblem */}
        <AmulBrandLogoMotion size="lg" showTagline={false} isPulsing={true} />

        <div className="mt-6 space-y-1.5">
          <h2 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
            {statusText}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
            {subText}
          </p>
        </div>

        {/* Smooth loading bar indicator */}
        <div className="mt-5 w-48 mx-auto h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#005A9C] via-sky-400 to-amber-400 rounded-full animate-pulse w-full" />
        </div>

        <div className="mt-3 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
          ParlourPro POS · Smart Billing &amp; Inventory
        </div>
      </div>
    </div>
  );
};

/**
 * Celebratory Transition Screen shown on successful login
 * before seamless handoff into the active POS dashboard.
 */
export interface AmulLoginSuccessTransitionProps {
  userName?: string;
  shopName?: string;
}

export const AmulLoginSuccessTransition: React.FC<AmulLoginSuccessTransitionProps> = ({
  userName = 'Authorized Cashier',
  shopName = 'ParlourPro POS'
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-fadeIn select-none">
      <div className="bg-white dark:bg-slate-900 border-2 border-emerald-500/80 rounded-3xl p-7 max-w-sm w-full text-center shadow-2xl transform scale-100 animate-in zoom-in-95 duration-300">
        {/* Pulsing Emerald Seal */}
        <div className="relative w-16 h-16 bg-emerald-100 dark:bg-emerald-950/70 border-2 border-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md">
          <svg
            className="w-8 h-8 text-emerald-600 dark:text-emerald-400 animate-in zoom-in-50 duration-200"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
          પ્રવેશ સફળ રહ્યો! (Signed In)
        </h3>
        <p className="text-xs text-emerald-700 dark:text-emerald-400 font-bold mt-1">
          {userName}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
          {shopName}
        </p>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 font-medium">
          Loading POS Terminal &amp; Stock Counter...
        </div>
      </div>
    </div>
  );
};
