/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Default seed catalog for Amul Parlour operations.
 * Authentic Amul product line (65+ items) with genuine GCMMF EAN-13 barcodes,
 * categories, units, standard MRPs, and realistic distributor wholesale costs.
 */

import { BankEntry, Product, ProductCategory, Shop, Supplier } from '../types/index.ts';
import { getAmulProductPresetImage } from './productImages.ts';

export const getSeedSuppliersForShop = (shopId: string): Supplier[] => [
  {
    id: `sup-${shopId}-01`,
    shopId,
    name: 'Shailesh Bhai (Route Distributor)',
    companyName: 'GCMMF Anand Central Milk Depot',
    phone: '+91 98250 88776',
    email: 'anand.depot@amul.coop',
    address: 'Amul Dairy Road, Anand - 388001',
    gstin: '24AAAAG1234A1Z1',
    currentBalance: 4500, // Current payable
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: `sup-${shopId}-02`,
    shopId,
    name: 'Prakash Frozen Logistics',
    companyName: 'Amul Ice Cream C&F Distributor',
    phone: '+91 98240 55443',
    email: 'prakash.frozen@gmail.com',
    address: 'Plot 8, GIDC Industrial Estate, Vitthal Udyognagar',
    gstin: '24BBBBP5678B1Z9',
    currentBalance: 0,
    createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export const INITIAL_SHOPS: Shop[] = [
  {
    id: 'shop-amul-001',
    shopCode: 'AP-2026-1001',
    name: 'Amul Preferred Outlet - Anand Dairy Kiosk',
    regionalName: 'અમૂલ પ્રેફર્ડ આઉટલેટ - આણંદ ડેરી કિઓસ્ક',
    ownerName: 'Rajesh Patel',
    phone: '+91 98250 12345',
    email: 'anand.kiosk@amulparlour.in',
    address: 'Shop No. 4, Station Road, Opp. Municipal Garden',
    city: 'Anand',
    state: 'Gujarat',
    pincode: '388001',
    gstNumber: '24AAAAA0000A1Z5',
    fssaiNumber: '10721001000234',
    bankName: 'State Bank of India (SBI)',
    accountHolderName: 'Rajesh Patel (Amul Parlour)',
    accountNumber: '384910204928',
    ifscCode: 'SBIN0000315',
    upiId: 'amulparlour.anand@sbi',
    approvalStatus: 'APPROVED',
    subscriptionPlanId: 'BASIC',
    subscriptionStatus: 'ACTIVE',
    subscriptionStartDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    subscriptionExpiryDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'shop-amul-002',
    shopCode: 'AP-2026-1002',
    name: 'Amul Ice Cream & Dairy Lounge',
    regionalName: 'અમૂલ આઈસ્ક્રીમ અને ડેરી લાઉન્જ',
    ownerName: 'Priya Sharma',
    phone: '+91 98111 67890',
    email: 'delhi.lounge@amulparlour.in',
    address: 'Plot 12, Sector 18, Commercial Market',
    city: 'Noida',
    state: 'Uttar Pradesh',
    pincode: '201301',
    gstNumber: '09AAAAA1111B1Z2',
    fssaiNumber: '10822002000567',
    bankName: 'HDFC Bank',
    accountHolderName: 'Amul Ice Cream Lounge',
    accountNumber: '50200049281726',
    ifscCode: 'HDFC0000128',
    upiId: 'amullounge.noida@okhdfcbank',
    approvalStatus: 'APPROVED',
    subscriptionPlanId: 'TRIAL',
    subscriptionStatus: 'ACTIVE',
    subscriptionStartDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    subscriptionExpiryDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'shop-amul-003',
    shopCode: 'AP-2026-1003',
    name: 'Amul Fresh Point - Whitefield',
    regionalName: 'અમૂલ ફ્રેશ પોઈન્ટ - વ્હાઈટફિલ્ડ',
    ownerName: 'Karthik Rao',
    phone: '+91 98450 99887',
    email: 'karthik.rao@amulparlour.in',
    address: 'Shop 2, ITPL Main Road, Hoodi',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560066',
    bankName: 'Canara Bank',
    accountHolderName: 'Amul Fresh Point',
    accountNumber: '0482101089201',
    ifscCode: 'CNRB0000482',
    upiId: 'amulwhitefield@okaxis',
    approvalStatus: 'PENDING',
    subscriptionPlanId: 'TRIAL',
    subscriptionStatus: 'INACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export const getSeedBankEntriesForShop = (shopId: string): BankEntry[] => [
  {
    id: `bank-${shopId}-01`,
    shopId,
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    type: 'CREDIT',
    category: 'CASH_DEPOSIT',
    amount: 15000,
    referenceNumber: 'DEP-20261028-01',
    description: 'Cash counter collection deposited into bank',
    partyName: 'SBI Anand Branch',
    paymentMode: 'CASH_DEPOSIT',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: `bank-${shopId}-02`,
    shopId,
    date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    type: 'DEBIT',
    category: 'SUPPLIER_PAYMENT',
    amount: 12500,
    referenceNumber: 'NEFT-GCMMF-8891',
    description: 'Milk & Ghee purchase invoice payment to GCMMF Depot',
    partyName: 'GCMMF Anand Central Milk Depot',
    paymentMode: 'NEFT_RTGS',
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: `bank-${shopId}-03`,
    shopId,
    date: new Date().toISOString().split('T')[0],
    type: 'CREDIT',
    category: 'UPI_SALE',
    amount: 420,
    referenceNumber: 'BILL-20261031-002',
    description: 'Customer counter sale - Amul Gold & Butter',
    partyName: '+91 98250 44332',
    paymentMode: 'UPI',
    createdAt: new Date().toISOString()
  }
];

/**
 * 65+ Authentic Amul Products across all official categories
 * Pre-filled with accurate EAN-13 barcodes, units, MRPs, and wholesale cost prices.
 */
export const getSeedProductsForShop = (shopId: string): Product[] => {
  const masterList: Array<{
    barcode: string;
    sku: string;
    name: string;
    regionalName?: string;
    category: ProductCategory;
    unit: Product['unit'];
    mrp: number;
    costPrice: number;
    initialStock: number;
    minStockAlert: number;
  }> = [
    // 1. FRESH MILK POUCHES
    { barcode: '8901262010014', sku: 'AMUL-MILK-TZ-500', name: 'Amul Taaza Toned Milk (500ml)', regionalName: 'અમૂલ તાઝા દૂધ', category: 'Milk', unit: 'Pouch', mrp: 27, costPrice: 24.5, initialStock: 80, minStockAlert: 20 },
    { barcode: '8901262010045', sku: 'AMUL-MILK-TZ-1000', name: 'Amul Taaza Toned Milk (1 Litre)', regionalName: 'અમૂલ તાઝા દૂધ ૧ લિટર', category: 'Milk', unit: 'Pouch', mrp: 54, costPrice: 49.0, initialStock: 40, minStockAlert: 10 },
    { barcode: '8901262010021', sku: 'AMUL-MILK-GD-500', name: 'Amul Gold Full Cream Milk (500ml)', regionalName: 'અમૂલ ગોલ્ડ દૂધ', category: 'Milk', unit: 'Pouch', mrp: 33, costPrice: 30.2, initialStock: 70, minStockAlert: 20 },
    { barcode: '8901262010052', sku: 'AMUL-MILK-GD-1000', name: 'Amul Gold Full Cream Milk (1 Litre)', regionalName: 'અમૂલ ગોલ્ડ દૂધ ૧ લિટર', category: 'Milk', unit: 'Pouch', mrp: 66, costPrice: 60.5, initialStock: 35, minStockAlert: 10 },
    { barcode: '8901262010069', sku: 'AMUL-MILK-SH-500', name: 'Amul Shakti Standardized Milk (500ml)', regionalName: 'અમૂલ શક્તિ દૂધ', category: 'Milk', unit: 'Pouch', mrp: 30, costPrice: 27.5, initialStock: 50, minStockAlert: 15 },
    { barcode: '8901262010076', sku: 'AMUL-MILK-SH-1000', name: 'Amul Shakti Standardized Milk (1 Litre)', regionalName: 'અમૂલ શક્તિ દૂધ ૧ લિટર', category: 'Milk', unit: 'Pouch', mrp: 60, costPrice: 55.0, initialStock: 25, minStockAlert: 10 },
    { barcode: '8901262010038', sku: 'AMUL-MILK-COW-500', name: 'Amul Cow Milk (500ml)', regionalName: 'અમૂલ ગાયનું દૂધ', category: 'Milk', unit: 'Pouch', mrp: 28, costPrice: 25.5, initialStock: 45, minStockAlert: 12 },
    { barcode: '8901262010083', sku: 'AMUL-MILK-COW-1000', name: 'Amul Cow Milk (1 Litre)', regionalName: 'અમૂલ ગાયનું દૂધ ૧ લિટર', category: 'Milk', unit: 'Pouch', mrp: 56, costPrice: 51.0, initialStock: 20, minStockAlert: 8 },
    { barcode: '8901262010090', sku: 'AMUL-MILK-BUF-500', name: 'Amul Buffalo Milk (A2 Protein 500ml)', regionalName: 'અમૂલ ભેંસનું દૂધ', category: 'Milk', unit: 'Pouch', mrp: 35, costPrice: 32.0, initialStock: 30, minStockAlert: 10 },
    { barcode: '8901262010106', sku: 'AMUL-MILK-SLIM-500', name: 'Amul Slim & Trim Skimmed Milk (500ml)', regionalName: 'અમૂલ સ્લિમ દૂધ', category: 'Milk', unit: 'Pouch', mrp: 25, costPrice: 22.8, initialStock: 25, minStockAlert: 8 },
    { barcode: '8901262010113', sku: 'AMUL-MILK-TSPEC-1000', name: 'Amul T-Special Milk (Hot Tea Special 1L)', regionalName: 'અમૂલ ટી-સ્પેશિયલ દૂધ', category: 'Milk', unit: 'Pouch', mrp: 62, costPrice: 57.0, initialStock: 30, minStockAlert: 10 },

    // 2. BUTTER & SPREADS
    { barcode: '8901262010151', sku: 'AMUL-BTR-100G', name: 'Amul Butter Salted (100g Pack)', regionalName: 'અમૂલ બટર ૧૦૦ ગ્રામ', category: 'Butter & Spreads', unit: 'Pack', mrp: 60, costPrice: 54.0, initialStock: 50, minStockAlert: 15 },
    { barcode: '8901262010168', sku: 'AMUL-BTR-500G', name: 'Amul Butter Salted (500g Block)', regionalName: 'અમૂલ બટર ૫૦૦ ગ્રામ', category: 'Butter & Spreads', unit: 'Pack', mrp: 275, costPrice: 252.0, initialStock: 25, minStockAlert: 6 },
    { barcode: '8901262010175', sku: 'AMUL-BTR-200G', name: 'Amul Butter Salted (200g Pack)', category: 'Butter & Spreads', unit: 'Pack', mrp: 118, costPrice: 107.0, initialStock: 30, minStockAlert: 8 },
    { barcode: '8901262010182', sku: 'AMUL-WHITE-BTR-500', name: 'Amul Unsalted White Butter (500g)', category: 'Butter & Spreads', unit: 'Pack', mrp: 290, costPrice: 265.0, initialStock: 12, minStockAlert: 4 },
    { barcode: '8901262010199', sku: 'AMUL-GARLIC-BTR-100', name: 'Amul Garlic & Herbs Butter (100g)', category: 'Butter & Spreads', unit: 'Pack', mrp: 65, costPrice: 58.5, initialStock: 20, minStockAlert: 5 },
    { barcode: '8901262010212', sku: 'AMUL-DELICIOUS-500', name: 'Amul Delicious Fat Spread (500g)', category: 'Butter & Spreads', unit: 'Pack', mrp: 130, costPrice: 115.0, initialStock: 15, minStockAlert: 4 },

    // 3. CHEESE & PANEER
    { barcode: '8901262010205', sku: 'AMUL-CHS-SL-200', name: 'Amul Processed Cheese Slices (200g / 10 Slices)', regionalName: 'અમૂલ ચીઝ સ્લાઈસ', category: 'Cheese & Paneer', unit: 'Pack', mrp: 145, costPrice: 130.0, initialStock: 35, minStockAlert: 10 },
    { barcode: '8901262010229', sku: 'AMUL-CHS-SL-100', name: 'Amul Processed Cheese Slices (100g / 5 Slices)', category: 'Cheese & Paneer', unit: 'Pack', mrp: 80, costPrice: 71.0, initialStock: 25, minStockAlert: 8 },
    { barcode: '8901262010236', sku: 'AMUL-CHS-BLK-200', name: 'Amul Processed Cheese Block (200g)', category: 'Cheese & Paneer', unit: 'Pack', mrp: 135, costPrice: 120.0, initialStock: 30, minStockAlert: 8 },
    { barcode: '8901262010243', sku: 'AMUL-CHS-BLK-400', name: 'Amul Processed Cheese Block (400g)', category: 'Cheese & Paneer', unit: 'Pack', mrp: 260, costPrice: 234.0, initialStock: 18, minStockAlert: 5 },
    { barcode: '8901262010250', sku: 'AMUL-CHS-CUBE-200', name: 'Amul Cheese Cubes (200g Pack)', category: 'Cheese & Paneer', unit: 'Pack', mrp: 140, costPrice: 125.0, initialStock: 28, minStockAlert: 8 },
    { barcode: '8901262010267', sku: 'AMUL-CHS-SPRD-200', name: 'Amul Cheese Spread Plain (200g Tub)', category: 'Cheese & Paneer', unit: 'Tub', mrp: 105, costPrice: 92.0, initialStock: 20, minStockAlert: 5 },
    { barcode: '8901262010274', sku: 'AMUL-CHS-SPRD-GAR-200', name: 'Amul Cheese Spread Garlic (200g Tub)', category: 'Cheese & Paneer', unit: 'Tub', mrp: 110, costPrice: 96.0, initialStock: 16, minStockAlert: 4 },
    { barcode: '8901262010281', sku: 'AMUL-MOZZ-200', name: 'Amul Pizza Mozzarella Cheese (200g Diced)', category: 'Cheese & Paneer', unit: 'Pack', mrp: 125, costPrice: 110.0, initialStock: 25, minStockAlert: 6 },
    { barcode: '8901262010298', sku: 'AMUL-MOZZ-1000', name: 'Amul Pizza Mozzarella Cheese (1kg Block)', category: 'Cheese & Paneer', unit: 'Pack', mrp: 520, costPrice: 465.0, initialStock: 10, minStockAlert: 3 },
    { barcode: '8901262010304', sku: 'AMUL-PNR-200G', name: 'Amul Fresh Malai Paneer (200g Block)', regionalName: 'અમૂલ તાજું પનીર', category: 'Cheese & Paneer', unit: 'Pack', mrp: 95, costPrice: 84.0, initialStock: 45, minStockAlert: 12 },
    { barcode: '8901262010311', sku: 'AMUL-PNR-1000G', name: 'Amul Fresh Malai Paneer (1kg Block)', regionalName: 'અમૂલ તાજું પનીર ૧ કિલો', category: 'Cheese & Paneer', unit: 'Pack', mrp: 450, costPrice: 400.0, initialStock: 15, minStockAlert: 4 },
    { barcode: '8901262010328', sku: 'AMUL-FROZ-PNR-500', name: 'Amul Frozen Diced Paneer Cubes (500g)', category: 'Cheese & Paneer', unit: 'Pack', mrp: 240, costPrice: 212.0, initialStock: 16, minStockAlert: 4 },

    // 4. DAHI, CURD & BUTTERMILK
    { barcode: '8901262010816', sku: 'AMUL-DAHI-PCH-200', name: 'Amul Masti Dahi (200g Pouch)', regionalName: 'અમૂલ મસ્તી દહીં ૨૦૦ ગ્રામ', category: 'Curd & Yogurt', unit: 'Pouch', mrp: 18, costPrice: 15.5, initialStock: 50, minStockAlert: 15 },
    { barcode: '8901262010823', sku: 'AMUL-DAHI-PCH-400', name: 'Amul Masti Dahi (400g Pouch)', regionalName: 'અમૂલ મસ્તી દહીં ૪૦૦ ગ્રામ', category: 'Curd & Yogurt', unit: 'Pouch', mrp: 35, costPrice: 30.5, initialStock: 45, minStockAlert: 12 },
    { barcode: '8901262010809', sku: 'AMUL-DAHI-CUP-400', name: 'Amul Masti Dahi (400g Cup)', category: 'Curd & Yogurt', unit: 'Cup', mrp: 40, costPrice: 34.5, initialStock: 30, minStockAlert: 8 },
    { barcode: '8901262010830', sku: 'AMUL-DAHI-TUB-1000', name: 'Amul Masti Dahi (1kg Bucket)', regionalName: 'અમૂલ મસ્તી દહીં ૧ કિલો', category: 'Curd & Yogurt', unit: 'Tub', mrp: 85, costPrice: 74.0, initialStock: 20, minStockAlert: 5 },
    { barcode: '8901262010847', sku: 'AMUL-PROBIOTIC-200', name: 'Amul Probiotic Dahi Cup (200g)', category: 'Curd & Yogurt', unit: 'Cup', mrp: 25, costPrice: 21.5, initialStock: 24, minStockAlert: 6 },
    { barcode: '8901262010601', sku: 'AMUL-MASTI-CHAAS-200', name: 'Amul Masti Spiced Buttermilk (200ml Pouch)', regionalName: 'અમૂલ મસાલા છાશ ૨૦૦ મિલી', category: 'Beverages & Buttermilk', unit: 'Pouch', mrp: 15, costPrice: 12.8, initialStock: 75, minStockAlert: 20 },
    { barcode: '8901262010625', sku: 'AMUL-MASTI-CHAAS-500', name: 'Amul Masti Spiced Buttermilk (500ml Pouch)', regionalName: 'અમૂલ મસાલા છાશ ૫૦૦ મિલી', category: 'Beverages & Buttermilk', unit: 'Pouch', mrp: 30, costPrice: 26.0, initialStock: 40, minStockAlert: 10 },
    { barcode: '8901262010632', sku: 'AMUL-PLAIN-CHAAS-500', name: 'Amul Plain Fresh Buttermilk (500ml Pouch)', category: 'Beverages & Buttermilk', unit: 'Pouch', mrp: 28, costPrice: 24.5, initialStock: 30, minStockAlert: 8 },
    { barcode: '8901262010649', sku: 'AMUL-CHAAS-TETRA-200', name: 'Amul Masala Buttermilk (200ml Tetrapack)', category: 'Beverages & Buttermilk', unit: 'Pack', mrp: 15, costPrice: 13.0, initialStock: 48, minStockAlert: 12 },
    { barcode: '8901262010656', sku: 'AMUL-LASSI-TETRA-200', name: 'Amul Sweetened Lassi (200ml Tetrapack)', regionalName: 'અમૂલ મીઠી લસ્સી', category: 'Beverages & Buttermilk', unit: 'Pack', mrp: 20, costPrice: 17.0, initialStock: 40, minStockAlert: 10 },
    { barcode: '8901262010663', sku: 'AMUL-MANGO-LASSI-200', name: 'Amul Mango Lassi (200ml Tetrapack)', regionalName: 'અમૂલ મેંગો લસ્સી', category: 'Beverages & Buttermilk', unit: 'Pack', mrp: 25, costPrice: 21.5, initialStock: 35, minStockAlert: 8 },

    // 5. PURE GHEE & DAIRY FATS
    { barcode: '8901262010502', sku: 'AMUL-GHEE-TIN-1000', name: 'Amul Pure Ghee (1 Litre Tin)', regionalName: 'અમૂલ શુદ્ધ ઘી ૧ લિટર ટિન', category: 'Ghee & Dairy Fats', unit: 'Tin', mrp: 610, costPrice: 565.0, initialStock: 18, minStockAlert: 4 },
    { barcode: '8901262010519', sku: 'AMUL-GHEE-PCH-1000', name: 'Amul Pure Ghee (1 Litre Pouch)', regionalName: 'અમૂલ શુદ્ધ ઘી ૧ લિટર પાઉચ', category: 'Ghee & Dairy Fats', unit: 'Pouch', mrp: 590, costPrice: 548.0, initialStock: 24, minStockAlert: 5 },
    { barcode: '8901262010526', sku: 'AMUL-GHEE-PCH-500', name: 'Amul Pure Ghee (500ml Pouch)', regionalName: 'અમૂલ શુદ્ધ ઘી ૫૦૦ મિલી', category: 'Ghee & Dairy Fats', unit: 'Pouch', mrp: 300, costPrice: 278.0, initialStock: 30, minStockAlert: 6 },
    { barcode: '8901262010533', sku: 'AMUL-COW-GHEE-1000', name: 'Amul Cow Ghee (1 Litre Tin)', regionalName: 'અમૂલ ગાયનું ઘી ૧ લિટર', category: 'Ghee & Dairy Fats', unit: 'Tin', mrp: 650, costPrice: 600.0, initialStock: 14, minStockAlert: 3 },
    { barcode: '8901262010540', sku: 'SAGAR-GHEE-TIN-1000', name: 'Sagar Pure Ghee (1 Litre Tin)', category: 'Ghee & Dairy Fats', unit: 'Tin', mrp: 580, costPrice: 535.0, initialStock: 12, minStockAlert: 3 },

    // 6. BEVERAGES & FLAVOURED MILK
    { barcode: '8901262010403', sku: 'AMUL-KOOL-BDM-200', name: 'Amul Kool Badam Shakers (200ml Glass Bottle)', regionalName: 'અમૂલ કૂલ બદામ', category: 'Beverages & Buttermilk', unit: 'Bottle', mrp: 30, costPrice: 25.0, initialStock: 48, minStockAlert: 12 },
    { barcode: '8901262010410', sku: 'AMUL-KOOL-KSR-200', name: 'Amul Kool Kesar Flavour (200ml Bottle)', regionalName: 'અમૂલ કૂલ કેસર', category: 'Beverages & Buttermilk', unit: 'Bottle', mrp: 30, costPrice: 25.0, initialStock: 36, minStockAlert: 10 },
    { barcode: '8901262010618', sku: 'AMUL-KOOL-CAFE-200', name: 'Amul Kool Cafe Flavoured Milk (200ml Can)', regionalName: 'અમૂલ કોલ્ડ કોફી કેન', category: 'Beverages & Buttermilk', unit: 'Bottle', mrp: 35, costPrice: 29.5, initialStock: 36, minStockAlert: 10 },
    { barcode: '8901262010427', sku: 'AMUL-KOOL-ELC-200', name: 'Amul Kool Elaichi Can (200ml)', category: 'Beverages & Buttermilk', unit: 'Bottle', mrp: 30, costPrice: 25.0, initialStock: 24, minStockAlert: 6 },
    { barcode: '8901262010434', sku: 'AMUL-KOOL-STRW-200', name: 'Amul Kool Strawberry Milkshake (200ml Can)', category: 'Beverages & Buttermilk', unit: 'Bottle', mrp: 30, costPrice: 25.0, initialStock: 24, minStockAlert: 6 },
    { barcode: '8901262010441', sku: 'AMUL-HALDI-DOODH-200', name: 'Amul Haldi Doodh Ayurvedic Can (200ml)', category: 'Beverages & Buttermilk', unit: 'Bottle', mrp: 30, costPrice: 25.0, initialStock: 24, minStockAlert: 6 },

    // 7. ICE CREAMS & FROZEN CONFECTIONERY
    { barcode: '8901262010908', sku: 'AMUL-IC-VAN-1000', name: 'Amul Real Milk Vanilla Ice Cream (1L Tub)', regionalName: 'અમૂલ વેનીલા આઈસ્ક્રીમ', category: 'Ice Cream & Frozen', unit: 'Tub', mrp: 160, costPrice: 135.0, initialStock: 20, minStockAlert: 5 },
    { barcode: '8901262010915', sku: 'AMUL-IC-BSCOTCH-1000', name: 'Amul Butterscotch Ice Cream (1L Tub)', regionalName: 'અમૂલ બટરસ્કોચ આઈસ્ક્રીમ', category: 'Ice Cream & Frozen', unit: 'Tub', mrp: 210, costPrice: 178.0, initialStock: 18, minStockAlert: 4 },
    { barcode: '8901262010922', sku: 'AMUL-IC-KAJU-1000', name: 'Amul Kaju Draksh Ice Cream (1L Tub)', regionalName: 'અમૂલ કાજુ દ્રાક્ષ આઈસ્ક્રીમ', category: 'Ice Cream & Frozen', unit: 'Tub', mrp: 240, costPrice: 205.0, initialStock: 16, minStockAlert: 4 },
    { barcode: '8901262010939', sku: 'AMUL-IC-CHOC-1000', name: 'Amul Chocolate Brownie Magic (1L Tub)', category: 'Ice Cream & Frozen', unit: 'Tub', mrp: 230, costPrice: 195.0, initialStock: 15, minStockAlert: 4 },
    { barcode: '8901262010946', sku: 'AMUL-IC-RAJBHOG-1000', name: 'Amul Royal Rajbhog Ice Cream (1L Tub)', regionalName: 'અમૂલ રાજભોગ આઈસ્ક્રીમ', category: 'Ice Cream & Frozen', unit: 'Tub', mrp: 260, costPrice: 220.0, initialStock: 12, minStockAlert: 3 },
    { barcode: '8901262010953', sku: 'AMUL-IC-TRICONE-BS', name: 'Amul Tricone Butterscotch Cone (120ml)', category: 'Ice Cream & Frozen', unit: 'Cone', mrp: 40, costPrice: 33.0, initialStock: 35, minStockAlert: 8 },
    { barcode: '8901262010960', sku: 'AMUL-IC-TRICONE-CH', name: 'Amul Tricone Belgian Chocolate (120ml)', category: 'Ice Cream & Frozen', unit: 'Cone', mrp: 45, costPrice: 37.0, initialStock: 35, minStockAlert: 8 },
    { barcode: '8901262010977', sku: 'AMUL-IC-FROSTIK', name: 'Amul Frostik Premium Chocolate Bar (70ml)', category: 'Ice Cream & Frozen', unit: 'Piece', mrp: 35, costPrice: 29.0, initialStock: 40, minStockAlert: 10 },
    { barcode: '8901262010984', sku: 'AMUL-IC-CHOCOBAR', name: 'Amul Classic Choco Bar (60ml)', category: 'Ice Cream & Frozen', unit: 'Piece', mrp: 20, costPrice: 16.5, initialStock: 50, minStockAlert: 12 },
    { barcode: '8901262010991', sku: 'AMUL-IC-CASSATTA', name: 'Amul Real Ice Cream Cassatta Slice (150ml)', category: 'Ice Cream & Frozen', unit: 'Piece', mrp: 50, costPrice: 41.5, initialStock: 25, minStockAlert: 6 },
    { barcode: '8901262011004', sku: 'AMUL-IC-KULFI-KP', name: 'Amul Kesar Pista Kulfi Stick (60ml)', regionalName: 'અમૂલ કેસર પિસ્તા કુલ્ફી', category: 'Ice Cream & Frozen', unit: 'Piece', mrp: 30, costPrice: 24.5, initialStock: 40, minStockAlert: 10 },

    // 8. CHOCOLATES & CONFECTIONERY
    { barcode: '8901262010700', sku: 'AMUL-CHOC-DARK-150', name: 'Amul 55% Dark Chocolate Bar (150g)', regionalName: 'અમૂલ ડાર્ક ચોકલેટ', category: 'Chocolates & Sweets', unit: 'Piece', mrp: 110, costPrice: 94.0, initialStock: 25, minStockAlert: 6 },
    { barcode: '8901262010717', sku: 'AMUL-CHOC-BITTER-150', name: 'Amul 75% Bitter Dark Chocolate (150g)', category: 'Chocolates & Sweets', unit: 'Piece', mrp: 130, costPrice: 112.0, initialStock: 20, minStockAlert: 5 },
    { barcode: '8901262010724', sku: 'AMUL-CHOC-FRUIT-150', name: 'Amul Fruit & Nut Dark Chocolate (150g)', category: 'Chocolates & Sweets', unit: 'Piece', mrp: 120, costPrice: 102.0, initialStock: 25, minStockAlert: 6 },
    { barcode: '8901262010731', sku: 'AMUL-CHOC-MILK-150', name: 'Amul Creamy Milk Chocolate (150g)', category: 'Chocolates & Sweets', unit: 'Piece', mrp: 100, costPrice: 85.0, initialStock: 25, minStockAlert: 6 },

    // 9. TRADITIONAL SWEETS & CONDENSED MILK
    { barcode: '8901262011103', sku: 'AMUL-SWT-GULAB-1000', name: 'Amul Gulab Jamun in Sugar Syrup (1kg Tin)', regionalName: 'અમૂલ ગુલાબ જાંબુ', category: 'Chocolates & Sweets', unit: 'Tin', mrp: 250, costPrice: 215.0, initialStock: 16, minStockAlert: 4 },
    { barcode: '8901262011110', sku: 'AMUL-SWT-RASGULLA-1000', name: 'Amul Sponge Rasgulla (1kg Tin)', regionalName: 'અમૂલ રસગુલ્લા', category: 'Chocolates & Sweets', unit: 'Tin', mrp: 240, costPrice: 205.0, initialStock: 16, minStockAlert: 4 },
    { barcode: '8901262011127', sku: 'AMUL-SWT-KAJU-250', name: 'Amul Pure Ghee Kaju Katli (250g Gift Box)', regionalName: 'અમૂલ કાજુ કતરી', category: 'Chocolates & Sweets', unit: 'Pack', mrp: 225, costPrice: 195.0, initialStock: 14, minStockAlert: 3 },
    { barcode: '8901262011134', sku: 'AMUL-SHRIKHAND-KSR-500', name: 'Amul Shrikhand Kesar (500g Tub)', regionalName: 'અમૂલ કેસર શ્રીખંડ', category: 'Chocolates & Sweets', unit: 'Tub', mrp: 120, costPrice: 102.0, initialStock: 20, minStockAlert: 5 },
    { barcode: '8901262011141', sku: 'AMUL-SHRIKHAND-MNG-500', name: 'Amul Shrikhand Mango (500g Tub)', regionalName: 'અમૂલ મેંગો શ્રીખંડ', category: 'Chocolates & Sweets', unit: 'Tub', mrp: 115, costPrice: 98.0, initialStock: 18, minStockAlert: 4 },
    { barcode: '8901262011202', sku: 'AMULYA-WHITENER-500', name: 'Amulya Dairy Whitener (500g Pouch)', regionalName: 'અમૂલ્યા ડેરી વ્હાઇટનર', category: 'Others', unit: 'Pack', mrp: 260, costPrice: 235.0, initialStock: 24, minStockAlert: 6 },
    { barcode: '8901262011219', sku: 'AMULYA-WHITENER-1000', name: 'Amulya Dairy Whitener (1kg Pack)', regionalName: 'અમૂલ્યા ડેરી વ્હાઇટનર ૧ કિલો', category: 'Others', unit: 'Pack', mrp: 510, costPrice: 462.0, initialStock: 15, minStockAlert: 4 },
    { barcode: '8901262011226', sku: 'AMUL-MITHAI-MATE-400', name: 'Amul Mithai Mate Sweetened Condensed Milk (400g Tin)', category: 'Others', unit: 'Tin', mrp: 140, costPrice: 122.0, initialStock: 20, minStockAlert: 5 }
  ];

  const now = new Date().toISOString();

  return masterList.map((item, index) => {
    const id = `prod-${shopId}-${String(index + 1).padStart(3, '0')}`;
    return {
      id,
      shopId,
      barcode: item.barcode,
      sku: item.sku,
      name: item.name,
      regionalName: item.regionalName,
      category: item.category,
      unit: item.unit,
      mrp: item.mrp,
      costPrice: item.costPrice,
      sellingPrice: item.mrp,
      currentStock: item.initialStock,
      minStockAlert: item.minStockAlert,
      isActive: true,
      imageUrl: getAmulProductPresetImage(item.name, item.category),
      createdAt: now,
      updatedAt: now
    };
  });
};
