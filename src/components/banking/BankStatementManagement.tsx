/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bank Statement & Passbook Management Component
 * Full ledger view of all incoming UPI sales, supplier transfers,
 * cash deposits, withdrawals, interest, and bank charges with running balance.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Landmark, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Wallet, 
  Plus, 
  Search, 
  Download, 
  Printer, 
  Filter, 
  RefreshCw, 
  CheckCircle2, 
  Trash2, 
  QrCode, 
  FileText, 
  CreditCard, 
  DollarSign,
  AlertCircle,
  Building,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { BankEntry, BankEntryCategory, BankEntryType, BankStatementSummary, Shop } from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';

interface BankStatementManagementProps {
  currentShop: Shop;
  onOpenProfileTab?: () => void;
}

export const BankStatementManagement: React.FC<BankStatementManagementProps> = ({
  currentShop,
  onOpenProfileTab
}) => {
  const [entries, setEntries] = useState<BankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<'TODAY' | 'WEEK' | 'MONTH' | 'ALL'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'CREDIT' | 'DEBIT'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State for Adding Bank Entry
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState(new Date().toISOString().split('T')[0]);
  const [modalType, setModalType] = useState<BankEntryType>('CREDIT');
  const [modalCategory, setModalCategory] = useState<BankEntryCategory>('CASH_DEPOSIT');
  const [modalAmount, setModalAmount] = useState<string>('');
  const [modalRef, setModalRef] = useState('');
  const [modalParty, setModalParty] = useState('');
  const [modalMode, setModalMode] = useState<'UPI' | 'NEFT_RTGS' | 'CHEQUE' | 'NET_BANKING' | 'CASH_DEPOSIT' | 'OTHER'>('CASH_DEPOSIT');
  const [modalDesc, setModalDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Load bank entries
  const loadEntries = async () => {
    try {
      setLoading(true);
      const list = await AppRepository.banking.getByShop(currentShop.id);
      setEntries(list);
    } catch (err) {
      console.error('Failed to load bank entries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, [currentShop.id]);

  // Date boundaries for filtering
  const filteredEntries = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    return entries.filter((e) => {
      // Date filter
      if (dateFilter === 'TODAY' && e.date !== todayStr) return false;
      if (dateFilter === 'WEEK' && e.date < sevenDaysAgo) return false;
      if (dateFilter === 'MONTH' && e.date < thirtyDaysAgo) return false;

      // Type filter
      if (typeFilter !== 'ALL' && e.type !== typeFilter) return false;

      // Category filter
      if (categoryFilter !== 'ALL' && e.category !== categoryFilter) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesRef = e.referenceNumber?.toLowerCase().includes(q);
        const matchesDesc = e.description?.toLowerCase().includes(q);
        const matchesParty = e.partyName?.toLowerCase().includes(q);
        if (!matchesRef && !matchesDesc && !matchesParty) return false;
      }

      return true;
    });
  }, [entries, dateFilter, typeFilter, categoryFilter, searchQuery]);

  // Calculate Running Balances from oldest to newest
  const entriesWithRunningBalance = useMemo(() => {
    // Sort ascending by date & createdAt for correct mathematical running balance
    const ascending = [...filteredEntries].sort(
      (a, b) => new Date(a.date || a.createdAt).getTime() - new Date(b.date || b.createdAt).getTime()
    );

    let running = 0;
    const mapped = ascending.map((item) => {
      if (item.type === 'CREDIT') {
        running += item.amount;
      } else {
        running -= item.amount;
      }
      return {
        ...item,
        runningBalance: running
      };
    });

    // Display newest at the top
    return mapped.reverse();
  }, [filteredEntries]);

  // Overall KPI Summary
  const summary: BankStatementSummary = useMemo(() => {
    let totalCredits = 0;
    let totalDebits = 0;
    let upiSalesTotal = 0;
    let upiSalesCount = 0;
    let supplierPaymentsTotal = 0;
    let cashDepositsTotal = 0;

    for (const e of entries) {
      if (e.type === 'CREDIT') {
        totalCredits += e.amount;
        if (e.category === 'UPI_SALE') {
          upiSalesTotal += e.amount;
          upiSalesCount += 1;
        } else if (e.category === 'CASH_DEPOSIT') {
          cashDepositsTotal += e.amount;
        }
      } else {
        totalDebits += e.amount;
        if (e.category === 'SUPPLIER_PAYMENT') {
          supplierPaymentsTotal += e.amount;
        }
      }
    }

    return {
      totalCredits,
      totalDebits,
      netBalance: totalCredits - totalDebits,
      upiSalesTotal,
      upiSalesCount,
      supplierPaymentsTotal,
      cashDepositsTotal
    };
  }, [entries]);

  // Handle Manual Entry Submit
  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(modalAmount);
    if (!parsedAmount || parsedAmount <= 0) {
      setFeedbackMessage({ text: 'Please enter a valid positive amount.', type: 'error' });
      return;
    }

    try {
      setIsSubmitting(true);
      const newEntry: Omit<BankEntry, 'id' | 'createdAt'> = {
        shopId: currentShop.id,
        date: modalDate,
        type: modalType,
        category: modalCategory,
        amount: parsedAmount,
        referenceNumber: modalRef.trim() || `MAN-${Date.now().toString().slice(-6)}`,
        description: modalDesc.trim() || `${modalCategory.replace('_', ' ')} manual entry`,
        partyName: modalParty.trim() || currentShop.bankName || 'Bank',
        paymentMode: modalMode
      };

      await AppRepository.banking.saveEntry(newEntry);
      setIsAddModalOpen(false);
      setModalAmount('');
      setModalRef('');
      setModalDesc('');
      setModalParty('');
      setFeedbackMessage({ text: 'બેંક એન્ટ્રી સફળતાપૂર્વક સાચવવામાં આવી!', type: 'success' });
      setTimeout(() => setFeedbackMessage(null), 3000);
      await loadEntries();
    } catch (err: any) {
      setFeedbackMessage({ text: err?.message || 'Failed to add bank entry', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Entry
  const handleDeleteEntry = async (id: string) => {
    if (!confirm('શું તમે આ બેંક એન્ટ્રી ડિલીટ કરવા માંગો છો? (Are you sure you want to delete this bank entry?)')) {
      return;
    }
    try {
      await AppRepository.banking.deleteEntry(id);
      await loadEntries();
    } catch (err) {
      console.error('Failed to delete entry:', err);
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    if (entriesWithRunningBalance.length === 0) return;
    const headers = ['Date', 'Type', 'Category', 'Amount (INR)', 'Running Balance', 'Reference #', 'Party Name', 'Payment Mode', 'Description'];
    const rows = entriesWithRunningBalance.map((e) => [
      e.date,
      e.type,
      e.category,
      e.amount.toFixed(2),
      e.runningBalance.toFixed(2),
      `"${e.referenceNumber || ''}"`,
      `"${e.partyName || ''}"`,
      e.paymentMode,
      `"${e.description || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Amul_Bank_Statement_${currentShop.shopCode}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCategoryBadge = (cat: BankEntryCategory) => {
    switch (cat) {
      case 'UPI_SALE':
        return <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded text-[10px] font-bold">UPI વેચાણ (UPI Sale)</span>;
      case 'SUPPLIER_PAYMENT':
        return <span className="bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 px-2 py-0.5 rounded text-[10px] font-bold">સપ્લાયર (Supplier Pay)</span>;
      case 'CASH_DEPOSIT':
        return <span className="bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 px-2 py-0.5 rounded text-[10px] font-bold">રોકડ જમા (Cash Deposit)</span>;
      case 'CASH_WITHDRAWAL':
        return <span className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded text-[10px] font-bold">રોકડ ઉપાડ (Withdrawal)</span>;
      case 'EXPENSE':
        return <span className="bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 px-2 py-0.5 rounded text-[10px] font-bold">ખર્ચ (Expense)</span>;
      case 'BANK_CHARGES':
        return <span className="bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 px-2 py-0.5 rounded text-[10px] font-bold">બેંક ચાર્જ (Charges)</span>;
      case 'INTEREST':
        return <span className="bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300 px-2 py-0.5 rounded text-[10px] font-bold">વ્યાજ જમા (Interest)</span>;
      default:
        return <span className="bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold">{cat}</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner / Account Overview */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wide">
              Bank Passbook
            </span>
            <span className="text-xs font-mono font-bold text-slate-500">
              {currentShop.bankName || 'Amul Official Settlement Account'}
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Landmark className="w-5 h-5 text-emerald-600" />
            બેંક એન્ટ્રી & પાસબુક સ્ટેટમેન્ટ (Bank Statement)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time reconciliation of counter UPI payments, distributor payments, cash deposits, and running bank balance.
          </p>
        </div>

        {/* Bank Credentials Mini Tag */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
              {currentShop.accountHolderName || currentShop.ownerName}
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              A/C: {currentShop.accountNumber ? `•••• ${currentShop.accountNumber.slice(-4)}` : 'Not set'} • IFSC: {currentShop.ifscCode || 'N/A'}
            </div>
            <div className="text-[10px] font-mono text-blue-600 dark:text-blue-400 font-bold">
              UPI: {currentShop.upiId || `amul.${currentShop.shopCode.toLowerCase()}@okhdfcbank`}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            + નવી એન્ટ્રી ઉમેરો (Add Entry)
          </button>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedbackMessage && (
        <div className={`p-4 rounded-xl text-xs flex items-center gap-2.5 shadow-xs ${
          feedbackMessage.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
            : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
        }`}>
          {feedbackMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* 4 Financial KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Credits */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              કુલ જમા (Total Credit)
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="font-mono text-2xl font-black text-emerald-600">
            ₹{summary.totalCredits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            UPI વેચાણ + રોકડ જમા + વ્યાજ
          </div>
        </div>

        {/* 2. Total Debits */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              કુલ ઉધાર (Total Debit)
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-600">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="font-mono text-2xl font-black text-rose-600">
            ₹{summary.totalDebits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            ડેપો સપ્લાયર પેમેન્ટ + બેંક ખર્ચ
          </div>
        </div>

        {/* 3. Net Calculated Bank Balance */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              ચોખ્ખી શિલ્લક (Net Balance)
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className={`font-mono text-2xl font-black ${
            summary.netBalance >= 0 ? 'text-[#005A9C] dark:text-blue-400' : 'text-rose-600'
          }`}>
            ₹{summary.netBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            કુલ જમા માઇનસ કુલ ઉધાર
          </div>
        </div>

        {/* 4. Customer UPI Transactions */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              UPI કાઉન્ટર વેચાણ (UPI Sales)
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600">
              <QrCode className="w-4 h-4" />
            </div>
          </div>
          <div className="font-mono text-2xl font-black text-indigo-600">
            ₹{summary.upiSalesTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {summary.upiSalesCount} સ્કેન પેમેન્ટ એન્ટ્રીઓ
          </div>
        </div>
      </div>

      {/* Filter Bar & Controls */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Date Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {(['TODAY', 'WEEK', 'MONTH', 'ALL'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setDateFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  dateFilter === tab
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {tab === 'TODAY' && 'આજે (Today)'}
                {tab === 'WEEK' && 'આ અઠવાડિયે (7 Days)'}
                {tab === 'MONTH' && 'આ મહિને (30 Days)'}
                {tab === 'ALL' && 'બધા (All Time)'}
              </button>
            ))}
          </div>

          {/* Action buttons (CSV / Print) */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              CSV ડાઉનલોડ
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              પ્રિન્ટ પાસબુક
            </button>
          </div>
        </div>

        {/* Second row filters: Type, Category, and Search Input */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="sm:col-span-3">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:outline-hidden"
            >
              <option value="ALL">બધા ટ્રાન્ઝેક્શન (All Types)</option>
              <option value="CREDIT">જમા માત્ર (Credit Only)</option>
              <option value="DEBIT">ઉધાર માત્ર (Debit Only)</option>
            </select>
          </div>

          <div className="sm:col-span-4">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:outline-hidden"
            >
              <option value="ALL">બધી કેટેગરી (All Categories)</option>
              <option value="UPI_SALE">UPI વેચાણ (UPI Sale)</option>
              <option value="SUPPLIER_PAYMENT">સપ્લાયર ચુકવણી (Supplier Payment)</option>
              <option value="CASH_DEPOSIT">રોકડ જમા (Cash Deposit)</option>
              <option value="CASH_WITHDRAWAL">રોકડ ઉપાડ (Cash Withdrawal)</option>
              <option value="EXPENSE">દુકાન ખર્ચ (Expense)</option>
              <option value="BANK_CHARGES">બેંક ચાર્જિસ (Bank Charges)</option>
              <option value="INTEREST">વ્યાજ જમા (Interest)</option>
            </select>
          </div>

          <div className="sm:col-span-5 relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="બિલ નં., રેફરન્સ અથવા પાર્ટી શોધો..."
              className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>
        </div>
      </div>

      {/* Statement Ledger Table with Running Balance */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-extrabold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">તારીખ (Date)</th>
                <th className="py-3 px-4">રેફરન્સ # (Ref No)</th>
                <th className="py-3 px-4">વિગત (Description)</th>
                <th className="py-3 px-4">કેટેગરી (Category)</th>
                <th className="py-3 px-4">પાર્ટી / ગ્રાહક (Party)</th>
                <th className="py-3 px-4">મોડ (Mode)</th>
                <th className="py-3 px-4 text-right text-emerald-700 dark:text-emerald-400">જમા (Credit +₹)</th>
                <th className="py-3 px-4 text-right text-rose-700 dark:text-rose-400">ઉધાર (Debit -₹)</th>
                <th className="py-3 px-4 text-right">શિલ્લક (Balance ₹)</th>
                <th className="py-3 px-4 text-center no-print">ક્રિયા</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                    બેંક એન્ટ્રીઓ લોડ થઈ રહી છે...
                  </td>
                </tr>
              ) : entriesWithRunningBalance.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Landmark className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    કોઈ બેંક એન્ટ્રી મળી નથી (No bank entries found).
                  </td>
                </tr>
              ) : (
                entriesWithRunningBalance.map((item) => {
                  const isCredit = item.type === 'CREDIT';
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition"
                    >
                      <td className="py-3 px-4 font-mono font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {item.date}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {item.referenceNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 max-w-xs truncate" title={item.description}>
                        {item.description}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getCategoryBadge(item.category)}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {item.partyName || '-'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-500">
                        {item.paymentMode}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {isCredit ? `+₹${item.amount.toFixed(2)}` : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-rose-600 dark:text-rose-400 whitespace-nowrap">
                        {!isCredit ? `-₹${item.amount.toFixed(2)}` : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-slate-900 dark:text-white whitespace-nowrap">
                        ₹{item.runningBalance.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap no-print">
                        {item.id.startsWith('bank-man-') ? (
                          <button
                            onClick={() => handleDeleteEntry(item.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                            title="Delete manual entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-300 font-mono">Auto</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Bank Entry Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Landmark className="w-5 h-5 text-emerald-600" />
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                  નવી બેંક એન્ટ્રી (Add Bank Transaction)
                </h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddEntry} className="space-y-4">
              {/* Type Switcher (Credit vs Debit) */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalType('CREDIT');
                    setModalCategory('CASH_DEPOSIT');
                  }}
                  className={`py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    modalType === 'CREDIT'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  જમા (Credit / In)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModalType('DEBIT');
                    setModalCategory('SUPPLIER_PAYMENT');
                  }}
                  className={`py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    modalType === 'DEBIT'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4" />
                  ઉધાર (Debit / Out)
                </button>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  રકમ (Amount in ₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={modalAmount}
                  onChange={(e) => setModalAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-base font-mono font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  required
                  autoFocus
                />
              </div>

              {/* Date & Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    તારીખ (Date) *
                  </label>
                  <input
                    type="date"
                    value={modalDate}
                    onChange={(e) => setModalDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    કેટેગરી (Category) *
                  </label>
                  <select
                    value={modalCategory}
                    onChange={(e) => setModalCategory(e.target.value as BankEntryCategory)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  >
                    {modalType === 'CREDIT' ? (
                      <>
                        <option value="CASH_DEPOSIT">રોકડ જમા (Cash Deposit)</option>
                        <option value="UPI_SALE">UPI વેચાણ (UPI Sale)</option>
                        <option value="INTEREST">બેંક વ્યાજ (Interest Credit)</option>
                        <option value="OTHER">અન્ય જમા (Other Credit)</option>
                      </>
                    ) : (
                      <>
                        <option value="SUPPLIER_PAYMENT">સપ્લાયર ચુકવણી (Supplier Pay)</option>
                        <option value="CASH_WITHDRAWAL">રોકડ ઉપાડ (Cash Withdrawal)</option>
                        <option value="EXPENSE">દુકાન ખર્ચ (Shop Expense)</option>
                        <option value="BANK_CHARGES">બેંક ચાર્જિસ (Bank Charges)</option>
                        <option value="DRAWINGS">માલિકી ઉપાડ (Drawings)</option>
                        <option value="OTHER">અન્ય ઉધાર (Other Debit)</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Reference # & Payment Mode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    સંદર્ભ / સ્લિપ નં. (Ref / Slip #)
                  </label>
                  <input
                    type="text"
                    value={modalRef}
                    onChange={(e) => setModalRef(e.target.value)}
                    placeholder="DEP-01 અથવા UTR #"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    મોડ (Payment Mode)
                  </label>
                  <select
                    value={modalMode}
                    onChange={(e) => setModalMode(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  >
                    <option value="CASH_DEPOSIT">Cash Deposit</option>
                    <option value="UPI">UPI</option>
                    <option value="NEFT_RTGS">NEFT / RTGS</option>
                    <option value="NET_BANKING">Net Banking</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              {/* Party Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  પાર્ટી / વ્યક્તિ / શાખા (Party Name)
                </label>
                <input
                  type="text"
                  value={modalParty}
                  onChange={(e) => setModalParty(e.target.value)}
                  placeholder="e.g. SBI Anand Branch અથવા GCMMF Depot"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  વિગત / નોંધ (Notes / Description)
                </label>
                <input
                  type="text"
                  value={modalDesc}
                  onChange={(e) => setModalDesc(e.target.value)}
                  placeholder="e.g. Counter cash sales deposited into bank"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  રદ કરો (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  સાચવો (Save Entry)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
