# Implementation Plan: Shop Profile Settings, Custom Bank UPI QR & Bank Statement Tab

This plan outlines the architecture and execution steps to introduce a dedicated **Shop Profile** management tab, a custom merchant **Bank/UPI QR Code** scanner at POS checkout, and a comprehensive **Bank Statement & Entries (બેંક એન્ટ્રી / પાસબુક)** tab for tracking all digital bank transactions.

---

## 1. User Requirements Summary
1. **Custom Shop UPI QR Code at POS Checkout:**
   - Replace the generic QR code at checkout with the shopkeeper's actual UPI payment QR.
   - Support uploading a photo/image of the shop's PhonePe/GPay/Paytm/BharatPe QR standee or entering the shop's UPI ID (`merchant@upi`) to generate an instant dynamic UPI QR with pre-filled bill amount.
   - Display the shop's bank name, UPI ID, and scan instructions so customers can scan and pay directly into the merchant's account.

2. **Dedicated "Shop Profile" (દુકાન પ્રોફાઇલ & સેટિંગ્સ) Tab:**
   - Tab in the navigation for managing shop credentials and payment settings.
   - Edit Shop Name, Owner Name, Contact Phone, Email, Physical Address, City, Pin Code.
   - Edit GSTIN and FSSAI License Number.
   - Bank Account Information: Bank Name, Account Holder Name, Account Number, IFSC Code, and Shop UPI ID.
   - Upload, preview, and delete custom Shop QR code image.
   - One-click "Print Merchant QR Standee" to print a counter display card for the shop.

3. **Dedicated "Bank Statement & Entries" (બેંક સ્ટેટમેન્ટ & એન્ટ્રી) Tab:**
   - View a complete passbook/statement of all bank and UPI financial movements.
   - **Automatic Inflows (Credit):** All POS sales completed via UPI / Bank Transfer.
   - **Automatic Outflows (Debit):** All supplier purchase payments made via Bank Transfer / UPI, and expense payments logged with Bank/UPI.
   - **Manual Bank Entries:** Ability to record manual bank transactions (e.g., cash deposited into bank, cash withdrawal from ATM, bank interest received, bank charges, loan EMI, electricity bill paid from bank).
   - KPI metrics: Total Bank Inflow, Total Bank Outflow, Current Calculated Bank Balance, and Total UPI Collections.
   - Filter by date range, transaction type, search by UTR / Reference / Party name.
   - Export Bank Statement to CSV / Excel and Print Passbook Statement.

---

## 2. Proposed Architecture & Data Models

### A. Shop Profile & Payment Settings in `types/index.ts`
Enhance the `Shop` interface with:
```typescript
export interface Shop {
  id: string;
  name: string;
  regionalName?: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  city?: string;
  pincode?: string;
  gstin?: string;
  fssaiNumber?: string;
  // Bank & UPI configuration
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
  upiId?: string;           // e.g. amulparlour@okaxis
  qrCodeImageUrl?: string;  // Base64 or image URL of merchant QR code
  createdAt: string;
  updatedAt: string;
  subscription?: ShopSubscription;
}
```

### B. Bank Entry Model in `types/index.ts`
```typescript
export interface BankEntry {
  id: string;
  shopId: string;
  date: string;
  type: 'CREDIT' | 'DEBIT';
  category: 'UPI_SALE' | 'SUPPLIER_PAYMENT' | 'EXPENSE' | 'CASH_DEPOSIT' | 'CASH_WITHDRAWAL' | 'BANK_CHARGES' | 'INTEREST' | 'OTHER';
  amount: number;
  referenceNumber: string; // UTR / Bill No / Ref No
  description: string;
  partyName?: string;      // Customer / Supplier / Bank
  paymentMode: 'UPI' | 'NEFT_RTGS' | 'CHEQUE' | 'NET_BANKING' | 'OTHER';
  sourceId?: string;       // Order ID or Purchase ID if automatically synced
  createdAt: string;
}
```

