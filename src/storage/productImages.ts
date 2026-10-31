/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Authentic Amul Product Packaging Imagery & Presets
 * High-definition, zero-dependency inline SVG data URLs that load instantaneously offline
 * and provide distinctive visual packaging representation for all 65+ official GCMMF Amul SKUs.
 */

const createSvgDataUrl = (svgContent: string): string => {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgContent.trim())}`;
};

export const AMUL_PRODUCT_IMAGE_PRESETS: Record<string, { name: string; category: string; dataUrl: string }> = {
  // 1. FRESH MILK POUCHES
  TAAZA_MILK: {
    name: 'Amul Taaza Toned Milk (Blue Pouch)',
    category: 'Milk',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#EBF4FF" rx="20"/>
        <path d="M45 35 L155 35 L162 165 C162 174 154 180 146 180 L54 180 C46 180 38 174 38 165 Z" fill="#0284C7" stroke="#0369A1" stroke-width="3"/>
        <path d="M38 65 Q100 80 162 65 L162 165 C162 174 154 180 146 180 L54 180 C46 180 38 174 38 165 Z" fill="#FFFFFF"/>
        <rect x="58" y="78" width="84" height="26" fill="#DC2626" rx="6"/>
        <text x="100" y="96" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="122" font-family="Arial, sans-serif" font-weight="800" font-size="16" fill="#0369A1" text-anchor="middle">TAAZA</text>
        <text x="100" y="140" font-family="Arial, sans-serif" font-weight="600" font-size="10" fill="#475569" text-anchor="middle">HOMOGENISED TONED MILK</text>
        <circle cx="100" cy="50" r="7" fill="#BAE6FD"/>
      </svg>
    `)
  },
  GOLD_MILK: {
    name: 'Amul Gold Full Cream Milk (Red Pouch)',
    category: 'Milk',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#FEF2F2" rx="20"/>
        <path d="M45 35 L155 35 L162 165 C162 174 154 180 146 180 L54 180 C46 180 38 174 38 165 Z" fill="#DC2626" stroke="#991B1B" stroke-width="3"/>
        <path d="M38 65 Q100 80 162 65 L162 165 C162 174 154 180 146 180 L54 180 C46 180 38 174 38 165 Z" fill="#FFFFFF"/>
        <rect x="58" y="78" width="84" height="26" fill="#1E3A8A" rx="6"/>
        <text x="100" y="96" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="122" font-family="Arial, sans-serif" font-weight="900" font-size="17" fill="#DC2626" text-anchor="middle">GOLD</text>
        <text x="100" y="140" font-family="Arial, sans-serif" font-weight="700" font-size="9" fill="#B91C1C" text-anchor="middle">PASTEURISED FULL CREAM MILK</text>
        <circle cx="100" cy="50" r="7" fill="#FDE047"/>
      </svg>
    `)
  },
  COW_MILK: {
    name: 'Amul Cow Milk (Yellow/Green Pouch)',
    category: 'Milk',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#FEFCE8" rx="20"/>
        <path d="M45 35 L155 35 L162 165 C162 174 154 180 146 180 L54 180 C46 180 38 174 38 165 Z" fill="#EAB308" stroke="#A16207" stroke-width="3"/>
        <path d="M38 65 Q100 80 162 65 L162 165 C162 174 154 180 146 180 L54 180 C46 180 38 174 38 165 Z" fill="#FFFFFF"/>
        <rect x="58" y="78" width="84" height="26" fill="#DC2626" rx="6"/>
        <text x="100" y="96" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="122" font-family="Arial, sans-serif" font-weight="800" font-size="15" fill="#A16207" text-anchor="middle">COW MILK</text>
        <text x="100" y="140" font-family="Arial, sans-serif" font-weight="600" font-size="9" fill="#15803D" text-anchor="middle">NATURAL &amp; EASILY DIGESTIBLE</text>
        <circle cx="100" cy="50" r="7" fill="#86EFAC"/>
      </svg>
    `)
  },
  SHAKTI_MILK: {
    name: 'Amul Shakti Standardized Milk (Green Pouch)',
    category: 'Milk',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#F0FDF4" rx="20"/>
        <path d="M45 35 L155 35 L162 165 C162 174 154 180 146 180 L54 180 C46 180 38 174 38 165 Z" fill="#16A34A" stroke="#15803D" stroke-width="3"/>
        <path d="M38 65 Q100 80 162 65 L162 165 C162 174 154 180 146 180 L54 180 C46 180 38 174 38 165 Z" fill="#FFFFFF"/>
        <rect x="58" y="78" width="84" height="26" fill="#DC2626" rx="6"/>
        <text x="100" y="96" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="122" font-family="Arial, sans-serif" font-weight="800" font-size="15" fill="#15803D" text-anchor="middle">SHAKTI</text>
        <text x="100" y="140" font-family="Arial, sans-serif" font-weight="600" font-size="9" fill="#475569" text-anchor="middle">STANDARDIZED MILK</text>
      </svg>
    `)
  },
  BUFFALO_MILK: {
    name: 'Amul Buffalo Milk (A2 Dark Navy Pouch)',
    category: 'Milk',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#F1F5F9" rx="20"/>
        <path d="M45 35 L155 35 L162 165 C162 174 154 180 146 180 L54 180 C46 180 38 174 38 165 Z" fill="#0F172A" stroke="#334155" stroke-width="3"/>
        <path d="M38 65 Q100 80 162 65 L162 165 C162 174 154 180 146 180 L54 180 C46 180 38 174 38 165 Z" fill="#FFFFFF"/>
        <rect x="58" y="78" width="84" height="26" fill="#DC2626" rx="6"/>
        <text x="100" y="96" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="122" font-family="Arial, sans-serif" font-weight="800" font-size="14" fill="#0F172A" text-anchor="middle">BUFFALO MILK</text>
        <text x="100" y="140" font-family="Arial, sans-serif" font-weight="700" font-size="9" fill="#D97706" text-anchor="middle">6.5% FAT · 9.0% SNF</text>
      </svg>
    `)
  },

  // 2. BUTTER & SPREADS
  BUTTER_PACK: {
    name: 'Amul Butter Salted (Yellow Carton)',
    category: 'Butter & Spreads',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#FEF9C3" rx="20"/>
        <rect x="28" y="50" width="144" height="100" fill="#FACC15" rx="10" stroke="#CA8A04" stroke-width="3"/>
        <rect x="34" y="56" width="132" height="88" fill="#FEF08A" rx="8"/>
        <rect x="52" y="64" width="96" height="26" fill="#DC2626" rx="6"/>
        <text x="100" y="82" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="112" font-family="Arial, sans-serif" font-weight="900" font-size="20" fill="#1E3A8A" text-anchor="middle">BUTTER</text>
        <text x="100" y="130" font-family="Arial, sans-serif" font-weight="700" font-size="8" fill="#B45309" text-anchor="middle">PASTEURISED · UTTERLY BUTTERLY DELICIOUS</text>
      </svg>
    `)
  },
  GARLIC_BUTTER: {
    name: 'Amul Garlic & Herbs Butter (Green Carton)',
    category: 'Butter & Spreads',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#F0FDF4" rx="20"/>
        <rect x="28" y="50" width="144" height="100" fill="#16A34A" rx="10" stroke="#15803D" stroke-width="3"/>
        <rect x="34" y="56" width="132" height="88" fill="#DCFCE7" rx="8"/>
        <rect x="52" y="64" width="96" height="26" fill="#DC2626" rx="6"/>
        <text x="100" y="82" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="110" font-family="Arial, sans-serif" font-weight="900" font-size="15" fill="#15803D" text-anchor="middle">GARLIC &amp; HERBS</text>
        <text x="100" y="128" font-family="Arial, sans-serif" font-weight="700" font-size="9" fill="#166534" text-anchor="middle">BUTTER SPREAD</text>
      </svg>
    `)
  },

  // 3. CHEESE & PANEER
  CHEESE_SLICES: {
    name: 'Amul Cheese Slices (Blue/Gold)',
    category: 'Cheese & Paneer',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#EFF6FF" rx="20"/>
        <rect x="32" y="42" width="136" height="116" fill="#1D4ED8" rx="12" stroke="#1E40AF" stroke-width="3"/>
        <rect x="40" y="50" width="120" height="100" fill="#FFFFFF" rx="8"/>
        <rect x="54" y="58" width="92" height="24" fill="#DC2626" rx="5"/>
        <text x="100" y="75" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="102" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="#1D4ED8" text-anchor="middle">CHEESE</text>
        <text x="100" y="120" font-family="Arial, sans-serif" font-weight="700" font-size="12" fill="#F59E0B" text-anchor="middle">SLICES</text>
        <text x="100" y="138" font-family="Arial, sans-serif" font-weight="600" font-size="8" fill="#64748B" text-anchor="middle">RICH IN CALCIUM &amp; PROTEIN</text>
      </svg>
    `)
  },
  CHEESE_BLOCK: {
    name: 'Amul Processed Cheese Block / Cubes',
    category: 'Cheese & Paneer',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#FEFCE8" rx="20"/>
        <rect x="30" y="48" width="140" height="104" fill="#CA8A04" rx="10" stroke="#854D0E" stroke-width="3"/>
        <rect x="36" y="54" width="128" height="92" fill="#FEF08A" rx="6"/>
        <rect x="52" y="62" width="96" height="24" fill="#DC2626" rx="5"/>
        <text x="100" y="79" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="106" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="#854D0E" text-anchor="middle">CHEESE BLOCK</text>
        <text x="100" y="126" font-family="Arial, sans-serif" font-weight="700" font-size="10" fill="#B45309" text-anchor="middle">100% COW &amp; BUFFALO MILK</text>
      </svg>
    `)
  },
  CHEESE_MOZZARELLA: {
    name: 'Amul Mozzarella Pizza Cheese (Diced)',
    category: 'Cheese & Paneer',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#FFF1F2" rx="20"/>
        <rect x="32" y="44" width="136" height="112" fill="#BE123C" rx="10" stroke="#881337" stroke-width="3"/>
        <rect x="38" y="50" width="124" height="100" fill="#FFFFFF" rx="7"/>
        <rect x="52" y="58" width="96" height="24" fill="#DC2626" rx="5"/>
        <text x="100" y="75" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="104" font-family="Arial, sans-serif" font-weight="900" font-size="15" fill="#BE123C" text-anchor="middle">PIZZA CHEESE</text>
        <text x="100" y="122" font-family="Arial, sans-serif" font-weight="700" font-size="10" fill="#15803D" text-anchor="middle">MOZZARELLA &amp; CHEDDAR</text>
        <text x="100" y="138" font-family="Arial, sans-serif" font-weight="600" font-size="8" fill="#64748B" text-anchor="middle">PERFECT STRETCH</text>
      </svg>
    `)
  },
  PANEER_FRESH: {
    name: 'Amul Fresh Malai Paneer (Green Pack)',
    category: 'Cheese & Paneer',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#F0FDF4" rx="20"/>
        <rect x="30" y="45" width="140" height="110" fill="#16A34A" rx="12" stroke="#15803D" stroke-width="3"/>
        <rect x="38" y="53" width="124" height="94" fill="#FFFFFF" rx="8"/>
        <rect x="54" y="62" width="92" height="24" fill="#DC2626" rx="5"/>
        <text x="100" y="79" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="106" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="#15803D" text-anchor="middle">MALAI PANEER</text>
        <text x="100" y="124" font-family="Arial, sans-serif" font-weight="700" font-size="10" fill="#047857" text-anchor="middle">SOFT &amp; JUICY · 100% REAL MILK</text>
      </svg>
    `)
  },

  // 4. GHEE & DAIRY FATS
  AMUL_GHEE_POUCH: {
    name: 'Amul Pure Ghee (1L Pouch / Refill)',
    category: 'Ghee & Dairy Fats',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#FEFCE8" rx="20"/>
        <path d="M45 35 L155 35 L162 165 C162 174 154 180 146 180 L54 180 C46 180 38 174 38 165 Z" fill="#FACC15" stroke="#CA8A04" stroke-width="3"/>
        <path d="M38 65 Q100 80 162 65 L162 165 C162 174 154 180 146 180 L54 180 C46 180 38 174 38 165 Z" fill="#FFFFFF"/>
        <rect x="58" y="78" width="84" height="26" fill="#DC2626" rx="6"/>
        <text x="100" y="96" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="122" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="#15803D" text-anchor="middle">PURE GHEE</text>
        <text x="100" y="140" font-family="Arial, sans-serif" font-weight="700" font-size="9" fill="#CA8A04" text-anchor="middle">GRANULAR TEXTURE &amp; AROMA</text>
      </svg>
    `)
  },
  AMUL_GHEE_TIN: {
    name: 'Amul Pure Ghee (1L Premium Tin / Jar)',
    category: 'Ghee & Dairy Fats',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#FEF9C3" rx="20"/>
        <rect x="50" y="30" width="100" height="18" fill="#15803D" rx="4"/>
        <rect x="42" y="46" width="116" height="124" fill="#FACC15" rx="10" stroke="#CA8A04" stroke-width="3"/>
        <rect x="48" y="60" width="104" height="98" fill="#FFFFFF" rx="6"/>
        <rect x="56" y="68" width="88" height="24" fill="#DC2626" rx="5"/>
        <text x="100" y="85" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="112" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="#15803D" text-anchor="middle">PURE GHEE</text>
        <text x="100" y="132" font-family="Arial, sans-serif" font-weight="700" font-size="9" fill="#A16207" text-anchor="middle">SPECIAL GRADE TIN</text>
      </svg>
    `)
  },

  // 5. CURD & YOGURT
  MASTI_DAHI: {
    name: 'Amul Masti Dahi (Tub / Pouch)',
    category: 'Curd & Yogurt',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#ECFDF5" rx="20"/>
        <ellipse cx="100" cy="50" rx="65" ry="16" fill="#047857" stroke="#065F46" stroke-width="2"/>
        <path d="M38 52 L162 52 L150 165 C150 172 142 178 134 178 L66 178 C58 178 50 172 50 165 Z" fill="#10B981" stroke="#059669" stroke-width="3"/>
        <rect x="52" y="70" width="96" height="88" fill="#FFFFFF" rx="6"/>
        <rect x="58" y="78" width="84" height="24" fill="#DC2626" rx="5"/>
        <text x="100" y="95" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="122" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="#047857" text-anchor="middle">MASTI DAHI</text>
        <text x="100" y="140" font-family="Arial, sans-serif" font-weight="700" font-size="9" fill="#059669" text-anchor="middle">THICK &amp; CREAMY CURD</text>
      </svg>
    `)
  },

  // 6. BEVERAGES & BUTTERMILK
  CHHAAS_POUCH: {
    name: 'Amul Masti Buttermilk / Chhaas Pouch',
    category: 'Beverages & Buttermilk',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#F0FDF4" rx="20"/>
        <path d="M45 35 L155 35 L162 165 C162 174 154 180 146 180 L54 180 C46 180 38 174 38 165 Z" fill="#059669" stroke="#047857" stroke-width="3"/>
        <path d="M38 65 Q100 80 162 65 L162 165 C162 174 154 180 146 180 L54 180 C46 180 38 174 38 165 Z" fill="#FFFFFF"/>
        <rect x="58" y="78" width="84" height="26" fill="#DC2626" rx="6"/>
        <text x="100" y="96" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="122" font-family="Arial, sans-serif" font-weight="900" font-size="15" fill="#047857" text-anchor="middle">MASTI CHHAAS</text>
        <text x="100" y="140" font-family="Arial, sans-serif" font-weight="600" font-size="9" fill="#15803D" text-anchor="middle">SPICED BUTTERMILK</text>
      </svg>
    `)
  },
  KOOL_BOTTLE: {
    name: 'Amul Kool Flavoured Milk (Glass Bottle/Can)',
    category: 'Beverages & Buttermilk',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#FDF2F8" rx="20"/>
        <rect x="80" y="25" width="40" height="15" fill="#DB2777" rx="4"/>
        <path d="M68 40 L132 40 L138 170 C138 176 132 180 125 180 L75 180 C68 180 62 176 62 170 Z" fill="#F472B6" stroke="#BE185D" stroke-width="3"/>
        <rect x="66" y="65" width="68" height="95" fill="#FFFFFF" rx="5"/>
        <rect x="72" y="72" width="56" height="20" fill="#DC2626" rx="4"/>
        <text x="100" y="87" font-family="Arial, sans-serif" font-weight="900" font-size="13" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="112" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="#BE185D" text-anchor="middle">KOOL</text>
        <text x="100" y="130" font-family="Arial, sans-serif" font-weight="700" font-size="9" fill="#0369A1" text-anchor="middle">FLAVOURED MILK</text>
      </svg>
    `)
  },
  PRO_PROTEIN: {
    name: 'Amul High Protein Lassi / Buttermilk / Shake',
    category: 'Beverages & Buttermilk',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#F8FAFC" rx="20"/>
        <rect x="42" y="35" width="116" height="138" fill="#0F172A" rx="10" stroke="#334155" stroke-width="3"/>
        <rect x="48" y="42" width="104" height="124" fill="#1E293B" rx="8"/>
        <rect x="56" y="52" width="88" height="24" fill="#DC2626" rx="5"/>
        <text x="100" y="69" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="98" font-family="Arial, sans-serif" font-weight="900" font-size="15" fill="#38BDF8" text-anchor="middle">HIGH PROTEIN</text>
        <rect x="62" y="108" width="76" height="20" fill="#F59E0B" rx="4"/>
        <text x="100" y="122" font-family="Arial, sans-serif" font-weight="900" font-size="12" fill="#000000" text-anchor="middle">15g PROTEIN</text>
        <text x="100" y="148" font-family="Arial, sans-serif" font-weight="600" font-size="8" fill="#94A3B8" text-anchor="middle">ZERO ADDED SUGAR</text>
      </svg>
    `)
  },

  // 7. ICE CREAM & FROZEN
  ICE_CREAM_TUB: {
    name: 'Amul Ice Cream Tub (Vanilla / Butterscotch)',
    category: 'Ice Cream & Frozen',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#FFFBEB" rx="20"/>
        <ellipse cx="100" cy="72" rx="58" ry="32" fill="#F43F5E"/>
        <ellipse cx="100" cy="58" rx="44" ry="22" fill="#FDA4AF"/>
        <path d="M48 76 L152 76 L142 168 C142 174 135 178 128 178 L72 178 C65 178 58 174 58 168 Z" fill="#D97706" stroke="#B45309" stroke-width="3"/>
        <rect x="62" y="96" width="76" height="54" fill="#FFFFFF" rx="5"/>
        <rect x="68" y="102" width="64" height="18" fill="#DC2626" rx="4"/>
        <text x="100" y="115" font-family="Arial, sans-serif" font-weight="900" font-size="12" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="136" font-family="Arial, sans-serif" font-weight="900" font-size="11" fill="#B45309" text-anchor="middle">REAL ICE CREAM</text>
      </svg>
    `)
  },
  ICE_CREAM_CONE: {
    name: 'Amul Tricone / Chocobar (Cone)',
    category: 'Ice Cream & Frozen',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#FEF2F2" rx="20"/>
        <circle cx="100" cy="65" r="32" fill="#78350F" stroke="#451A03" stroke-width="2"/>
        <path d="M72 75 L128 75 L100 175 Z" fill="#D97706" stroke="#92400E" stroke-width="3"/>
        <rect x="80" y="85" width="40" height="16" fill="#DC2626" rx="3"/>
        <text x="100" y="97" font-family="Arial, sans-serif" font-weight="900" font-size="10" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="125" font-family="Arial, sans-serif" font-weight="800" font-size="9" fill="#FFFFFF" text-anchor="middle">TRICONE</text>
      </svg>
    `)
  },

  // 8. CHOCOLATES & SWEETS
  CHOCOLATE_BAR: {
    name: 'Amul Dark Chocolate (Rich Cocoa 55%)',
    category: 'Chocolates & Sweets',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#F8FAFC" rx="20"/>
        <rect x="36" y="42" width="128" height="116" fill="#29180E" rx="8" stroke="#170E08" stroke-width="3"/>
        <rect x="42" y="48" width="116" height="34" fill="#422212" rx="5"/>
        <rect x="56" y="54" width="88" height="22" fill="#DC2626" rx="4"/>
        <text x="100" y="70" font-family="Arial, sans-serif" font-weight="900" font-size="15" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="108" font-family="Arial, sans-serif" font-weight="900" font-size="14" fill="#F8FAFC" text-anchor="middle">DARK CHOCOLATE</text>
        <text x="100" y="128" font-family="Arial, sans-serif" font-weight="700" font-size="10" fill="#F59E0B" text-anchor="middle">55% RICH COCOA</text>
      </svg>
    `)
  },
  MITHAI_GULAB_JAMUN: {
    name: 'Amul Gulab Jamun / Rasgulla Tin (1kg)',
    category: 'Chocolates & Sweets',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#FEF3C7" rx="20"/>
        <rect x="50" y="32" width="100" height="18" fill="#B45309" rx="4"/>
        <rect x="42" y="48" width="116" height="120" fill="#D97706" rx="10" stroke="#92400E" stroke-width="3"/>
        <rect x="48" y="60" width="104" height="96" fill="#FFFFFF" rx="6"/>
        <rect x="56" y="68" width="88" height="24" fill="#DC2626" rx="5"/>
        <text x="100" y="85" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="112" font-family="Arial, sans-serif" font-weight="900" font-size="14" fill="#92400E" text-anchor="middle">GULAB JAMUN</text>
        <text x="100" y="130" font-family="Arial, sans-serif" font-weight="700" font-size="9" fill="#15803D" text-anchor="middle">MADE WITH AMUL KHOA</text>
      </svg>
    `)
  },
  SHRIKHAND_TUB: {
    name: 'Amul Shrikhand Kesar / Elaichi (500g Tub)',
    category: 'Chocolates & Sweets',
    dataUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" fill="#FEFCE8" rx="20"/>
        <ellipse cx="100" cy="54" rx="62" ry="16" fill="#CA8A04" stroke="#854D0E" stroke-width="2"/>
        <path d="M42 56 L158 56 L148 165 C148 172 140 178 132 178 L68 178 C60 178 52 172 52 165 Z" fill="#FACC15" stroke="#CA8A04" stroke-width="3"/>
        <rect x="54" y="74" width="92" height="84" fill="#FFFFFF" rx="6"/>
        <rect x="60" y="82" width="80" height="24" fill="#DC2626" rx="5"/>
        <text x="100" y="99" font-family="Arial, sans-serif" font-weight="900" font-size="15" fill="#FFFFFF" text-anchor="middle">Amul</text>
        <text x="100" y="122" font-family="Arial, sans-serif" font-weight="900" font-size="14" fill="#854D0E" text-anchor="middle">SHRIKHAND</text>
        <text x="100" y="140" font-family="Arial, sans-serif" font-weight="700" font-size="9" fill="#DC2626" text-anchor="middle">KESAR · ELAICHI</text>
      </svg>
    `)
  }
};

/**
 * Return an authentic packaging preset image dataUrl based on product name and category.
 */
export const getAmulProductPresetImage = (productName: string, category: string): string => {
  const lower = productName.toLowerCase();

  // 1. Fresh Milk
  if (lower.includes('taaza')) return AMUL_PRODUCT_IMAGE_PRESETS.TAAZA_MILK.dataUrl;
  if (lower.includes('gold')) return AMUL_PRODUCT_IMAGE_PRESETS.GOLD_MILK.dataUrl;
  if (lower.includes('cow milk') || lower.includes('cow')) return AMUL_PRODUCT_IMAGE_PRESETS.COW_MILK.dataUrl;
  if (lower.includes('shakti')) return AMUL_PRODUCT_IMAGE_PRESETS.SHAKTI_MILK.dataUrl;
  if (lower.includes('buffalo')) return AMUL_PRODUCT_IMAGE_PRESETS.BUFFALO_MILK.dataUrl;

  // 2. Butter & Spreads
  if (lower.includes('garlic')) return AMUL_PRODUCT_IMAGE_PRESETS.GARLIC_BUTTER.dataUrl;
  if (lower.includes('butter') && !lower.includes('buttermilk')) return AMUL_PRODUCT_IMAGE_PRESETS.BUTTER_PACK.dataUrl;

  // 3. Cheese & Paneer
  if (lower.includes('pizza') || lower.includes('mozzarella')) return AMUL_PRODUCT_IMAGE_PRESETS.CHEESE_MOZZARELLA.dataUrl;
  if (lower.includes('slice')) return AMUL_PRODUCT_IMAGE_PRESETS.CHEESE_SLICES.dataUrl;
  if (lower.includes('cheese')) return AMUL_PRODUCT_IMAGE_PRESETS.CHEESE_BLOCK.dataUrl;
  if (lower.includes('paneer')) return AMUL_PRODUCT_IMAGE_PRESETS.PANEER_FRESH.dataUrl;

  // 4. Ghee & Fats
  if (lower.includes('tin') && lower.includes('ghee')) return AMUL_PRODUCT_IMAGE_PRESETS.AMUL_GHEE_TIN.dataUrl;
  if (lower.includes('ghee')) return AMUL_PRODUCT_IMAGE_PRESETS.AMUL_GHEE_POUCH.dataUrl;

  // 5. Curd & Yogurt
  if (lower.includes('dahi') || lower.includes('curd') || category === 'Curd & Yogurt') return AMUL_PRODUCT_IMAGE_PRESETS.MASTI_DAHI.dataUrl;

  // 6. Beverages & Buttermilk
  if (lower.includes('chaas') || lower.includes('chhas') || lower.includes('buttermilk')) return AMUL_PRODUCT_IMAGE_PRESETS.CHHAAS_POUCH.dataUrl;
  if (lower.includes('protein') || lower.includes('pro')) return AMUL_PRODUCT_IMAGE_PRESETS.PRO_PROTEIN.dataUrl;
  if (lower.includes('kool') || category === 'Beverages & Buttermilk') return AMUL_PRODUCT_IMAGE_PRESETS.KOOL_BOTTLE.dataUrl;

  // 7. Ice Cream & Frozen
  if (lower.includes('cone') || lower.includes('tricone') || lower.includes('chocobar')) return AMUL_PRODUCT_IMAGE_PRESETS.ICE_CREAM_CONE.dataUrl;
  if (lower.includes('ice cream') || category === 'Ice Cream & Frozen') return AMUL_PRODUCT_IMAGE_PRESETS.ICE_CREAM_TUB.dataUrl;

  // 8. Chocolates & Sweets
  if (lower.includes('shrikhand')) return AMUL_PRODUCT_IMAGE_PRESETS.SHRIKHAND_TUB.dataUrl;
  if (lower.includes('jamun') || lower.includes('rasgulla') || lower.includes('mithai') || lower.includes('halwa')) return AMUL_PRODUCT_IMAGE_PRESETS.MITHAI_GULAB_JAMUN.dataUrl;
  if (lower.includes('choco') || category === 'Chocolates & Sweets') return AMUL_PRODUCT_IMAGE_PRESETS.CHOCOLATE_BAR.dataUrl;

  // Category Fallbacks
  switch (category) {
    case 'Milk': return AMUL_PRODUCT_IMAGE_PRESETS.TAAZA_MILK.dataUrl;
    case 'Butter & Spreads': return AMUL_PRODUCT_IMAGE_PRESETS.BUTTER_PACK.dataUrl;
    case 'Cheese & Paneer': return AMUL_PRODUCT_IMAGE_PRESETS.CHEESE_SLICES.dataUrl;
    case 'Ghee & Dairy Fats': return AMUL_PRODUCT_IMAGE_PRESETS.AMUL_GHEE_POUCH.dataUrl;
    case 'Curd & Yogurt': return AMUL_PRODUCT_IMAGE_PRESETS.MASTI_DAHI.dataUrl;
    case 'Beverages & Buttermilk': return AMUL_PRODUCT_IMAGE_PRESETS.KOOL_BOTTLE.dataUrl;
    case 'Ice Cream & Frozen': return AMUL_PRODUCT_IMAGE_PRESETS.ICE_CREAM_TUB.dataUrl;
    case 'Chocolates & Sweets': return AMUL_PRODUCT_IMAGE_PRESETS.CHOCOLATE_BAR.dataUrl;
    default: return AMUL_PRODUCT_IMAGE_PRESETS.TAAZA_MILK.dataUrl;
  }
};
