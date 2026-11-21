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
    expect(html).toContain('ParlourPro POS');
    expect(html).toContain('Smart Billing &amp; Inventory');
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
    expect(html).not.toContain('border-2 border-[#005A9C]/25');
    expect(html).not.toContain('blur-xl');
    expect(html).toContain('alt="ParlourPro POS — Smart Billing &amp; Inventory"');
  });

  it('renders regional Gujarati branding text when showRegionalText is true', () => {
    const html = renderToString(
      React.createElement(AmulBrandLogoMotion, {
        size: 'md',
        showRegionalText: true
      })
    );

    expect(html).toContain('પાર્લરપ્રો POS - સ્માર્ટ બિલિંગ અને ઇન્વેન્ટરી');
  });
});

describe('2. AmulStartupSplash Component', () => {
  it('renders startup splash with welcoming status text and ParlourPro POS branding', () => {
    const html = renderToString(
      React.createElement(AmulStartupSplash, {
        statusText: 'Opening ParlourPro POS...',
        subText: 'સ્માર્ટ બિલિંગ અને ઇન્વેન્ટરી કાઉન્ટર શરૂ થઈ રહ્યું છે'
      })
    );

    expect(html).toContain('Opening ParlourPro POS...');
    expect(html).toContain('સ્માર્ટ બિલિંગ અને ઇન્વેન્ટરી');
    expect(html).toContain('amul-motion-breathe');
    expect(html).toContain('ParlourPro POS · Smart Billing &amp; Inventory');
  });
});

describe('3. AmulLoginSuccessTransition Component', () => {
  it('renders celebratory transition card with cashier and shop details', () => {
    const html = renderToString(
      React.createElement(AmulLoginSuccessTransition, {
        userName: 'Rajesh Patel (Cashier)',
        shopName: 'ParlourPro Main Outlet (AP-2026-1001)'
      })
    );

    expect(html).toContain('પ્રવેશ સફળ રહ્યો! (Signed In)');
    expect(html).toContain('Rajesh Patel (Cashier)');
    expect(html).toContain('AP-2026-1001');
    expect(html).toContain('Loading POS Terminal');
  });
});

describe('4. LoginPage Glassmorphism & ParlourPro Banner Branding', () => {
  it('renders full-screen blurred logo background, horizontal logo-banner.png, and frosted glass login card', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const loginSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/auth/LoginPage.tsx'), 'utf8');

    expect(loginSource).toContain('LOGO_BANNER_URL');
    expect(loginSource).toContain('max-h-24');
    expect(loginSource).toContain('fixed inset-0 w-full h-full object-cover');
    expect(loginSource).toContain('blur-sm opacity-20');
    expect(loginSource).toContain('backdrop-blur-md');
    expect(loginSource).toContain('bg-white/85');
    expect(loginSource).toContain('backdrop-blur-xl');
    expect(loginSource).toContain('border-white/60');
    expect(loginSource).toContain('rounded-3xl');
  });
});
