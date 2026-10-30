# Amul Parlour 3-Project Architecture: Unified API Contract & Data Model Specifications

This document defines the formal, production-ready contract connecting the **3 distinct projects**:
1. **Existing Android App** (Kotlin / Retrofit / Room Database)
2. **Existing Website** (React + TypeScript / Local-First IndexedDB Repository)
3. **Shared Backend API** (Node.js + Express + TypeScript + PostgreSQL / Cloud SQL)

---

## 1. Architectural Principles

1. **Separation of Projects**: The Android app, website, and backend are kept strictly as independent repositories.
2. **Offline-First Synchronization**: Both mobile and web clients write transactions locally first (Room on Android, IndexedDB on Web) and sync changes upstream using idempotent change-sets.
3. **Shop-Level Tenant Isolation**: Every query, bill, purchase, product, supplier, and stock movement is partitioned by `shop_id` (`shopCode`). Cross-shop data contamination is strictly prohibited.
4. **Duplicate Prevention & Idempotency**: All billing and purchase endpoints mandate an `idempotencyKey` (UUIDv4). Repeated submissions return the original receipt without double-deducting or double-adding physical inventory.
5. **Separation of Concerns**: Shop approval (`PENDING` -> `APPROVED`) is strictly distinct from subscription activation (`INACTIVE` -> `ACTIVE`).
6. **Purchases Stock Posting**: Confirmed purchases automatically increment shelf inventory exactly once. Draft or cancelled purchases never increment inventory.
7. **P&L Financial Integrity**: Gross profit ($$\text{Sales} - \text{COGS}$$) and Net operating profit ($$\text{Gross Profit} - \text{Expenses}$$) are strictly calculated and distinguished from gross revenue.

---

## 2. Kotlin Data Models (Android Retrofit / Room)

Below are the exact Kotlin data models designed for the Android client:

