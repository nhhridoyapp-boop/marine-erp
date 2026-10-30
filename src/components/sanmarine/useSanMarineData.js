import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { api } from '@/lib/sanmarineApi';
import { withRetry, runLimited } from '@/lib/sanmarineNet';
import { getRules } from '@/lib/sanmarineRules';
import { setOcrWorkerUrl } from '@/lib/geminiOcrConfig';
import { isAdminRole, canHandleAlerts } from '@/lib/erpRoles';
import { syncPendingAlerts } from '@/lib/sanmarineEntries';
import useLiveSync from './useLiveSync';

const SYNC_MS = 120000;       // background safety-net; realtime subscriptions refresh the numbers when data really changes
const FIRST_PAINT_MS = 5000;  // the loading screen never lasts longer than this: after it the app shell is shown and loading continues
const REQ_TIMEOUT_MS = 60000;
const RANK = { light: 0, data: 1, full: 2 };
const LIST_TABS = ['entry', 'pending'];
const modeForTab = (tab) => (LIST_TABS.includes(tab) ? 'data' : 'light');
const CONN_MSG = 'সার্ভার সাময়িকভাবে সংযোগযোগ্য নয়। আপনার Login Session ও সংরক্ষিত Data নিরাপদ আছে। সংযোগ ফিরলে স্বয়ংক্রিয়ভাবে লোড হবে।';
const DEFAULT_SETTINGS = { companyName: 'SAN MARINE SURVEY & INSPECTION', reportHeader: 'Daily Discharge Report' };
const INITIAL = {
  entries: [], emptyWeights: [], vessels: [], lighters: [], consignees: [], ghats: [], cargos: [], scales: [],
  users: [], alerts: [], closings: [], approvals: [], todayEntries: [], settings: DEFAULT_SETTINGS,
};

