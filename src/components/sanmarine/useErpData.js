import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '@/lib/sanmarineApi';

const DEFAULT_SETTINGS = { companyName: 'SAN MARINE SURVEY & INSPECTION', reportHeader: 'Daily Discharge Report' };
const MASTER0 = { vessels: [], lighters: [], consignees: [], ghats: [], cargos: [], scales: [], users: [], closings: [], settings: DEFAULT_SETTINGS };
const LIVE0 = { alerts: [], approvals: [], pendingEmpty: [], pendingLoads: [], stats: null };
const POLL_MS = 20000;

// Loads the ERP data the screens need. Master lists change rarely (reloaded on demand);
// the "live" part (counts, alerts, approvals, pending trucks) is small and refreshed in the background.
export default function useErpData(enabled) {
  const [master, setMaster] = useState(MASTER0);
  const [live, setLive] = useState(LIVE0);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const statsRef = useRef(null);

  const loadMaster = useCallback(async () => {
    const z = (p) => p.catch(() => []);
    const [vessels, lighters, consignees, ghats, cargos, scales, users, closings, s] = await Promise.all([
      z(api.getErpVessels()), z(api.getErpLighters()), z(api.getErpConsignees()), z(api.getErpGhats()), z(api.getErpCargos()),
      z(api.getErpScales()), z(api.getErpUsersList()), z(api.getErpClosings()), api.getErpSettings().catch(() => null),
    ]);
    setMaster((prev) => ({ vessels, lighters, consignees, ghats, cargos, scales, users, closings, settings: s && s.companyName ? s : prev.settings }));
  }, []);

  const loadLive = useCallback(async () => {
    const z = (p) => p.catch(() => []);
    const [alerts, approvals, pendingEmpty, pendingLoads, stats] = await Promise.all([
      z(api.getAlerts()), z(api.getErpApprovals()), z(api.getUnlinkedEmptyWeights()), z(api.getLoadsWithoutEmpty()),
      api.getDashboardStats(statsRef.current).catch(() => statsRef.current),
    ]);
    statsRef.current = stats;
    setLive({ alerts, approvals, pendingEmpty, pendingLoads, stats });
  }, []);

  const refreshAll = useCallback(async (spinner = false) => {
    if (spinner) setLoading(true);
    setIsSyncing(true);
    await Promise.all([loadMaster(), loadLive()]);
    setLastSynced(new Date());
    setIsSyncing(false);
    if (spinner) setLoading(false);
  }, [loadMaster, loadLive]);

  const refreshLive = useCallback(async () => {
    setIsSyncing(true);
    await loadLive();
    setLastSynced(new Date());
    setIsSyncing(false);
  }, [loadLive]);

  useEffect(() => {
    if (!enabled) return undefined;
    refreshAll(true);
    const tick = () => { if (document.visibilityState === 'visible') refreshLive(); };
    const timer = setInterval(tick, POLL_MS);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); };
  }, [enabled, refreshAll, refreshLive]);

  return { ...master, ...live, loading, isSyncing, lastSynced, refreshAll, refreshLive };
}