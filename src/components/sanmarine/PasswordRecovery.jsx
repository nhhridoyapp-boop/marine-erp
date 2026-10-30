import React, { useState } from 'react';
import { KeyRound, Mail, ArrowLeft, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/sanmarineApi';

export default function PasswordRecovery({ onBack }) {
  const [step, setStep] = useState('request');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleRequest = async (e) => {
    e.preventDefault();
    setErrorMsg(''); setSuccessMsg('');
    if (!identifier.trim()) { setErrorMsg('ইমেইল, মোবাইল অথবা স্টাফ আইডি লিখুন।'); return; }
    setLoading(true);
    try {
      const res = await api.requestPasswordReset(identifier.trim());
      setChallengeId(res.challengeId);
      setSentTo(res.sentTo);
      setStep('reset');
      setSuccessMsg(`ভেরিফিকেশন কোড ${res.sentTo} এ পাঠানো হয়েছে। কোডটি ১০ মিনিটের জন্য কার্যকর।`);
    } catch (err) {
      setErrorMsg(err.message || 'কোড পাঠানো যায়নি। কাস্টম ডোমেইন কনফিগার করা প্রয়োজন।');
    } finally { setLoading(false); }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setErrorMsg(''); setSuccessMsg('');
    if (!/^\d{6}$/.test(otp.trim())) { setErrorMsg('৬-সংখ্যার কোড লিখুন।'); return; }
    if (!newPassword || newPassword.length < 6) { setErrorMsg('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।'); return; }
    if (newPassword !== confirmPassword) { setErrorMsg('পাসওয়ার্ড মেলেনি।'); return; }
    setLoading(true);
    try {
      await api.confirmPasswordReset(challengeId, otp.trim(), newPassword);
      setSuccessMsg('✓ পাসওয়ার্ড সফলভাবে রিসেট হয়েছে! এখন লগইন করতে পারেন।');
      setTimeout(() => onBack(), 2000);
    } catch (err) {
      setErrorMsg(err.message || 'রিসেট ব্যর্থ।');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 text-slate-100 relative"
      style={{ backgroundImage: 'url(/sanmarine-bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 bg-[#0B2A4A]/70 backdrop-blur-[2px]" />
      <div className="relative z-10 bg-white text-slate-800 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl border border-slate-200">
        <div className="text-center mb-5">
          <img src="/sanmarine-logo.png" alt="SAN MARINE" className="inline-block h-16 w-16 rounded-2xl object-contain shadow-sm mb-2" />
          <h1 className="text-lg font-black tracking-tight text-[#0f172a]">পাসওয়ার্ড রিকভারি</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            {step === 'request' ? 'আপনার অ্যাকাউন্টের ইমেইলে ভেরিফিকেশন কোড পাঠানো হবে।' : `${sentTo} এ পাঠানো কোড দিন ও নতুন পাসওয়ার্ড সেট করুন।`}
          </p>
        </div>
        {errorMsg && (
          <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" /><span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 mb-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /><span>{successMsg}</span>
          </div>
        )}
        {step === 'request' ? (
          <form onSubmit={handleRequest} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">ইমেইল / স্টাফ আইডি / মোবাইল</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input type="text" required value={identifier} onChange={e => setIdentifier(e.target.value)}
                  placeholder="e.g. user@email.com" className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-400 outline-none text-sm font-medium" />
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60">
              {loading ? <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <><KeyRound className="h-4 w-4" /> কোড পাঠান</>}
            </button>
            <button type="button" onClick={onBack} className="w-full text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> লগইনে ফিরে যান
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">৬-সংখ্যার কোড</label>
              <input inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••" className="w-full px-3 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-400 outline-none text-center text-2xl font-black tracking-[0.3em]" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">নতুন পাসওয়ার্ড</label>
              <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="••••••••" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-400 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">কনফার্ম পাসওয়ার্ড</label>
              <input type="password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-400 outline-none text-sm" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60">
              {loading ? <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <><ShieldCheck className="h-4 w-4" /> পাসওয়ার্ড রিসেট করুন</>}
            </button>
            <button type="button" onClick={() => setStep('request')} className="w-full text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> আবার কোড পাঠান
            </button>
          </form>
        )}
      </div>
    </div>
  );
}