// Loads the ERP data in three steps so the dashboard appears fast:
//   light = dashboard numbers, alerts, approvals (periodic / realtime)   data = light + waiting-truck lists   full = everything
// A server/network failure is NEVER an authentication failure: it only shows a notice, keeps the session and the data already
// on screen, and retries by itself with backoff. Every request is time-limited; identical reads in flight are shared.
export default function useSanMarineData(currentUser, activeTab, company) {
  const uid = currentUser && currentUser.id;
  const [d, setD] = useState(INITIAL);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [connError, setConnError] = useState('');
  const [usersError, setUsersError] = useState('');
  const [statsError, setStatsError] = useState('');
  const inFlight = useRef(false);
  const queued = useRef(null);
  const retryTimer = useRef(null);
  const failStreak = useRef(0);
  const rateLimitedUntil = useRef(0); // after a 429, pause automatic refreshes briefly so we stop hammering the rate limit
  const userRef = useRef(currentUser);
  const tabRef = useRef(activeTab);
  const companyRef = useRef(company);
  const loadedCompanyRef = useRef(company);
  const epochRef = useRef(0);
  const lastListsCompany = useRef('');
  const statsRef = useRef(null);
  const pendingSyncAt = useRef(0);
  const refreshCount = useRef(0);
  const lastRefreshAt = useRef(0);
  const lastListsAt = useRef(0);
  const mastersLoaded = useRef(false);
  userRef.current = currentUser;
  tabRef.current = activeTab;
  companyRef.current = company;
  const rules = useMemo(() => getRules(d.settings), [d.settings]);

  // Forces the dashboard counters to be re-read on the next refresh. `countsOnly` (changes made on OTHER devices) keeps the
  // slow aggregate charts cached — aggregates have the strictest request limit.
  const invalidateStats = useCallback((countsOnly = false) => {
    const s = statsRef.current;
    if (s) statsRef.current = { ...s, counts: s.counts && { ...s.counts, at: 0 }, sums: !countsOnly && s.sums ? { ...s.sums, at: 0 } : s.sums };
  }, []);

  const refreshAllData = useCallback(async function run(showSpinner = false, mode = 'light') {
    if (!userRef.current?.id) { setLoading(false); return; } // never leave the shell stuck on the loading screen
    if (Date.now() < rateLimitedUntil.current) return;
    if (inFlight.current) {
      const q = queued.current;
      queued.current = { mode: q && RANK[q.mode] > RANK[mode] ? q.mode : mode };
      return;
    }
    inFlight.current = true;
    refreshCount.current += 1;
    lastRefreshAt.current = Date.now();
    let eff = showSpinner ? 'full' : mode;
    if (!mastersLoaded.current || refreshCount.current % 5 === 1) eff = 'full';
    const cap = showSpinner ? setTimeout(() => setLoading(false), FIRST_PAINT_MS) : null;
    if (showSpinner) setLoading(true);
    setIsSyncing(true);
    const epoch = epochRef.current, readCompany = companyRef.current, readUid = userRef.current?.id;
    let total = 0; let failed = 0;
    const guarded = async (fn, key) => { total += 1; try { const value = await withRetry(fn, { tries: key === 'stats' ? 2 : 1, timeoutMs: REQ_TIMEOUT_MS }); if (key === 'users' && epoch === epochRef.current) setUsersError(''); if (key === 'stats' && epoch === epochRef.current) setStatsError(''); return value; } catch (e) { if (key === 'users' && (e.status || e.response?.status) === 403) { setUsersError(e.response?.data?.error || e.data?.error || e.message || 'স্টাফ তালিকা দেখার অনুমতি নেই।'); return []; } if (key === 'users' && epoch === epochRef.current) setUsersError(e.message || 'স্টাফ তালিকা লোড হয়নি; আগের রেকর্ড পরিবর্তিত হয়নি।'); if (key === 'stats' && epoch === epochRef.current) setStatsError('ড্যাশবোর্ড পরিসংখ্যান লোড হয়নি। অন্যান্য মেনু ব্যবহার করতে পারেন।'); failed += 1; if (e && (e.status === 429 || (e.response && e.response.status) === 429)) rateLimitedUntil.current = Date.now() + 60000; return null; } };
    const runJobs = (jobs) => runLimited(jobs.map(([key, fn, set]) => async () => {
      const v = await guarded(fn, key);
      if (v !== null && v !== undefined && epoch === epochRef.current && readCompany === companyRef.current && readUid === userRef.current?.id) set(v);
      return v;
    }), 2);
    const put = (k) => (v) => setD((p) => ({ ...p, [k]: v }));
    try {
      // Step 1 — what the dashboard needs.
      const first = [
        ['stats', () => api.getDashboardStats(statsRef.current, readCompany), (st) => { statsRef.current = st; setStats(st); }],
        ['alerts', () => api.getAlerts(readCompany), put('alerts')],
        ...(isAdminRole(userRef.current) ? [['approvals', () => api.getErpApprovals(), put('approvals')]] : []),
        ['todayEntries', () => api.getTodayEntries(readCompany), put('todayEntries')],
      ];
      if (eff === 'full') first.push(['settings', () => api.getErpSettings(), (s) => { if (s && s.companyName) { setOcrWorkerUrl(s.ocrWorkerUrl); put('settings')(s); } }]);
      await runJobs(first);
      if (total - failed > 0) setLoading(false);

      // Step 2 — master lists (forms, filters, user management), then the waiting-truck lists.
      if (eff === 'full') {
        const masters = [
          ['vessels', () => api.getErpVessels(), put('vessels')], ['lighters', () => api.getErpLighters(), put('lighters')],
          ['ghats', () => api.getErpGhats(), put('ghats')], ['consignees', () => api.getErpConsignees(), put('consignees')],
          ['cargos', () => api.getErpCargos(), put('cargos')], ['scales', () => api.getErpScales(), put('scales')],
          ['closings', () => api.getErpClosings(), put('closings')],
        ];
        if (isAdminRole(userRef.current)) masters.push(['users', () => api.getErpUsersList(), put('users')]);
        const res = await runJobs(masters);
        if (epoch === epochRef.current && readUid === userRef.current?.id) mastersLoaded.current = res.every((v) => v !== null && v !== undefined);
      }
      if (eff !== 'light') {
        const listCompany = tabRef.current === 'entry' ? undefined : readCompany;
        const res = await runJobs([
          ['entries', () => api.getLoadsWithoutEmpty(listCompany), put('entries')],
          ['emptyWeights', () => api.getUnlinkedEmptyWeights(listCompany), put('emptyWeights')],
        ]);
        if (epoch === epochRef.current && res.every((v) => v !== null && v !== undefined)) { lastListsAt.current = Date.now(); lastListsCompany.current = listCompany || 'entry-global'; }
      }

      if (epoch !== epochRef.current || readUid !== userRef.current?.id) return;
      clearTimeout(retryTimer.current);
      if (total - failed > 0) setLastSynced(new Date());
      if (failed > 0) {
        failStreak.current += 1;
        setConnError(total > 0 && failed === total ? CONN_MSG : '');
        const wait = Math.min(120000, 60000 * 2 ** Math.min(failStreak.current - 1, 1));
        const coolWait = Math.max(0, rateLimitedUntil.current - Date.now()); // never retry faster than the 429 cool-down allows
        retryTimer.current = setTimeout(() => run(false, mastersLoaded.current ? modeForTab(tabRef.current) : 'full'), Math.max(wait, coolWait));
      } else {
        failStreak.current = 0;
        setConnError('');
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      clearTimeout(cap);
      inFlight.current = false;
      setIsSyncing(false);
      setLoading(false);
      const q = queued.current;
      queued.current = null;
      if (q && failed === 0 && userRef.current?.id) run(false, q.mode);
    }
  }, []);

  // The shell opens after FIRST_PAINT_MS, but statistics remain unknown until a real read succeeds.
  // During background failures keep the last rendered figures; never replace them with invented zeroes.

  // Loads when someone signs in; refreshes on a slow timer, when the app comes back to the foreground, and the moment the connection returns.
  useEffect(() => {
    if (!uid) {
      epochRef.current += 1;
      setD(INITIAL); setStats(null); statsRef.current = null; setOcrWorkerUrl('');
      setLastSynced(null); setConnError(''); setUsersError(''); setStatsError(''); rateLimitedUntil.current = 0; queued.current = null;
      setLoading(false);
      mastersLoaded.current = false; lastListsAt.current = 0; refreshCount.current = 0; failStreak.current = 0;
      return undefined;
    }
    refreshAllData(true);
    const tick = () => { if (Date.now() < rateLimitedUntil.current) return; refreshAllData(false, modeForTab(tabRef.current)); };
    const timer = setInterval(() => { if (document.visibilityState === 'visible') tick(); }, SYNC_MS);
    const onVis = () => { if (document.visibilityState === 'visible' && Date.now() - lastRefreshAt.current > 60000) tick(); };
    const onOnline = () => refreshAllData(false, 'data'); // connection is back: reload right away (a full load if masters are missing)
    window.addEventListener('focus', onVis);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(timer); clearTimeout(retryTimer.current);
      window.removeEventListener('focus', onVis); window.removeEventListener('online', onOnline); document.removeEventListener('visibilitychange', onVis);
    };
  }, [refreshAllData, uid]);

  useEffect(() => {
    if (loadedCompanyRef.current === company) return;
    loadedCompanyRef.current = company;
    epochRef.current += 1; statsRef.current = null; setStats(null); lastListsAt.current = 0;
    setD((p) => ({ ...p, alerts: [], todayEntries: [], entries: [], emptyWeights: [] }));
    setStatsError('');
    clearTimeout(retryTimer.current);
    if (uid) refreshAllData(false, modeForTab(tabRef.current));
  }, [company, uid, refreshAllData]);

  // Entry matching remains global; company-specific pending lists cannot reuse that page.
  useEffect(() => {
    const expected = activeTab === 'entry' ? 'entry-global' : company;
    if (uid && LIST_TABS.includes(activeTab) && (lastListsCompany.current !== expected || Date.now() - lastListsAt.current > 30000)) refreshAllData(false, 'data');
  }, [activeTab, company, uid, refreshAllData]);

  // Other devices' saves refresh the numbers in near real time (no polling).
  useLiveSync(!!uid, () => {
    if (inFlight.current || Date.now() - lastRefreshAt.current < 60000) return;
    if (Date.now() < rateLimitedUntil.current) return; // rate-limited: let the cool-down expire before auto-refreshing
    invalidateStats(true);
    refreshAllData(false, modeForTab(tabRef.current));
  });

  // Batched server re-query: unscoped event payloads must never enter another company's view.
  useEffect(() => {
    if (!uid) return undefined;
    let timer, unsubscribe = () => {};
    try {
      const u = base44.entities.Alert.subscribe(() => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (!navigator.onLine || inFlight.current || Date.now() - lastRefreshAt.current < 60000 || Date.now() < rateLimitedUntil.current) return;
          invalidateStats(true); refreshAllData(false, 'light');
        }, 3000);
      });
      if (typeof u === 'function') unsubscribe = u;
    } catch (e) { console.error('Alert subscription failed:', e); }
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [uid, invalidateStats, refreshAllData]);

  // Empty weights waiting too long for their loading entry raise an alert (supervisor+ sessions only, at most every 5 minutes).
  useEffect(() => {
    if (!uid || !canHandleAlerts(currentUser) || d.emptyWeights.length === 0) return;
    if (Date.now() - pendingSyncAt.current < 300000) return;
    pendingSyncAt.current = Date.now();
    syncPendingAlerts(d.emptyWeights, rules).then((n) => { if (n > 0) refreshAllData(false, 'light'); }).catch(() => {});
  }, [d.emptyWeights, rules, uid]);

  const refresh = useCallback(() => { invalidateStats(); return refreshAllData(false, 'full'); }, [invalidateStats, refreshAllData]);
  const refreshData = useCallback(() => { invalidateStats(); return refreshAllData(false, 'data'); }, [invalidateStats, refreshAllData]);

  const currentStats = stats?.company === company ? stats : null;
  const criticalAlertCount = currentStats?.criticalAlertCount || 0;
  // The badge comes from the server-side counters when they are known (the lists are only a page of the records).
  const pendingCount = (currentStats?.pendingEmpty || 0) + (currentStats?.noEmpty || 0);
  const approvalCount = d.approvals.filter((a) => a.status === 'pending').length;

  const operationalVisible = activeTab === 'entry' || lastListsCompany.current === company;
  return { ...d, alerts: currentStats ? d.alerts : [], todayEntries: currentStats ? d.todayEntries : [], entries: operationalVisible ? d.entries : [], emptyWeights: operationalVisible ? d.emptyWeights : [], stats: currentStats, rules, loading, isSyncing, lastSynced, connError, usersError, statsError, refresh, refreshData, criticalAlertCount, pendingCount, approvalCount };
}