```kotlin
package com.amul.parlour.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.gson.annotations.SerializedName

enum class ShopApprovalStatus {
    @SerializedName("PENDING") PENDING,
    @SerializedName("APPROVED") APPROVED,
    @SerializedName("SUSPENDED") SUSPENDED
}

enum class SubscriptionStatus {
    @SerializedName("INACTIVE") INACTIVE,
    @SerializedName("ACTIVE") ACTIVE,
    @SerializedName("EXPIRED") EXPIRED
}

enum class SubscriptionPlanId {
    @SerializedName("TRIAL") TRIAL,
    @SerializedName("BASIC") BASIC,
    @SerializedName("PRO") PRO
}

enum class PurchaseStatus {
    @SerializedName("CONFIRMED") CONFIRMED,
    @SerializedName("DRAFT") DRAFT,
    @SerializedName("CANCELLED") CANCELLED
}

@Entity(tableName = "shops")
data class ShopEntity(
    @PrimaryKey
    @SerializedName("id") val id: String,
    @SerializedName("shopCode") val shopCode: String,
    @SerializedName("name") val name: String,
    @SerializedName("ownerName") val ownerName: String,
    @SerializedName("phone") val phone: String,
    @SerializedName("email") val email: String,
    @SerializedName("address") val address: String,
    @SerializedName("city") val city: String,
    @SerializedName("state") val state: String,
    @SerializedName("pincode") val pincode: String,
    @SerializedName("gstNumber") val gstNumber: String?,
    @SerializedName("fssaiNumber") val fssaiNumber: String?,
    @SerializedName("approvalStatus") val approvalStatus: ShopApprovalStatus,
    @SerializedName("subscriptionPlanId") val subscriptionPlanId: SubscriptionPlanId,
    @SerializedName("subscriptionStatus") val subscriptionStatus: SubscriptionStatus,
    @SerializedName("subscriptionExpiryDate") val subscriptionExpiryDate: String?,
    @SerializedName("updatedAt") val updatedAt: String
)

@Entity(tableName = "products")
data class ProductEntity(
    @PrimaryKey
    @SerializedName("id") val id: String,
    @SerializedName("shopId") val shopId: String,
    @SerializedName("barcode") val barcode: String,
    @SerializedName("sku") val sku: String,
    @SerializedName("name") val name: String,
    @SerializedName("regionalName") val regionalName: String?,
    @SerializedName("category") val category: String,
    @SerializedName("unit") val unit: String,
    @SerializedName("mrp") val mrp: Double,
    @SerializedName("costPrice") val costPrice: Double,
    @SerializedName("sellingPrice") val sellingPrice: Double,
    @SerializedName("currentStock") val currentStock: Int,
    @SerializedName("minStockAlert") val minStockAlert: Int,
    @SerializedName("isActive") val isActive: Boolean,
    @SerializedName("updatedAt") val updatedAt: String
)

@Entity(tableName = "suppliers")
data class SupplierEntity(
    @PrimaryKey
    @SerializedName("id") val id: String,
    @SerializedName("shopId") val shopId: String,
    @SerializedName("name") val name: String,
    @SerializedName("companyName") val companyName: String,
    @SerializedName("phone") val phone: String,
    @SerializedName("email") val email: String?,
    @SerializedName("gstin") val gstin: String?,
    @SerializedName("currentBalance") val currentBalance: Double,
    @SerializedName("updatedAt") val updatedAt: String
)

@Entity(tableName = "purchases")
data class PurchaseBillEntity(
    @PrimaryKey
    @SerializedName("id") val id: String,
    @SerializedName("purchaseInvoiceNumber") val purchaseInvoiceNumber: String,
    @SerializedName("shopId") val shopId: String,
    @SerializedName("supplierId") val supplierId: String,
    @SerializedName("supplierName") val supplierName: String,
    @SerializedName("purchaseDate") val purchaseDate: String,
    @SerializedName("itemCount") val itemCount: Int,
    @SerializedName("totalAmount") val totalAmount: Double,
    @SerializedName("paidAmount") val paidAmount: Double,
    @SerializedName("dueAmount") val dueAmount: Double,
    @SerializedName("status") val status: PurchaseStatus,
    @SerializedName("paymentMode") val paymentMode: String,
    @SerializedName("stockPosted") val stockPosted: Boolean,
    @SerializedName("idempotencyKey") val idempotencyKey: String,
    @SerializedName("updatedAt") val updatedAt: String
)

@Entity(tableName = "stock_movements")
data class StockMovementEntity(
    @PrimaryKey
    @SerializedName("id") val id: String,
    @SerializedName("shopId") val shopId: String,
    @SerializedName("productId") val productId: String,
    @SerializedName("productName") val productName: String,
    @SerializedName("barcode") val barcode: String,
    @SerializedName("movementType") val movementType: String, // IN, OUT, PURCHASE, PURCHASE_CANCEL, SALE, SALE_RETURN, ADJUSTMENT, EXPIRY_DAMAGE
    @SerializedName("quantity") val quantity: Int,
    @SerializedName("unitPrice") val unitPrice: Double,
    @SerializedName("reason") val reason: String,
    @SerializedName("referenceNumber") val referenceNumber: String?,
    @SerializedName("timestamp") val timestamp: String,
    @SerializedName("createdBy") val createdBy: String,
    @SerializedName("syncStatus") val syncStatus: String = "SYNCED"
)

@Entity(tableName = "sales_bills")
data class SaleBillEntity(
    @PrimaryKey
    @SerializedName("id") val id: String,
    @SerializedName("billNumber") val billNumber: String,
    @SerializedName("shopId") val shopId: String,
    @SerializedName("timestamp") val timestamp: String,
    @SerializedName("itemCount") val itemCount: Int,
    @SerializedName("subtotal") val subtotal: Double,
    @SerializedName("discountAmount") val discountAmount: Double,
    @SerializedName("taxAmount") val taxAmount: Double,
    @SerializedName("roundOff") val roundOff: Double,
    @SerializedName("finalAmount") val finalAmount: Double,
    @SerializedName("paymentMode") val paymentMode: String,
    @SerializedName("customerName") val customerName: String?,
    @SerializedName("customerPhone") val customerPhone: String?,
    @SerializedName("status") val status: String,
    @SerializedName("cashierName") val cashierName: String,
    @SerializedName("idempotencyKey") val idempotencyKey: String,
    @SerializedName("syncStatus") val syncStatus: String = "SYNCED"
)

@Entity(tableName = "expenses")
data class ExpenseEntity(
    @PrimaryKey
    @SerializedName("id") val id: String,
    @SerializedName("shopId") val shopId: String,
    @SerializedName("date") val date: String,
    @SerializedName("category") val category: String,
    @SerializedName("amount") val amount: Double,
    @SerializedName("paymentMode") val paymentMode: String,
    @SerializedName("notes") val notes: String?,
    @SerializedName("createdBy") val createdBy: String
)
```

