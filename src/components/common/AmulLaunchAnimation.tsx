/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Amul Brand Launch Animation
 * Features:
 * - Iconic Amul Red (#E31837) & Anand Dairy Blue (#005A9C) palette
 * - "The Taste of India" classic typography and gold dairy crest
 * - Radial milk swirl and droplet ripple effect
 * - Auto-transitions smoothly to Login after 2.2 seconds
 * - Immediate "Skip Intro" option for busy shop counters
 */

import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { LOGO_ROUND_URL } from '../../assets/logo.ts';

interface AmulLaunchAnimationProps {
  onComplete: () => void;
}

export const AmulLaunchAnimation: React.FC<AmulLaunchAnimationProps> = ({ onComplete }) => {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    // Start fade out at 2.0s
    const timer = setTimeout(() => {
      setFadingOut(true);
    }, 2000);

    // Call onComplete when fade out finishes at 2.4s
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 2400);

    return () => {
      clearTimeout(timer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  const handleSkip = () => {
    setFadingOut(true);
    setTimeout(() => {
      onComplete();
    }, 200);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-[#003870] via-[#005A9C] to-[#002244] text-white transition-opacity duration-500 ease-in-out ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      role="dialog"
      aria-label="ParlourPro POS Launch Screen"
    >
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.15)_0%,transparent_70%)] animate-pulse" />

      {/* Decorative swirling ripple rings */}
      <div className="absolute w-[440px] h-[440px] rounded-full border border-white/10 animate-ping opacity-20 pointer-events-none" />
      <div className="absolute w-[320px] h-[320px] rounded-full border-2 border-amber-300/20 animate-spin opacity-40 pointer-events-none [animation-duration:12s]" />

      {/* Center Branding Card */}
      <div className="relative z-10 flex flex-col items-center max-w-sm px-6 text-center transform transition-transform duration-700 ease-out scale-100 animate-in fade-in zoom-in-95">
        
        {/* ParlourPro Round Emblem */}
        <div className="relative mb-6">
          <div className="absolute -inset-2 bg-gradient-to-r from-sky-400 via-blue-500 to-amber-400 rounded-full blur-md opacity-70 animate-pulse" />
          <div className="relative w-32 h-32 bg-white rounded-full shadow-2xl flex items-center justify-center p-1.5 border-2 border-white/40 transform hover:scale-105 transition-transform duration-300">
            <img
              src={LOGO_ROUND_URL}
              alt="ParlourPro POS — Smart Billing & Inventory"
              className="w-full h-full rounded-full object-contain"
              loading="eager"
            />
          </div>
        </div>

        {/* Tagline & Slogan */}
        <div className="space-y-1 mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-medium text-amber-200 border border-white/15">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Smart Billing &amp; Inventory</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white mt-2">
            ParlourPro POS
          </h1>
          <p className="text-xs text-blue-100/80 max-w-xs">
            Smart Billing, Real-Time Stock Tracking &amp; Parlour Management Portal
          </p>
        </div>

        {/* Loading Progress Bar & Skip Button */}
        <div className="w-full max-w-[200px] flex flex-col items-center gap-3">
          <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden p-0.5 backdrop-blur">
            <div className="h-full bg-gradient-to-r from-amber-300 via-sky-300 to-white rounded-full animate-[progress_2s_ease-in-out_forwards] w-full" />
          </div>

          <button
            onClick={handleSkip}
            type="button"
            className="inline-flex items-center gap-1.5 text-xs text-blue-200 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <span>Skip intro</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>

      {/* Bottom credits */}
      <div className="absolute bottom-6 text-center text-[10px] text-blue-200/60 font-mono tracking-wider">
        PARLOURPRO POS • SMART BILLING &amp; INVENTORY
      </div>
    </div>
  );
};
