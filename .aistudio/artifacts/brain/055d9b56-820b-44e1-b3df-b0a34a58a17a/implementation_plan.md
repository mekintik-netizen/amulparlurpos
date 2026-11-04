# Purchase Bill Print Rebranding, Stock Report Zero-Stock Filter & Bank Passbook Print Stylesheet

A comprehensive upgrade to the print and reporting system in the Amul Parlour POS application:
1. Rebrand Purchase invoice print action and preview headers to prominently read **"BILL PRINT"** with a clean A4 invoice layout.
2. Filter out zero-stock items from both the Stock Report display and print view so only active available items (**quantity $\ge 1$**) are shown and printed, saving paper pages.
3. Implement a dedicated `@media print` stylesheet for Bank Passbook to automatically strip away webpage navigation bars, dock menus, filter controls, and action buttons, leaving a clean, official bank ledger document.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> - **Purchase Bill "BILL PRINT" Branding**: The purchase print action buttons (in the purchase history table, view modal, and purchase entry confirmation) and the printout header will explicitly and prominently display **"BILL PRINT"** (બિલ પ્રિન્ટ) while keeping the full A4 layout with parlour details, agency name, bill number, item table, and totals.
> - **Stock Report Active-Stock Rule**: Items with `closingStock <= 0` are automatically excluded from the stock report print layout and default table view, ensuring only items with **1 or more units** are printed. A quick filter toggle *"બધા આઇટમ્સ (Include 0 Stock)"* is available on screen for audit reconciliation without cluttering prints.
> - **Bank Passbook Print Layout Isolation**: When printing the passbook, all peripheral UI (main app header, right-side dock navigation, KPI stat cards, search bars, filter buttons, CSV buttons) are hidden via `@media print`. The print document features a parlour bank ledger header (Shop name, GSTIN, Bank A/C & IFSC, statement date range) followed by the clean transaction table with credit, debit, and running balance columns.

---

### 1. Overview & Core Concept

- **What It Does**:
  - Delivers dedicated, professional print outputs for two essential parlour workflows: Purchase Invoices ("BILL PRINT") and Bank Passbook Ledgers.
  - Streamlines daily stock audits by eliminating 0-stock clutter from printouts, condensing multi-page stock printouts into crisp, readable single/double pages.
- **Target Audience / Persona**:
  - **Amul Parlour Franchise Owner & Cashier**: Needs quick "BILL PRINT" receipts for distributor delivery acknowledgments, concise stock counts without blank lines, and clean bank passbook printouts for chartered accountants and tax audits.
- **Key Value**:
  - Paper conservation, faster physical verification, and clean official records without browser navigation artifacts.

---

### 2. User Experience & Visual Design

- **Purchase "BILL PRINT" Workflow**:
  - In Purchase Management table rows, action buttons include a blue/slate button labeled **"BILL PRINT"** with `<Printer />` icon.
  - In the View Purchase Details modal, a primary action button labeled **"BILL PRINT"** opens the A4 printable invoice.
  - The printed invoice header prominently features:
    ```
    ┌────────────────────────────────────────────────────────┐
    │                       BILL PRINT                       │
    │             Amul Parlour Purchase Invoice              │
    ├────────────────────────────┬───────────────────────────┤
    │ Parlour Details:           │ Agency & Invoice Details: │
    │ Anand Super Parlour        │ Shreeji Amul Agency       │
    │ GSTIN: 24AAACA1234A1Z5     │ Bill No: AMUL-BL-9821     │
    │ Phone: +91 98765 43210     │ Date: 02-Nov-2026         │
    ├────────────────────────────┴───────────────────────────┤
    │ Item Name       Qty   Unit   Cost Rate   MRP   Total   │
    │ Amul Taaza 500  40    Pouch  ₹24.50      ₹27   ₹980.00 │
    ├────────────────────────────────────────────────────────┤
    │ Total SKUs: 1   Total Units: 40    Grand Total: ₹980.00│
    └────────────────────────────────────────────────────────┘
    ```

