# Amul Parlour POS: Comprehensive Manual Testing & Verification Checklist

This manual checklist is designed for QA testers, store managers, and developers deploying the Amul Parlour Web POS on Windows 11, Windows 10, Windows 8.1, and Windows 7 (with modern browsers).

---

## 1. First Launch & Browser Storage Initialization
- [ ] **First Launch:** Open the web application URL (`localhost:3000` or Cloud Run URL).
- [ ] **Database Initialization:** Verify the app initializes the local IndexedDB database (`AmulParlourDB` v2) and loads the default seed shops (`AP-2026-1001` Anand Station, `AP-2026-1002` Vadodara Dairy Outlet).
- [ ] **Default Selection:** Verify the header shop switcher selects the first approved shop with an active subscription.
- [ ] **Catalog Pre-Population:** Navigate to **POS Billing** and verify Amul product SKUs (Milk, Butter, Cheese, Ice Creams, Paneer, Ghee, Shrikhand) appear in catalog list with correct pricing.
- [ ] **Browser Refresh:** Press `F5` / `Ctrl+R`. Verify the app reloads seamlessly without losing active shop selection or seeded data.
- [ ] **Storage Error Handling:** Test opening in a browser with storage disabled or private window with blocked storage. Verify the clear error card displays with supported browser guidance and a **Retry Initialization** button.

---

## 2. Shop Login & Admin Portal
- [ ] **Open Admin Portal:** Click **Admin & Shops** tab in the top navigation bar.
- [ ] **Default Mode Notice:** Verify the clear badge explains that client-only authentication is for local development, with a shared backend connecting later.
- [ ] **Admin Login:** Click **Sign In as System Admin** with demo passkey `amuladmin2026` (or quick demo login).
- [ ] **Shop Approval Separation:** Create a new shop. Verify its **Approval Status** is `PENDING` and **Subscription Status** is `INACTIVE`.
- [ ] **Approve Shop:** Click **Approve Shop**. Verify approval status changes to `APPROVED`, but subscription status remains `INACTIVE` (enforcing strict business rule separation).
- [ ] **Activate Subscription:** Select plan (Trial ₹0, Basic ₹300, or Pro ₹500) and click **Activate Subscription**. Verify subscription status changes to `ACTIVE`.

---

## 3. Product Catalog Management
- [ ] **Add New Product:** Navigate to **Catalog** tab. Click **Add New Product**.
- [ ] **Fill Details:** Enter Product Name, Barcode (`8901262...`), Category (`Milk & Dairy`), MRP, Unit Price, Cost Price, Unit (`Pouch`/`Pack`), and Initial Stock.
- [ ] **Save & Verify:** Click Save. Verify product appears in catalog with correct current stock and active badge.
- [ ] **Edit Product:** Click **Edit** on an existing SKU. Update price or stock threshold. Save and verify changes persist across tab navigation.

---

## 4. Barcode Billing & USB HID Scanner Operations
- [ ] **USB Scanner Hardware Test:** Connect a USB keyboard-mode barcode scanner. Scan an authentic Amul product barcode (e.g. `8901262010014` for Taaza 500ml).
- [ ] **Automatic Cart Addition:** Verify the item is immediately added to the cart, the scanner input clears, a crisp audio beep plays, and a green success banner appears.
- [ ] **Repeated Scans:** Scan the same barcode 3 times. Verify the item quantity increases to 3 and line total multiplies accurately ($$3 \times 27 = 81$$).
- [ ] **Manual Entry Fallback:** Type barcode into input field and press Enter. Verify identical behavior.
- [ ] **Invalid Barcode Handling:** Scan an uncataloged barcode. Verify a low error beep plays and an error banner explains `Barcode [...] not found in this shop's catalog`.
- [ ] **Keyboard Isolation:** Focus on the Customer Phone or Customer Name input field. Type numbers/letters. Verify typing in form fields is not intercepted as barcode scanner input.
- [ ] **Financial Totals:** Verify Subtotal, Discount, Tax, Round-Off, and Net Payable calculations match the exact math.

---

## 5. Completing a Sale & Stock Deduction
- [ ] **Cash Payment:** Click **Cash ₹[Amount]**.
- [ ] **Atomic Stock Deduction:** Verify the sale completes, cart empties, and inventory for sold SKUs decrements exactly by the sold quantities.
- [ ] **Thermal Receipt Modal:** Verify the receipt preview modal immediately opens showing the exact sale invoice details.
- [ ] **Reprint Test:** In the receipt modal, click **Print Receipt (58mm)** or **(80mm)**.
- [ ] **Zero-Mutation Guarantee:** Verify that clicking Print Receipt or closing and reopening the preview NEVER creates a second sale or decrements stock again.

---

