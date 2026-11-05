/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Unit tests for:
 * 1. Professional Subscription Expiry Popup (Gujarati & ₹500 Payment)
 * 2. Dynamic UPI QR Code URL generation & manual copy details
 * 3. WhatsApp Payment Link with pre-filled Gujarati confirmation message
 * 4. Admin HQ Subscription Demo Preview & Settings Customizer
 * 5. Automatic restoration when expiry date is extended by Admin
 */

import { describe, it, expect } from 'vitest';
import { 
  DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG, 
  SubscriptionSettingsConfig, 
  Shop 
} from '../src/types/index.ts';
import { 
  getUpiQrCodeUrl, 
  getWhatsAppPaymentLink,
  getCachedSubscriptionSettings
} from '../src/storage/subscriptionSettings.ts';
import { 
  isShopSubscriptionActive, 
  renewShopSubscription,
  isNewShop
} from '../src/storage/subscription.ts';

describe('1. Professional Subscription Expiry Popup (Gujarati & ₹500 Payment)', () => {
  it('has official default header title in Gujarati & English', () => {
    expect(DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG.headerTitle).toBe(
      '⚠️ સબ્સ્ક્રિપ્શન સમાપ્ત થઈ ગયું છે (Subscription Expired)'
    );
  });

  it('contains the exact requested Gujarati expiry message with ₹500', () => {
    const msg = DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG.messageGujarati;
    expect(msg).toContain('તમારો ૧ મહિનાનો સબ્સ્ક્રિપ્શન સમય પૂરો થઈ ગયો છે');
    expect(msg).toContain('₹૫૦૦ (₹500)');
    expect(msg).toContain('સબ્સ્ક્રિપ્શન રિન્યુ કરાવો');
  });

  it('defaults renewal fee to ₹500/month', () => {
    expect(DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG.monthlyFee).toBe(500);
    expect(DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG.currencySymbol).toBe('₹');
  });

  it('includes 10-day advance renewal warning threshold and Gujarati text', () => {
    expect(DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG.warningDaysThreshold).toBe(10);
    expect(DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG.warningHeaderTitle).toContain('સબ્સ્ક્રિપ્શન રિન્યુઅલ ચેતવણી');
    expect(DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG.warningMessageGujarati).toContain('₹૫૦૦ (₹500)');
  });
});

describe('2. Dynamic UPI QR Code URL Generation', () => {
  const sampleShop: Shop = {
    id: 'shop-test-101',
    shopCode: 'AP-2026-1001',
    name: 'Amul Preferred Outlet - Anand',
    ownerName: 'Rajesh Patel',
    phone: '+91 98980 12345',
    email: 'anand@amul.in',
    address: 'Dairy Circle, Anand',
    city: 'Anand',
    state: 'Gujarat',
    pincode: '388001',
    approvalStatus: 'APPROVED',
    subscriptionPlanId: 'BASIC',
    subscriptionStatus: 'EXPIRED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  it('generates standard UPI QR URL encoding ₹500 and UPI ID', () => {
    const config: SubscriptionSettingsConfig = {
      ...DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG,
      upiId: 'amulparlour.admin@okhdfcbank',
      payeeName: 'Amul HQ Admin',
      monthlyFee: 500
    };

    const qrUrl = getUpiQrCodeUrl(config, 500, sampleShop);

    expect(qrUrl).toContain('api.qrserver.com');
    // Decode the URL param data
    const decoded = decodeURIComponent(qrUrl);
    expect(decoded).toContain('upi://pay?pa=amulparlour.admin@okhdfcbank');
    expect(decodeURIComponent(decoded)).toContain('pn=Amul HQ Admin');
    expect(decoded).toContain('am=500.00');
    expect(decoded).toContain('cu=INR');
  });

  it('uses custom uploaded QR image URL if provided by admin', () => {
    const config: SubscriptionSettingsConfig = {
      ...DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG,
      upiQrImageUrl: 'https://example.com/custom-admin-qr.png'
    };

    const qrUrl = getUpiQrCodeUrl(config, 500, sampleShop);
    expect(qrUrl).toBe('https://example.com/custom-admin-qr.png');
  });
});

describe('3. WhatsApp Payment Link Generation', () => {
  const sampleShop: Shop = {
    id: 'shop-test-102',
    shopCode: 'AP-2026-2002',
    name: 'Amul Parlour Gandhinagar',
    ownerName: 'Pravin Shah',
    phone: '+91 98980 54321',
    email: 'gandhinagar@amul.in',
    address: 'Sector 16, Gandhinagar',
    city: 'Gandhinagar',
    state: 'Gujarat',
    pincode: '382016',
    approvalStatus: 'APPROVED',
    subscriptionPlanId: 'BASIC',
    subscriptionStatus: 'EXPIRED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  it('builds direct wa.me link with sanitized phone number and pre-filled payment details', () => {
    const config: SubscriptionSettingsConfig = {
      ...DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG,
      whatsappNumber: '+91 91735 98234',
      monthlyFee: 500
    };

    const waLink = getWhatsAppPaymentLink(config, sampleShop);

    expect(waLink).toContain('https://wa.me/919173598234?text=');
    const decodedText = decodeURIComponent(waLink);
    expect(decodedText).toContain('Amul Parlour Gandhinagar');
    expect(decodedText).toContain('AP-2026-2002');
    expect(decodedText).toContain('₹500');
    expect(decodedText).toContain('સબ્સ્ક્રિપ્શન રિન્યુઅલ પેમેન્ટ');
  });

  it('sanitizes WhatsApp phone number removing spaces and hyphens', () => {
    const config: SubscriptionSettingsConfig = {
      ...DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG,
      whatsappNumber: '+91-98989-12345'
    };

    const waLink = getWhatsAppPaymentLink(config, sampleShop);
    expect(waLink).toContain('https://wa.me/919898912345');
  });
});

