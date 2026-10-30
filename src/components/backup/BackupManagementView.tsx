/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Dedicated Data Management & Backup/Restore Center
 * Provides full local-first data safety, portable versioned JSON export,
 * atomic IndexedDB restoration with pre-restore safety snapshots,
 * and scheduled daily 8:00 PM backup reminder management.
 */

import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Download, 
  Upload, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  RotateCcw, 
  HardDrive, 
  FileJson, 
  History, 
  Settings, 
  Terminal, 
  AlertCircle, 
  RefreshCw,
  FileCheck,
  Calendar,
  Lock,
  ExternalLink,
  Info
} from 'lucide-react';
import { Shop, BackupSettings, LocalDatabaseExport, StoredBackupRecord, BackupManifest } from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';

interface BackupManagementViewProps {
  currentShop: Shop | null;
  onDataReload: () => void;
}

type SubTab = 'EXPORT' | 'RESTORE' | 'HISTORY' | 'AUTOMATION';

export const BackupManagementView: React.FC<BackupManagementViewProps> = ({
  currentShop,
  onDataReload
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('EXPORT');
  const [settings, setSettings] = useState<BackupSettings>({
    autoBackupEnabled: true,
    scheduledTime: '20:00',
    retentionDays: 14
  });
  const [storedBackups, setStoredBackups] = useState<StoredBackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Export scope
  const [exportScope, setExportScope] = useState<'CURRENT' | 'ALL'>('CURRENT');

  // Restore State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedBackup, setParsedBackup] = useState<LocalDatabaseExport | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [autoSafetySnapshot, setAutoSafetySnapshot] = useState(true);
  const [lastSafetyBackupId, setLastSafetyBackupId] = useState<string | null>(null);

  // Load configuration and history
  const loadState = async () => {
    try {
      setLoading(true);
      const bkpSettings = await AppRepository.system.getBackupSettings();
      setSettings(bkpSettings);

      if (currentShop) {
        const list = await AppRepository.system.getStoredBackups(currentShop.id);
        setStoredBackups(list);
      }
    } catch (err) {
      console.error('Failed to load backup manager state:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadState();
  }, [currentShop?.id]);

  // Handle Manual JSON Export
  const handleDownloadBackup = async () => {
    if (!currentShop && exportScope === 'CURRENT') {
      setStatusMessage({ text: 'Please select an active shop to export.', type: 'error' });
      return;
    }

    try {
      setIsProcessing(true);
      setStatusMessage(null);

      const shopIdToExport = exportScope === 'CURRENT' && currentShop ? currentShop.id : 'all';
      const backupData = await AppRepository.system.exportData(shopIdToExport);

      const todayStr = new Date().toISOString().slice(0, 10);
      const shopCodeSlug = exportScope === 'CURRENT' && currentShop ? currentShop.shopCode.replace(/[^a-zA-Z0-9_-]/g, '') : 'ALL_SHOPS';
      const filename = `AmulParlour_Backup_${shopCodeSlug}_${todayStr}.json`;

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Record snapshot in IndexedDB history
      if (currentShop) {
        await AppRepository.system.createBackup(currentShop.id, 'MANUAL');
        await loadState();
      }

      setStatusMessage({
        text: `Backup exported successfully as "${filename}" (${(blob.size / 1024).toFixed(1)} KB).`,
        type: 'success'
      });
    } catch (err: any) {
      console.error('Failed to export backup file:', err);
      setStatusMessage({
        text: err?.message || 'Failed to generate backup JSON file.',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle File Input Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setParseError(null);
    setParsedBackup(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const json = JSON.parse(text) as LocalDatabaseExport;

        // Basic schema verification
        if (!json || typeof json !== 'object') {
          throw new Error('Selected file does not contain valid JSON data.');
        }

        if (!Array.isArray(json.shops) || !Array.isArray(json.products) || !Array.isArray(json.sales)) {
          throw new Error('Incompatible backup format: "shops", "products", or "sales" stores are missing.');
        }

        setParsedBackup(json);
      } catch (err: any) {
        setParseError(err?.message || 'Corrupted or unreadable backup JSON file.');
      }
    };

    reader.onerror = () => {
      setParseError('Failed to read file from disk.');
    };

    reader.readAsText(file);
  };

  // Execute Restore
  const handleExecuteRestore = async () => {
    if (!parsedBackup) return;

    try {
      setIsProcessing(true);
      setStatusMessage(null);

      const targetShopId = currentShop?.id || (parsedBackup.shops[0]?.id) || 'all';
      const result = await AppRepository.system.importData(parsedBackup, {
        currentShopId: targetShopId,
        createSafetySnapshot: autoSafetySnapshot
      });

      if (result.safetyBackupId) {
        setLastSafetyBackupId(result.safetyBackupId);
      }

      setStatusMessage({
        text: `Restoration complete: ${result.message}`,
        type: 'success'
      });

      // Reload global application data
      onDataReload();
      await loadState();
    } catch (err: any) {
      console.error('Restore error:', err);
      setStatusMessage({
        text: err?.message || 'Restoration failed. Local database was kept safe.',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Rollback to last safety snapshot
  const handleRollback = async () => {
    if (!lastSafetyBackupId) return;

    try {
      setIsProcessing(true);
      setStatusMessage(null);

      const result = await AppRepository.system.restoreFromStoredBackup(lastSafetyBackupId, {
        currentShopId: currentShop?.id,
        createSafetySnapshot: false
      });

      setStatusMessage({
        text: `Rollback successful! Restored data to pre-restore safety snapshot.`,
        type: 'success'
      });

      setLastSafetyBackupId(null);
      onDataReload();
      await loadState();
    } catch (err: any) {
      console.error('Rollback error:', err);
      setStatusMessage({
        text: err?.message || 'Rollback failed.',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsProcessing(true);
      await AppRepository.system.saveBackupSettings(settings);
      setStatusMessage({
        text: 'Backup automation settings updated successfully.',
        type: 'success'
      });
    } catch (err: any) {
      setStatusMessage({
        text: err?.message || 'Failed to save settings.',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Health Metrics */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 flex items-center justify-center text-[#005A9C] dark:text-blue-400">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                  Data Management &amp; Backup Center
                </h1>
                <span className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono">
                  <ShieldCheck className="w-3 h-3" />
                  Local-First IndexedDB
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Zero data loss guarantee: Export portable JSON backups, restore with pre-restore safety snapshots, and inspect audit logs.
              </p>
            </div>
          </div>

          {/* Quick Snapshot Action */}
          {currentShop && (
            <button
              onClick={handleDownloadBackup}
              disabled={isProcessing}
              className="bg-[#005A9C] hover:bg-blue-800 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
            >
              {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>Download Backup Now (.json)</span>
            </button>
          )}
        </div>

        {/* Status Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-800">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Active Shop Scope</div>
            <div className="text-sm font-black text-slate-900 dark:text-white mt-1 truncate">
              {currentShop ? currentShop.name : 'All Shops'}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              Code: {currentShop?.shopCode || 'GLOBAL'}
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-800">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Last Backup Taken</div>
            <div className="text-sm font-black text-slate-900 dark:text-white mt-1 font-mono">
              {settings.lastBackupTimestamp
                ? new Date(settings.lastBackupTimestamp).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : 'No backups yet'}
            </div>
            <div className="text-[10px] text-slate-400">
              Status: {settings.lastBackupStatus || 'PENDING'}
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-800">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Scheduled Reminder</div>
            <div className="text-sm font-black text-slate-900 dark:text-white mt-1 font-mono">
              {settings.autoBackupEnabled ? `${settings.scheduledTime} Daily` : 'Disabled'}
            </div>
            <div className="text-[10px] text-slate-400">
              Retention: {settings.retentionDays} days
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-800">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Local Snapshots</div>
            <div className="text-sm font-black text-slate-900 dark:text-white mt-1 font-mono">
              {storedBackups.length} Saved
            </div>
            <div className="text-[10px] text-slate-400">
              Stored in browser storage
            </div>
          </div>
        </div>
      </div>

      {/* Global Status Message */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800'
              : statusMessage.type === 'error'
              ? 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800'
              : 'bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {statusMessage.type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0" />}
            {statusMessage.type === 'info' && <Info className="w-4 h-4 shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>

          {lastSafetyBackupId && (
            <button
              onClick={handleRollback}
              disabled={isProcessing}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Revert to Pre-Restore Snapshot
            </button>
          )}
        </div>
      )}

      {/* Sub-Tabs Navigation */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto text-xs">
        <button
          onClick={() => setActiveSubTab('EXPORT')}
          className={`px-3 py-2 rounded-xl font-bold flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
            activeSubTab === 'EXPORT'
              ? 'bg-[#005A9C] text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Download className="w-4 h-4" />
          <span>Export Backup File</span>
        </button>

        <button
          onClick={() => setActiveSubTab('RESTORE')}
          className={`px-3 py-2 rounded-xl font-bold flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
            activeSubTab === 'RESTORE'
              ? 'bg-[#005A9C] text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Upload className="w-4 h-4" />
          <span>Restore Backup File</span>
        </button>

        <button
          onClick={() => setActiveSubTab('HISTORY')}
          className={`px-3 py-2 rounded-xl font-bold flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
            activeSubTab === 'HISTORY'
              ? 'bg-[#005A9C] text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Snapshots &amp; History ({storedBackups.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('AUTOMATION')}
          className={`px-3 py-2 rounded-xl font-bold flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
            activeSubTab === 'AUTOMATION'
              ? 'bg-[#005A9C] text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Reminder &amp; Windows Guide</span>
        </button>
      </div>

      {/* SUB-TAB 1: EXPORT BACKUP */}
      {activeSubTab === 'EXPORT' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileJson className="w-5 h-5 text-blue-600" />
                Download Complete Shop Backup (.json)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Generates a standardized JSON archive with SHA-256 cryptographic checksum containing every record store.
              </p>
            </div>

            {/* Scope Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Select Backup Scope:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setExportScope('CURRENT')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    exportScope === 'CURRENT'
                      ? 'border-[#005A9C] bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="text-xs font-bold">Current Shop Only</div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    {currentShop?.name || 'Selected parlour'} ({currentShop?.shopCode || 'AP-2026-XXXX'})
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setExportScope('ALL')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    exportScope === 'ALL'
                      ? 'border-[#005A9C] bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="text-xs font-bold">All Shops &amp; Global Catalog</div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Complete multi-shop database snapshot
                  </div>
                </button>
              </div>
            </div>

            {/* Included Data Stores Checklist */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-emerald-600" />
                Stores Included in Backup Manifest:
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                <div>✓ Shop Profile &amp; Settings</div>
                <div>✓ Product Catalog &amp; Barcodes</div>
                <div>✓ Current &amp; Opening Stock</div>
                <div>✓ Confirmed Purchase Bills</div>
                <div>✓ Sales &amp; Counter Bills</div>
                <div>✓ Suppliers &amp; Balances</div>
                <div>✓ Supplier Payments</div>
                <div>✓ Operating Expenses</div>
                <div>✓ Inventory Movements</div>
                <div>✓ SHA-256 Checksum</div>
                <div>✓ Schema DB Version 2</div>
                <div>✓ Timestamp Metadata</div>
              </div>
            </div>

            {/* Output File Name Preview */}
            <div className="p-3 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-200/60 dark:border-blue-900 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                Target Filename:
              </span>
              <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                AmulParlour_Backup_{exportScope === 'CURRENT' && currentShop ? currentShop.shopCode.replace(/[^a-zA-Z0-9_-]/g, '') : 'ALL_SHOPS'}_{new Date().toISOString().slice(0, 10)}.json
              </div>
            </div>

            {/* Action Button */}
            <button
              onClick={handleDownloadBackup}
              disabled={isProcessing}
              className="w-full bg-[#005A9C] hover:bg-blue-800 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>Download Portable Backup (.json)</span>
            </button>
          </div>

          {/* Privacy & Safety Sidecard */}
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-600" />
                Data Privacy Guarantee
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                The exported backup contains only your commercial shop registers. Plaintext passwords, authentication sessions, and production API secrets are strictly omitted.
              </p>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl text-[10px] text-slate-600 dark:text-slate-400 font-mono">
                Generator: Amul Parlour Local-First IndexedDB Engine v2.0
              </div>
            </div>

            <div className="bg-amber-50/70 dark:bg-amber-950/30 rounded-2xl border border-amber-200/80 dark:border-amber-900 p-5 space-y-2 text-xs text-amber-900 dark:text-amber-200">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                Daily Recommendation
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                Save your backup file to an external USB flash drive or Windows PC cloud backup folder (Google Drive / OneDrive) at the end of each business day.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: RESTORE BACKUP */}
      {activeSubTab === 'RESTORE' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600" />
              Restore Shop Data from Backup File
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Select a valid <code className="font-mono">.json</code> backup file. The system will inspect record counts, check schema version, and take an automatic safety snapshot before restoring.
            </p>
          </div>

          {/* File Upload Zone */}
          <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center hover:border-blue-500 dark:hover:border-blue-400 transition bg-slate-50/50 dark:bg-slate-800/30">
            <input
              type="file"
              id="backupFileInput"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <label
              htmlFor="backupFileInput"
              className="cursor-pointer flex flex-col items-center justify-center gap-2"
            >
              <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <FileJson className="w-6 h-6" />
              </div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                {selectedFile ? selectedFile.name : 'Click to select or drag backup .json file'}
              </div>
              <div className="text-[11px] text-slate-400">
                {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : 'Supports all authentic Amul Parlour JSON backup formats'}
              </div>
            </label>
          </div>

          {parseError && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Parsed Inspection Preview */}
          {parsedBackup && (
            <div className="space-y-4 pt-2">
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4 text-emerald-600" />
                    File Inspection &amp; Manifest Summary
                  </div>
                  <span className="text-[10px] font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                    Schema v{parsedBackup.manifest?.version || 2}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="text-[9px] text-slate-400">Shops</div>
                    <div className="font-bold text-slate-900 dark:text-white">{parsedBackup.shops.length}</div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="text-[9px] text-slate-400">Products</div>
                    <div className="font-bold text-slate-900 dark:text-white">{parsedBackup.products.length}</div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="text-[9px] text-slate-400">Sales Bills</div>
                    <div className="font-bold text-slate-900 dark:text-white">{parsedBackup.sales.length}</div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="text-[9px] text-slate-400">Purchase Invoices</div>
                    <div className="font-bold text-slate-900 dark:text-white">{parsedBackup.purchases?.length || 0}</div>
                  </div>
                </div>

                {parsedBackup.manifest?.exportedAt && (
                  <div className="text-[10px] text-slate-500 font-mono">
                    Export Timestamp: {new Date(parsedBackup.manifest.exportedAt).toLocaleString('en-IN')} · Target Shop: {parsedBackup.manifest.shopId}
                  </div>
                )}
              </div>

              {/* Automatic Safety Snapshot Option */}
              <div className="flex items-center gap-2 p-3 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/80 dark:border-emerald-900">
                <input
                  type="checkbox"
                  id="safetyCheck"
                  checked={autoSafetySnapshot}
                  onChange={(e) => setAutoSafetySnapshot(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                />
                <label htmlFor="safetyCheck" className="text-xs text-emerald-900 dark:text-emerald-200 cursor-pointer">
                  <span className="font-bold">Auto-create safety snapshot before restore (Recommended).</span>
                  <span className="block text-[11px] text-emerald-700 dark:text-emerald-300">
                    Allows you to revert instantly if this backup file is outdated or belongs to another counter.
                  </span>
                </label>
              </div>

              {/* Action Buttons */}
              <button
                onClick={handleExecuteRestore}
                disabled={isProcessing}
                className="w-full bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                <span>Confirm &amp; Restore Records to Database</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: SNAPSHOTS & HISTORY */}
      {activeSubTab === 'HISTORY' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <History className="w-5 h-5 text-blue-600" />
                IndexedDB Local Snapshots Log
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Snapshots stored locally inside browser IndexedDB storage for fast rollbacks and history tracking.
              </p>
            </div>

            <button
              onClick={loadState}
              className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>

          {storedBackups.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Database className="w-12 h-12 mx-auto stroke-1 mb-2 text-slate-300" />
              <p className="text-xs font-semibold">No local snapshots saved yet.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Create a manual backup or enable scheduled 8:00 PM backups to build snapshot history.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase text-[10px] border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">Date &amp; Timestamp</th>
                    <th className="py-2.5 px-2">Type</th>
                    <th className="py-2.5 px-2">Products</th>
                    <th className="py-2.5 px-2">Sales Bills</th>
                    <th className="py-2.5 px-2">Purchases</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {storedBackups.map((bkp) => (
                    <tr key={bkp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {new Date(bkp.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </div>
                        <div className="text-[10px] text-slate-400 font-sans">
                          {new Date(bkp.createdAt).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 font-sans">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            bkp.type === 'AUTO'
                              ? 'bg-blue-100 text-blue-800'
                              : bkp.type === 'SAFETY_PRE_RESTORE'
                              ? 'bg-amber-100 text-amber-800 font-black'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {bkp.type === 'SAFETY_PRE_RESTORE' ? 'PRE-RESTORE SAFETY' : bkp.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-slate-700 dark:text-slate-300">
                        {bkp.manifest.counts.products}
                      </td>
                      <td className="py-2.5 px-2 text-slate-700 dark:text-slate-300">
                        {bkp.manifest.counts.sales}
                      </td>
                      <td className="py-2.5 px-2 text-slate-700 dark:text-slate-300">
                        {bkp.manifest.counts.purchases}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5 font-sans">
                          <button
                            onClick={() => {
                              const jsonStr = JSON.stringify(bkp.data, null, 2);
                              const blob = new Blob([jsonStr], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `Amul_Snapshot_${bkp.id}.json`;
                              a.click();
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition cursor-pointer"
                            title="Download as JSON file"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={async () => {
                              if (confirm(`Revert database to snapshot from ${new Date(bkp.createdAt).toLocaleString()}?`)) {
                                try {
                                  setIsProcessing(true);
                                  await AppRepository.system.restoreFromStoredBackup(bkp.id, {
                                    currentShopId: currentShop?.id,
                                    createSafetySnapshot: true
                                  });
                                  alert('Reverted to snapshot successfully!');
                                  onDataReload();
                                  loadState();
                                } catch (err: any) {
                                  alert(`Rollback failed: ${err.message}`);
                                } finally {
                                  setIsProcessing(false);
                                }
                              }
                            }}
                            className="p-1.5 rounded-lg text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950 transition cursor-pointer"
                            title="Revert to this snapshot"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 4: REMINDER & WINDOWS GUIDE */}
      {activeSubTab === 'AUTOMATION' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Schedule Settings Form */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                Daily Reminder &amp; Retention Configuration
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Configure the daily scheduled snapshot time and how many days of local snapshot history to retain.
              </p>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoEnabled"
                  checked={settings.autoBackupEnabled}
                  onChange={(e) => setSettings({ ...settings, autoBackupEnabled: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                />
                <label htmlFor="autoEnabled" className="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                  Enable Daily Automated Snapshots
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Daily Reminder &amp; Snapshot Time (24h format):
                </label>
                <input
                  type="time"
                  value={settings.scheduledTime}
                  onChange={(e) => setSettings({ ...settings, scheduledTime: e.target.value })}
                  className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono w-full focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Default: 20:00 (8:00 PM close of business).
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Snapshot Retention (Days):
                </label>
                <input
                  type="number"
                  min={3}
                  max={60}
                  value={settings.retentionDays}
                  onChange={(e) => setSettings({ ...settings, retentionDays: Number(e.target.value) })}
                  className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono w-full focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Keeps the last {settings.retentionDays} snapshots in IndexedDB to prevent storage bloat.
                </span>
              </div>

              <button
                type="submit"
                disabled={isProcessing}
                className="w-full bg-[#005A9C] hover:bg-blue-800 text-white py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Settings className="w-4 h-4" />
                <span>Save Reminder Settings</span>
              </button>
            </form>
          </div>

          {/* Windows 10/11 Shop PC Guide */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Terminal className="w-5 h-5 text-purple-600" />
              Windows 10/11 Shop Owner Operating Guide
            </h2>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-[11px]">
                <strong>Truthful Browser Sandbox Disclosure:</strong>
                <p className="mt-0.5">
                  Standard web browsers cannot download files to your Windows hard drive when the browser is completely closed or the PC is shut down.
                </p>
              </div>

              <div className="space-y-2">
                <p className="font-bold text-slate-800 dark:text-slate-200">
                  Best Practices for Unattended Windows Shop Reliability:
                </p>
                <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <li>
                    <strong>Keep POS Tab Open:</strong> While the tab remains open on your counter PC, the background timer takes automated snapshots silently at 8:00 PM.
                  </li>
                  <li>
                    <strong>Missed Backup Detection:</strong> If you close the PC before 8:00 PM, the system detects this when you reopen the browser next morning and displays an instant snapshot prompt.
                  </li>
                  <li>
                    <strong>Windows Startup Shortcut:</strong> Press <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">Win + R</code>, type <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">shell:startup</code>, and drag the Amul POS website shortcut here so it launches automatically on power-on.
                  </li>
                  <li>
                    <strong>External Drive Copy:</strong> Download the weekly backup JSON file to a USB thumb drive to protect against hardware damage.
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
