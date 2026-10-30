import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAccessToken } from '@base44/sdk';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/sanmarineApi';
import SanMarineAuth from './SanMarineAuth';
import SanMarineNavbar from './SanMarineNavbar';
import { refreshSession, localDeviceId } from '@/lib/sanmarineSession';
import { runSafetyTasks } from '@/lib/sanmarineSafetyTasks';
import { withTimeout } from '@/lib/startupGuard';
import ConnectionBanner from './ConnectionBanner';
import useSanMarineData from './useSanMarineData';
import { isAdminRole } from '@/lib/erpRoles';
import OfflineBanner from './OfflineBanner';
import StartupScreen from './StartupScreen';
import ErrorBoundary from './ErrorBoundary';
import { SanMarineProvider, pathToTab, TAB_PATHS } from './SanMarineContext';
import SanMarineRoutes from './SanMarineRoutes';
import { COMPANIES } from '@/components/sanmarine/company/companyScope';

const LOGOUT_STRIKES = 5;     // consecutive, confirmed "account/device no longer valid" answers before a session is ended
const SAFETY_DELAY_MS = 20000; // backups / version checks start this long after the dashboard has loaded
const SESSION_CHECK_INTERVAL = 300000; // 5 minutes — a network hiccup must not sign anyone out
const BOOT_LIMIT_MS = 6000;           // absolute ceiling on the startup loading screen

