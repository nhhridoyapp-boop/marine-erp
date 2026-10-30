import { base44 } from '@/api/base44Client';
import { api } from '@/lib/sanmarineApi';
import { requireActor } from '@/lib/sanmarineSession';
import { ROLE_SETS } from '@/lib/erpRoles';

// Totals for one lighter, computed on the server (aggregate), never by loading all rows.
export async function summarizeLighter(lighterId) {
  const [tot, byDate] = await Promise.all([
    base44.entities.TruckEntry.aggregate({ query: { lighterVesselId: lighterId }, groupBy: 'lighterVesselId', sum: ['net', 'bags'] }),
    base44.entities.TruckEntry.aggregate({ query: { lighterVesselId: lighterId }, groupBy: 'date', sum: ['net', 'bags'], sort: 'date', limit: 400 }),
  ]);
  const t = (tot.rows && tot.rows[0]) || {};
  return {
    trucks: t.count || 0,
    bags: t.sum_bags || 0,
    netKg: t.sum_net || 0,
    byDate: (byDate.rows || []).map(r => ({ date: r.date, trucks: r.count, bags: r.sum_bags, netKg: r.sum_net })),
  };
}

export async function closeLighter(actor, { lighter, vessel, summary, bagTareGrams, notes }) {
  const user = await requireActor(actor, ROLE_SETS.HANDLE);
  const grams = Number(bagTareGrams) || 0;
  const bagTareKg = (summary.bags * grams) / 1000;
  const finalKg = summary.netKg - bagTareKg;
  const closing = await base44.entities.VesselClosing.create({
    motherVesselId: vessel?.id || '',
    motherVesselName: vessel?.name || '',
    lighterVesselId: lighter.id,
    lighterVesselName: lighter.name,
    consigneeId: lighter.consigneeId || '',
    consigneeName: lighter.consigneeName || '',
    cargoName: vessel?.cargoType || '',
    declaredCargoMT: vessel?.totalCargoMT || 0,
    arrivalDate: vessel?.arrivalDate || undefined,
    closingDate: api.todayStr(),
    closedBy: user.id,
    closedByName: user.name,
    totalCompletedTrucks: summary.trucks,
    totalBags: summary.bags,
    totalDailyNetWeightKg: summary.netKg,
    bagTareWeightGrams: grams,
    totalBagTareWeightKg: bagTareKg,
    finalNetWeightKg: finalKg,
    finalNetWeightMT: finalKg / 1000,
    closingNotes: notes || '',
    dateBreakdown: JSON.stringify(summary.byDate),
    status: 'LOCKED',
    reopenRequested: false,
  });
  await base44.entities.LighterVessel.update(lighter.id, { status: 'Completed' });
  return closing;
}

export async function reopenClosing(actor, closingId) {
  const user = await requireActor(actor, ROLE_SETS.SUPER);
  const c = await base44.entities.VesselClosing.get(closingId);
  await base44.entities.VesselClosing.update(closingId, { status: 'REOPENED', reopenRequested: false, reopenedBy: user.name, reopenedAt: api.nowISO() });
  if (c && c.lighterVesselId) await base44.entities.LighterVessel.update(c.lighterVesselId, { status: 'Active' });
}