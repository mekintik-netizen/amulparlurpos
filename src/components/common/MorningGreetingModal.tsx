/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Professional Morning Greeting Popup (Admin & Shop Counter)
 * Triggers on successful login between 5:00 AM and 11:59 AM.
 * Displays Gujarati business prosperity wishes and auto-dismisses after 6s.
 * Guaranteed to show only ONCE per daily session.
 */

import React, { useState, useEffect } from 'react';
import { Sun, Sparkles, CheckCircle2 } from 'lucide-react';
import amulLogo from '../../assets/logo.ts';

interface MorningGreetingModalProps {
  onDismiss?: () => void;
}

export const MorningGreetingModal: React.FC<MorningGreetingModalProps> = ({ onDismiss }) => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      const now = new Date();
      const currentHour = now.getHours(); // 0-23
      const todayStr = now.toISOString().slice(0, 10);
      const storageKey = `amul_greeting_shown_${todayStr}`;

      // Check time condition: 5:00 AM to 11:59 AM (5 <= hour < 12)
      const isMorning = currentHour >= 5 && currentHour < 12;
      const alreadyShown = sessionStorage.getItem(storageKey);

      if (isMorning && !alreadyShown) {
        setIsOpen(true);
        sessionStorage.setItem(storageKey, 'true');

        // Auto dismiss after 6 seconds
        const timer = setTimeout(() => {
          handleClose();
        }, 6000);

        return () => clearTimeout(timer);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    if (onDismiss) onDismiss();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border-2 border-amber-300 dark:border-amber-500/40 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl text-center relative overflow-hidden transition-all transform scale-100">
        {/* Soft morning ambient aura */}
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-amber-400/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-orange-400/20 rounded-full blur-2xl pointer-events-none" />

        {/* Amul Logo Artwork */}
        <div className="flex justify-center mb-3">
          <div className="bg-white p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
            <img
              src={amulLogo}
              alt="Amul"
              className="h-10 w-auto object-contain"
            />
          </div>
        </div>

        {/* Sun Badge */}
        <div className="w-14 h-14 mx-auto mb-3 bg-gradient-to-tr from-amber-400 to-orange-400 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/30">
          <Sun className="w-8 h-8 animate-pulse" />
        </div>

        {/* Title */}
        <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center justify-center gap-1.5">
          <span>☀️ GOOD MORNING</span>
          <span className="text-amber-500">|</span>
          <span>શુભ પ્રભાત</span>
        </h2>

        {/* Gujarati Business Wishes */}
        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium leading-relaxed my-4 px-2">
          "આપનો આજનો દિવસ શુભ અને સફળ રહે! આપના વેપાર-ધંધામાં ઉત્તરોત્તર પ્રગતિ થાય અને ગ્રાહકો સાથેનો સંબંધ વધુ મજબૂત બને એવી હાર્દિક શુભેચ્છાઓ."
        </p>

        <div className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold mb-5 flex items-center justify-center gap-1">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Amul Preferred Parlour · Fresh & Happy Counter</span>
        </div>

        {/* Start Day Button */}
        <button
          onClick={handleClose}
          className="w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-[#005A9C] to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>શરૂ કરો (Start Day)</span>
        </button>
      </div>
    </div>
  );
};
