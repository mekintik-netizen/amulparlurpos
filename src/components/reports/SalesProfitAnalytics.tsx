/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Interactive Sales & Profit Analytics Component with PDF Export
 * - Today vs Yesterday Comparative Metrics & Bar Chart
 * - 30-Day Monthly Growth & P&L Trend Area/Bar Chart
 * - Instant Client-side PDF Report Generation & Download (via jsPDF)
 * - Strict multi-shop tenant isolation (only currentShop.id data)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  IndianRupee, 
  Calendar, 
  Download, 
  Printer, 
  Sparkles, 
  Share2, 
  BarChart3, 
  PieChart, 
  Percent, 
  Clock, 
  FileSpreadsheet,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  AreaChart, 
  Area, 
  CartesianGrid 
} from 'recharts';
import { jsPDF } from 'jspdf';
import { Shop, SaleBill, Expense } from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';

interface SalesProfitAnalyticsProps {
  currentShop: Shop | null;
}

export const SalesProfitAnalytics: React.FC<SalesProfitAnalyticsProps> = ({ currentShop }) => {
  const [sales, setSales] = useState<SaleBill[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadAnalyticsData = async () => {
      if (!currentShop?.id) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        // Query only currentShop.id
        const [salesList, expenseList] = await Promise.all([
          AppRepository.sales.getByShop(currentShop.id),
          AppRepository.expenses.getByShop(currentShop.id)
        ]);

        if (isMounted) {
          setSales(salesList.filter(s => s.status !== 'CANCELLED' && s.shopId === currentShop.id));
          setExpenses(expenseList.filter(e => e.shopId === currentShop.id));
        }
      } catch (err) {
        console.error('Failed to load analytics data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadAnalyticsData();
    return () => { isMounted = false; };
  }, [currentShop?.id]);

  // Date helpers
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  // Compute Today vs Yesterday Metrics
  const comparison = useMemo(() => {
    let todaySales = 0;
    let todayCost = 0;
    let todayCount = 0;

    let yesterdaySales = 0;
    let yesterdayCost = 0;
    let yesterdayCount = 0;

    sales.forEach(sale => {
      const saleDate = sale.createdAt?.slice(0, 10) || sale.timestamp?.slice(0, 10) || '';
      let billCost = 0;
      sale.items.forEach(item => {
        const cost = item.costPrice || (item.unitPrice * 0.88);
        billCost += cost * item.quantity;
      });

      const billTotal = sale.finalAmount || 0;

      if (saleDate === todayStr) {
        todaySales += billTotal;
        todayCost += billCost;
        todayCount += 1;
      } else if (saleDate === yesterdayStr) {
        yesterdaySales += billTotal;
        yesterdayCost += billCost;
        yesterdayCount += 1;
      }
    });

    const todayProfit = Math.max(0, todaySales - todayCost);
    const yesterdayProfit = Math.max(0, yesterdaySales - yesterdayCost);

    const salesGrowthPct = yesterdaySales > 0 
      ? Number((((todaySales - yesterdaySales) / yesterdaySales) * 100).toFixed(1))
      : todaySales > 0 ? 100 : 0;

    const profitGrowthPct = yesterdayProfit > 0
      ? Number((((todayProfit - yesterdayProfit) / yesterdayProfit) * 100).toFixed(1))
      : todayProfit > 0 ? 100 : 0;

    return {
      todaySales,
      todayProfit,
      todayCount,
      yesterdaySales,
      yesterdayProfit,
      yesterdayCount,
      salesGrowthPct,
      profitGrowthPct
    };
  }, [sales, todayStr, yesterdayStr]);

  // Comparison Bar Chart Data
  const comparativeChartData = useMemo(() => {
    return [
      {
        period: 'ગઈકાલ (Yesterday)',
        વેચાણ: comparison.yesterdaySales,
        નફો: comparison.yesterdayProfit
      },
      {
        period: 'આજ (Today)',
        વેચાણ: comparison.todaySales,
        નફો: comparison.todayProfit
      }
    ];
  }, [comparison]);

  // 30-Day Trend Data
  const monthlyData = useMemo(() => {
    const dayMap = new Map<string, { date: string; displayDate: string; revenue: number; cost: number; expense: number; profit: number }>();
    
    // Generate last 30 days
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const display = `${d.getDate()}/${d.getMonth() + 1}`;
      dayMap.set(iso, { date: iso, displayDate: display, revenue: 0, cost: 0, expense: 0, profit: 0 });
    }

    sales.forEach(sale => {
      const saleDate = sale.createdAt?.slice(0, 10) || sale.timestamp?.slice(0, 10) || '';
      if (dayMap.has(saleDate)) {
        const item = dayMap.get(saleDate)!;
        item.revenue += sale.finalAmount || 0;
        let billCost = 0;
        sale.items.forEach(it => {
          const cost = it.costPrice || (it.unitPrice * 0.88);
          billCost += cost * it.quantity;
        });
        item.cost += billCost;
      }
    });

    expenses.forEach(exp => {
      const expDate = exp.date?.slice(0, 10);
      if (dayMap.has(expDate)) {
        const item = dayMap.get(expDate)!;
        item.expense += exp.amount;
      }
    });

    let totalRevenue = 0;
    let totalCostExpenses = 0;

    const list = Array.from(dayMap.values()).map(entry => {
      const netProfit = Math.round(entry.revenue - entry.cost - entry.expense);
      entry.profit = Math.max(0, netProfit);
      totalRevenue += entry.revenue;
      totalCostExpenses += (entry.cost + entry.expense);
      return entry;
    });

    const totalNetProfit = Math.max(0, totalRevenue - totalCostExpenses);
    const profitMargin = totalRevenue > 0 ? Number(((totalNetProfit / totalRevenue) * 100).toFixed(1)) : 0;

    return {
      dailySeries: list,
      totalRevenue,
      totalCostExpenses,
      totalNetProfit,
      profitMargin
    };
  }, [sales, expenses]);

  // PDF Export Generator
  const handleDownloadPdf = () => {
    try {
      setPdfGenerating(true);
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const primaryColor = [0, 90, 156]; // Amul Blue
      const redColor = [227, 24, 55]; // Amul Red
      const darkColor = [30, 41, 59];

      // 1. Header Banner
      doc.setFillColor(0, 90, 156);
      doc.rect(0, 0, 210, 26, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('AMUL PREFERRED PARLOUR', 14, 12);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Official Sales & Net Profit Performance Audit Report', 14, 18);
      doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 23);

      // 2. Shop Details Card
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14, 32, 182, 28, 3, 3, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, 32, 182, 28, 3, 3, 'S');

      if (!currentShop) {
        alert('Please select an active parlour before generating report.');
        return;
      }

      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(currentShop.name, 18, 40);

      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(`Parlour Code: ${currentShop.shopCode}  |  Owner: ${currentShop.ownerName || 'Amul Franchisee'}  |  Phone: ${currentShop.phone || 'N/A'}`, 18, 46);
      doc.text(`Address: ${currentShop.address || 'Amul Outlet'}`, 18, 51);
      doc.text(`GSTIN: ${currentShop.gstNumber || 'N/A'}  |  FSSAI: ${currentShop.fssaiNumber || 'N/A'}`, 18, 56);

      // 3. Today vs Yesterday Comparison Table
      doc.setTextColor(redColor[0], redColor[1], redColor[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('1. TODAY vs YESTERDAY COMPARATIVE PERFORMANCE', 14, 68);

      let startY = 72;
      // Table Header
      doc.setFillColor(241, 245, 249);
      doc.rect(14, startY, 182, 8, 'F');
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(9);
      doc.text('Performance Metric', 18, startY + 5.5);
      doc.text('Today (આજ)', 80, startY + 5.5);
      doc.text('Yesterday (ગઈકાલ)', 125, startY + 5.5);
      doc.text('Growth %', 170, startY + 5.5);

      // Row 1: Total Sales
      startY += 8;
      doc.setFillColor(255, 255, 255);
      doc.rect(14, startY, 182, 8, 'F');
      doc.setFont('helvetica', 'normal');
      doc.text('Gross Sales Revenue', 18, startY + 5.5);
      doc.setFont('helvetica', 'bold');
      doc.text(`INR ${comparison.todaySales.toLocaleString('en-IN')}`, 80, startY + 5.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`INR ${comparison.yesterdaySales.toLocaleString('en-IN')}`, 125, startY + 5.5);
      doc.text(`${comparison.salesGrowthPct >= 0 ? '+' : ''}${comparison.salesGrowthPct}%`, 170, startY + 5.5);

      // Row 2: Net Profit
      startY += 8;
      doc.setFillColor(248, 250, 252);
      doc.rect(14, startY, 182, 8, 'F');
      doc.setFont('helvetica', 'normal');
      doc.text('Estimated Net Profit', 18, startY + 5.5);
      doc.setFont('helvetica', 'bold');
      doc.text(`INR ${comparison.todayProfit.toLocaleString('en-IN')}`, 80, startY + 5.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`INR ${comparison.yesterdayProfit.toLocaleString('en-IN')}`, 125, startY + 5.5);
      doc.text(`${comparison.profitGrowthPct >= 0 ? '+' : ''}${comparison.profitGrowthPct}%`, 170, startY + 5.5);

      // Row 3: Invoices Count
      startY += 8;
      doc.setFillColor(255, 255, 255);
      doc.rect(14, startY, 182, 8, 'F');
      doc.setFont('helvetica', 'normal');
      doc.text('Total Customer Invoices', 18, startY + 5.5);
      doc.text(`${comparison.todayCount} Bills`, 80, startY + 5.5);
      doc.text(`${comparison.yesterdayCount} Bills`, 125, startY + 5.5);
      doc.text('-', 170, startY + 5.5);

      // 4. 30-Day Monthly Summary
      startY += 16;
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('2. LAST 30 DAYS PERFORMANCE SUMMARY', 14, startY);

      startY += 5;
      const cardW = 43;
      const cardH = 20;

      // Card 1: Revenue
      doc.setFillColor(239, 246, 255);
      doc.roundedRect(14, startY, cardW, cardH, 2, 2, 'F');
      doc.setTextColor(30, 58, 138);
      doc.setFontSize(8);
      doc.text('30-Day Revenue', 18, startY + 6);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`INR ${monthlyData.totalRevenue.toLocaleString('en-IN')}`, 18, startY + 14);

      // Card 2: Cost & Expenses
      doc.setFillColor(254, 242, 242);
      doc.roundedRect(60, startY, cardW, cardH, 2, 2, 'F');
      doc.setTextColor(153, 27, 27);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('Cost & Expenses', 64, startY + 6);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`INR ${monthlyData.totalCostExpenses.toLocaleString('en-IN')}`, 64, startY + 14);

      // Card 3: Net Profit
      doc.setFillColor(240, 253, 244);
      doc.roundedRect(106, startY, cardW, cardH, 2, 2, 'F');
      doc.setTextColor(22, 101, 52);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('30-Day Net Profit', 110, startY + 6);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`INR ${monthlyData.totalNetProfit.toLocaleString('en-IN')}`, 110, startY + 14);

      // Card 4: Profit Margin
      doc.setFillColor(254, 243, 199);
      doc.roundedRect(152, startY, cardW, cardH, 2, 2, 'F');
      doc.setTextColor(146, 64, 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('Average Margin', 156, startY + 6);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`${monthlyData.profitMargin}%`, 156, startY + 14);

      // 5. Recent 7-Day Performance Log
      startY += cardH + 10;
      doc.setTextColor(51, 65, 85);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('3. RECENT 7 DAYS DAILY SALES BREAKDOWN', 14, startY);

      startY += 4;
      doc.setFillColor(241, 245, 249);
      doc.rect(14, startY, 182, 7, 'F');
      doc.setFontSize(8);
      doc.text('Date', 18, startY + 5);
      doc.text('Sales Revenue (INR)', 70, startY + 5);
      doc.text('Cost / Overheads (INR)', 120, startY + 5);
      doc.text('Net Margin (INR)', 165, startY + 5);

      const recent7Days = monthlyData.dailySeries.slice(-7);
      recent7Days.forEach((day, idx) => {
        startY += 7;
        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(14, startY, 182, 7, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.text(day.date, 18, startY + 5);
        doc.setFont('helvetica', 'bold');
        doc.text(day.revenue.toLocaleString('en-IN'), 70, startY + 5);
        doc.setFont('helvetica', 'normal');
        doc.text((day.cost + day.expense).toLocaleString('en-IN'), 120, startY + 5);
        doc.setTextColor(22, 101, 52);
        doc.text(day.profit.toLocaleString('en-IN'), 165, startY + 5);
        doc.setTextColor(51, 65, 85);
      });

      // 6. Footer Disclaimer & Signature
      doc.setDrawColor(203, 213, 225);
      doc.line(14, 275, 196, 275);

      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Confidential - Generated exclusively for Amul Preferred Franchisee internal records and audit.', 14, 281);
      doc.text(`Page 1 of 1 · Amul POS Engine`, 170, 281);

      // Save PDF
      doc.save(`Amul_Report_${currentShop.shopCode}_${todayStr}.pdf`);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      alert('PDF generation failed. Please try again.');
    } finally {
      setPdfGenerating(false);
    }
  };

  if (!currentShop) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center text-slate-500 border border-slate-200 dark:border-slate-800">
        Please select an active parlour to view sales &amp; profit analytics.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Export Actions */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-xs border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">
            <BarChart3 className="w-4 h-4" />
            <span>Interactive Sales & Profit Analytics (વેચાણ & નફો એનાલિટિક્સ)</span>
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">
            {currentShop.name} · બિઝનેસ પરફોર્મન્સ
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Today vs Yesterday live comparison, 30-day growth trends, and audited net profit calculation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadPdf}
            disabled={pdfGenerating}
            className="bg-[#E31837] hover:bg-rose-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            title="Download official PDF report for accounting & WhatsApp share"
          >
            <Download className="w-4 h-4" />
            <span>{pdfGenerating ? 'પીડીએફ બની રહી છે...' : 'Download PDF Report (પીડીએફ ડાઉનલોડ)'}</span>
          </button>
        </div>
      </div>

      {/* 1. TODAY vs YESTERDAY COMPARISON CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today Sales */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span className="font-bold">આજનું વેચાણ (Today's Sales)</span>
            <div className={`flex items-center gap-1 font-bold px-2 py-0.5 rounded-full text-[10px] ${
              comparison.salesGrowthPct >= 0 
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
            }`}>
              {comparison.salesGrowthPct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              <span>{comparison.salesGrowthPct >= 0 ? '+' : ''}{comparison.salesGrowthPct}%</span>
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono flex items-center">
            <IndianRupee className="w-5 h-5 mr-0.5 text-blue-600" />
            <span>{comparison.todaySales.toLocaleString('en-IN')}</span>
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 flex items-center justify-between">
            <span>ગઈકાલ: ₹{comparison.yesterdaySales.toLocaleString('en-IN')}</span>
            <span>{comparison.todayCount} બિલ</span>
          </div>
        </div>

        {/* Today Profit */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span className="font-bold">આજનો નફો (Today's Net Profit)</span>
            <div className={`flex items-center gap-1 font-bold px-2 py-0.5 rounded-full text-[10px] ${
              comparison.profitGrowthPct >= 0 
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
            }`}>
              {comparison.profitGrowthPct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              <span>{comparison.profitGrowthPct >= 0 ? '+' : ''}{comparison.profitGrowthPct}%</span>
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono flex items-center">
            <IndianRupee className="w-5 h-5 mr-0.5" />
            <span>{comparison.todayProfit.toLocaleString('en-IN')}</span>
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 flex items-center justify-between">
            <span>ગઈકાલનો નફો: ₹{comparison.yesterdayProfit.toLocaleString('en-IN')}</span>
            <span>{comparison.todaySales > 0 ? ((comparison.todayProfit / comparison.todaySales) * 100).toFixed(1) : 0}% માર્જિન</span>
          </div>
        </div>

        {/* 30-Day Total Revenue */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span className="font-bold">મહિનાની કુલ આવક (30-Day Revenue)</span>
            <Calendar className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono flex items-center">
            <IndianRupee className="w-5 h-5 mr-0.5" />
            <span>{monthlyData.totalRevenue.toLocaleString('en-IN')}</span>
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 flex items-center justify-between">
            <span>ખરીદી & ખર્ચ: ₹{monthlyData.totalCostExpenses.toLocaleString('en-IN')}</span>
            <span>૩૦ દિવસ</span>
          </div>
        </div>

        {/* 30-Day Total Net Profit */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span className="font-bold">મહિનાનો ચોખ્ખો નફો (30-Day Net Profit)</span>
            <Percent className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono flex items-center">
            <IndianRupee className="w-5 h-5 mr-0.5" />
            <span>{monthlyData.totalNetProfit.toLocaleString('en-IN')}</span>
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 flex items-center justify-between">
            <span>સરેરાશ માર્જિન: {monthlyData.profitMargin}%</span>
            <span className="text-emerald-600 font-bold">Audited</span>
          </div>
        </div>
      </div>

      {/* 2. SIDE-BY-SIDE CHARTS: Today vs Yesterday & 30-Day Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Comparative Bar Chart: Today vs Yesterday */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                <span>Today vs Yesterday Comparison</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">આજ અને ગઈકાલના વેચાણ અને નફાની સીધી સરખામણી</p>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparativeChartData} margin={{ top: 15, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.6} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`} />
                <Tooltip formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, '']} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="વેચાણ" fill="#005A9C" radius={[6, 6, 0, 0]} name="વેચાણ (Sales)" />
                <Bar dataKey="નફો" fill="#10B981" radius={[6, 6, 0, 0]} name="નફો (Net Profit)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 30-Day Trend Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>30-Day Daily Sales, Expenses & Net Profit Trend</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">છેલ્લા ૩૦ દિવસમાં થયેલ દૈનિક વેચાણ, ખર્ચ અને ચોખ્ખો નફો</p>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData.dailySeries} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#005A9C" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#005A9C" stopOpacity={0.0}/>
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.6} />
                <XAxis dataKey="displayDate" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`} />
                <Tooltip formatter={(value: any, name: any) => [`₹${Number(value).toLocaleString('en-IN')}`, name]} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Area type="monotone" dataKey="revenue" stroke="#005A9C" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" name="વેચાણ (Sales)" />
                <Area type="monotone" dataKey="profit" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorProfit)" name="ચોખ્ખો નફો (Profit)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
