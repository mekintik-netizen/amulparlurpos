/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Master Admin Security & Gmail OTP Configuration Tab
 * Manages:
 * - Cloud Firestore `adminSettings/security` (Registered Admin Gmail, 5-min OTP TTL, 3-attempt lock, 2FA toggle)
 * - Cloud Firestore `adminSettings/emailConfig` (EmailJS Service ID, Template ID, Public Key)
 * - Live Gmail OTP Delivery & Masked Verification Tester (zero on-screen/console plain-text OTP exposure)
 */

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Key,
  Lock,
  Mail,
  Save,
  Send,
  ShieldCheck
} from 'lucide-react';
import {
  DEFAULT_ADMIN_EMAILJS_CONFIG,
  DEFAULT_ADMIN_SECURITY_CONFIG,
  isEmailJsConfigured,
  saveAdminEmailConfig,
  saveAdminSecurityConfig,
  sendAdminGmailOtp,
  subscribeToAdminEmailConfig,
  subscribeToAdminSecurityConfig,
  verifyAdminGmailOtp
} from '../../storage/adminEmailOtp.ts';
import { AdminEmailJsConfig, AdminSecurityConfig } from '../../types/index.ts';

interface AdminEmailSecurityTabProps {
  adminUsername: string;
}

export const AdminEmailSecurityTab: React.FC<AdminEmailSecurityTabProps> = ({
  adminUsername
}) => {
  const [securityConfig, setSecurityConfig] = useState<AdminSecurityConfig>(DEFAULT_ADMIN_SECURITY_CONFIG);
  const [emailConfig, setEmailConfig] = useState<AdminEmailJsConfig>(DEFAULT_ADMIN_EMAILJS_CONFIG);

  const [adminEmailInput, setAdminEmailInput] = useState(DEFAULT_ADMIN_SECURITY_CONFIG.adminEmail);
  const [requireOtpOnLogin, setRequireOtpOnLogin] = useState(true);

  const [serviceId, setServiceId] = useState(DEFAULT_ADMIN_EMAILJS_CONFIG.serviceId);
  const [templateId, setTemplateId] = useState(DEFAULT_ADMIN_EMAILJS_CONFIG.templateId);
  const [publicKey, setPublicKey] = useState(DEFAULT_ADMIN_EMAILJS_CONFIG.publicKey);
  const [targetEmailInput, setTargetEmailInput] = useState(DEFAULT_ADMIN_SECURITY_CONFIG.adminEmail);
  const [senderName, setSenderName] = useState(DEFAULT_ADMIN_EMAILJS_CONFIG.senderName || 'Amul Parlour Admin Security');
  const [showPublicKey, setShowPublicKey] = useState(false);

  const [savingSecurity, setSavingSecurity] = useState(false);
  const [savingEmailJs, setSavingEmailJs] = useState(false);
  const [testingSend, setTestingSend] = useState(false);
  const [testingVerify, setTestingVerify] = useState(false);

  const [testOtpInput, setTestOtpInput] = useState('');
  const [showTestOtp, setShowTestOtp] = useState(false);
  const [testOtpDispatched, setTestOtpDispatched] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubSec = subscribeToAdminSecurityConfig((cfg) => {
      setSecurityConfig(cfg);
      setAdminEmailInput(cfg.adminEmail);
      setRequireOtpOnLogin(cfg.requireGmailOtpOnLogin !== false);
    });
    const unsubEmail = subscribeToAdminEmailConfig((cfg) => {
      setEmailConfig(cfg);
      setServiceId(cfg.serviceId || DEFAULT_ADMIN_EMAILJS_CONFIG.serviceId);
      setTemplateId(cfg.templateId || DEFAULT_ADMIN_EMAILJS_CONFIG.templateId);
      setPublicKey(cfg.publicKey || DEFAULT_ADMIN_EMAILJS_CONFIG.publicKey);
      setTargetEmailInput(cfg.adminEmail || DEFAULT_ADMIN_SECURITY_CONFIG.adminEmail);
      setSenderName(cfg.senderName || 'Amul Parlour Admin Security');
    });
    return () => {
      unsubSec();
      unsubEmail();
    };
  }, []);

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSavingSecurity(true);
    try {
      const saved = await saveAdminSecurityConfig({
        adminEmail: adminEmailInput.trim().toLowerCase(),
        requireGmailOtpOnLogin: requireOtpOnLogin,
        updatedBy: adminUsername
      });
      setSecurityConfig(saved);
      setNotice(`Registered Master Admin Gmail saved to Cloud Firestore (adminSettings/security): ${saved.adminEmail}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save security settings.');
    } finally {
      setSavingSecurity(false);
    }
  };

  const handleSaveEmailConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSavingEmailJs(true);
    try {
      const normalizedTarget = (targetEmailInput || adminEmailInput || DEFAULT_ADMIN_SECURITY_CONFIG.adminEmail)
        .trim()
        .toLowerCase();
      const saved = await saveAdminEmailConfig({
        serviceId: serviceId.trim(),
        templateId: templateId.trim(),
        publicKey: publicKey.trim(),
        adminEmail: normalizedTarget,
        senderName: senderName.trim() || 'Amul Parlour Admin Security',
        updatedBy: adminUsername
      });
      setEmailConfig(saved);
      setAdminEmailInput(saved.adminEmail || normalizedTarget);
      setNotice('Gmail OTP Settings saved securely to Cloud Firestore (adminSettings/emailConfig)!');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save EmailJS settings.');
    } finally {
      setSavingEmailJs(false);
    }
  };

  const handleSendTestOtp = async () => {
    setError(null);
    setNotice(null);
    setTestingSend(true);
    try {
      const normalizedTarget = (targetEmailInput || adminEmailInput || DEFAULT_ADMIN_SECURITY_CONFIG.adminEmail)
        .trim()
        .toLowerCase();
      const res = await sendAdminGmailOtp({
        purpose: 'ADMIN_LOGIN_2FA',
        targetEmailOverride: normalizedTarget,
        emailConfigOverride: {
          serviceId: serviceId.trim(),
          templateId: templateId.trim(),
          publicKey: publicKey.trim(),
          adminEmail: normalizedTarget,
          senderName: senderName.trim()
        },
        skipCooldown: true
      });
      setTestOtpDispatched(res.channel === 'emailjs');
      setTestOtpInput('');
      setNotice(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'OTP dispatch failed.');
    } finally {
      setTestingSend(false);
    }
  };

  const handleVerifyTestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setTestingVerify(true);
    try {
      const res = await verifyAdminGmailOtp({
        code: testOtpInput.trim(),
        purpose: 'ADMIN_LOGIN_2FA'
      });
      setTestOtpInput('');
      setTestOtpDispatched(false);
      setNotice(`Verified & invalidated single-use 6-digit OTP for ${res.targetEmail}. Delivery confirmed!`);
    } catch (err: unknown) {
      setTestOtpInput('');
      setError(err instanceof Error ? err.message : 'OTP verification test failed.');
    } finally {
      setTestingVerify(false);
    }
  };

  const emailReady = isEmailJsConfigured({
    serviceId: serviceId.trim(),
    templateId: templateId.trim(),
    publicKey: publicKey.trim()
  });

  return (
    <div className="space-y-5 animate-in fade-in">
      {notice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span className="font-semibold">{notice}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-xs text-rose-700">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span className="font-semibold">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Card 1: Registered Master Admin Gmail (`adminSettings/security`) */}
        <form
          onSubmit={handleSaveSecurity}
          className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/80 space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-[#E31837] flex items-center justify-center border border-rose-200 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Master Admin Security (`adminSettings/security`)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  All 6-digit login &amp; password reset OTPs are delivered exclusively to this Gmail address. Only salted SHA-256 hashes are stored in Firestore.
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Registered Master Admin Gmail <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="email"
                value={adminEmailInput}
                onChange={(e) => {
                  setAdminEmailInput(e.target.value);
                  setTargetEmailInput(e.target.value);
                }}
                placeholder="mekintik@gmail.com"
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-[#005A9C] focus:outline-hidden"
                required
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Active configured email: <strong className="font-mono text-slate-800">{securityConfig.adminEmail}</strong>
            </p>
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={requireOtpOnLogin}
              onChange={(e) => setRequireOtpOnLogin(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded text-[#005A9C] focus:ring-[#005A9C]"
            />
            <span className="text-xs text-slate-700">
              <strong className="text-slate-900 block">Enforce Gmail 6-Digit OTP on Every Admin HQ Login</strong>
              <span className="text-[11px] text-slate-500">
                5-minute expiry, single-use invalidation, and automatic lockout after 3 wrong attempts.
              </span>
            </span>
          </label>

          <button
            type="submit"
            disabled={savingSecurity}
            className="w-full bg-[#005A9C] hover:bg-blue-800 disabled:bg-slate-400 text-white py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <Save className="w-4 h-4" />
            <span>{savingSecurity ? 'Saving Security Settings...' : 'Save Admin Security Settings'}</span>
          </button>
        </form>

        {/* Card 2: EmailJS Configuration (`adminSettings/emailConfig`) */}
        <form
          onSubmit={handleSaveEmailConfig}
          className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/80 space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#005A9C] flex items-center justify-center border border-blue-200 shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 flex flex-wrap items-center gap-2">
                  <span>Gmail OTP Settings</span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                      emailReady
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {emailReady ? 'EmailJS Active' : 'Needs Keys'}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Saved in Cloud Firestore (<code className="font-mono">adminSettings/emailConfig</code>) for real 6-digit Gmail OTP delivery via EmailJS.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                EmailJS Service ID <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                placeholder="service_xxxxxxx"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-[#005A9C] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                EmailJS Template ID <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                placeholder="template_xxxxxxx"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-[#005A9C] focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                EmailJS Public Key <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Key className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type={showPublicKey ? 'text' : 'password'}
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                  placeholder="Enter EmailJS public key"
                  className="w-full pl-8 pr-9 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-[#005A9C] focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowPublicKey((prev) => !prev)}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  aria-label={showPublicKey ? 'Hide public key' : 'Show public key'}
                >
                  {showPublicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Sender Display Name
              </label>
              <input
                type="text"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="Amul Parlour Admin Security"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#005A9C] focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Admin Target Email <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              value={targetEmailInput}
              onChange={(e) => {
                setTargetEmailInput(e.target.value);
                setAdminEmailInput(e.target.value);
              }}
              placeholder="mekintik@gmail.com"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-[#005A9C] focus:outline-hidden"
              required
            />
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
            <div className="font-bold text-slate-800">EmailJS Template Variables Passed:</div>
            <div className="font-mono text-[10px] text-slate-700">
              {'{{email}}'}, {'{{passcode}}'}, {'{{time}}'}
            </div>
            {emailConfig.updatedAt && (
              <div className="text-[10px] text-slate-400">
                Last updated: {new Date(emailConfig.updatedAt).toLocaleString()}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="submit"
              disabled={savingEmailJs}
              className="flex-1 bg-slate-900 hover:bg-black disabled:bg-slate-400 text-white py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Save className="w-4 h-4" />
              <span>{savingEmailJs ? 'Saving...' : 'Save Gmail OTP Settings'}</span>
            </button>

            <button
              type="button"
              onClick={handleSendTestOtp}
              disabled={testingSend}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{testingSend ? 'Sending...' : 'Send OTP to Gmail'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Optional Live Delivery Masked Verifier */}
      {testOtpDispatched && (
        <form
          onSubmit={handleVerifyTestOtp}
          className="bg-white rounded-2xl p-5 shadow-xs border border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-4"
          autoComplete="off"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold text-slate-900">
                Confirm Gmail OTP Delivery (Masked Input)
              </h4>
              <p className="text-[11px] text-slate-500">
                Enter the 6-digit OTP received in your Gmail inbox to confirm end-to-end verification.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-44">
              <input
                type={showTestOtp ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={6}
                value={testOtpInput}
                onChange={(e) => setTestOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                className="w-full text-center tracking-[0.35em] font-mono font-bold py-2 pl-3 pr-9 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                required
              />
              <button
                type="button"
                onClick={() => setShowTestOtp((prev) => !prev)}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label={showTestOtp ? 'Hide OTP' : 'Show OTP'}
              >
                {showTestOtp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="submit"
              disabled={testingVerify || testOtpInput.length !== 6}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer shrink-0"
            >
              {testingVerify ? 'Verifying...' : 'Verify OTP'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
