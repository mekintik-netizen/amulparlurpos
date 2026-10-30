# Implementation Plan: Master Admin Setup, Password Recovery & Shop Management

This plan implements the complete workflow requested by the user:
1. **One-Time Master Admin Creation**: When opening the webpage for the first time, guide the user to create the ONE AND ONLY Master Admin ID. Once created, admin creation is permanently locked.
2. **Admin Password Recovery via Security Question**: During admin setup, save a secret security question & answer. If the admin forgets their password, they answer their question to securely reset their password.
3. **Shop Profile Registration with Unique ID & Password**: Inside Admin Portal, when creating a new shop, the admin provides full shop details and sets a dedicated, unique Shop Owner Login ID and Password.
4. **Shop Owner Password Management by Admin**: Inside Admin Portal, add a "Reset Shop Password" tool so the admin can change or reset any shop's password at any time.
5. **1-Month Subscription Auto-Activation & Renewal**: Fix the 1-month subscription so that newly registered shops are immediately active for 30 days upon creation, and the Admin can extend or renew for +30 days with a single click.

---

## 1. Architecture & Workflow Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FIRST-TIME SYSTEM INITIALIZATION                │
├────────────────────────────────────────────────────────────────────────┤
│ • Initial Open (No Admin in DB):                                       │
│   - Detects `!hasMasterAdmin` in IndexedDB                             │
│   - Launches "One-Time Master Admin Setup" wizard                      │
│   - Admin enters: Username, Password, Security Question & Answer       │
│   - Saves Master Admin with cryptographic salt & SHA-256 hash          │
│   - Permanently locks admin registration (single master admin only)    │
│                                                                        │
│ • Admin Forgot Password Flow:                                          │
│   - Admin clicks "Forgot Password?" on Admin HQ tab                    │
│   - Prompts for Admin Username -> displays saved Security Question     │
│   - Validates secret answer -> allows setting new Admin Password       │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                        ADMIN PORTAL SHOP & CREDENTIALS                 │
├────────────────────────────────────────────────────────────────────────┤
│ • Shop Registration:                                                   │
│   - Admin fills Shop Profile (Name, Owner, Phone, City, GST, FSSAI)   │
│   - Admin sets Unique Shop Owner Login ID & Password                   │
│   - 1-Month Plan is auto-activated for 30 days from creation date      │
│   - Both Shop record and User record are saved safely in IndexedDB    │
│                                                                        │
│ • Shop Password Reset by Admin:                                        │
│   - Admin Portal shops table includes "Change / Reset Password" button │
│   - Admin enters new password for that specific shop                   │
│   - Updates shop user's salt & passwordHash immediately                │
│                                                                        │
│ • 1-Month Subscription Extension:                                      │
│   - Status display (Days remaining & Expiry date)                      │
│   - "Activate / Extend +30 Days" button extends 30 days cleanly        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Proposed File Changes

### 1. `src/storage/auth.ts`
- Add security question support:
  - Extend `LocalUser` interface to include `securityQuestion?: string` and `securityAnswerHash?: string`.
  - Update `isMasterAdminInitialized()` to check whether a real user-created master admin exists in `appSettings` or users store.
  - Add `setupInitialMasterAdmin(params: { username, fullName, password, securityQuestion, securityAnswer })`:
    - Checks that no master admin exists yet.
    - Hashes password with salt.
    - Hashes or normalizes security answer.
    - Sets `master_admin_initialized` flag in `appSettings`.
  - Add `getAdminSecurityQuestion(username: string)`:
    - Retrieves the configured security question for password recovery.
  - Add `resetAdminPasswordWithSecurityAnswer(username, securityAnswer, newPassword)`:
    - Validates security answer.
    - Updates admin password hash with a fresh cryptographically random salt.
  - Add `adminResetShopPassword(shopCode: string, newPassword: string)`:
    - Allows an authenticated admin to reset a shop owner's / cashier's password.

### 2. `src/components/auth/AdminRegistration.tsx`
- Enhance the initial setup form:
  - Add selectable preset security questions (e.g. "What was your first school name?", "What is your birthplace?", "What is your favorite Amul ice cream?") plus custom question input.
  - Secret answer input field.
  - Clean error handling and immediate login on completion.

### 3. `src/components/auth/AdminPasswordResetModal.tsx` *(NEW)*
- Modal for admin password reset:
  - Step 1: Enter admin username.
  - Step 2: Answer the security question.
  - Step 3: Enter new password and confirm.

### 4. `src/components/auth/LoginPage.tsx`
- Add "Forgot Admin Password?" link on the Admin HQ tab to open `AdminPasswordResetModal`.
- On launch, if `!hasMasterAdmin`, open the `AdminRegistration` wizard full screen so the user creates the single master admin first.

### 5. `src/components/admin/AdminPortal.tsx`
- In `handleSaveShop`:
  - When creating a new shop, auto-set `subscriptionStatus: 'ACTIVE'`, `approvalStatus: 'APPROVED'`, `subscriptionStartDate: now`, `subscriptionExpiryDate: now + 30 days`.
  - Provide input fields for Unique Shop Owner Login ID and Password.
  - Register the shop user account automatically.
- In the Shop Management Table:
  - Add a **"Reset Password"** button for each shop that opens a modal allowing the admin to set a new password for that shop.
  - Add a dedicated **"Extend 30 Days"** button with clear visual countdown indicator.

### 6. Verification & Automated Tests
- Run `npm test -- --run` to ensure all 77+ tests pass and write new tests for:
  - Initial master admin setup & single admin lock.
  - Security question password reset.
  - Admin shop password reset.
  - 1-month subscription auto-activation and 30-day extension.
- Run `npm run lint` and `npm run build` / `compile_applet`.
