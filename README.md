# Amul Parlour Web POS & Management Portal (Project 2 of 3)

Local-first, production-ready Point of Sale (POS) and franchise retail management portal built specifically for Amul Parlour operations. Designed for our exact **3-Project Architecture**:
1. **Existing Android App** (Kotlin Room / Retrofit)
2. **Existing Website** (React + TypeScript Local-First IndexedDB)
3. **Shared Backend API + PostgreSQL** (Node.js, Express, Cloud SQL)

---

## 🚀 Running Locally on Windows 11 PC

### Prerequisites
- Node.js (v18 or v20+ recommended)
- Modern web browser (Google Chrome, Microsoft Edge, Brave)
- Optional Hardware:
  - Standard USB HID Barcode Scanner (Keyboard emulation mode)
  - 58mm (2-inch) or 80mm (3-inch) USB / Bluetooth Thermal POS Receipt Printer

### Setup & Launch
1. Open Windows Terminal / PowerShell in the website project root:
   ```powershell
   npm install
   npm run dev
   ```
2. Open your browser to:
   ```
   http://localhost:3000
   ```
3. The application will initialize the local-first IndexedDB database (`AmulParlourDB` v2) with authentic Amul products, demo shops, and GCMMF suppliers.

---

## 📋 Comprehensive Operational Workflows

### 1. Barcode POS Billing & USB Scanner
- Plug in your USB keyboard-mode barcode scanner.
- In **POS Billing**, scan any Amul product barcode (e.g. `8901262010014` for Amul Taaza 500ml, `8901262010151` for Amul Butter 100g, `8901262010205` for Cheese Slices).
- Repeated scans automatically increase item quantity with audio confirmation.
- Modify quantities, apply discounts, or enter customer phone number.
- Choose payment mode: **Cash**, **UPI Dynamic QR**, **Card**, or **Customer Khata / Credit**.
- Click **Complete Sale & Print Receipt**. Stock is deducted atomically, idempotency is enforced, and the thermal receipt modal opens.

### 2. Thermal Receipt Printing (58mm & 80mm)
- Toggle between **58mm (2-inch)** and **80mm (3-inch)** roll paper layouts.
- Click **Print Receipt**. The browser print dialog opens with custom `@media print` CSS for 0-margin roll paper. Select your USB thermal printer or Microsoft Print to PDF.

### 3. Purchase Bill Entry & Stock Replenishment
- Click **Purchases** in the top navigation.
- Click **New Purchase Entry**.
- Select the distributor (e.g. *GCMMF Anand Central Depot*), enter the invoice number, and add delivered items (quantity and wholesale cost rate).
- **Critical Business Rule**:
  - **CONFIRMED** purchases automatically increase product inventory and update the supplier's payable balance.
  - **DRAFT** purchases save without altering inventory stock.
  - Cancelling a confirmed purchase automatically reverses the added stock with an audited `PURCHASE_CANCEL` record.

### 4. Supplier Ledger & Payment Khata
- Click the **Supplier Ledger & Payables** sub-tab in Purchases.
- View real-time outstanding payable balances for all distributors.
- Click **Record Payment** when paying by Cheque or NEFT/Bank Transfer. This reduces the outstanding payable balance.

### 5. Daily Stock Reports & Reconciliations
- Click **Stock Reports** to inspect:
  $$\text{Closing Stock} = \text{Opening Stock} + \text{Stock In / Purchases} - \text{Sales Quantity} - \text{Stock Out / Leakage}$$
- View movement history logs with reason, timestamp, and reference number.
- Download reports as **CSV** for accounting.
- Use **Stock In / Out** to log crate arrivals or damaged/expired milk pouches.

### 6. Operating Expenses & Profit/Loss Reconciliation
- Click **P&L & Expenses** in top navigation.
- Strictly separates gross sales revenue from accounting profit:
  $$\text{Gross Profit} = \text{Sales Revenue} - \text{Cost of Goods Sold (COGS)}$$
  $$\text{Net Operating Profit} = \text{Gross Profit} - \text{Operating Expenses}$$
- Log expenses for Electricity (deep freezers), Shop Rent, Wages, or Packaging.
- Inspect the live **Cash Drawer** balance.

### 7. Product Catalog Management & Barcode Assignment
- Click **Catalog** to add or edit product SKUs.
- Assign genuine barcodes, set packaging units (Pouch, Pack, Cup, Tub, etc.), wholesale cost, retail selling price, printed MRP, and low-stock alert thresholds.

### 8. Admin Portal & Shop Provisioning
- Click **Admin & Shops** (Local PIN: `8888`).
- Generate unique Shop IDs (e.g. `AP-2026-XXXX`).
- Manage shop records, franchise owner contact details, and locations.
- **Approval vs Subscription Separation**: Approving a shop does NOT activate its subscription. Subscriptions (Trial ₹0, Basic ₹300, Pro ₹500) are activated separately.

---

## 💾 Automatic Daily Backup & Integrity System

### How It Works in Browser
- **Schedule**: Defaults to taking a snapshot once per calendar day at **8:00 PM (20:00)** local time while the website is open.
- **Snapshot Storage**: Full-data snapshots are stored locally inside the `backups` object store in IndexedDB, retaining the last 14 days of history.
- **Manifest & Checksum**: Each backup includes schema version, timestamp, record counts, and a SHA-256 integrity checksum.
- **Export to PC**: In **Backup / Restore**, click **Backup Now** or click **Download** on any historical snapshot to save the `.json` file to your PC or USB drive.
- **Missed Backup Detection**: If your PC was shut down or the browser was closed at 8:00 PM yesterday, a banner alerts you upon opening the site with a one-click **Backup Now** trigger.
- **Restore Safety**: Uploading a backup validates schema and integrity before prompting you for confirmation.

---

## 🧪 Automated Testing

### In-Browser Interactive Suite
Click **Verify System** (flask icon in the header) to run all 11 test suites live against your browser's IndexedDB engine:
1. IndexedDB persistence & v2 schema stores
2. Stock movement atomic updates & deductions
3. Confirmed purchase stock increases (exactly once)
4. Draft & cancelled purchase immunity
5. Daily stock audit reconciliation formula
6. Financial P&L (Revenue vs COGS vs Net Profit)
7. Duplicate-sale prevention & idempotency
8. Sale cancellation & stock restoral
9. Multi-tenant shop isolation
10. Backup snapshot & manifest checksum
11. Missed backup detection

### Command-Line Suite
Run automated unit tests in terminal:
```powershell
npm test
```

---

## 🔗 Future Migration to Shared Backend & Android App

When you are ready to connect Project 3 (Shared Express + PostgreSQL Backend):
1. **Export Local Data**: On the website, open **Backup / Restore** -> click **Download Backup JSON**.
2. **Configure Backend URL**: In `.env`, configure:
   ```env
   VITE_API_BASE_URL="https://your-backend-api.run.app"
   ```
3. **Repository Switch**: `AppRepository` will automatically switch from local IndexedDB to the shared REST API endpoints defined in `API_CONTRACT.md`.
4. Both the Android app and website will share the centralized PostgreSQL database with full shop-level tenant isolation.
