/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Truthful Local-First Automated Daily Backup & Restore Center
 * Features:
 * - Manual "Backup Now"
 * - Automated daily backup snapshot stored in IndexedDB at configured schedule (default 8:00 PM)
 * - Manifest with record counts, schema version, and SHA-256 checksum
 * - Configurable retention policy (e.g. keep last 14 backups)
 * - Missed backup detection when browser reopens after PC shutdown
 * - Export to downloadable JSON on Windows PC
 * - Restores with schema validation & explicit confirmation
 * - Transparent disclosure of browser sandbox limitations
 */

import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Download, 
  Upload, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCcw, 
  X, 
  FileJson,
  ShieldAlert,
  Clock,
  Settings,
  HardDrive,
  Calendar,
  Check
} from 'lucide-react';
import { BackupSettings, LocalDatabaseExport, Shop, StoredBackupRecord } from '../../types/index.ts';
import { AppRepository } from '../../storage/repositories.ts';

interface BackupRestoreModalProps {
  currentShop: Shop | null;
  onClose: () => void;
  onDataReload: () => void;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  currentShop,
  onClose,
  onDataReload
}) => {
  const [activeTab, setActiveTab] = useState<'MANAGE' | 'HISTORY' | 'SCHEDULE'>('MANAGE');
  const [settings, setSettings] = useState<BackupSettings>({
    autoBackupEnabled: true,
    scheduledTime: '20:00',
    retentionDays: 14
  });
  const [storedBackups, setStoredBackups] = useState<StoredBackupRecord[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isResetConfirming, setIsResetConfirming] = useState(false);

  const loadBackupState = async () => {
    try {
      const [s, bList] = await Promise.all([
        AppRepository.system.getBackupSettings(),
        currentShop ? AppRepository.system.getStoredBackups(currentShop.id) : []
      ]);
      setSettings(s);
      setStoredBackups(bList);
    } catch (err) {
      console.error('Failed to load backup status:', err);
    }
  };

  useEffect(() => {
    loadBackupState();
  }, [currentShop?.id]);

  // Manual Backup Now Action
  const handleBackupNow = async () => {
    if (!currentShop) return;
    try {
      setIsProcessing(true);
      const record = await AppRepository.system.createBackup(currentShop.id, 'MANUAL');
      await loadBackupState();

      // Trigger download for Windows PC file storage
      const jsonStr = JSON.stringify(record.data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      const todayStr = new Date().toISOString().slice(0, 10);
      link.setAttribute('download', `Amul_POS_Backup_${currentShop.shopCode}_${todayStr}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setStatusMessage({
        text: `Backup created and downloaded to your PC (${record.manifest.counts.products} SKUs, ${record.manifest.counts.sales} sales).`,
        type: 'success'
      });
    } catch (err: any) {
      setStatusMessage({ text: `Backup failed: ${err.message}`, type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Download a previously stored historical backup
  const handleDownloadHistorical = (rec: StoredBackupRecord) => {
    const jsonStr = JSON.stringify(rec.data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Amul_Historical_Backup_${rec.shopId}_${rec.backupDate}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Import JSON with Schema & Checksum Verification
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed: LocalDatabaseExport = JSON.parse(text);

        if (!parsed.shops || !parsed.products || !parsed.sales) {
          throw new Error('Invalid backup schema. Required "shops", "products", or "sales" missing.');
        }

        const confirmRestore = window.confirm(
          `RESTORE CONFIRMATION:\n\n` +
          `File contains: ${parsed.shops.length} shop(s), ${parsed.products.length} products, ` +
          `${parsed.sales.length} sales bills, and ${parsed.purchases?.length || 0} purchase bills.\n\n` +
          `Are you sure you want to restore these records? Existing records with matching IDs will be updated.`
        );

        if (!confirmRestore) return;

        const result = await AppRepository.system.importData(parsed, {
          currentShopId: currentShop?.id,
          createSafetySnapshot: true
        });
        setStatusMessage({ text: result.message, type: 'success' });
        onDataReload();
        await loadBackupState();
      } catch (err: any) {
        setStatusMessage({ text: `Restore failed: ${err.message}`, type: 'error' });
      }
    };
    reader.readAsText(file);
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await AppRepository.system.saveBackupSettings(settings);
      setStatusMessage({ text: 'Backup schedule settings saved successfully.', type: 'success' });
    } catch (err: any) {
      setStatusMessage({ text: `Failed to save settings: ${err.message}`, type: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden my-6 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="font-bold text-sm">Backup & Data Recovery</h3>
              <p className="text-[11px] text-slate-400">
                Daily snapshot engine with PC export & restoration
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="flex border-b border-slate-200 px-6 pt-3 bg-slate-50 gap-4 text-xs font-bold">
          <button
            onClick={() => setActiveTab('MANAGE')}
            className={`pb-2.5 transition border-b-2 ${
              activeTab === 'MANAGE'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Backup & Restore
          </button>
          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`pb-2.5 transition border-b-2 ${
              activeTab === 'HISTORY'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Snapshot History ({storedBackups.length})
          </button>
          <button
            onClick={() => setActiveTab('SCHEDULE')}
            className={`pb-2.5 transition border-b-2 ${
              activeTab === 'SCHEDULE'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Daily Schedule Config
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Truthful Browser Limitation Disclosure */}
          <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5 text-amber-950">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              Truthful Browser Automation Boundary
            </div>
            <p className="text-amber-800 text-[11px] leading-relaxed">
              In a browser website, automated backups run while the site is open in your browser.
              If your PC is shut down or the browser is closed at 8:00 PM, the system automatically detects the missed backup
              the next time you launch the website and prompts you to create it immediately.
            </p>
          </div>

          {activeTab === 'MANAGE' && (
            <div className="space-y-4">
              {/* Last Backup Status */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">Last Backup Status</div>
                  <div className="font-bold text-sm text-slate-900 mt-0.5 flex items-center gap-1.5">
                    {settings.lastBackupStatus === 'SUCCESS' ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span className="text-emerald-800">
                          Completed on {settings.lastBackupDate || 'Today'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Clock className="w-4 h-4 text-amber-600" />
                        <span className="text-amber-800">Scheduled for {settings.scheduledTime}</span>
                      </>
                    )}
                  </div>
                  {settings.lastBackupTimestamp && (
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {new Date(settings.lastBackupTimestamp).toLocaleString('en-IN')}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleBackupNow}
                  disabled={isProcessing}
                  className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  {isProcessing ? 'Generating...' : 'Backup Now'}
                </button>
              </div>

              {/* Restore Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <h4 className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-emerald-600" />
                  Restore from JSON Backup File
                </h4>
                <p className="text-[11px] text-slate-500">
                  Select a previously downloaded Amul POS JSON backup file to restore into this browser.
                </p>

                <label className="border-2 border-dashed border-slate-300 hover:border-blue-400 bg-white rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition text-center">
                  <FileJson className="w-6 h-6 text-slate-400 mb-1" />
                  <span className="text-xs font-bold text-slate-700">Choose Backup File (.json)</span>
                  <span className="text-[10px] text-slate-400">Validated with checksum prior to commit</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Factory Reset */}
              <div className="pt-2 border-t border-slate-200">
                {!isResetConfirming ? (
                  <button
                    type="button"
                    onClick={() => setIsResetConfirming(true)}
                    className="text-xs text-slate-400 hover:text-rose-600 font-semibold flex items-center gap-1.5 transition"
                  >
                    <RefreshCcw className="w-3.5 h-3.5" />
                    Reset database to seed defaults...
                  </button>
                ) : (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2 text-xs">
                    <div className="font-bold text-rose-800 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      Reset all local transactions and restored bills?
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setIsResetConfirming(false)}
                        className="px-3 py-1 bg-white border border-slate-300 rounded-lg text-slate-700 text-xs font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          await AppRepository.system.resetDefaults();
                          setIsResetConfirming(false);
                          onDataReload();
                          onClose();
                        }}
                        className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold"
                      >
                        Confirm Reset
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'HISTORY' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500">
                Retaining the last {settings.retentionDays} days of daily snapshots:
              </div>

              {storedBackups.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No automated backup snapshots recorded yet. Click "Backup Now" to take your first snapshot.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                  {storedBackups.map(rec => (
                    <div key={rec.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-900 font-mono">
                          {rec.backupDate} ({rec.type})
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {rec.manifest.counts.products} SKUs • {rec.manifest.counts.sales} bills • {rec.manifest.counts.purchases} purchases
                        </div>
                      </div>

                      <button
                        onClick={() => handleDownloadHistorical(rec)}
                        className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'SCHEDULE' && (
            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
              <div>
                <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoBackupEnabled}
                    onChange={e => setSettings({ ...settings, autoBackupEnabled: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>Enable Daily Scheduled Backup Snapshot</span>
                </label>
                <p className="text-[11px] text-slate-500 ml-6 mt-0.5">
                  Takes a daily snapshot once per calendar day when the website is open at or after the scheduled time.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 ml-6">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Scheduled Daily Time
                  </label>
                  <input
                    type="time"
                    value={settings.scheduledTime}
                    onChange={e => setSettings({ ...settings, scheduledTime: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-400">Default: 20:00 (8:00 PM)</span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Retention History (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={settings.retentionDays}
                    onChange={e => setSettings({ ...settings, retentionDays: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-400">Default: 14 days</span>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md"
                >
                  Save Schedule Settings
                </button>
              </div>
            </form>
          )}

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
