# Pre-fill Amul Catalog with 0 Stock & Role-Based Navigation Optimization

Pre-fill the authentic 65+ Amul catalog with 0 initial stock quantity across all shops (making purchase entry and barcode scanning instant) and streamline role-based navigation so Shop Profile and Bank Statement are directly available to Cashiers, while the Admin tab is reserved strictly for franchise management and subscription plans.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> - **Catalog 0-Stock Initialization**: When any shop (new or existing) has 0 products, the system will automatically seed all 65+ authentic Amul products (Milk, Curd, Ghee, Butter, Paneer, Ice Cream, Chocolates, Beverages) with their genuine EAN-13 barcodes, MRP, and **quantity = 0**. This allows immediate stock inwards and purchases without manual product typing.
> - **One-Click Catalog Replenish**: In the Catalog tab, a dedicated button *"Pre-fill Master Amul Catalog (0 Stock)" (અમુલ કેટલોગ 0 સ્ટોક સાથે ભરો)* will allow shop owners to restore or refresh the complete Amul product master list anytime.
> - **Role Separation**: Cashier / Shop Counter users will have direct, prominent access to **Shop Profile & QR** and **Bank Statement**, while the **Admin & Shops** tab will be hidden from cashiers and shown only to logged-in Master Administrators.

---

### 1. Overview & Core Concept

- **What It Does**:
  1. Ensures no shop ever sees an empty or blank catalog. All standard Amul items are pre-loaded with official barcodes and zero quantity.
  2. Enables immediate purchase entry (`Purchases Khata`) where the merchant only needs to scan the barcode or select an item and enter the received quantity and cost.
  3. Tailors the user interface to counter reality: Cashiers need fast billing, stock checks, bank passbook tracking, and payment QR settings. The Master Admin portal is reserved exclusively for the app owner for shop onboarding, franchise approvals, and subscription plan management.

- **Target Audience / Persona**:
  - **Amul Parlour Cashier / Franchise Owner**: Operates daily billing, tracks UPI payments, inputs purchase deliveries, and updates bank QR.
  - **Master Admin**: App owner registering new parlour franchises and configuring subscription plans.

---

### 2. User Experience & Visual Design

- **Navigation Restructuring**:
  - **For Shop Counter / Cashier (`SHOP_USER`)**:
    - Top Header and Right Dock will prominently feature:
      1. `POS Billing` (કાઉન્ટર બિલિંગ)
      2. `Purchases` (માલ ખરીદી & સ્ટોક ઇનવર્ડ)
      3. `Stock Reports` (સ્ટોક ઓડિટ)
      4. `Daily Sales` (દૈનિક વેચાણ)
      5. `PDF Reports` (રિપોર્ટ્સ હબ)
      6. `P&L & Expenses` (ખર્ચ)
      7. `Bank Statement` (બેંક એન્ટ્રી & પાસબુક)
      8. `Shop Profile & QR` (દુકાન પ્રોફાઇલ & સેટિંગ્સ)
      9. `Product Catalog` (પ્રોડક્ટ કેટલોગ - 65+ આઇટમ્સ)
      10. `Backup & Safety` (બેકઅપ)
    - The `Admin & Shops` tab is **hidden** for Cashiers so they never see or get confused by franchise management.
  - **For Master Admin (`ADMIN`)**:
    - Direct access to `Admin HQ Portal` for registering new shops, viewing subscription status, and resetting cashier credentials, with the ability to inspect any shop counter.

- **Catalog Experience**:
  - Zero-state banner replaced with auto-populated 65+ Amul inventory cards showing `Stock: 0 નંગ (Out of Stock / Ready for Purchase)`.
  - In Purchase Entry (`Purchases Khata`), typing or barcode scanning instantly auto-completes any Amul product so cashiers only type the received quantity.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Automatic 0-Stock Seeding on New Shop Creation and on Retrieval**
  - *Chosen Approach*: Update `saveShop` in `src/storage/db.ts` and `AdminPortal.tsx` to automatically seed the 65+ Amul items with `currentStock = 0` whenever a new shop is created. In addition, `getProductsByShop` will auto-seed if a shop has 0 items.
  - *Why*: Eliminates the "blank catalog" issue forever, regardless of how or when a shop was registered.

- **Decision 2: Cashier Direct Access to Bank & Profile**
  - *Chosen Approach*: Keep `BANK` and `PROFILE` tabs permanently available for authenticated cashier sessions in both `Header.tsx` and `RightSideNavigation.tsx`. Hide `ADMIN` tab if `session.role !== 'ADMIN'`.
  - *Why*: Directly aligns with user requirement ("admin to khali mara mate chhe, shop profile and bank statement shop login ma aapo").

---

### 4. Technical Architecture & Component Mapping

```
┌────────────────────────────────────────────────────────┐
│                   Dual Authentication                  │
│   Cashier Login (Shop Counter) │ Admin Login (Owner)   │
└───────────────┬──────────────────────────┬─────────────┘
                │                          │
        Role: SHOP_USER               Role: ADMIN
                │                          │
┌───────────────▼────────────────┐ ┌───────▼─────────────┐
│     Shop Counter Interface     │ │  Master Admin HQ    │
│  - POS Billing (Fast Scan)     │ │  - Shop Onboarding  │
│  - Purchases (Pre-filled items)│ │  - Subscriptions    │
│  - Bank Statement & Passbook   │ │  - Credential Reset │
│  - Shop Profile & Merchant QR  │ └─────────────────────┘
│  - Catalog (65+ Amul items)    │
│  - Reports & Daily Sales       │
└────────────────────────────────┘
```

- **Database Layer (`src/storage/db.ts`)**:
  - In `getProductsByShop(shopId)`: If product count for `shopId` is 0, auto-insert all 65+ `getSeedProductsForShop(shopId)` with `currentStock: 0`.
  - In `AdminPortal.tsx` shop creation handler: Immediately call `seedShopAmulCatalog(newShop.id)`.
  - Add `resetShopCatalogToDefault(shopId)` utility to restore default Amul items with 0 stock.

- **Navigation Components (`Header.tsx` & `RightSideNavigation.tsx`)**:
  - Conditional rendering: only show `ADMIN` tab button when `currentUser?.role === 'ADMIN'`.
  - Ensure `BANK` and `PROFILE` tabs are prominently positioned and styled for shop users.

---

### 5. Duplicate Items Detection & Resolution Engine
- **Dedicated Tab in Catalog**:
  - `બધી પ્રોડક્ટ્સ / All Products ({count})` vs `ડુપ્લિકેટ આઇટમ્સ / Duplicate Items ({count})`.
  - Grouping engine detects duplicates matching on exact barcodes, SKUs, or normalized names with unit variations (e.g. `500 ml` vs `500ml`).
  - Identifies primary recommended keeper based on highest stock, valid barcode, and recency.
  - One-click actions: "સ્ટોક મર્જ કરી ડિલીટ (Merge Stock & Delete Duplicate)", "ડિલીટ / Delete Duplicate", and "તમામ ડુપ્લિકેટ્સ મર્જ કરો / Auto-Merge All".
  - Real-time Firestore synchronizer instantly updates and propagates deletions and stock updates across all connected devices and browser profiles.
