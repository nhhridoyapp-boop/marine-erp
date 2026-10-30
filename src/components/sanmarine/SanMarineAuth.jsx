import React, { useState, useMemo } from 'react';
import {
  ShieldCheck, CheckCircle2, AlertTriangle, LogIn, UserPlus, Mail, Lock, User, Phone, KeyRound, RefreshCw, ArrowLeft,
} from 'lucide-react';
import { api } from '@/lib/sanmarineApi';
import { base44 } from '@/api/base44Client';
import JoinRequestFields from './JoinRequestFields';
import StaffLoginAccess from '@/components/sanmarine/StaffLoginAccess';
import { safeReturnTo } from '@/lib/authReturnTo';
import PasswordRecovery from './PasswordRecovery';


function getDeviceId() {
  try {
    let id = localStorage.getItem('sanmarine_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      localStorage.setItem('sanmarine_device_id', id);
    }
    return id;
  } catch (e) { return 'dev_unknown_' + Date.now(); }
}
function getDeviceName() {
  try {
    const ua = navigator.userAgent || '';
    let os = 'Unknown';
    if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Mac/i.test(ua)) os = 'Mac';
    else if (/Linux/i.test(ua)) os = 'Linux';
    const w = (window.screen && window.screen.width) || '?';
    const h = (window.screen && window.screen.height) || '?';
    return `${os} · ${w}x${h}`;
  } catch (e) { return 'Unknown Device'; }
}