describe('4. Automatic Restoration When Admin Updates Expiry Date', () => {
  it('automatically marks shop active and clears expired block when admin advances expiry date', () => {
    const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const expiredShop: Shop = {
      id: 'shop-test-103',
      shopCode: 'AP-2026-3003',
      name: 'Amul Milk Hub Baroda',
      ownerName: 'Kishore Joshi',
      phone: '+91 98250 99887',
      email: 'baroda@amul.in',
      address: 'Alkapuri, Vadodara',
      city: 'Vadodara',
      state: 'Gujarat',
      pincode: '390007',
      approvalStatus: 'APPROVED',
      subscriptionPlanId: 'BASIC',
      subscriptionStatus: 'EXPIRED',
      subscriptionStartDate: new Date(Date.now() - 33 * 24 * 60 * 60 * 1000).toISOString(),
      subscriptionExpiryDate: pastDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Initially expired
    const initialCheck = isShopSubscriptionActive(expiredShop);
    expect(initialCheck.isActive).toBe(false);
    expect(initialCheck.isExpired).toBe(true);

    // Admin renews shop subscription by 30 days
    const renewedShop = renewShopSubscription(expiredShop, 30, 'Master Admin');

    // After renewal, subscription is active, expiry is in the future
    const renewedCheck = isShopSubscriptionActive(renewedShop);
    expect(renewedCheck.isActive).toBe(true);
    expect(renewedCheck.isExpired).toBe(false);
    expect(renewedCheck.daysRemaining).toBeGreaterThanOrEqual(29);
  });
});

describe('5. Pricing Structure for New Shops vs Existing Shops', () => {
  const newShop: Shop = {
    id: 'shop-trial-001',
    shopCode: 'AP-NEW-101',
    name: 'Shree Amul Parlour - Palanpur',
    ownerName: 'Jayesh Prajapati',
    phone: '+91 98251 11223',
    email: 'palanpur@amul.in',
    address: 'Highway Circle, Palanpur',
    city: 'Palanpur',
    state: 'Gujarat',
    pincode: '385001',
    approvalStatus: 'APPROVED',
    subscriptionPlanId: 'TRIAL',
    subscriptionStatus: 'ACTIVE',
    isFirstMonth: true,
    renewalCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const existingShop: Shop = {
    id: 'shop-regular-002',
    shopCode: 'AP-REG-202',
    name: 'Amul Depot - Surat',
    ownerName: 'Manish Varma',
    phone: '+91 98980 99887',
    email: 'surat@amul.in',
    address: 'Ring Road, Surat',
    city: 'Surat',
    state: 'Gujarat',
    pincode: '395002',
    approvalStatus: 'APPROVED',
    subscriptionPlanId: 'BASIC',
    subscriptionStatus: 'ACTIVE',
    isFirstMonth: false,
    renewalCount: 3,
    createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString()
  };

  it('correctly identifies new shops vs existing shops', () => {
    expect(isNewShop(newShop)).toBe(true);
    expect(isNewShop(existingShop)).toBe(false);
  });

  it('provides exact Gujarati message for New Shops (Setup ₹2500 + Sub ₹500 = ₹3000)', () => {
    const msg = DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG.newShopMessageGujarati;
    expect(msg).toBeDefined();
    expect(msg).toContain('૧ મહિનાનું ફ્રી ટ્રાયલ પૂરું થયું છે');
    expect(msg).toContain('સેટઅપ ચાર્જ ₹૨૫૦૦');
    expect(msg).toContain('સબ્સ્ક્રિપ્શન ચાર્જ ₹૫૦૦');
    expect(msg).toContain('પહેલા મહિને કુલ ₹૩૦૦૦');
    expect(msg).toContain('ત્યારપછીના મહિનાથી દર મહિને માત્ર ₹૫૦૦');
  });

  it('generates ₹3000 UPI QR code and WhatsApp confirmation for New Shops', () => {
    const config = DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG;
    const qrUrl = getUpiQrCodeUrl(config, 3000, newShop, true);
    expect(decodeURIComponent(qrUrl)).toContain('am=3000.00');

    const waLink = getWhatsAppPaymentLink(config, newShop, 3000, true);
    const decodedWa = decodeURIComponent(waLink);
    expect(decodedWa).toContain('સેટઅપ ચાર્જ ₹૨૫૦૦');
    expect(decodedWa).toContain('સબ્સ્ક્રિપ્શન ચાર્જ ₹૫૦૦');
    expect(decodedWa).toContain('₹૩,૦૦૦');
  });

  it('generates ₹500 UPI QR code and WhatsApp confirmation for Existing Shops', () => {
    const config = DEFAULT_SUBSCRIPTION_SETTINGS_CONFIG;
    const qrUrl = getUpiQrCodeUrl(config, 500, existingShop, false);
    expect(decodeURIComponent(qrUrl)).toContain('am=500.00');

    const waLink = getWhatsAppPaymentLink(config, existingShop, 500, false);
    const decodedWa = decodeURIComponent(waLink);
    expect(decodedWa).toContain('₹500');
    expect(decodedWa).toContain('સબ્સ્ક્રિપ્શન રિન્યુઅલ પેમેન્ટ');
  });

  it('transitions New Shop to Existing Shop upon admin subscription renewal', () => {
    const renewed = renewShopSubscription(newShop, 30, 'Master Admin');
    expect(renewed.isFirstMonth).toBe(false);
    expect(renewed.renewalCount).toBe(1);
    expect(renewed.subscriptionPlanId).toBe('BASIC');
  });
});