## 6. Thermal Printing (USB & Bluetooth)
- [ ] **58mm Roll Formatting (2-inch roll):**
  - Toggle width switch to **58mm (2")**.
  - Verify layout uses compact stacked 2-line rendering (Product Name on line 1, Qty x Rate and Line Total on line 2).
  - Verify horizontal text is not clipped.
- [ ] **80mm Roll Formatting (3-inch roll):**
  - Toggle width switch to **80mm (3")**.
  - Verify layout uses 4-column grid (`Item`, `Qty`, `Rate`, `Amt`).
- [ ] **Print Dialog Settings (Chrome / Edge):**
  - Click **Print Receipt**.
  - In dialog: Select Destination printer (USB or paired Bluetooth printer).
  - Select Paper Size: `58mm x Receipt` or `80mm x Receipt`.
  - Set Margins: **None** or **Minimum**.
  - Uncheck **Headers and footers** (prevents browser printing date/URL at top/bottom).
  - Verify preview shows only the receipt (no modal border, no dark overlay, no website header).
  - Print receipt. Verify physical tear-off has no blank pages trailing.

---

## 7. Purchase Bill Entry & Supplier Ledger
- [ ] **Add Purchase Bill:** Navigate to **Purchases** tab. Click **New Purchase Bill**.
- [ ] **Draft Purchase Test:** Create a purchase bill with status set to `DRAFT`. Verify saved purchase does NOT increment product inventory.
- [ ] **Confirmed Purchase Test:** Create a purchase bill with status set to `CONFIRMED`.
- [ ] **Inventory Increase:** Verify product stock immediately increases by the purchased quantity, cost price updates, and a `PURCHASE` movement is logged.
- [ ] **Supplier Balance:** Verify the supplier's payable balance increases by the unpaid invoice amount.
- [ ] **Record Supplier Payment:** Go to **Supplier Ledger**. Click **Record Payment**. Enter payment amount and reference. Verify supplier balance decreases accordingly.
- [ ] **Cancel Purchase:** Click **Cancel Bill** on a confirmed purchase. Verify stock decreases back, supplier balance reverses, and a `PURCHASE_CANCEL` movement is recorded.

---

## 8. Operating Expenses & Daily Financial P&L
- [ ] **Record Expense:** Navigate to **P&L & Expenses** tab. Record an expense (e.g., Deep Freezer Electricity ₹800 or Staff Wage ₹500).
- [ ] **Financial Audit Separation:**
  - Verify **Gross Sales Revenue** is total completed sales.
  - Verify **Gross Profit** is $$\text{Sales} - \text{COGS}$$ (Cost of Goods Sold).
  - Verify **Net Operating Profit** is $$\text{Gross Profit} - \text{Operating Expenses}$$.
  - Confirm the system does not confuse revenue with profit.

---

## 9. Daily Reports & Sales History
- [ ] **Daily Sales Report:** Navigate to **Daily Sales**.
- [ ] **Bill List:** Verify all completed sales bills appear with timestamp, payment mode, cashier, and net payable.
- [ ] **Reprint Past Bill:** Click the **Printer icon** next to any previous bill. Verify the thermal receipt opens with identical bill details without altering current inventory.
- [ ] **Cancel Bill & Return:** Click **Cancel** on a bill. Enter reason (e.g., "Customer returned sour pouch"). Verify the bill is marked `CANCELLED` and stock is restored via `SALE_RETURN` movement.
- [ ] **Daily Stock Report:** Navigate to **Stock Reports**. Verify the mathematical reconciliation formula holds:
  $$\text{Closing Stock} = \text{Opening Stock} + \text{Purchases/In} - \text{Sales} - \text{Out/Loss}$$

---

## 10. Backup, Disaster Recovery & Checksum
- [ ] **Manual Backup:** Click **Backup Now** in the Daily Backup modal.
- [ ] **PC Download:** Verify a JSON file (`Amul_POS_Backup_[ShopCode]_[Date].json`) downloads to the Windows PC.
- [ ] **Manifest & Checksum:** Open the JSON file in Notepad. Verify it contains `manifest.checksum` (SHA-256), record counts, and full tables.
- [ ] **Simulated Restore:** Click **Choose Backup File (.json)** and select the downloaded file. Verify confirmation dialog lists accurate counts and restoration completes safely.
- [ ] **Missed Backup Detection:** Verify that if the last backup was yesterday, the yellow banner alerts the cashier: *"Scheduled daily backup missed for [ShopCode]. Create backup now."*

---

## 11. Cross-Browser & Windows OS Compatibility Matrix

| OS / Environment | Supported Browsers | Expected Behavior |
| :--- | :--- | :--- |
| **Windows 11** | Chrome 120+, Edge 120+, Firefox 125+ | Full support; native USB & Bluetooth spooler printing |
| **Windows 10** | Chrome 120+, Edge 120+, Firefox 125+ | Full support; native USB & Bluetooth spooler printing |
| **Windows 8.1 / 7** | Chrome 109 (last supported), Firefox ESR 115 | Full local POS & IndexedDB support; uses crypto fallback if subtle unavailable |
| **Legacy IE / Pre-Chromium** | Internet Explorer 11 / Legacy Edge | **Unsupported**; displays clear browser requirement card |
| **Screen Sizes** | 1080p, 720p, 1366x768 laptops, POS touch displays | Responsive grid with overflow scrollbars for narrow views |
