/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Amul Parlour POS & Management System - Complete Domain Types
 * Fully aligned with Kotlin Android Data Models & PostgreSQL Database Schema.
 * Prepared for the 3-Project Architecture:
 * 1. Existing Android App
 * 2. Existing React + TypeScript Website (Local-First IndexedDB)
 * 3. Shared Backend API + PostgreSQL Database
 */

export type ShopApprovalStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED';
export type SubscriptionStatus = 'INACTIVE' | 'ACTIVE' | 'EXPIRED';
export type SubscriptionPlanId = 'TRIAL' | 'BASIC' | 'PRO';

export interface SubscriptionPlan {
  id: SubscriptionPlanId;
  name: string;
  price: number; // in INR
  durationDays: number;
  description: string;
  maxProducts: number;
  features: string[];
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, SubscriptionPlan> = {
  TRIAL: {
    id: 'TRIAL',
    name: 'Trial Plan',
    price: 0,
    durationDays: 30,
    description: '30-day evaluation trial with basic barcode billing.',
    maxProducts: 50,
    features: ['Barcode POS Billing', 'Daily Sales Report', 'Local Backup & Restore', 'Single Counter', 'Max 50 Products']
  },
  BASIC: {
    id: 'BASIC',
    name: 'Basic Parlour',
    price: 300,
    durationDays: 30,
    description: 'Standard retail pack for Amul franchisees and kiosks.',
    maxProducts: 250,
    features: ['Barcode POS Billing', 'Daily Sales & Stock Reports', 'Thermal 58mm/80mm Printing', 'Purchase & Expense Entry', 'Max 250 Products', 'CSV Export']
  },
  PRO: {
    id: 'PRO',
    name: 'Pro Dairy Enterprise',
    price: 500,
    durationDays: 30,
    description: 'Comprehensive solution with multi-counter sync and deep reports.',
    maxProducts: 1000,
    features: ['Unlimited Products & Bills', 'Automated Daily Backups', 'Multi-Terminal Sync Ready', 'Thermal & A4 Invoicing', 'Supplier Khata & P&L Profit Tracking', 'Deep Audit Trail']
  }
};

export interface Shop {
  id: string; // Internal UUID
  shopCode: string; // e.g. "AP-2026-1001"
  name: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstNumber?: string;
  fssaiNumber?: string;
  approvalStatus: ShopApprovalStatus;
  subscriptionPlanId: SubscriptionPlanId;
  subscriptionStatus: SubscriptionStatus;
  subscriptionStartDate?: string; // ISO string
  subscriptionExpiryDate?: string; // ISO string
  ownerIdVerified?: boolean; // Whether the shop owner's ID has been verified by admin
  ownerVerifiedAt?: string; // ISO string when verification occurred
  verifiedByAdmin?: string; // Admin username who performed verification
  ownerIdentityNumber?: string; // Aadhaar / PAN / Franchise Agreement ID
  createdAt: string;
  updatedAt: string;
}

export type ProductCategory = 
  | 'Milk'
  | 'Butter & Spreads'
  | 'Cheese & Paneer'
  | 'Ice Cream & Frozen'
  | 'Ghee & Dairy Fats'
  | 'Beverages & Buttermilk'
  | 'Chocolates & Sweets'
  | 'Curd & Yogurt'
  | 'Bakery & Snacks'
  | 'Others';

export interface Product {
  id: string;
  shopId: string;
  barcode: string; // EAN-13 or Code-128
  sku: string;
  name: string;
  regionalName?: string;
  category: ProductCategory;
  unit: 'Pouch' | 'Pack' | 'Cup' | 'Cone' | 'Tub' | 'Bottle' | 'Tin' | 'Brick' | 'Kg' | 'Litre' | 'Piece';
  mrp: number;
  costPrice: number;
  sellingPrice: number;
  currentStock: number;
  minStockAlert: number;
  imageUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type StockMovementType = 
  | 'IN' // Stock received from distributor / Amul supply
  | 'OUT' // Stock damaged / internal consumption
  | 'PURCHASE' // Automatically added when purchase bill is CONFIRMED
  | 'PURCHASE_CANCEL' // Deducted if a confirmed purchase is cancelled
  | 'SALE' // Deducted automatically upon bill completion
  | 'SALE_RETURN' // Restored upon bill refund / cancellation
  | 'ADJUSTMENT' // Physical inventory count correction
  | 'EXPIRY_DAMAGE'; // Dump / expired milk pouches

export interface StockMovement {
  id: string;
  shopId: string;
  productId: string;
  productName: string;
  barcode: string;
  movementType: StockMovementType;
  quantity: number; // Positive number
  unitPrice: number; // Cost or selling price at time of movement
  reason: string;
  referenceNumber?: string; // e.g., Purchase Invoice # or Sale Bill #
  notes?: string;
  timestamp: string; // ISO-8601 UTC
  createdBy: string;
}

export type PaymentMode = 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'BANK_TRANSFER' | 'CHEQUE';
export type SaleBillStatus = 'COMPLETED' | 'CANCELLED' | 'FAILED';

export interface SaleItem {
  productId: string;
  productName: string;
  barcode: string;
  quantity: number;
  unit: string;
  mrp: number;
  unitPrice: number;
  costPrice: number;
  total: number;
}

export interface SaleBill {
  id: string;
  billNumber: string; // e.g. "BILL-20261027-001"
  shopId: string;
  timestamp: string; // ISO-8601 UTC
  items: SaleItem[];
  itemCount: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  roundOff: number;
  finalAmount: number;
  paymentMode: PaymentMode;
  customerName?: string;
  customerPhone?: string;
  status: SaleBillStatus;
  cashierName: string;
  notes?: string;
  idempotencyKey: string; // Prevents duplicate billing / stock deduction
  createdAt: string;
}

// ==========================================
// SUPPLIERS & PURCHASES
// ==========================================

export interface Supplier {
  id: string;
  shopId: string;
  name: string;
  companyName: string; // e.g. "GCMMF Anand Depot" or "Kheda Dairy Union"
  phone: string;
  email?: string;
  address?: string;
  gstin?: string;
  currentBalance: number; // Positive = we owe supplier (Payable)
  createdAt: string;
  updatedAt: string;
}

export type PurchaseBillStatus = 'CONFIRMED' | 'DRAFT' | 'CANCELLED';

export interface PurchaseItem {
  productId: string;
  productName: string;
  barcode: string;
  quantity: number;
  unit: string;
  purchaseRate: number; // Wholesale cost
  mrp: number;
  total: number;
}

export interface PurchaseBill {
  id: string;
  purchaseInvoiceNumber: string; // e.g. "INV-AMUL-9982"
  shopId: string;
  supplierId: string;
  supplierName: string;
  purchaseDate: string; // ISO date YYYY-MM-DD
  items: PurchaseItem[];
  itemCount: number;
  subtotal: number;
  taxAmount: number;
  otherCharges: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  status: PurchaseBillStatus;
  paymentMode: PaymentMode;
  paymentReference?: string;
  stockPosted: boolean; // True if added to product inventory
  notes?: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierPayment {
  id: string;
  shopId: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  paymentDate: string;
  paymentMode: PaymentMode;
  referenceNumber?: string;
  notes?: string;
  createdAt: string;
}

// ==========================================
// EXPENSES & FINANCIAL AUDIT
// ==========================================

export type ExpenseCategory = 
  | 'Rent'
  | 'Electricity & Cold Storage'
  | 'Staff Wages'
  | 'Transport & Delivery'
  | 'Packaging & Ice Bags'
  | 'Maintenance & Repairs'
  | 'Miscellaneous';

export interface Expense {
  id: string;
  shopId: string;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  amount: number;
  paymentMode: PaymentMode;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

// ==========================================
// REPORTS & SUMMARIES
// ==========================================

export interface DailyStockReportRow {
  productId: string;
  productName: string;
  barcode: string;
  category: ProductCategory;
  unit: string;
  openingStock: number;
  stockIn: number; // Includes purchase delivery + manual Stock In
  salesQty: number; // Deducted by sales
  stockOut: number; // Damaged, leakages, manual Stock Out
  closingStock: number;
  minStockAlert: number;
  isLowStock: boolean;
}

export interface DailySalesReportSummary {
  date: string;
  totalBills: number;
  totalAmount: number;
  totalCostOfGoodsSold: number;
  grossProfit: number; // totalAmount - totalCostOfGoodsSold
  totalItemsSold: number;
  cashAmount: number;
  upiAmount: number;
  cardAmount: number;
  creditAmount: number;
  cancelledBillsCount: number;
  bills: SaleBill[];
  productSummaries: {
    productId: string;
    productName: string;
    barcode: string;
    category: ProductCategory;
    quantitySold: number;
    revenue: number;
    cost: number;
    profit: number;
  }[];
}

export interface DailyFinancialSummary {
  date: string;
  salesRevenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  purchasesTotal: number;
  expensesTotal: number;
  netOperatingProfit: number; // Gross Profit - Expenses
  cashInHand: number;
  upiInBank: number;
  supplierPayables: number;
}

// ==========================================
// AUTOMATED BACKUP & INTEGRITY MANIFEST
// ==========================================

export interface BackupManifest {
  version: number;
  exportedAt: string;
  shopId: string;
  appName: string;
  counts: {
    shops: number;
    products: number;
    stockMovements: number;
    sales: number;
    purchases: number;
    suppliers: number;
    supplierPayments: number;
    expenses: number;
  };
  checksum: string;
  generator: string;
}

export interface LocalDatabaseExport {
  manifest: BackupManifest;
  shops: Shop[];
  products: Product[];
  stockMovements: StockMovement[];
  sales: SaleBill[];
  purchases: PurchaseBill[];
  suppliers: Supplier[];
  supplierPayments: SupplierPayment[];
  expenses: Expense[];
  settings?: Record<string, any>;
}

export interface StoredBackupRecord {
  id: string;
  shopId: string;
  backupDate: string; // YYYY-MM-DD
  createdAt: string; // ISO timestamp
  type: 'AUTO' | 'MANUAL' | 'SAFETY_PRE_RESTORE';
  manifest: BackupManifest;
  data: LocalDatabaseExport;
}

export interface BackupSettings {
  autoBackupEnabled: boolean;
  scheduledTime: string; // "20:00"
  retentionDays: number; // e.g. 14
  lastBackupDate?: string;
  lastBackupTimestamp?: string;
  lastBackupStatus?: 'SUCCESS' | 'FAILED' | 'PENDING';
  lastBackupError?: string;
}

// ==========================================
// SYNC OUTBOX (FOR FUTURE BACKEND LINK)
// ==========================================

export interface SyncOutboxEntry {
  id: string;
  shopId: string;
  entityType: 'SHOP' | 'PRODUCT' | 'SALE' | 'PURCHASE' | 'MOVEMENT' | 'SUPPLIER' | 'EXPENSE';
  entityId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: any;
  clientTimestamp: string;
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
  retryCount: number;
  lastError?: string;
}