export default function SanMarineAuth({ onLoginSuccess, initialInfo = '' }) {
  const [activeTab, setActiveTab] = useState('login');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleInfo, setGoogleInfo] = useState(initialInfo);

  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [regName, setRegName] = useState('');
  const [regMobile, setRegMobile] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regEmpId, setRegEmpId] = useState('');
  const [regPosition, setRegPosition] = useState('');
  const [regHasId, setRegHasId] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  const [otpStep, setOtpStep] = useState(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpMsg, setOtpMsg] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showForgot, setShowForgot] = useState(false);

  const deviceId = useMemo(getDeviceId, []);
  const deviceName = useMemo(getDeviceName, []);


  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg(''); setSuccessMsg('');
    const identifier = loginIdentifier.trim();
    if (!identifier) { setErrorMsg('অনুগ্রহ করে ইউজার আইডি, ইমেইল অথবা মোবাইল নম্বর লিখুন।'); return; }
    if (!loginPassword) { setErrorMsg('অনুগ্রহ করে আপনার পাসওয়ার্ড লিখুন।'); return; }
    setLoading(true);
    try {
      if (identifier.includes('@')) {
        await base44.auth.loginViaEmailPassword(identifier.toLowerCase(), loginPassword);
        window.location.href = safeReturnTo();
        return;
      }
      const res = await api.loginErp(identifier, loginPassword, { deviceId, deviceName });
      if (res && res.user) {
        localStorage.setItem('sanmarine_auth_user', JSON.stringify(res.user));
        if (res.token) localStorage.setItem('sanmarine_auth_token', res.token);
        setSuccessMsg(`✓ লগইন সফল! স্বাগতম ${res.user.name} (${res.user.role})`);
        setTimeout(() => onLoginSuccess(res.user), 250);
      } else if (res && res.requiresOtp) {
        setOtpStep({ challengeId: res.challengeId, sentTo: res.otpSentTo, delivered: res.delivered });
        setOtpCode(''); setOtpMsg('');
        if (res.delivered) setOtpMsg(`একটি ৬-সংখ্যার ভেরিফিকেশন কোড ${res.otpSentTo || 'আপনার ইমেইলে'} পাঠানো হয়েছে। কোডটি ১০ মিনিটের জন্য কার্যকর।`);
        else setOtpMsg('নতুন ডিভাইস ভেরিফিকেশন প্রয়োজন। ইমেইল সেবা এখন সক্রিয় না থাকলে অ্যাডমিনের সাথে যোগাযোগ করুন।');
      }
    } catch (err) {
      setErrorMsg(identifier.includes('@') ? 'ইমেইল-পাসওয়ার্ড লগইন হয়নি। আগে অনুমোদিত হলে একই ইমেইল দিয়ে Google লগইন করুন অথবা নিচের "প্রথমবার ইমেইল যাচাই" ব্যবহার করুন। পাসওয়ার্ড আগে সেট করে থাকলে রিসেট করুন।' : (err.message || 'লগইন ব্যর্থ হয়েছে।'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setErrorMsg(''); setOtpMsg('');
    if (!otpStep) return;
    if (!/^\d{6}$/.test(otpCode.trim())) { setErrorMsg('৬-সংখ্যার ভেরিফিকেশন কোড লিখুন।'); return; }
    setLoading(true);
    try {
      const res = await api.verifyLoginOtp(otpStep.challengeId, otpCode.trim(), { deviceId, deviceName });
      if (res && res.user) {
        localStorage.setItem('sanmarine_auth_user', JSON.stringify(res.user));
        if (res.token) localStorage.setItem('sanmarine_auth_token', res.token);
        setSuccessMsg(`✓ ডিভাইস ভেরিফাইড। স্বাগতম ${res.user.name}!`);
        setTimeout(() => onLoginSuccess(res.user), 250);
      }
    } catch (err) {
      setErrorMsg(err.message || 'ভেরিফিকেশন ব্যর্থ।');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setErrorMsg(''); setOtpMsg(''); setLoading(true);
    try {
      const res = await api.resendLoginOtp(otpStep.challengeId);
      setOtpStep({ challengeId: res.challengeId, sentTo: res.sentTo, delivered: res.delivered });
      setOtpMsg(res.delivered ? `নতুন কোড ${res.sentTo || 'ইমেইলে'} পাঠানো হয়েছে।` : 'ইমেইল সেবা এখন সক্রিয় নয়। অ্যাডমিনের সাথে যোগাযোগ করুন।');
    } catch (err) {
      setErrorMsg(err.message || 'কোড পুনরায় পাঠাতে সমস্যা।');
    } finally { setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setErrorMsg(''); setSuccessMsg('');
    if (!regName.trim()) { setErrorMsg('পূর্ণ নাম প্রদান করুন।'); return; }
    if (!regMobile.trim() && !regEmail.trim()) { setErrorMsg('মোবাইল অথবা ইমেইল যেকোনো একটি প্রদান করুন।'); return; }
    if (!regPosition) { setErrorMsg('আবেদনের পদ (Admin / Supervisor / Staff) নির্বাচন করুন।'); return; }
    if (!regHasId) { setErrorMsg('"আমার আইডি আছে" অথবা "আমার আইডি নেই" নির্বাচন করুন।'); return; }
    if (regHasId === 'yes' && !regEmpId.trim()) { setErrorMsg('আপনার আইডি লিখুন অথবা "আমার আইডি নেই" নির্বাচন করুন।'); return; }
    if (!regPassword || regPassword.length < 6) { setErrorMsg('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।'); return; }
    if (regPassword !== regConfirmPassword) { setErrorMsg('পাসওয়ার্ড এবং কনফার্ম পাসওয়ার্ড মেলেনি।'); return; }
    setLoading(true);
    try {
      await api.registerErp({
        name: regName.trim(), mobile: regMobile.trim(), email: regEmail.trim(),
        employeeId: regHasId === 'yes' ? regEmpId.trim().toUpperCase() : undefined, hasId: regHasId === 'yes',
        requestedRole: regPosition, password: regPassword,
      });
      setSuccessMsg('✓ আপনার যোগদানের আবেদন সফলভাবে জমা হয়েছে! অ্যাডমিন অনুমোদনের পর আপনি লগইন করতে পারবেন।');
      setLoginIdentifier(regEmail.trim());
      setLoginPassword('');
      setTimeout(() => { setActiveTab('login'); setSuccessMsg(''); }, 2200);
    } catch (err) {
      setErrorMsg(err.message || 'অ্যাকাউন্ট তৈরিতে সমস্যা হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg(''); setSuccessMsg(''); setGoogleInfo(''); setGoogleLoading(true);
    try {
      await base44.auth.loginWithProvider('google', window.location.pathname + window.location.search);
    } catch (e) {
      setGoogleLoading(false);
      setErrorMsg('Google লগইন শুরু করা যায়নি। আবার চেষ্টা করুন অথবা ইমেইল-পাসওয়ার্ড দিয়ে লগইন করুন।');
    }
  };

  if (showForgot) return <PasswordRecovery onBack={() => setShowForgot(false)} />;

  if (otpStep) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 text-slate-100 relative"
        style={{ backgroundImage: 'url(/sanmarine-bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="absolute inset-0 bg-[#0B2A4A]/70 backdrop-blur-[2px]" />
        <div className="relative z-10 bg-white text-slate-800 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl border border-slate-200">
          <div className="text-center mb-5">
            <img src="/sanmarine-logo.png" alt="SAN MARINE SURVEY & INSPECTION" className="inline-block h-16 w-16 rounded-2xl object-contain shadow-sm mb-2" />
            <h1 className="text-lg font-black tracking-tight text-[#0f172a]">নতুন ডিভাইস ভেরিফিকেশন</h1>
            <p className="text-xs text-slate-500 font-medium mt-1">এই ডিভাইস থেকে প্রথমবার লগইন। নিরাপত্তার জন্য ভেরিফিকেশন কোড প্রয়োজন।</p>
          </div>
          {otpMsg && (
            <div className="p-3 mb-4 rounded-xl bg-teal-50 border border-teal-100 text-teal-900 text-xs font-semibold flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" /><span>{otpMsg}</span>
            </div>
          )}
          {errorMsg && (
            <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" /><span>{errorMsg}</span>
            </div>
          )}
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">৬-সংখ্যার ভেরিফিকেশন কোড</label>
              <input inputMode="numeric" maxLength={6} value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••" className="w-full px-3 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-400 outline-none text-center text-2xl font-black tracking-[0.3em]" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 active:scale-[0.98]">
              {loading ? <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <><ShieldCheck className="h-4 w-4" /> ভেরিফাই ও লগইন</>}
            </button>
            <div className="flex items-center justify-between pt-1">
              <button type="button" onClick={() => { setOtpStep(null); setOtpCode(''); setErrorMsg(''); setOtpMsg(''); }}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1">
                <ArrowLeft className="h-3.5 w-3.5" /> ফিরে যান
              </button>
              <button type="button" onClick={handleResendOtp} disabled={loading}
                className="text-xs font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1 disabled:opacity-50">
                <RefreshCw className="h-3.5 w-3.5" /> কোড আবার পাঠান
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 text-slate-100 relative"
      style={{ backgroundImage: 'url(/sanmarine-bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 bg-[#0B2A4A]/70 backdrop-blur-[2px]" />

      <div className="relative z-10 bg-white text-slate-800 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
            <span className="text-[11px] font-bold text-teal-800 tracking-wide">SAN MARINE SURVEY &amp; INSPECTION</span>
          </div>
        </div>

        <div className="text-center mb-5">
          <img src="/sanmarine-logo.png" alt="SAN MARINE SURVEY & INSPECTION" className="inline-block h-20 w-20 rounded-2xl object-contain shadow-sm mb-2" />
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#0B2A4A]">SAN MARINE SURVEY &amp; INSPECTION</h1>
          <p className="text-xs text-[#64748b] font-medium mt-0.5">Scale Monitoring and Truck Entry System</p>
        </div>

        <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl mb-5 text-xs font-bold text-slate-600 gap-1">
          <button type="button" onClick={() => { setActiveTab('login'); setErrorMsg(''); setSuccessMsg(''); }}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all ${activeTab === 'login' ? 'bg-white text-teal-800 shadow-sm font-black' : 'hover:text-slate-900'}`}>
            <LogIn className="h-4 w-4" /><span>সরাসরি লগইন</span>
          </button>
          <button type="button" onClick={() => { setActiveTab('register'); setErrorMsg(''); setSuccessMsg(''); }}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all ${activeTab === 'register' ? 'bg-white text-teal-800 shadow-sm font-black' : 'hover:text-slate-900'}`}>
            <UserPlus className="h-4 w-4" /><span>অ্যাকাউন্ট তৈরি</span>
          </button>
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

        {googleInfo && (
          <div className="p-3 mb-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" /><span>{googleInfo}</span>
          </div>
        )}

        {activeTab === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <button type="button" onClick={handleGoogleLogin} disabled={googleLoading || loading}
              className="w-full py-3 rounded-xl bg-white border-2 border-slate-200 hover:border-teal-400 text-slate-700 font-bold text-sm flex items-center justify-center gap-2.5 transition-all disabled:opacity-60 active:scale-[0.98]">
              {googleLoading ? <span className="h-4 w-4 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin" /> : (
                <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                  <path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.3-5.5l-6.6-5.6C29.6 34.5 27 35.5 24 35.5c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.1 4.1-3.9 5.4l6.6 5.6C41.4 35.3 44 30.1 44 24c0-1.3-.1-2.3-.4-3.5z"/>
                </svg>
              )}
              <span>Google দিয়ে লগইন</span>
            </button>
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <div className="flex-1 h-px bg-slate-200" /> অথবা <div className="flex-1 h-px bg-slate-200" />
            </div>
            <div className="bg-teal-50/70 border border-teal-100 rounded-xl p-3 text-xs text-teal-950 flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
              <div><span className="font-bold">নিরাপদ অ্যাক্সেস:</span> প্রথমে অনুমোদিত ইমেইল দিয়ে পরিচয় যাচাই করুন। পরিচয় যাচাইয়ের পরই আপনার স্টাফ আইডি, রোল ও অনুমোদন মিলিয়ে অ্যাপ খুলবে।</div>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">Email / User ID / Mobile Number</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input type="text" required value={loginIdentifier} onChange={e => setLoginIdentifier(e.target.value)}
                  placeholder="e.g. user@email.com" className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-400 focus:ring-2 focus:ring-teal-100 outline-none text-sm font-medium" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">পাসওয়ার্ড</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input type="password" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                  placeholder="••••••••" className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-400 focus:ring-2 focus:ring-teal-100 outline-none text-sm font-medium" />
              </div>
            </div>
            <StaffLoginAccess email={loginIdentifier} />
            <button type="button" onClick={() => { setErrorMsg(''); setShowForgot(true); }} className="w-full text-xs font-bold text-teal-700 hover:text-teal-900 flex items-center justify-center gap-1 pt-1">
              <KeyRound className="h-3.5 w-3.5" /> পাসওয়ার্ড ভুলে গেছেন?
            </button>
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 active:scale-[0.98]">
              {loading ? <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <><LogIn className="h-4 w-4" /> সিস্টেমে প্রবেশ করুন</>}
            </button>
          </form>
        )}

        {activeTab === 'register' && (
          <form onSubmit={handleRegister} className="space-y-3">
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2.5">
              <UserPlus className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div><span className="font-bold">স্টাফ যোগদান আবেদন:</span> অনুমোদনের অপেক্ষায় থাকবে — অ্যাডমিন অনুমোদন ছাড়া লগইন সম্ভব নয়।</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">পূর্ণ নাম *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input type="text" required value={regName} onChange={e => setRegName(e.target.value)} className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-400 outline-none text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">মোবাইল (ঐচ্ছিক)</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input type="text" value={regMobile} onChange={e => setRegMobile(e.target.value)} className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-400 outline-none text-sm" />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">ইমেইল (ঐচ্ছিক)</label>
                              <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-400 outline-none text-sm" />
            </div>
            <JoinRequestFields position={regPosition} setPosition={setRegPosition} hasId={regHasId} setHasId={setRegHasId} empId={regEmpId} setEmpId={setRegEmpId} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">পাসওয়ার্ড *</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input type="password" required value={regPassword} onChange={e => setRegPassword(e.target.value)} className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-400 outline-none text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">কনফার্ম পাসওয়ার্ড *</label>
                <input type="password" required value={regConfirmPassword} onChange={e => setRegConfirmPassword(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-400 outline-none text-sm" />
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 active:scale-[0.98]">
              {loading ? <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <><UserPlus className="h-4 w-4" /> যোগদান আবেদন জমা দিন</>}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}