// true only when the platform answered "401 unauthorized" on two tries in a row; network errors/timeouts never count.
async function platformSessionExpired() {
  for (let i = 0; i < 2; i += 1) {
    try { await base44.auth.me(); return false; } catch (e) { if ((e && (e.status || e.response?.status)) !== 401) return false; }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return true;
}

export default function SanMarineApp() {
  const { user: platformUser } = useAuth();
  // Once logged in, the app opens straight from the saved login (platform token + saved ERP profile) — no login page on
  // every launch. Without the platform token no data can be read, so the login screen is shown instead of a broken app.
  // The background session check (below) re-validates role/status/device against the database.
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      if (!getAccessToken()) return null;
      const saved = localStorage.getItem('sanmarine_auth_user');
      if (saved) {
        const p = JSON.parse(saved);
        const sameIdentity = !platformUser?.email || (p?.email || '').trim().toLowerCase() === platformUser.email.trim().toLowerCase();
        if (p?.role && p?.id && sameIdentity) return p;
      }
    } catch (e) {}
    return null;
  });

  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = pathToTab(location.pathname);
  const [company, setCompany] = useState(COMPANIES[0]);
  const [checkingGoogle, setCheckingGoogle] = useState(false);
  const [googleInfo, setGoogleInfo] = useState('');
  const [safetyReady, setSafetyReady] = useState(false);
  // Hard failsafe: the loading screen may never last forever. After BOOT_LIMIT_MS the app shell is shown
  // no matter what, and data keeps loading behind it — so a slow or failing server can never trap the operator.
  const [bootExpired, setBootExpired] = useState(false);
  useEffect(() => { const t = setTimeout(() => setBootExpired(true), BOOT_LIMIT_MS); return () => clearTimeout(t); }, []);

  const D = useSanMarineData(currentUser, activeTab, company);
  const connRef = useRef('');
  connRef.current = D.connError;
  const synced = !!D.lastSynced;

  // Detect a returning Google OAuth session (Super Admin direct login / pending staff).
  useEffect(() => {
    if (currentUser) return;
    let cancelled = false;
    (async () => {
      try {
        const authed = await withTimeout(base44.auth.isAuthenticated(), 15000, 'google check');
        if (!authed) return;
        setCheckingGoogle(true);
        const me = await withTimeout(base44.auth.me(), 15000, 'google profile');
        if (!me || !me.email) { setCheckingGoogle(false); return; }
        const res = await withTimeout(api.loginWithGoogle({ email: me.email, name: me.full_name || me.name || '' }, { deviceId: localDeviceId(), deviceName: navigator.userAgent || 'Google Device' }), 25000, 'google login');
        if (cancelled) return;
        if (res && res.user && !res.pending && !res.blocked) {
          try { localStorage.setItem('sanmarine_auth_user', JSON.stringify(res.user)); } catch (e) {}
          setCurrentUser(res.user);
        } else if (res && res.pending) {
          setGoogleInfo('আপনার অ্যাকাউন্ট এখন অ্যাডমিনের অনুমোদনের অপেক্ষায়। অনুমোদনের পর একই ইমেইল দিয়ে আবার লগইন করুন।');
          try { await base44.auth.logout(); } catch (e) {}
        } else if (res && res.blocked) {
          setGoogleInfo('আপনার অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।');
          try { await base44.auth.logout(); } catch (e) {}
        }
      } catch (e) {
        if (!cancelled) setGoogleInfo(e.message || 'পরিচয় যাচাইয়ের পর স্টাফ অ্যাকাউন্ট লোড হয়নি। আবার লগইন করুন।');
      } finally {
        if (!cancelled) setCheckingGoogle(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser]);

  // Only the user's own "Logout" button (or a confirmed suspended account) ends a session — never a network or server error.
  const handleLogout = async () => {
    try { localStorage.removeItem('sanmarine_auth_user'); localStorage.removeItem('sanmarine_auth_token'); } catch (e) {}
    setSafetyReady(false);
    setCurrentUser(null);
    try { await base44.auth.logout(); } catch (e) {}
  };
  const handleLoginSuccess = (user) => {
    try { localStorage.setItem('sanmarine_auth_user', JSON.stringify(user)); } catch (e) {}
    setCurrentUser(user); navigate('/');
  };

  const go = useCallback((tab, opts) => {
    if (tab === 'reports_san') setCompany(COMPANIES[0]);
    if (tab === 'reports_sea') setCompany(COMPANIES[1]);
    const path = TAB_PATHS[tab] || '/';
    const search = new URLSearchParams();
    if (opts?.mode) search.set('mode', opts.mode);
    if (opts?.truckNo) search.set('truck', opts.truckNo);
    if (opts?.filterStatus && opts.filterStatus !== 'all') search.set('filter', opts.filterStatus);
    const qs = search.toString();
    navigate(qs ? `${path}?${qs}` : path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [navigate]);

  // Session check: role, status and trusted device always come from the database, never from the browser copy.
  // A suspended/removed user or revoked device is signed out only after the database answered "invalid" (each answer
  // double-checked) LOGOUT_STRIKES times in a row. Network errors, timeouts, server errors, an offline device, a hidden tab
  // and any period while the server is unreachable all count as "could not check" — they never sign anyone out.
  useEffect(() => {
    if (!currentUser?.id) return undefined;
    let strikes = 0;
    const check = async () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      // The platform login token itself ran out (confirmed "401" twice): go to the login screen instead of a silent "server unreachable" state.
      if (await platformSessionExpired()) { handleLogout(); return; }
      if (connRef.current) return;
      try {
        const fresh = await refreshSession(currentUser.id, localDeviceId());
        if (fresh === null) { strikes += 1; if (strikes >= LOGOUT_STRIKES) handleLogout(); return; }
        strikes = 0;
        if (fresh && (fresh.role !== currentUser.role || fresh.name !== currentUser.name)) {
          try { localStorage.setItem('sanmarine_auth_user', JSON.stringify(fresh)); } catch (e) {}
          setCurrentUser(fresh);
        }
      } catch (e) { /* could not check — keep the session */ }
    };
    const first = setTimeout(check, 3000);
    const t = setInterval(check, SESSION_CHECK_INTERVAL);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [currentUser?.id]);

  // Backups and the version-upgrade check are heavy: they start only after the dashboard has loaded and the app has been idle a moment.
  useEffect(() => {
    if (!currentUser?.id || !synced || safetyReady) return undefined;
    const t = setTimeout(() => setSafetyReady(true), SAFETY_DELAY_MS);
    return () => clearTimeout(t);
  }, [currentUser?.id, synced, safetyReady]);
  useEffect(() => {
    if (safetyReady && currentUser && isAdminRole(currentUser)) runSafetyTasks(currentUser);
  }, [safetyReady, currentUser?.id]);

  if (!currentUser) {
    if (checkingGoogle) {
      return <StartupScreen state="loading" message="লগইন ও স্টাফ অনুমোদন যাচাই হচ্ছে..." slowAfterMs={10000} retryLabel="লগইন ফর্মে যান" onRetry={() => setCheckingGoogle(false)} />;
    }
    return <SanMarineAuth onLoginSuccess={handleLoginSuccess} initialInfo={googleInfo} />;
  }

  // Only the very first paint waits (at most a few seconds). After that the app shell is always shown, even if the server is down.
  if (D.loading && !D.lastSynced && !bootExpired) {
    return <StartupScreen state="loading" message="ডাটা লোড হচ্ছে..." retryLabel="এখনই খুলুন" onRetry={() => setBootExpired(true)} />;
  }

  const contextValue = { currentUser, D, company, setCompany, go, onLogout: handleLogout };

  return (
    <SanMarineProvider value={contextValue}>
      <div className="min-h-screen text-slate-800 flex flex-col bg-slate-50 relative">
        <OfflineBanner />
        {D.connError && <ConnectionBanner message={D.connError} onRetry={D.refresh} busy={D.isSyncing} />}
        <SanMarineNavbar
          currentUser={currentUser} companyName={company} onLogout={handleLogout}
          alertCount={D.criticalAlertCount} pendingCount={D.pendingCount} approvalCount={D.approvalCount}
          isSyncing={D.isSyncing} lastSyncedTime={D.lastSynced} onManualSync={D.refresh}
        />
        <div className="flex-1"><ErrorBoundary inline key={location.pathname}><SanMarineRoutes /></ErrorBoundary></div>
      </div>
    </SanMarineProvider>
  );
}