/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Built-In Instant Local Business Intelligence Engine (Gujarati & English)
 * Guarantees 100% zero-error structured answers directly from live
 * IndexedDB / Firestore-synced shop metrics whenever no Gemini API key is
 * configured yet or when cloud AI is offline / unreachable.
 */

import { ShopAiContextSummary } from '../types/index.ts';

function inr(value: number): string {
  const num = Number(value) || 0;
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  })}`;
}

export function generateLocalGujaratiBusinessAnswer(
  rawQuestion: string,
  ctx: ShopAiContextSummary,
  language: 'gu' | 'en' = 'gu'
): string {
  const q = (rawQuestion || '').toLowerCase();
  const s = ctx.salesMetrics;
  const isEn = language === 'en';

  const isProfitOrSales =
    q.includes('નફો') ||
    q.includes('વેચાણ') ||
    q.includes('profit') ||
    q.includes('sale') ||
    q.includes('revenue') ||
    q.includes('cash') ||
    q.includes('upi') ||
    q.includes('હિસાબ');

  const isTopSelling =
    q.includes('સૌથી વધુ') ||
    q.includes('વેચાઈ') ||
    q.includes('ટોપ') ||
    q.includes('top') ||
    q.includes('best') ||
    q.includes('fast');

  const isLowStock =
    q.includes('ખતમ') ||
    q.includes('ઓછો સ્ટોક') ||
    q.includes('low stock') ||
    q.includes('out of stock') ||
    q.includes('સ્ટોક');

  const isSmartOrder =
    q.includes('ઓર્ડર') ||
    q.includes('મંગાવ') ||
    q.includes('order') ||
    q.includes('reorder') ||
    q.includes('purchase list');

  const isCustomerDues =
    q.includes('કસ્ટમર') ||
    q.includes('ઉઘરાણી') ||
    q.includes('customer') ||
    q.includes('khata') ||
    q.includes('credit');

  const isAgencyDues =
    q.includes('એજન્સી') ||
    q.includes('સપ્લાયર') ||
    q.includes('પેમેન્ટ') ||
    q.includes('agency') ||
    q.includes('supplier') ||
    q.includes('bill');

  const isDeadStock =
    q.includes('dead stock') ||
    q.includes('બિલકુલ નથી વેચાતી') ||
    q.includes('ડેડ') ||
    q.includes('slow') ||
    q.includes('વેચાતી');

  // 1. Dead stock check BEFORE top-selling ("વેચાતી" vs "વેચાઈ")
  if (isDeadStock) {
    if (ctx.deadStockItems30d.length === 0) {
      return isEn
        ? [
            `### 📉 Dead Stock Analysis (Last 30 Days)`,
            `• Great news! **No items in current stock have zero sales in the last 30 days.**`,
            `• All stocked products are moving steadily.`
          ].join('\n')
        : [
            `### 📉 ડેડ સ્ટોક વિશ્લેષણ (છેલ્લા ૩૦ દિવસ)`,
            `• ખૂબ સરસ! છેલ્લા ૩૦ દિવસમાં હાલ સ્ટોકમાં રહેલી **કોઈ પણ આઈટમ 0-વેચાણ (Dead Stock) માં નથી.**`,
            `• તમારી બધી જ ઉપલબ્ધ આઈટમ્સનું નિયમિત વેચાણ થઈ રહ્યું છે.`
          ].join('\n');
    }
    const totalDeadCapital = ctx.deadStockItems30d.reduce((sum, d) => sum + d.stockValueAtCost, 0);
    return isEn
      ? [
          `### 📉 Dead Stock Items (Zero Sales in Last 30 Days)`,
          `• **${ctx.deadStockItems30d.length} items** have stock on hand with 0 sales (Capital tied up: **${inr(totalDeadCapital)}**):`,
          ...ctx.deadStockItems30d.slice(0, 10).map(
            (d, i) => `• ${i + 1}. **${d.productName}** — Stock: **${d.currentStock} ${d.unit}** (Value: ${inr(d.stockValueAtCost)})`
          ),
          `• 💡 **Tip:** Move these items near the billing counter or bundle them with fast-moving dairy packs.`
        ].join('\n')
      : [
          `### 📉 બિલકુલ ન વેચાતી આઈટમ્સ (Dead Stock - છેલ્લા ૩૦ દિવસ)`,
          `• કુલ **${ctx.deadStockItems30d.length} આઈટમ્સ** એવી છે જેનો સ્ટોક પડ્યો છે પરંતુ છેલ્લા ૩૦ દિવસમાં એક પણ વેચાણ થયું નથી (રોકાયેલ મૂડી: **${inr(totalDeadCapital)}**):`,
          ...ctx.deadStockItems30d.slice(0, 10).map(
            (d, i) => `• ${i + 1}. **${d.productName}** — સ્ટોક: **${d.currentStock} ${d.unit}** (કિંમત: ${inr(d.stockValueAtCost)})`
          ),
          `• 💡 **સલાહ:** આ આઈટમ્સ કાઉન્ટરની આગળ ડિસ્પ્લે કરો અથવા ફાસ્ટ-મૂવિંગ દૂધ/બટર સાથે કોમ્બો ઓફર આપીને સ્ટોક ક્લિયર કરો.`
        ].join('\n');
  }

  // 2. Pending Agency / Supplier Bills
  if (isAgencyDues) {
    const bills = ctx.pendingSupplierPayables.pendingBills;
    const sups = ctx.pendingSupplierPayables.suppliersWithBalance;
    if (bills.length === 0 && sups.length === 0) {
      return isEn
        ? [
            `### 🧾 Pending Agency & Supplier Payments`,
            `• Currently **zero agency/supplier bills are pending (₹0).**`,
            `• All purchase accounts are settled.`
          ].join('\n')
        : [
            `### 🧾 એજન્સી અને સપ્લાયર બાકી પેમેન્ટ`,
            `• હાલમાં **કોઈ પણ એજન્સી કે સપ્લાયરનું બિલ બાકી નથી (₹0).**`,
            `• તમારા બધા પર્ચેઝ બિલ્સ ક્લિયર છે.`
          ].join('\n');
    }
    return isEn
      ? [
          `### 🧾 Pending Agency / Supplier Payables`,
          `• Total Pending Purchase Bills: **${inr(ctx.pendingSupplierPayables.totalPendingBillsAmount)}**`,
          `• Total Supplier Ledger Balance: **${inr(ctx.pendingSupplierPayables.totalSupplierLedgerBalance)}**`,
          ...bills.slice(0, 8).map(
            (b, i) => `• ${i + 1}. **${b.agencyName}** (Bill #${b.billNumber}, ${b.purchaseDate}) — Due: **${inr(b.dueAmount)}**`
          ),
          ...(bills.length === 0
            ? sups.slice(0, 8).map(
                (sup, i) => `• ${i + 1}. **${sup.companyName || sup.supplierName}** (${sup.phone}) — Due: **${inr(sup.payableBalance)}**`
              )
            : []),
          `• 💡 **Tip:** Open **Purchases Khata** to record supplier settlements.`
        ].join('\n')
      : [
          `### 🧾 એજન્સી / સપ્લાયર બાકી પેમેન્ટ વિગત`,
          `• કુલ બાકી પર્ચેઝ બિલ્સ: **${inr(ctx.pendingSupplierPayables.totalPendingBillsAmount)}**`,
          `• કુલ સપ્લાયર ખાતા બેલેન્સ: **${inr(ctx.pendingSupplierPayables.totalSupplierLedgerBalance)}**`,
          ...bills.slice(0, 8).map(
            (b, i) =>
              `• ${i + 1}. **${b.agencyName}** (બિલ #${b.billNumber}, તારીખ: ${b.purchaseDate}) — બાકી: **${inr(b.dueAmount)}** (કુલ: ${inr(b.totalAmount)}, ચૂકવેલ: ${inr(b.paidAmount)})`
          ),
          ...(bills.length === 0
            ? sups.slice(0, 8).map(
                (sup, i) =>
                  `• ${i + 1}. **${sup.companyName || sup.supplierName}** (${sup.phone}) — બાકી: **${inr(sup.payableBalance)}**`
              )
            : []),
          `• 💡 **સલાહ:** **Purchases Khata** માં જઈને બાકી બિલ ચકાસો અને પેમેન્ટ એન્ટ્રી અપડેટ કરો.`
        ].join('\n');
  }

  // 3. Pending Customer Khata Dues
  if (isCustomerDues) {
    const cust = ctx.pendingCustomerDues;
    if (cust.customers.length === 0 || cust.totalPendingAmount <= 0) {
      return isEn
        ? [
            `### 💰 Customer Credit Dues (Khata)`,
            `• Currently **zero customer credit dues are pending (₹0).**`
          ].join('\n')
        : [
            `### 💰 કસ્ટમર ઉઘરાણી (Credit Khata) રિપોર્ટ`,
            `• હાલમાં **કોઈ પણ કસ્ટમરની ઉઘરાણી બાકી નથી (₹0).**`,
            `• બધા બિલ્સ Cash / UPI / Card થી ચૂકવાયેલા છે.`
          ].join('\n');
    }
    return isEn
      ? [
          `### 💰 Pending Customer Dues (Credit Khata)`,
          `• Total Pending Dues: **${inr(cust.totalPendingAmount)}** across **${cust.totalCreditBills}** credit bills`,
          ...cust.customers.slice(0, 10).map(
            (c, i) =>
              `• ${i + 1}. **${c.customerName}**${c.customerPhone ? ` (${c.customerPhone})` : ''} — Due: **${inr(c.dueAmount)}** (${c.billCount} bills, last: ${c.lastBillDate})`
          ),
          `• 💡 **Tip:** Send a polite WhatsApp payment reminder for top overdue accounts.`
        ].join('\n')
      : [
          `### 💰 બાકી કસ્ટમર ઉઘરાણી (Credit Bills)`,
          `• કુલ બાકી ઉઘરાણી: **${inr(cust.totalPendingAmount)}** (${cust.totalCreditBills} ક્રેડિટ બિલ્સ)`,
          ...cust.customers.slice(0, 10).map(
            (c, i) =>
              `• ${i + 1}. **${c.customerName}**${c.customerPhone ? ` (${c.customerPhone})` : ''} — બાકી: **${inr(c.dueAmount)}** (${c.billCount} બિલ, છેલ્લું બિલ: ${c.lastBillDate})`
          ),
          `• 💡 **સલાહ:** વધારે રકમ બાકી હોય તેવા ગ્રાહકોને WhatsApp પર નમ્ર રિમાઇન્ડર મોકલો.`
        ].join('\n');
  }

  // 4. Smart Order Next 7 Days
  if (isSmartOrder) {
    const recs = ctx.smartOrder7dRecommendations;
    if (recs.length === 0) {
      return isEn
        ? [
            `### 🛒 7-Day Smart Order Plan`,
            `• Based on the last 7 days of POS sales, your active items already have sufficient stock.`
          ].join('\n')
        : [
            `### 🛒 આવતા ૭ દિવસ માટે Smart Order સલાહ`,
            `• છેલ્લા ૭ દિવસના POS વેચાણ મુજબ હાલની બધી વેચાતી આઈટમ્સ માટે પૂરતો સ્ટોક ઉપલબ્ધ છે.`,
            `• કોઈ તાત્કાલિક નવો ઓર્ડર સૂચવવામાં આવ્યો નથી.`
          ].join('\n');
    }
    const estTotal = recs.reduce((sum, r) => sum + r.estimatedCost, 0);
    return isEn
      ? [
          `### 🛒 Recommended 7-Day Smart Order (+10% Safety Buffer)`,
          `• **${recs.length} items** recommended (Estimated Purchase Total: **${inr(estTotal)}**):`,
          ...recs.slice(0, 10).map(
            (r, i) =>
              `• ${i + 1}. **${r.productName}** — Order **${r.suggestedQty} ${r.unit}** (Stock: ${r.currentStock}, Avg/day: ${r.avgDailySales}, Est: ${inr(r.estimatedCost)})`
          ),
          `• 💡 **Tip:** Open **Smart Order** in the right sidebar to send this list via WhatsApp or PDF.`
        ].join('\n')
      : [
          `### 🛒 આવતા ૭ દિવસ માટે Smart Order સૂચન (+૧૦% સેફ્ટી બફર સાથે)`,
          `• કુલ **${recs.length} આઈટમ્સ** ઓર્ડર કરવા જેવી છે (અંદાજિત કુલ ખર્ચ: **${inr(estTotal)}**):`,
          ...recs.slice(0, 10).map(
            (r, i) =>
              `• ${i + 1}. **${r.productName}** — ઓર્ડર: **${r.suggestedQty} ${r.unit}** (હાલનો સ્ટોક: ${r.currentStock}, રોજનું સરેરાશ વેચાણ: ${r.avgDailySales}, અંદાજ: ${inr(r.estimatedCost)})`
          ),
          `• 💡 **સલાહ:** જમણી બાજુ **Smart Order** મેનૂ ખોલીને સીધો WhatsApp ઓર્ડર અથવા PDF પર્ચેઝ લિસ્ટ મોકલી શકો છો.`
        ].join('\n');
  }

  // 5. Low Stock & Out-of-Stock Alert
  if (isLowStock) {
    if (ctx.lowStockItems.length === 0) {
      return isEn
        ? `### ⚠️ Stock Alert Report\n• All products are well-stocked. **Zero low-stock or out-of-stock items.**`
        : `### ⚠️ સ્ટોક એલર્ટ રિપોર્ટ\n• ખૂબ સરસ! હાલમાં **કોઈ પણ આઈટમ Low Stock કે Out-of-Stock નથી.**`;
    }
    return isEn
      ? [
          `### ⚠️ Low Stock & Out-of-Stock Items`,
          `• Total Low Stock Items: **${ctx.lowStockCount}** (**${ctx.outOfStockCount} items at 0 stock**):`,
          ...ctx.lowStockItems.slice(0, 12).map(
            (item, i) =>
              `• ${i + 1}. **${item.productName}** — Stock: **${item.currentStock} ${item.unit}** (Alert at: ${item.minStockAlert})`
          ),
          `• 💡 **Tip:** Reorder 0-stock fast movers immediately so customers never leave empty-handed.`
        ].join('\n')
      : [
          `### ⚠️ ઓછો સ્ટોક અને ખતમ થયેલ આઈટમ્સ`,
          `• કુલ Low Stock આઈટમ્સ: **${ctx.lowStockCount}** (જેમાંથી **${ctx.outOfStockCount} આઈટમ્સ 0 સ્ટોક** પર છે):`,
          ...ctx.lowStockItems.slice(0, 12).map(
            (item, i) =>
              `• ${i + 1}. **${item.productName}** — હાલનો સ્ટોક: **${item.currentStock} ${item.unit}** (મિનિમમ એલર્ટ: ${item.minStockAlert})`
          ),
          `• 💡 **સલાહ:** 0 સ્ટોક વાળી અને ઝડપથી વેચાતી આઈટમ્સ માટે આજે જ એજન્સીને ઓર્ડર નોંધાવો.`
        ].join('\n');
  }

  // 6. Top Selling Items
  if (isTopSelling) {
    if (ctx.topSellingProducts7d.length === 0) {
      return isEn
        ? `### 🔥 Top Selling Items (Last 7 Days)\n• No POS sales recorded in the last 7 days yet.`
        : `### 🔥 આ અઠવાડિયાની સૌથી વધુ વેચાતી આઈટમ્સ\n• છેલ્લા ૭ દિવસમાં હજુ સુધી કોઈ POS વેચાણ નોંધાયું નથી.`;
    }
    return isEn
      ? [
          `### 🔥 Top Selling Items (Last 7 Days)`,
          ...ctx.topSellingProducts7d.slice(0, 10).map(
            (item, i) =>
              `• ${i + 1}. **${item.productName}** — Sold: **${item.qtySold} ${item.unit}** (${inr(item.revenue)}) | Stock: ${item.currentStock}`
          ),
          `• 💡 **Tip:** Keep extra buffer stock on your top 3 sellers before weekend rush.`
        ].join('\n')
      : [
          `### 🔥 છેલ્લા ૭ દિવસની Top Selling આઈટમ્સ`,
          ...ctx.topSellingProducts7d.slice(0, 10).map(
            (item, i) =>
              `• ${i + 1}. **${item.productName}** — વેચાણ: **${item.qtySold} ${item.unit}** (${inr(item.revenue)}) | હાલનો સ્ટોક: ${item.currentStock}`
          ),
          `• 💡 **સલાહ:** ટોચની ૩ આઈટમ્સનો સ્ટોક હંમેશા પૂરતો રાખો જેથી ગ્રાહક ખાલી હાથે ન જાય.`
        ].join('\n');
  }

  // 7. Today's Sales & Profit
  if (isProfitOrSales) {
    return isEn
      ? [
          `### 📊 Today's Sales & Net Profit (${s.todayDate})`,
          `• **Bills Today:** ${s.todayBills} bills`,
          `• **Total Revenue:** **${inr(s.todayRevenue)}** | **COGS:** ${inr(s.todayCogs)}`,
          `• **Gross Profit:** **${inr(s.todayGrossProfit)}** | **Expenses:** ${inr(s.todayExpenses)}`,
          `• **Net Profit:** **${inr(s.todayNetProfit)}**`,
          `• **Payment Split:** Cash **${inr(s.todayByPaymentMode.cash)}** | UPI **${inr(s.todayByPaymentMode.upi)}** | Card **${inr(s.todayByPaymentMode.card)}** | Credit **${inr(s.todayByPaymentMode.credit)}**`,
          `• **7d / 30d:** ${inr(s.last7DaysRevenue)} (7d) · ${inr(s.last30DaysRevenue)} (30d)`
        ].join('\n')
      : [
          `### 📊 આજનો વેચાણ અને નફો રિપોર્ટ (${s.todayDate})`,
          `• **આજના કુલ બિલ:** ${s.todayBills} બિલ`,
          `• **આજનું કુલ વેચાણ (Revenue):** **${inr(s.todayRevenue)}**`,
          `• **માલની પડતર (COGS):** ${inr(s.todayCogs)}`,
          `• **ગ્રોસ નફો (Gross Profit):** **${inr(s.todayGrossProfit)}**`,
          `• **આજનો ખર્ચ (Expenses):** ${inr(s.todayExpenses)}`,
          `• **ચોખ્ખો નફો (Net Profit):** **${inr(s.todayNetProfit)}**`,
          ``,
          `### 💳 પેમેન્ટ મુજબ વિગત (આજે)`,
          `• રોકડ (Cash): **${inr(s.todayByPaymentMode.cash)}** | UPI: **${inr(s.todayByPaymentMode.upi)}** | Card: **${inr(s.todayByPaymentMode.card)}** | બાકી (Credit): **${inr(s.todayByPaymentMode.credit)}**`,
          ``,
          `### 📅 ૭ દિવસ અને ૩૦ દિવસની ઝલક`,
          `• છેલ્લા ૭ દિવસ: ${s.last7DaysBills} બિલ • વેચાણ **${inr(s.last7DaysRevenue)}** • અંદાજિત નફો **${inr(s.last7DaysEstimatedNetProfit)}**`,
          `• છેલ્લા ૩૦ દિવસ: ${s.last30DaysBills} બિલ • વેચાણ **${inr(s.last30DaysRevenue)}** • અંદાજિત નફો **${inr(s.last30DaysEstimatedNetProfit)}**`
        ].join('\n');
  }

  // General custom query fallback
  const top3 = ctx.topSellingProducts7d
    .slice(0, 3)
    .map((p) => `${p.productName} (${p.qtySold} ${p.unit})`)
    .join(', ');

  return isEn
    ? [
        `### ✨ ${ctx.shop.name} — Live Business Summary`,
        `• **Today's Sales (${s.todayDate}):** **${inr(s.todayRevenue)}** (${s.todayBills} bills) | **Net Profit:** **${inr(s.todayNetProfit)}**`,
        `• **Payment Split:** Cash ${inr(s.todayByPaymentMode.cash)} · UPI ${inr(s.todayByPaymentMode.upi)} · Credit ${inr(s.todayByPaymentMode.credit)}`,
        `• **7-Day Top Items:** ${top3 || 'No sales data yet'}`,
        `• **Stock Alerts:** ${ctx.lowStockCount} Low Stock (${ctx.outOfStockCount} out of stock)`,
        `• **Pending Ledgers:** Customer Dues **${inr(ctx.pendingCustomerDues.totalPendingAmount)}** | Agency Payables **${inr(ctx.pendingSupplierPayables.totalPendingBillsAmount)}**`
      ].join('\n')
    : [
        `### ✨ ${ctx.shop.name} — લાઈવ બિઝનેસ સારાંશ`,
        `• **આજનું વેચાણ (${s.todayDate}):** **${inr(s.todayRevenue)}** (${s.todayBills} બિલ) | **ચોખ્ખો નફો:** **${inr(s.todayNetProfit)}**`,
        `• **પેમેન્ટ વિભાજન:** Cash ${inr(s.todayByPaymentMode.cash)} • UPI ${inr(s.todayByPaymentMode.upi)} • Credit ${inr(s.todayByPaymentMode.credit)}`,
        `• **૭ દિવસની ટોપ આઈટમ્સ:** ${top3 || 'કોઈ વેચાણ ડેટા નથી'}`,
        `• **સ્ટોક એલર્ટ:** ${ctx.lowStockCount} Low Stock (${ctx.outOfStockCount} આઈટમ્સ 0 સ્ટોક)`,
        `• **બાકી હિસાબ:** કસ્ટમર ઉઘરાણી **${inr(ctx.pendingCustomerDues.totalPendingAmount)}** | એજન્સી પેમેન્ટ **${inr(ctx.pendingSupplierPayables.totalPendingBillsAmount)}**`,
        `• 💡 વધુ વિગતવાર વિશ્લેષણ માટે ઉપરના બટન પર ક્લિક કરો અથવા API Key સેટ કરીને AI મોડ ચાલુ કરો.`
      ].join('\n');
}