---

## 3. PostgreSQL Database Schema Definition

Below is the DDL schema for the shared backend:

```sql
CREATE TABLE shops (
    id VARCHAR(64) PRIMARY KEY,
    shop_code VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(20) NOT NULL,
    gst_number VARCHAR(30),
    fssai_number VARCHAR(30),
    approval_status VARCHAR(20) DEFAULT 'PENDING',
    subscription_plan_id VARCHAR(20) DEFAULT 'TRIAL',
    subscription_status VARCHAR(20) DEFAULT 'INACTIVE',
    subscription_start_date TIMESTAMP WITH TIME ZONE,
    subscription_expiry_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE products (
    id VARCHAR(64) PRIMARY KEY,
    shop_id VARCHAR(64) REFERENCES shops(id) ON DELETE CASCADE,
    barcode VARCHAR(64) NOT NULL,
    sku VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    regional_name VARCHAR(255),
    category VARCHAR(100) NOT NULL,
    unit VARCHAR(30) NOT NULL,
    mrp NUMERIC(10, 2) NOT NULL,
    cost_price NUMERIC(10, 2) NOT NULL,
    selling_price NUMERIC(10, 2) NOT NULL,
    current_stock INT DEFAULT 0,
    min_stock_alert INT DEFAULT 10,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_shop_barcode UNIQUE(shop_id, barcode)
);

CREATE TABLE suppliers (
    id VARCHAR(64) PRIMARY KEY,
    shop_id VARCHAR(64) REFERENCES shops(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    address TEXT,
    gstin VARCHAR(30),
    current_balance NUMERIC(12, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE purchases (
    id VARCHAR(64) PRIMARY KEY,
    purchase_invoice_number VARCHAR(64) NOT NULL,
    shop_id VARCHAR(64) REFERENCES shops(id) ON DELETE CASCADE,
    supplier_id VARCHAR(64) REFERENCES suppliers(id),
    supplier_name VARCHAR(255) NOT NULL,
    purchase_date DATE NOT NULL,
    item_count INT NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL,
    tax_amount NUMERIC(10, 2) DEFAULT 0,
    total_amount NUMERIC(12, 2) NOT NULL,
    paid_amount NUMERIC(12, 2) DEFAULT 0,
    due_amount NUMERIC(12, 2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'CONFIRMED',
    payment_mode VARCHAR(30) NOT NULL,
    stock_posted BOOLEAN DEFAULT TRUE,
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE purchase_items (
    id SERIAL PRIMARY KEY,
    purchase_id VARCHAR(64) REFERENCES purchases(id) ON DELETE CASCADE,
    product_id VARCHAR(64) REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,
    barcode VARCHAR(64) NOT NULL,
    quantity INT NOT NULL,
    unit VARCHAR(30) NOT NULL,
    purchase_rate NUMERIC(10, 2) NOT NULL,
    mrp NUMERIC(10, 2) NOT NULL,
    total NUMERIC(12, 2) NOT NULL
);

CREATE TABLE sales (
    id VARCHAR(64) PRIMARY KEY,
    bill_number VARCHAR(64) NOT NULL,
    shop_id VARCHAR(64) REFERENCES shops(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    item_count INT NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL,
    discount_amount NUMERIC(10, 2) DEFAULT 0,
    tax_amount NUMERIC(10, 2) DEFAULT 0,
    round_off NUMERIC(6, 2) DEFAULT 0,
    final_amount NUMERIC(12, 2) NOT NULL,
    payment_mode VARCHAR(20) NOT NULL,
    customer_name VARCHAR(255),
    customer_phone VARCHAR(20),
    status VARCHAR(20) DEFAULT 'COMPLETED',
    cashier_name VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE sale_items (
    id SERIAL PRIMARY KEY,
    sale_id VARCHAR(64) REFERENCES sales(id) ON DELETE CASCADE,
    product_id VARCHAR(64) REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,
    barcode VARCHAR(64) NOT NULL,
    quantity INT NOT NULL,
    unit VARCHAR(30) NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    cost_price NUMERIC(10, 2) NOT NULL,
    mrp NUMERIC(10, 2) NOT NULL,
    total NUMERIC(12, 2) NOT NULL
);

CREATE TABLE stock_movements (
    id VARCHAR(64) PRIMARY KEY,
    shop_id VARCHAR(64) REFERENCES shops(id) ON DELETE CASCADE,
    product_id VARCHAR(64) REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,
    barcode VARCHAR(64) NOT NULL,
    movement_type VARCHAR(30) NOT NULL,
    quantity INT NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    reason TEXT NOT NULL,
    reference_number VARCHAR(64),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL
);

CREATE TABLE expenses (
    id VARCHAR(64) PRIMARY KEY,
    shop_id VARCHAR(64) REFERENCES shops(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    category VARCHAR(100) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    payment_mode VARCHAR(30) NOT NULL,
    notes TEXT,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 4. REST API Endpoints Specification

Base URL: `https://<BACKEND-HOST>/api` (Configured via `VITE_API_BASE_URL` on Web).

