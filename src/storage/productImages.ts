/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Authentic Amul Product Presets & Imagery
 * Lightweight, zero-dependency inline SVG data URLs that load instantly offline
 * and provide distinctive visual branding for all major Amul dairy categories.
 */

// Helper to create clean base64 SVG data URLs
const createSvgDataUrl = (svgContent: string): string => {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgContent.trim())}`;
};

export const AMUL_PRODUCT_IMAGE_PRESETS: Record<string, { name: string; category: string; dataUrl: string }> = {
  TAAZA_MILK: {
    name: 'Amul Taaza Milk (Blue)',
    category: 'Milk',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#EBF4FF" rx="24"/>
        <path d="M50 40 L150 40 L160 165 C160 172 154 178 147 178 L53 178 C46 178 40 172 40 165 Z" fill="#007ACC" stroke="#005A9C" stroke-width="4"/>
        <path d="M40 70 Q100 85 160 70 L160 165 C160 172 154 178 147 178 L53 178 C46 178 40 172 40 165 Z" fill="#FFFFFF"/>
        <rect x="58" y="85" width="84" height="26" fill="#E31837" rx="6"/>
        <text x="100" y="103" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="128" font-family="Arial, sans-serif" font-weight="800" font-size="14" fill="#005A9C" text-anchor="middle">TAAZA</text>
        <text x="100" y="146" font-family="Arial, sans-serif" font-weight="600" font-size="10" fill="#4A5568" text-anchor="middle">TONED MILK</text>
        <circle cx="100" cy="55" r="8" fill="#FFFFFF"/>
      </svg>
    `)
  },
  GOLD_MILK: {
    name: 'Amul Gold Full Cream (Red)',
    category: 'Milk',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#FFF5F5" rx="24"/>
        <path d="M50 40 L150 40 L160 165 C160 172 154 178 147 178 L53 178 C46 178 40 172 40 165 Z" fill="#E31837" stroke="#B91C1C" stroke-width="4"/>
        <path d="M40 70 Q100 85 160 70 L160 165 C160 172 154 178 147 178 L53 178 C46 178 40 172 40 165 Z" fill="#FFFFFF"/>
        <rect x="58" y="85" width="84" height="26" fill="#005A9C" rx="6"/>
        <text x="100" y="103" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="128" font-family="Arial, sans-serif" font-weight="800" font-size="14" fill="#E31837" text-anchor="middle">GOLD</text>
        <text x="100" y="146" font-family="Arial, sans-serif" font-weight="600" font-size="10" fill="#4A5568" text-anchor="middle">FULL CREAM MILK</text>
        <circle cx="100" cy="55" r="8" fill="#FBBF24"/>
      </svg>
    `)
  },
  COW_MILK: {
    name: 'Amul Cow Milk (Yellow)',
    category: 'Milk',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#FEFCE8" rx="24"/>
        <path d="M50 40 L150 40 L160 165 C160 172 154 178 147 178 L53 178 C46 178 40 172 40 165 Z" fill="#EAB308" stroke="#CA8A04" stroke-width="4"/>
        <path d="M40 70 Q100 85 160 70 L160 165 C160 172 154 178 147 178 L53 178 C46 178 40 172 40 165 Z" fill="#FFFFFF"/>
        <rect x="58" y="85" width="84" height="26" fill="#E31837" rx="6"/>
        <text x="100" y="103" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="128" font-family="Arial, sans-serif" font-weight="800" font-size="14" fill="#CA8A04" text-anchor="middle">COW MILK</text>
        <text x="100" y="146" font-family="Arial, sans-serif" font-weight="600" font-size="10" fill="#4A5568" text-anchor="middle">FRESH &amp; PURE</text>
      </svg>
    `)
  },
  BUTTER_PACK: {
    name: 'Amul Butter Salted (Yellow)',
    category: 'Butter & Spreads',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#FEF9C3" rx="24"/>
        <rect x="30" y="55" width="140" height="90" fill="#FACC15" rx="10" stroke="#CA8A04" stroke-width="3"/>
        <rect x="36" y="61" width="128" height="78" fill="#FEF08A" rx="7"/>
        <rect x="54" y="68" width="92" height="24" fill="#E31837" rx="5"/>
        <text x="100" y="85" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="110" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="#005A9C" text-anchor="middle">BUTTER</text>
        <text x="100" y="126" font-family="Arial, sans-serif" font-weight="700" font-size="9" fill="#B45309" text-anchor="middle">PASTEURISED · UTTERLY BUTTERLY</text>
      </svg>
    `)
  },
  CHEESE_SLICES: {
    name: 'Amul Cheese Slices (Blue/Gold)',
    category: 'Cheese & Paneer',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#EFF6FF" rx="24"/>
        <rect x="35" y="45" width="130" height="110" fill="#1D4ED8" rx="12" stroke="#1E40AF" stroke-width="3"/>
        <rect x="42" y="52" width="116" height="96" fill="#FFFFFF" rx="8"/>
        <rect x="55" y="60" width="90" height="22" fill="#E31837" rx="5"/>
        <text x="100" y="76" font-family="Arial, sans-serif" font-weight="900" font-size="15" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="100" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="#1D4ED8" text-anchor="middle">CHEESE</text>
        <text x="100" y="116" font-family="Arial, sans-serif" font-weight="700" font-size="11" fill="#F59E0B" text-anchor="middle">10 SLICES</text>
        <rect x="65" y="124" width="70" height="14" fill="#FEF3C7" rx="3" stroke="#F59E0B" stroke-width="1"/>
        <text x="100" y="134" font-family="Arial, sans-serif" font-weight="600" font-size="8" fill="#92400E" text-anchor="middle">RICH IN PROTEIN</text>
      </svg>
    `)
  },
  PANEER_FRESH: {
    name: 'Amul Fresh Malai Paneer',
    category: 'Cheese & Paneer',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#F0FDF4" rx="24"/>
        <rect x="35" y="50" width="130" height="100" fill="#16A34A" rx="10" stroke="#15803D" stroke-width="3"/>
        <rect x="42" y="57" width="116" height="86" fill="#FFFFFF" rx="6"/>
        <rect x="55" y="65" width="90" height="22" fill="#E31837" rx="4"/>
        <text x="100" y="81" font-family="Arial, sans-serif" font-weight="900" font-size="15" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="106" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="#15803D" text-anchor="middle">MALAI PANEER</text>
        <text x="100" y="122" font-family="Arial, sans-serif" font-weight="600" font-size="10" fill="#6B7280" text-anchor="middle">100% REAL MILK</text>
      </svg>
    `)
  },
  AMUL_GHEE: {
    name: 'Amul Pure Ghee (Green/Gold)',
    category: 'Ghee & Dairy Fats',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#FEFCE8" rx="24"/>
        <rect x="55" y="45" width="90" height="20" fill="#CA8A04" rx="6"/>
        <path d="M50 65 L150 65 L155 160 C155 168 148 175 140 175 L60 175 C52 175 45 168 45 160 Z" fill="#FACC15" stroke="#CA8A04" stroke-width="3"/>
        <rect x="52" y="80" width="96" height="80" fill="#FFFFFF" rx="6"/>
        <rect x="60" y="88" width="80" height="22" fill="#E31837" rx="4"/>
        <text x="100" y="104" font-family="Arial, sans-serif" font-weight="900" font-size="15" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="128" font-family="Arial, sans-serif" font-weight="900" font-size="17" fill="#15803D" text-anchor="middle">PURE GHEE</text>
        <text x="100" y="145" font-family="Arial, sans-serif" font-weight="600" font-size="9" fill="#B45309" text-anchor="middle">TRADITIONAL AROMA</text>
      </svg>
    `)
  },
  KOOL_BOTTLE: {
    name: 'Amul Kool Flavoured Milk (Glass/Can)',
    category: 'Beverages & Buttermilk',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#FDF2F8" rx="24"/>
        <rect x="80" y="30" width="40" height="15" fill="#EC4899" rx="4"/>
        <path d="M70 45 L130 45 L135 170 C135 176 130 180 124 180 L76 180 C70 180 65 176 65 170 Z" fill="#F472B6" stroke="#DB2777" stroke-width="3"/>
        <rect x="68" y="70" width="64" height="90" fill="#FFFFFF" rx="4"/>
        <rect x="74" y="78" width="52" height="18" fill="#E31837" rx="3"/>
        <text x="100" y="91" font-family="Arial, sans-serif" font-weight="900" font-size="12" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="115" font-family="Arial, sans-serif" font-weight="900" font-size="15" fill="#DB2777" text-anchor="middle">KOOL</text>
        <text x="100" y="132" font-family="Arial, sans-serif" font-weight="700" font-size="9" fill="#005A9C" text-anchor="middle">ELACHI / KESAR</text>
      </svg>
    `)
  },
  ICE_CREAM_TUB: {
    name: 'Amul Ice Cream (Cone / Tub)',
    category: 'Ice Cream & Frozen',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#FFFBEB" rx="24"/>
        <ellipse cx="100" cy="80" rx="55" ry="35" fill="#F43F5E"/>
        <ellipse cx="100" cy="65" rx="40" ry="25" fill="#FDA4AF"/>
        <path d="M50 85 L150 85 L140 170 C140 176 134 180 127 180 L73 180 C66 180 60 176 60 170 Z" fill="#D97706" stroke="#B45309" stroke-width="3"/>
        <rect x="65" y="105" width="70" height="50" fill="#FFFFFF" rx="4"/>
        <rect x="70" y="112" width="60" height="16" fill="#E31837" rx="3"/>
        <text x="100" y="124" font-family="Arial, sans-serif" font-weight="900" font-size="11" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="142" font-family="Arial, sans-serif" font-weight="800" font-size="11" fill="#B45309" text-anchor="middle">REAL ICE CREAM</text>
      </svg>
    `)
  },
  CHOCOLATE_BAR: {
    name: 'Amul Dark Chocolate (Rich Cocoa)',
    category: 'Chocolates & Sweets',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#F5F3FF" rx="24"/>
        <rect x="40" y="45" width="120" height="110" fill="#3B1F11" rx="8" stroke="#1F1008" stroke-width="3"/>
        <rect x="45" y="50" width="110" height="30" fill="#592C18" rx="4"/>
        <rect x="58" y="55" width="84" height="20" fill="#E31837" rx="4"/>
        <text x="100" y="70" font-family="Arial, sans-serif" font-weight="900" font-size="14" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="105" font-family="Arial, sans-serif" font-weight="800" font-size="13" fill="#E2E8F0" text-anchor="middle">DARK CHOCOLATE</text>
        <text x="100" y="125" font-family="Arial, sans-serif" font-weight="700" font-size="10" fill="#FBBF24" text-anchor="middle">55% RICH COCOA</text>
      </svg>
    `)
  }
};

// Return a matching preset image dataUrl based on product category or name
export const getAmulProductPresetImage = (productName: string, category: string): string => {
  const lowerName = productName.toLowerCase();
  
  if (lowerName.includes('taaza')) return AMUL_PRODUCT_IMAGE_PRESETS.TAAZA_MILK.dataUrl;
  if (lowerName.includes('gold')) return AMUL_PRODUCT_IMAGE_PRESETS.GOLD_MILK.dataUrl;
  if (lowerName.includes('cow')) return AMUL_PRODUCT_IMAGE_PRESETS.COW_MILK.dataUrl;
  if ((lowerName.includes('butter') && !lowerName.includes('buttermilk')) || category === 'Butter & Spreads') return AMUL_PRODUCT_IMAGE_PRESETS.BUTTER_PACK.dataUrl;
  if (lowerName.includes('slice') || lowerName.includes('cheese')) return AMUL_PRODUCT_IMAGE_PRESETS.CHEESE_SLICES.dataUrl;
  if (lowerName.includes('paneer')) return AMUL_PRODUCT_IMAGE_PRESETS.PANEER_FRESH.dataUrl;
  if (lowerName.includes('ghee') || category.includes('Ghee')) return AMUL_PRODUCT_IMAGE_PRESETS.AMUL_GHEE.dataUrl;
  if (lowerName.includes('kool') || category.includes('Beverage')) return AMUL_PRODUCT_IMAGE_PRESETS.KOOL_BOTTLE.dataUrl;
  if (lowerName.includes('ice cream') || category.includes('Ice Cream')) return AMUL_PRODUCT_IMAGE_PRESETS.ICE_CREAM_TUB.dataUrl;
  if (lowerName.includes('choco') || category.includes('Chocolate')) return AMUL_PRODUCT_IMAGE_PRESETS.CHOCOLATE_BAR.dataUrl;

  // Category fallbacks
  switch (category) {
    case 'Milk': return AMUL_PRODUCT_IMAGE_PRESETS.TAAZA_MILK.dataUrl;
    case 'Butter & Spreads': return AMUL_PRODUCT_IMAGE_PRESETS.BUTTER_PACK.dataUrl;
    case 'Cheese & Paneer': return AMUL_PRODUCT_IMAGE_PRESETS.CHEESE_SLICES.dataUrl;
    case 'Ghee & Dairy Fats': return AMUL_PRODUCT_IMAGE_PRESETS.AMUL_GHEE.dataUrl;
    case 'Beverages & Buttermilk': return AMUL_PRODUCT_IMAGE_PRESETS.KOOL_BOTTLE.dataUrl;
    case 'Ice Cream & Frozen': return AMUL_PRODUCT_IMAGE_PRESETS.ICE_CREAM_TUB.dataUrl;
    case 'Chocolates & Sweets': return AMUL_PRODUCT_IMAGE_PRESETS.CHOCOLATE_BAR.dataUrl;
    default: return AMUL_PRODUCT_IMAGE_PRESETS.TAAZA_MILK.dataUrl;
  }
};
