# Windows 11 Thermal Receipt Printer Setup & Verification Checklist
## Amul Parlour POS (Local-First React + TypeScript POS)

This checklist provides step-by-step guidance for setting up, calibrating, and testing **58mm (2-inch)** and **80mm (3-inch)** thermal receipt printers connected via **USB** or **Bluetooth** to a **Windows 11 PC**.

---

### Architecture & Truthful Printing Mechanism
- The Amul Parlour web application uses the browser's standard printing mechanism (`window.print()`).
- In modern web browsers (Chrome, Edge, Firefox), web applications **cannot directly send raw byte commands to arbitrary USB or Bluetooth hardware** without operating system printer spooler drivers or native bridges.
- Therefore, both USB and Bluetooth thermal printers must be recognized by Windows 11 as a printer. Once recognized in Windows 11, the browser sends clean, CSS-calibrated vector/text receipts to the printer with zero clipping and zero blank pages.
- **No fake connection status:** The web application never claims to detect hardware presence that the browser cannot physically verify.

---

### SECTION 1: USB Thermal Printer Setup on Windows 11

1. **Physical Connection:**
   - Plug the thermal printer's USB cable into a USB 2.0/3.0 port directly on the Windows 11 PC (avoid unpowered USB hubs).
   - Turn on the printer power switch. Verify the power LED is illuminated solid (Green or Blue).
   - Ensure the thermal paper roll is inserted with the heat-sensitive side facing the thermal print head (paper feeding from underneath the roll).

2. **Driver Installation:**
   - Most thermal receipt printers (Xprinter, POS-58, POS-80, Epson TM-T20/TM-T82, TVS, Rongta, Everycom) include a Windows driver CD or download link.
   - Run the driver installer as Administrator. Select your OS (**Windows 11 / Windows 10**), port (**USB001 / USB002** or Auto-detect), and printer model (**POS-58** for 58mm or **POS-80** for 80mm).
   - If the manufacturer driver is not available, Windows Generic / Text Only or standard POS-58/80 ESC/POS drivers work reliably.

3. **Verify in Windows 11 Settings:**
   - Open **Windows Settings** (`Win + I`) > **Bluetooth & devices** > **Printers & scanners**.
   - Confirm your printer appears in the list (e.g., `POS-58`, `POS-80`, or `EPSON TM-T82 Receipt`).
   - Click the printer name > **Printer properties** > **Print test page**. The printer should feed and print a Windows test page.

---

### SECTION 2: Bluetooth Thermal Printer Setup on Windows 11

1. **Power & Pairing Mode:**
   - Turn on the Bluetooth thermal printer.
   - If the printer has a pairing button, press and hold it until the Bluetooth LED blinks rapidly.

2. **Pair Device in Windows 11:**
   - On Windows 11: Open **Settings** > **Bluetooth & devices**.
   - Ensure Bluetooth is toggled **ON**.
   - Click **Add device** > choose **Bluetooth**.
   - Windows will scan and list nearby devices (e.g., `MTP-II`, `POS-58-BT`, `RPP02N`, or `Bluetooth Printer`).
   - Click the printer name. When prompted for a PIN, enter the default manufacturer PIN:
     - Usually **`0000`** or **`1234`** (consult printer label).
   - Windows will confirm: *"Your device is ready to go!"*

3. **Check Windows Outgoing Virtual COM Port & Spooler:**
   - Open **Settings** > **Bluetooth & devices** > **More Bluetooth settings** > **COM Ports**.
   - Note the outgoing COM port (e.g., `COM3` or `COM4`).
   - If your printer model requires a spooler driver, run the manufacturer's Bluetooth setup tool to bind the COM port to a Windows printer instance.
   - Once mapped, the printer will be selectable in the Chrome/Edge print dialog just like a USB printer.

---

### SECTION 3: Chrome / Microsoft Edge Print Dialog Calibration

When you click **Print Receipt** in the Amul Parlour POS, the browser print dialog opens (`Ctrl+P` equivalent). Follow these exact settings for flawless receipts:

