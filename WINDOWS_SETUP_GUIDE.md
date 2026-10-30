# Amul Parlour Web POS — Universal Windows Compatibility & Installation Guide

This document provides complete instructions for running the **Amul Parlour Web POS & Management Portal** across the widest practical range of Microsoft Windows systems, from **Windows 7 SP1** through **Windows 11**.

---

## 1. Operating System & Browser Compatibility Matrix

| Operating System | Supported Browser Baseline | Local Node.js Support | Recommended Deployment Mode |
|---|---|---|---|
| **Windows 11 (64-bit)** | Chrome 130+, Edge 130+, Firefox 130+ | Node.js 18, 20, 22 LTS | PWA Desktop Install OR Local Server (`Start-Amul-POS.bat`) |
| **Windows 10 (32 & 64-bit)** | Chrome 130+, Edge 130+, Firefox 130+ | Node.js 18, 20, 22 LTS | PWA Desktop Install OR Local Server (`Start-Amul-POS.bat`) |
| **Windows 8.1 (32 & 64-bit)** | Chrome 109, Edge 109, Firefox ESR 115 | Node.js v16.20.2 or v13.14.0 | Direct Browser PWA (Chrome 109 / Firefox ESR 115) |
| **Windows 8.0 (32 & 64-bit)** | Chrome 109, Edge 109, Firefox ESR 115 | Node.js v13.14.0 | Direct Browser PWA (Chrome 109 / Firefox ESR 115) |
| **Windows 7 SP1 (32 & 64-bit)**| Chrome 109, Edge 109, Firefox ESR 115 | Node.js v13.14.0 (Legacy) | Direct Browser PWA (Chrome 109 / Firefox ESR 115) |

---

## 2. Choosing Your Deployment Mode

### Mode A: Direct Browser / PWA Mode (Recommended for All Windows Systems)
**No Node.js installation required.** 

1. On any Windows PC (7 SP1 through 11), open Google Chrome, Microsoft Edge, or Mozilla Firefox.
2. Visit the application URL (or open `index.html` from a static local server).
3. In Chrome or Edge, click the **"Install"** icon in the URL bar (or select menu `⋮` ➔ **"Save and share"** ➔ **"Install Amul Parlour POS"**).
4. A standalone window opens with an icon on your desktop.
5. All sales transactions, inventory records, purchase khata, and receipts are stored locally inside **IndexedDB** on your PC and remain available offline without an active internet connection.

### Mode B: Standalone Local Offline Server (Windows 10 / 11)
**Runs a local HTTP server directly from your PC hard drive.**

1. Extract `amul-parlour-website.zip` to a folder on your PC (e.g. `C:\AmulPOS`).
2. Ensure Node.js 18, 20, or 22 LTS is installed from [nodejs.org](https://nodejs.org).
3. Double-click **`Create-Desktop-Shortcut.vbs`** to generate the **"Amul Parlour"** shortcut on your Windows Desktop.
4. Double-click the **"Amul Parlour"** Desktop shortcut anytime:
   - It automatically checks if the server is already active on port 3000 to prevent duplicate processes.
   - It starts the production preview server and launches your default web browser to `http://localhost:3000`.

---

## 3. Hardware Configuration & Setup

### A. USB HID Barcode Scanners (Plug & Play)
- Standard 1D/2D USB handheld barcode scanners operate in **HID Keyboard Wedge Mode**.
- No specialized Windows drivers are required.
- Plug the scanner into any USB port. Scan an Amul product barcode on the POS Billing screen; the built-in listener captures keystrokes with millisecond timing and immediately adds the item to the billing cart.

### B. Thermal Receipt Printers (58mm & 80mm)
- Connect your thermal printer via USB or Bluetooth.
- Install the standard manufacturer Windows printer driver (or use Windows generic text-only printer).
- In the POS Billing screen:
  1. Click the paper toggle to select **58mm** (compact kiosk rolls) or **80mm** (standard depot receipt rolls).
  2. Click **"Print Receipt"**.
  3. In the Windows Print dialog, set Margins to **"None"** and uncheck **"Headers and footers"** for pixel-perfect thermal printing.

---

## 4. Legacy Windows 7 & 8.1 Technical Details

1. **Browser Engine Support**:
   - Google and Microsoft ceased Windows 7 and 8.1 updates at version 109. Mozilla supported Firefox ESR 115 through September 2024.
   - Our build targets `['chrome109', 'edge109', 'firefox115', 'es2020']`, ensuring syntax like optional chaining, nullish coalescing, and modern DOM methods compile down safely.
2. **Early Runtime Feature Detection**:
   - `index.html` executes an early verification before loading React bundles. If an obsolete browser (such as Internet Explorer 11) is opened, an explicit upgrade prompt is displayed explaining which Chrome/Firefox version to install.
3. **Database Local Sandbox**:
   - IndexedDB is fully supported in Chrome 109 and Firefox ESR 115 on Windows 7 SP1, guaranteeing that local transactions and data retention work identically to modern Windows 11 PCs.
