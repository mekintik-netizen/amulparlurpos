# In-Card Admin Registration Tab on First Open

Provide a dedicated **Admin Registration** tab directly on the main login card when opening the webpage for the first time, allowing one-time setup of the master admin ID and password, which then locks permanently.

### User Review & Critical Decisions

> [!IMPORTANT]
> The setup flow is embedded directly inside the login card as a segmented tab rather than a modal or full-screen wizard.
> - **Default Tab on First Open**: When no admin exists in IndexedDB, the card displays 3 tabs: **Admin Register** (active by default), **Shop Counter**, and **Admin HQ**.
> - **Permanent Lock**: Once the single Master Admin account is created, the "Admin Register" tab disappears permanently, leaving only **Shop Counter** and **Admin HQ**.
> - **Password Recovery**: The admin sets a secret recovery question and answer during registration so the password can be recovered anytime from the "Forgot Password?" link on the Admin HQ tab.

---

### 1. Overview & Core Concept

- **What It Does**: When the application runs for the first time with an uninitialized or empty database, the login screen displays a prominent "Admin Register" tab. The user inputs their desired Admin ID, Password, and a Security Recovery Question/Answer. Submitting creates the sole administrator, locks further admin creation, and immediately logs the administrator into the Admin HQ portal.
- **Target Audience / Persona**: Shop franchise owners and Amul parlour administrators during initial local system deployment.
- **Key Value**: Streamlined, intuitive onboarding without jarring full-screen takeovers or confusing popups, while maintaining strict local security and single-admin enforcement.

---

### 2. User Experience & Visual Design

#### Visual Layout & Tab States

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FIRST-TIME WEBPAGE OPEN                         │
│                        (No Admin Initialized)                          │
├────────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────┬───────────────────────┬───────────────────┐ │
│  │   🛡️ Admin Register   │     🏪 Shop Counter   │    🔒 Admin HQ    │ │
│  │      (Active Tab)     │                       │                   │ │
│  └───────────────────────┴───────────────────────┴───────────────────┘ │
│                                                                        │
│  Admin Username / ID:                                                  │
│  [ admin                                                            ]  │
│                                                                        │
│  Password (min 6 characters):                                          │
│  [ ••••••••••••                                                   👁 ] │
│                                                                        │
│  Confirm Password:                                                     │
│  [ ••••••••••••                                                   👁 ] │
│                                                                        │
│  Security Recovery Question:                                           │
│  [ What was the name of your first school?                          ▼ ] │
│                                                                        │
│  Security Recovery Answer:                                             │
│  [ St. Xavier's                                                     ]  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │            [ Create Admin Account & Log In ]                     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘

                                   ▼ Once Created

┌────────────────────────────────────────────────────────────────────────┐
│                        NORMAL / SUBSEQUENT USE                         │
│                        (Master Admin Initialized)                      │
├────────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────┬───────────────────────────────┐ │
│  │           🏪 Shop Counter         │          🔒 Admin HQ          │ │
│  │            (Cashier POS)          │     (Forgot Password link)    │ │
│  └───────────────────────────────────┴───────────────────────────────┘ │
│  * "Admin Register" tab is permanently gone. Only 1 Admin can exist.   │
└────────────────────────────────────────────────────────────────────────┘
```

#### Visual Styling & Theme Tokens
- **Tab Design**: Clean segmented button bar with micro-animations and active indicator styling (`bg-white text-slate-900 shadow-xs font-bold` in light mode, `bg-neutral-800 text-white` in dark mode).
- **Security Recovery Question**: Clean native select with standard presets (first school, childhood pet, birth city, favorite sports team, custom) and secret answer field.
- **Micro-Interactions**: Show/hide toggle for password visibility, inline validation errors for mismatched passwords or length under 6 characters, and instant transition into the application.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Direct In-Card Tab vs. Modal / Full-Screen Wizard**
  - *Chosen Approach*: Embed the registration directly as the active tab inside the login card.
  - *Why*: Directly aligns with user feedback (*"paheli var webpage opne karta admin rajistesan nu aek teb opane thay"*). Eliminates intrusive modals and keeps the user anchored in the login screen.
  - *Alternative Considered*: Full-screen setup wizard (rejected by user as too complex/disruptive).

- **Decision 2: Single-Admin Enforced by Storage Layer**
  - *Chosen Approach*: The client checks `isMasterAdminInitialized()` on mount. Once `performOneTimeAdminSetup()` executes, the storage rejects any additional admin creation attempts.
  - *Why*: Ensures strict single-administrator ownership and prevents unauthorized admin registrations from any client.

- **Decision 3: Seamless Immediate Login upon Admin Creation**
  - *Chosen Approach*: Upon successful registration, the tab triggers `onLoginSuccess(session)` directly, landing the admin in the Admin HQ portal immediately without re-typing credentials.
  - *Why*: High-speed, frictionless onboarding experience.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           LoginPage Component                           │
│  - State: activeTab ('ADMIN_REGISTER' | 'SHOP_USER' | 'ADMIN')          │
│  - State: hasMasterAdmin (boolean)                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Mount:                                                                 │
│    isMasterAdminInitialized() ──► false ──► hasMasterAdmin = false      │
│                                         ──► activeTab = 'ADMIN_REGISTER'│
│                                                                         │
│  Form Submission ('ADMIN_REGISTER'):                                    │
│    performOneTimeAdminSetup({                                           │
│      username, password, securityQuestion, securityAnswer               │
│    })                                                                   │
│      │                                                                  │
│      ▼                                                                  │
│  auth.ts (IndexedDB / Local Storage):                                   │
│    - Hashes password with SHA-256 + salt                                │
│    - Hashes security answer with SHA-256 + salt                         │
│    - Saves LocalUser (role: 'ADMIN')                                    │
│    - Creates and returns AuthSession                                    │
│      │                                                                  │
│      ▼                                                                  │
│  LoginPage:                                                             │
│    - setHasMasterAdmin(true)  (tab disappears permanently)             │
│    - onLoginSuccess(session)   (enters Admin HQ portal)                 │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Component & State Mapping
1. **`src/components/auth/LoginPage.tsx`**:
   - Update tab type: `type LoginTab = 'SHOP_USER' | 'ADMIN' | 'ADMIN_REGISTER'`.
   - On load, query `isMasterAdminInitialized()`.
   - If `false`, set `hasMasterAdmin(false)` and `activeTab('ADMIN_REGISTER')`.
   - When `!hasMasterAdmin`, render the 3-button segmented tab bar: `Admin Register`, `Shop Counter`, `Admin HQ`.
   - When `activeTab === 'ADMIN_REGISTER'`, render the in-card registration form with Admin ID, Password, Confirm Password, Security Question & Answer, and Submit button.
   - When submitted, call `performOneTimeAdminSetup()`, set `hasMasterAdmin(true)`, and call `onLoginSuccess(session)`.
   - When `hasMasterAdmin` is `true`, render the 2-button segmented tab bar: `Shop Counter` and `Admin HQ`.

2. **Verification Plan**:
   - Verify zero-state loads with the "Admin Register" tab active by default.
   - Test password match validation, minimum length check (6 characters).
   - Test admin creation and verify immediate transition to Admin HQ.
   - Reload page and confirm only "Shop Counter" and "Admin HQ" appear.
   - Verify "Forgot Password?" still recovers the admin password using the registered security answer.
   - Run `npm test -- --run` to ensure all 84 test suites pass.
   - Run `compile_applet` to ensure zero compilation or type errors.