| Setting | Required Value | Rationale |
| :--- | :--- | :--- |
| **Destination** | Select your thermal printer (e.g. `POS-58` or `POS-80`) | Directs output to thermal spooler |
| **Pages** | `All` | Single-page thermal roll |
| **Layout** | `Portrait` | Standard receipt orientation |
| **Paper Size** | `58mm x Receipt` / `80mm x Receipt` / `Roll Paper` | Avoids A4/Letter size pagination |
| **Margins** | **`None`** or **`Minimum`** | **CRITICAL:** Default 0.4" margins will clip 58mm text and push content to a 2nd page |
| **Scale** | **`100%`** or **`Fit to printable area`** | Preserves designed font sizes (10px / 12px) |
| **Headers and Footers** | **`UNCHECKED`** | **CRITICAL:** If checked, Chrome prints the website URL, page title, and timestamp at top & bottom |
| **Background Graphics** | `Checked` (optional, no heavy fills used) | Ensures crisp dashed borders |

> **Pro Tip for POS Cashiers:** Once you set Margins to *None* and uncheck *Headers and footers*, Chrome and Edge remember these settings for that printer destination on subsequent prints.

---

### SECTION 4: 58mm (2-Inch) vs 80mm (3-Inch) Layout Guide

| Characteristic | 58mm Roll (2-inch) | 80mm Roll (3-inch) |
| :--- | :--- | :--- |
| **Physical Roll Width** | 57mm - 58mm | 79mm - 80mm |
| **Effective Printable Area**| ~48mm (384 dots @ 203 DPI) | ~72mm (576 dots @ 203 DPI) |
| **Item Line Layout** | **Stacked 2-Line:**<br>Line 1: Product Name<br>Line 2: `Qty Unit x ₹Rate` ... `Total` | **4-Column Grid:**<br>`Item` (span 6) \| `Qty` (span 2) \| `Rate` (span 2) \| `Amt` (span 2) |
| **Font Size in CSS** | `10px` monospace, `line-height: 1.25` | `12px` monospace, `line-height: 1.35` |
| **Best For** | Milk booths, ice cream kiosks, quick counters | Full grocery parlour, bulk purchases, detailed invoices |

---

### SECTION 5: Billing & Reprint Workflow Verification

1. **Exactly-Once Sale & Stock Reduction:**
   - Complete a sale by clicking **Cash ₹...** or **UPI QR & Collect**.
   - The sale bill is created in IndexedDB with a unique `idempotencyKey` and `billNumber`.
   - Shelf stock decrements **exactly once**.
   - The thermal receipt preview modal opens with the saved bill.

2. **Reprinting Never Deducts Stock:**
   - Click **Print Receipt** multiple times or cancel and click again.
   - Close the receipt preview.
   - Go to **Daily Reports** > **Daily Sales** > Click the **Printer icon** next to the invoice.
   - The receipt modal displays the stored bill.
   - **Verification:** Inventory and ledger records are untouched. No duplicate bill is generated.

3. **Cancelled Sales Protection:**
   - If a bill is cancelled in Daily Reports, reprinting it prints a clear **`*** CANCELLED SALE ***`** border warning, preventing fraudulent returns.

---

### SECTION 6: Troubleshooting Blank Pages & Clipped Text

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| **Extra blank page ejected after receipt** | Browser margin or `@page` overflow | In browser print dialog, set **Margins = None**. Our CSS defines `@page { margin: 0; }` and `page-break-inside: avoid;`. |
| **Website navigation/background prints** | Faulty print CSS visibility | We use `@media print` with `.no-print { display: none !important; }` and flatten the modal to `position: static`. |
| **Right side of prices clipped on 58mm** | 58mm roll using 80mm layout or margins > 0 | Switch toggle in receipt header to **58mm (2")**, and set print dialog margins to **None**. |
| **URL or date printed at top and bottom** | Chrome header/footer setting | In Chrome/Edge print dialog, uncheck **"Headers and footers"**. |
| **Blank white paper feeds with no ink** | Roll inserted backwards | Thermal paper only prints on one side. Flip roll so paper unwinds from the bottom toward the tear bar. |
| **Bluetooth printer disconnected after idle** | Windows Bluetooth power saving | In Windows Device Manager > Bluetooth adapter > Properties > Power Management, uncheck *"Allow the computer to turn off this device to save power"*. |

---

### SECTION 7: Running Automated Verification Tests

The application includes automated tests verifying the thermal receipt formatting, roll dimensions, idempotency, and reprint immutability:

- **Command Line (Vitest):**
  ```bash
  npm test
  ```
  Runs 21 unit tests covering all financial rules, 58mm/80mm layout constraints, and stock deductions.

- **In-Browser Interactive Runner:**
  Click **Run Automated Tests** in the Amul Parlour website header. Tests #12 and #13 live-test thermal print formatting and reprint immutability directly in the browser.
