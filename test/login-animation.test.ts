/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Unit tests for:
 * 1. Amul Brand Logo Motion & Dairy Ripple Animation
 * 2. Startup Splash Screen rendering and accessibility
 * 3. Login & OTP Screen animated branding integration
 * 4. Seamless Transition into Dashboard on Successful Login
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { 
  AmulBrandLogoMotion, 
  AmulStartupSplash, 
  AmulLoginSuccessTransition 
} from '../src/components/common/AmulBrandMotion.tsx';

describe('1. AmulBrandLogoMotion Component', () => {
  it('renders with breathing animation and dairy ripple elements when isPulsing is true', () => {
    const html = renderToString(
      React.createElement(AmulBrandLogoMotion, {
        size: 'lg',
        isPulsing: true,
        showTagline: true
      })
    );

    expect(html).toContain('amul-motion-breathe');
    expect(html).toContain('amul-motion-ripple-1');
    expect(html).toContain('amul-motion-ripple-2');
    expect(html).toContain('Amul Preferred Parlour');
    expect(html).toContain('The Taste of India');
  });

  it('supports non-pulsing static mode for print/static contexts', () => {
    const html = renderToString(
      React.createElement(AmulBrandLogoMotion, {
        size: 'sm',
        isPulsing: false,
        showTagline: false
      })
    );

    // When isPulsing is false, the ripple divs and blur auras are not rendered
    expect(html).not.toContain('border-2 border-[#E31837]/25');
    expect(html).not.toContain('blur-xl');
    expect(html).toContain('alt="Amul - The Taste of India"');
  });

  it('renders regional Gujarati branding text when showRegionalText is true', () => {
    const html = renderToString(
      React.createElement(AmulBrandLogoMotion, {
        size: 'md',
        showRegionalText: true
      })
    );

    expect(html).toContain('આણંદ ડેરી પ્રોડક્ટ્સ - ડિજિટલ કાઉન્ટર POS');
  });
});

describe('2. AmulStartupSplash Component', () => {
  it('renders startup splash with welcoming status text and Amul branding', () => {
    const html = renderToString(
      React.createElement(AmulStartupSplash, {
        statusText: 'Opening Amul Parlour POS...',
        subText: 'સત્તાવાર અમૂલ પ્રોડક્ટ કેટાલોગ અને કાઉન્ટર શરૂ થઈ રહ્યું છે'
      })
    );

    expect(html).toContain('Opening Amul Parlour POS...');
    expect(html).toContain('સત્તાવાર અમૂલ પ્રોડક્ટ કેટાલોગ');
    expect(html).toContain('amul-motion-breathe');
    expect(html).toContain('GCMMF · Anand Depot Cloud Sync');
  });
});

describe('3. AmulLoginSuccessTransition Component', () => {
  it('renders celebratory transition card with cashier and shop details', () => {
    const html = renderToString(
      React.createElement(AmulLoginSuccessTransition, {
        userName: 'Rajesh Patel (Cashier)',
        shopName: 'Amul Preferred Outlet - Anand (AP-2026-1001)'
      })
    );

    expect(html).toContain('પ્રવેશ સફળ રહ્યો! (Signed In)');
    expect(html).toContain('Rajesh Patel (Cashier)');
    expect(html).toContain('AP-2026-1001');
    expect(html).toContain('Loading POS Terminal');
  });
});
