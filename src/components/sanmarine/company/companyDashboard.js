import { base44 } from '@/api/base44Client';
import { dedupe, runLimited } from '@/lib/sanmarineNet';
import { canonicalCompany, companyValues, andQuery, readScopeRows } from '@/components/sanmarine/company/companyScope';
const today = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); };

// Safe wrappers: a failed count/aggregate returns 0/empty instead of throwing.
// One failed read must never block the entire dashboard.
const safeCount = async (entity, query) => {
  try { const n = await entity.count(query); return Number.isFinite(n) ? n : 0; } catch { return 0; }
};
const safeAgg = async (fn) => {
  try { return await fn(); } catch { return { rows: [] }; }
};

// Company-scoped dashboard snapshot. Uses companyQuery directly (no ID-list building)
// and wraps every read so partial failures still produce a usable dashboard.
export default function companyDashboard(company) {
  return dedupe(`company-dashboard:${company}`, async () => {
    const E = base44.entities;
    const aliases = companyValues(company);
    const canonical = canonicalCompany(company);
    const companyQuery = { company: { $in: aliases } };
    const date = today();
    const unlinked = { $or: [{ loadingEntryId: '' }, { loadingEntryId: { $exists: false } }] };

    // 11 counts — each independently safe. runLimited keeps concurrency at 2 to respect rate limits.
    const [totalLoads, todayLoads, totalEmpty, todayEmpty, okMatched, pendingEmpty, noEmpty, missingDocs, missingVideo, activeVessels, activeLighters] = await runLimited([
      () => safeCount(E.TruckEntry, companyQuery),
      () => safeCount(E.TruckEntry, { ...companyQuery, date }),
      () => safeCount(E.EmptyWeight, companyQuery),
      () => safeCount(E.EmptyWeight, { ...companyQuery, emptyWeightDate: date }),
      () => safeCount(E.TruckEntry, { ...companyQuery, emptyWeightMatched: true, missingDocs: { $ne: true } }),
      () => safeCount(E.EmptyWeight, { ...companyQuery, ...unlinked }),
      () => safeCount(E.TruckEntry, { ...companyQuery, emptyWeightMatched: { $ne: true } }),
      () => safeCount(E.TruckEntry, { ...companyQuery, missingDocs: true }),
      () => safeCount(E.EmptyWeight, { ...companyQuery, emptyWeightDate: date, $or: [{ emptyTruckVideo: '' }, { emptyTruckVideo: { $exists: false } }] }),
      () => safeCount(E.MotherVessel, { ...companyQuery, status: 'Active' }),
      () => safeCount(E.LighterVessel, { ...companyQuery, status: 'Active' }),
    ], 2);

    // 4 aggregates — each independently safe.
    const [totals, dates, ghats, alertGroups] = await runLimited([
      () => safeAgg(() => E.TruckEntry.aggregate({ query: companyQuery, sum: ['net', 'bags'] })),
      () => safeAgg(() => E.TruckEntry.aggregate({ query: companyQuery, groupBy: 'date', sum: ['net', 'bags'], sort: '-date', limit: 30 })),
      () => safeAgg(() => E.TruckEntry.aggregate({ query: companyQuery, groupBy: 'ghatName', sum: ['net', 'bags'], sort: '-count', limit: 20 })),
      () => safeAgg(() => E.Alert.aggregate({ query: { ...companyQuery, status: { $ne: 'RESOLVED' } }, groupBy: 'severity' })),
    ], 2);

    // Vessels and lighters are needed by the dashboard and child components.
    const [vessels, lighters] = await Promise.all([
      readScopeRows(E.MotherVessel, companyQuery).catch(() => []),
      readScopeRows(E.LighterVessel, companyQuery).catch(() => []),
    ]);

    const sum = (totals.rows && totals.rows[0]) || {};
    const t = (dates.rows || []).find((r) => r.date === date) || {};
    const alertCount = (values) => (alertGroups.rows || []).filter((r) => values.includes(r.severity)).reduce((n, r) => n + r.count, 0);

    const counts = {
      totalLoads, todayLoads, totalEmpty, todayEmpty, okMatched, pendingEmpty, noEmpty, missingDocs, missingVideo,
      activeVessels, activeLighters,
      criticalAlerts: alertCount(['critical']), highAlerts: alertCount(['high', 'warning']),
      criticalAlertCount: alertCount(['critical', 'high']),
    };

    return {
      company: canonical,
      ...counts,
      counts,
      sums: { bags: sum.sum_bags || 0, net: sum.sum_net || 0, todayBags: t.sum_bags || 0, todayNet: t.sum_net || 0 },
      dateRows: (dates.rows || []).slice().reverse(),
      ghatRows: ghats.rows || [],
      scope: { company: canonical, aliases, companyQuery, vessels, lighters, trucks: companyQuery, empty: companyQuery, alerts: companyQuery, docs: companyQuery, closings: { id: { $in: [] } } },
    };
  });
}