### C. Persistent Storage in `storage/repositories.ts`
- Add `AppRepository.bankEntries`:
  - `getAll(shopId: string): Promise<BankEntry[]>`
  - `add(entry: BankEntry): Promise<void>`
  - `delete(id: string): Promise<void>`
  - `getStatement(shopId: string, startDate?: string, endDate?: string): Promise<BankStatementSummary>`
- Hook order completion (when payment mode is `UPI` or `BANK_TRANSFER`) to automatically record a credit in `bankEntries`.
- Hook purchase bill settlement (when payment mode is `BANK_TRANSFER` or `UPI`) to automatically record a debit in `bankEntries`.

---

## 3. UI Component Plan

1. **`src/components/profile/ShopProfileManagement.tsx` (New Component):**
   - Clean, professional tab with Amul branding.
   - **Shop Identity Section:** Business Name, Gujarati Name, Owner, Phone, Email, Address, GSTIN, FSSAI.
   - **Bank & UPI Details:** Bank Name, Account Number, IFSC, Account Holder, and UPI ID.
   - **Merchant QR Code Studio:**
     - Live preview of current QR (either uploaded photo or dynamic vector QR generated from UPI ID).
     - File upload button (drag & drop or click to upload PhonePe/GPay/Paytm QR).
     - Remove / replace QR button.
     - Printable A4 / Standee tent-card with Amul Branding: "Scan Here to Pay via GPay / PhonePe / Paytm / BHIM".
   - Save Changes button with toast notifications and subscription check.

2. **`src/components/banking/BankStatementManagement.tsx` (New Component):**
   - **KPI Summary Cards:**
     - Total Inflow (UPI Sales + Bank Credits)
     - Total Outflow (Supplier Payments + Debits)
     - Net Bank Balance
     - Today's UPI Collection Count & Value
   - **Action Bar:**
     - "+ Add Bank Entry (કેશ જમા / ઉપાડ / ચાર્જીસ)" button opening a modal.
     - Date Range Picker (Today, This Week, This Month, Custom).
     - Type Filter (All, Credit / આવક, Debit / ખર્ચ).
     - Search bar for UTR / Reference / Party name.
     - Export to CSV / Excel and Print Statement buttons with official branded header.
   - **Statement Table:**
     - Date & Time
     - Type (Credit [Green] / Debit [Red])
     - Category (UPI વેચાણ, સપ્લાયર પેમેન્ટ, ખર્ચ, બેંક એન્ટ્રી)
     - Party / Account Name
     - Reference / UTR Number
     - Credit Amount (₹)
     - Debit Amount (₹)
     - Running Balance (₹)
     - Action (Delete for manual entries)

3. **POS Checkout Modal Enhancement (`src/components/pos/CheckoutModal.tsx`):**
   - When payment mode is `UPI`:
     - If the shop has an uploaded `qrCodeImageUrl`, render the shopkeeper's authentic QR code image.
     - If the shop has a `upiId`, generate a dynamic QR code using `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=` with the encoded `upi://pay?pa={upiId}&pn={shopName}&am={finalTotal}&cu=INR`.
     - Display: Shop Name, Merchant UPI ID, and exact amount to be paid.
     - Quick "Copy UPI ID" button.
     - Direct confirmation: "ગ્રાહકે પેમેન્ટ કર્યા પછી Pay & Print પર ક્લિક કરો".

4. **Navigation Integration (`src/components/layout/Sidebar.tsx` & `src/App.tsx`):**
   - Add **"બેંક સ્ટેટમેન્ટ" (Bank Statement)** tab with a bank/wallet icon.
   - Add **"દુકાન પ્રોફાઇલ" (Shop Profile)** tab with a store/settings icon.
   - Accessible to Cashier / Admin / Master Admin roles with appropriate permission control.

---

## 4. Verification & Testing
- Unit tests in `test/bank-and-profile.test.ts`:
  - Verify shop profile updating and persistence of bank details and QR image.
  - Verify automatic creation of bank entries on UPI sales and supplier payments.
  - Verify manual bank entry creation (cash deposit, withdrawal, charges) and running balance calculations.
  - Verify POS checkout modal displays merchant custom QR when uploaded or UPI ID format.
- Run `npm test` and `compile_applet`.
- Repackage offline zip.