### 4.1 Authentication & Profile
- `POST /api/auth/login`
- `GET /api/auth/me`

### 4.2 Shop Management (Admin & Shop Kiosk)
- `GET /api/shops` (Tenant isolated)
- `POST /api/shops` (Creates shop with unique Shop ID, default `PENDING` approval and `INACTIVE` subscription)
- `PATCH /api/shops/:id/approval` (Admin approves/suspends)
- `PATCH /api/shops/:id/subscription` (Admin activates subscription plan)

### 4.3 Products & Inventory
- `GET /api/products?shopId=:shopId`
- `GET /api/products/barcode?shopId=:shopId&barcode=:barcode`
- `POST /api/products` (Upsert product)
- `DELETE /api/products/:id`

### 4.4 Purchases & Suppliers
- `GET /api/suppliers?shopId=:shopId`
- `POST /api/suppliers`
- `POST /api/suppliers/payments` (Records payment, decrements balance)
- `GET /api/purchases?shopId=:shopId&date=:date`
- `POST /api/purchases` (Idempotent. Confirmed status increases stock; draft does not)
- `POST /api/purchases/:id/cancel` (Reverses added stock and supplier balance)

### 4.5 Sales & Invoicing
- `GET /api/sales?shopId=:shopId&date=:date`
- `POST /api/sales` (Idempotent with row locks; verifies stock, deducts stock, records sale movements)
- `POST /api/sales/:id/cancel` (Marks cancelled, restores stock via `SALE_RETURN`)

### 4.6 Reports & Financials
- `GET /api/reports/daily-stock?shopId=:shopId&date=YYYY-MM-DD`
- `GET /api/reports/daily-sales?shopId=:shopId&date=YYYY-MM-DD`
- `GET /api/reports/daily-financials?shopId=:shopId&date=YYYY-MM-DD` (Gross profit, COGS, expenses, net profit)

---

## 5. Migration Guide: From Local IndexedDB to PostgreSQL

When you are ready to connect to Project 3 (Shared Backend):
1. **Export Local Data**: On the website, open **Backup / Restore** -> click **Download Backup JSON**.
2. **Import Endpoint**: The backend provides a migration endpoint:
   `POST /api/admin/migrate-local-data`
   passing the JSON backup file with bearer authentication.
3. **Database Insertion**: The backend wraps the payload inside a single database transaction:
   - Inserts shops (preserving original `id` and `shopCode`).
   - Inserts products with current stock.
   - Inserts suppliers, purchases, sales, and stock ledger movements.
4. **Switch Client Mode**: In `.env`, set:
   ```env
   VITE_API_BASE_URL="https://your-backend-api.run.app"
   ```
   The website's repository layer will immediately route all reads and writes to the PostgreSQL backend!