- **Stock Report Zero-Stock Filter View**:
  - Both `DailyStockReport.tsx` and `ReportsHub.tsx` filter rows to `closingStock > 0`.
  - Header displays active count: e.g., *"સક્રિય સ્ટોક ધરાવતી આઇટમ્સ (Active Stock Items): 24"* (excluding 41 zero-stock products).
  - Print layout strictly excludes all items with 0 stock, ensuring compact paper usage.

- **Bank Passbook Clean Print View**:
  - When the cashier clicks **"પ્રિન્ટ પાસબુક" (Print Passbook)**, browser print preview displays:
    - Official Amul Parlour Bank Statement Header (Shop name, account number, IFSC, date window).
    - Summary row: Opening Balance, Total Credits, Total Debits, Closing Net Balance.
    - Transaction ledger: Date, Reference/Mode, Particulars/Party, Credit (+), Debit (-), Running Balance.
    - Total exclusion of webpage chrome, sidebars, dock buttons, and filter bars.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dedicated Print Modal & Printable Component for Purchase Bill**
  - *Chosen Approach*: Add a standalone printable invoice modal with `@media print` CSS so clicking "BILL PRINT" opens the preview and directly invokes `window.print()` with a dedicated print layout.
  - *Why*: Prevents modal backdrop or background purchase management controls from polluting the printout.

- **Decision 2: Stock Report Zero-Stock Filter Precedence**
  - *Chosen Approach*: Default `showZeroStock` to `false` in `DailyStockReport` and enforce `closingStock > 0` during print and PDF generation in both `DailyStockReport.tsx` and `ReportsHub.tsx`.
  - *Why*: Parlour catalogs often contain 65+ standard Amul items, of which only 15–25 are stocked on any given day. Printing zero-stock items wastes 3–4 pages of thermal or A4 paper.

- **Decision 3: Passbook Print Scoping via CSS Class**
  - *Chosen Approach*: Wrap the printable passbook ledger in `.passbook-printable-area` and apply `@media print` rules in `src/index.css` to hide all sibling elements (`header`, `.right-side-nav`, `.no-print`) when printing.
  - *Why*: Guarantees zero web clutter on any browser (Chrome, Edge, Firefox) without altering standard screen interactivity.

---

### 4. Technical Architecture & Component Mapping

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Amul Parlour POS                              │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
│  Purchase Management  │ │  Daily Stock Report   │ │ Bank Statement Passbk │
│  - "BILL PRINT" btn   │ │  - closingStock > 0   │ │  - .passbook-print    │
│  - PurchasePrintModal │ │  - Zero-stock filter  │ │  - @media print rule  │
│  - A4 invoice layout  │ │  - Paper optimization │ │  - Hide nav & chrome  │
└───────────────────────┘ └───────────────────────┘ └───────────────────────┘
```

- **Files to Modify / Enhanced**:
  1. `src/components/purchases/PurchaseManagement.tsx`: Added "BILL PRINT" action buttons and dedicated `PurchaseBillPrintModal` with "BILL PRINT" header; made actions column sticky (`sticky right-0`) and modal action controls sticky (`sticky top-0` and `sticky bottom-0`) with responsive scrolling containers.
  2. `src/components/reports/DailyStockReport.tsx`: Update row filtering to exclude `closingStock <= 0` by default and in print layout.
  3. `src/components/reports/ReportsHub.tsx`: Exclude `closingStock <= 0` in stock report view and CSV/print.
  4. `src/components/banking/BankStatementManagement.tsx`: Wrap passbook container with `.passbook-printable-document`, add passbook print header, and attach `.no-print` classes to web controls.
  5. `src/index.css`: Add `@media print` rules for `#purchase-bill-modal-overlay`, `#purchase-bill-modal-card`, `.purchase-printable-bill`, `.passbook-printable-document` and hide general webpage elements during printing.
  6. Unit tests: Create/update tests verifying "BILL PRINT" labeling, stock filtering (> 0), passbook print classes, sticky print controls, and responsive viewports.

