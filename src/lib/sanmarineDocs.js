import { base44 } from '@/api/base44Client';
import { api } from '@/lib/sanmarineApi';
import * as R from '@/lib/sanmarineRules';
import { requireActor } from '@/lib/sanmarineSession';
import { ROLE_SETS } from '@/lib/erpRoles';
import { cleanRows, docRows } from '@/lib/sanmarineKhataRows';
import { canonicalCompany } from '@/components/sanmarine/company/companyScope';
import { parsePhotos } from '@/lib/sanmarinePhotos';

// Daily documents per Date + Mother Vessel + Lighter + Ghat: weighment sheet vs point khata.
const E = () => base44.entities.LighterDailyDocument;
const audit = (u, action, id, details, oldV, newV) => api.addAuditLog({
  userId: u.id, userName: u.name, userRole: u.role, action, recordType: 'LighterDailyDocument', recordId: id || '', details: details || '',
  oldValue: oldV ? JSON.stringify(oldV) : '', newValue: newV ? JSON.stringify(newV) : '',
});

export function validateDoc(f) {
  return [
    !f.date && 'তারিখ', !f.motherVesselId && 'মাদার ভেসেল', !f.lighterVesselId && 'লাইটার', !f.ghatName && 'ঘাট',
    parsePhotos(f.weighmentSheetPhoto).length === 0 && 'ওয়েইমেন্ট শিট ছবি', parsePhotos(f.pointKhataPhoto).length === 0 && 'পয়েন্ট খাতা ছবি',
    R.parseTruckList(f.wsText).length === 0 && 'ওয়েইমেন্ট শিটের ট্রাক নম্বর', R.parseTruckList(f.pkText).length === 0 && 'পয়েন্ট খাতার ট্রাক নম্বর',
    !(Number(f.wsBags) > 0) && 'ওয়েইমেন্ট শিটের ব্যাগ সংখ্যা', !(Number(f.pkBags) > 0) && 'পয়েন্ট খাতার ব্যাগ সংখ্যা',
  ].filter(Boolean);
}

function docFields(f, ctx, rec) {
  const company = canonicalCompany(ctx.vessel?.company);
  if (!company || ctx.lighter?.motherVesselId !== ctx.vessel?.id || ctx.lighter?.company && canonicalCompany(ctx.lighter.company) !== company) throw new Error('Daily Document-এর Mother/Lighter কোম্পানি সংযোগ নিশ্চিত নয়; Admin Review করুন।');
  return {
    company,
    date: f.date, motherVesselId: f.motherVesselId, motherVesselName: ctx.vessel?.name || '', lighterVesselId: f.lighterVesselId,
    lighterVesselName: ctx.lighter?.name || '', ghatName: (f.ghatName || '').toUpperCase(), ghatId: ctx.ghat?.id || '',
    consigneeId: ctx.lighter?.consigneeId || '', consigneeName: ctx.lighter?.consigneeName || '',
    weighmentSheetPhoto: f.weighmentSheetPhoto, pointKhataPhoto: f.pointKhataPhoto, remarks: f.remarks || '',
    weighmentSheetTotalTrucks: rec.wsCount, pointKhataTotalTrucks: rec.pkCount, truckDifference: rec.truckDifference,
    scaleTotalBags: Number(f.wsBags) || 0, pointKhataTotalBags: Number(f.pkBags) || 0, bagDifference: rec.bagDifference,
    weighmentTruckNumbers: JSON.stringify(rec.ws), pointKhataTruckNumbers: JSON.stringify(rec.pk),
    ...(f.wsRows ? { weighmentRows: JSON.stringify(cleanRows(f.wsRows)) } : {}),
    ...(f.pkRows ? { pointKhataRows: JSON.stringify(cleanRows(f.pkRows)) } : {}),
    missingInPointKhata: JSON.stringify(rec.missingInPointKhata), missingInWeighmentSheet: JSON.stringify(rec.missingInWeighmentSheet),
    inBothTrucks: JSON.stringify(rec.inBoth), duplicateTrucks: JSON.stringify(rec.duplicates), reconciliationStatus: rec.status,
  };
}

const isTruckBad = (truckDiff, missPk, missWs) => truckDiff !== 0 || missPk > 0 || missWs > 0;
const jsonLen = (s) => { try { return JSON.parse(s || '[]').length; } catch (e) { return 0; } };

// Truck mismatch and bag mismatch are separate alerts. A bag difference above 45 is HIGH PRIORITY (critical).
// `old` (when editing) stops an unchanged problem from raising the same alert again.
async function docAlerts(fields, rec, user, old) {
  const where = `${fields.lighterVesselName} (${fields.date})`;
  const out = [];
  const truckBad = isTruckBad(rec.truckDifference, rec.missingInPointKhata.length, rec.missingInWeighmentSheet.length);
  const oldTruckBad = old ? isTruckBad(old.truckDifference || 0, jsonLen(old.missingInPointKhata), jsonLen(old.missingInWeighmentSheet)) : false;
  if (truckBad && !oldTruckBad) {
    // Distinct category per problem, so the headline itself says whether TRUCKS or BAGS fail to match.
    out.push(api.createAlert({
      category: 'DOC_TRUCK_MISMATCH', status: 'OPEN', severity: 'high', title: `ডেইলি ডকুমেন্টে ট্রাক মিলছে না — ${where}`,
      description: `ওয়েইমেন্ট শিট ${rec.wsCount} ট্রাক, পয়েন্ট খাতা ${rec.pkCount} ট্রাক; শিটে আছে কিন্তু খাতায় নেই ${rec.missingInPointKhata.length}টি, খাতায় আছে কিন্তু শিটে নেই ${rec.missingInWeighmentSheet.length}টি`,
      expectedValue: `ওয়েইমেন্ট শিট ${rec.wsCount} ট্রাক`, actualValue: `পয়েন্ট খাতা ${rec.pkCount} ট্রাক`,
      ghat: fields.ghatName, enteredByName: user.name, company: canonicalCompany(fields.company), motherVesselId: fields.motherVesselId, lighterVesselId: fields.lighterVesselId, consigneeId: fields.consigneeId, relatedDailyDocumentId: fields.id || '',
    }));
  }
  const bagGap = Math.abs(rec.bagDifference);
  const oldBagGap = old ? Math.abs(old.bagDifference || 0) : 0;
  if (bagGap > R.DOC_BAG_ALERT_THRESHOLD && oldBagGap <= R.DOC_BAG_ALERT_THRESHOLD) {
    out.push(api.createAlert({
      category: 'DOC_BAG_MISMATCH', status: 'OPEN', severity: 'critical', title: `ডেইলি ডকুমেন্টে ব্যাগ মিলছে না (${R.DOC_BAG_ALERT_THRESHOLD}-এর বেশি) — ${where}`,
      description: `ওয়েইমেন্ট শিট ${fields.scaleTotalBags} ব্যাগ, পয়েন্ট খাতা ${fields.pointKhataTotalBags} ব্যাগ; পার্থক্য ${rec.bagDifference} ব্যাগ`,
      expectedValue: `ওয়েইমেন্ট শিট ${fields.scaleTotalBags} ব্যাগ`, actualValue: `পয়েন্ট খাতা ${fields.pointKhataTotalBags} ব্যাগ`,
      ghat: fields.ghatName, enteredByName: user.name, company: canonicalCompany(fields.company), motherVesselId: fields.motherVesselId, lighterVesselId: fields.lighterVesselId, consigneeId: fields.consigneeId, relatedDailyDocumentId: fields.id || '',
    }));
  }
  await Promise.all(out);
}

export async function saveDailyDoc(f, ctx, actor) {
  const me = await requireActor(actor);
  const miss = validateDoc(f);
  if (miss.length) throw new Error(`আবশ্যক তথ্য/ডকুমেন্ট অসম্পূর্ণ — জমা হয়নি: ${miss.join(', ')}`);
  const dup = await E().filter({ date: f.date, motherVesselId: f.motherVesselId, lighterVesselId: f.lighterVesselId, ghatName: f.ghatName.toUpperCase() }, { limit: 1 });
  if (dup.items.length) throw new Error('এই তারিখ, মাদার ভেসেল, লাইটার ও ঘাটের ডকুমেন্ট আগেই আছে — তালিকা থেকে সেটি সম্পাদনা করুন।');
  const rec = R.reconcileDocs(f);
  const fields = docFields(f, ctx, rec);
  const doc = await E().create({ ...fields, uploadedBy: me.name, uploadedAt: api.nowISO() });
  await docAlerts({ ...fields, id: doc.id }, rec, me, null);
  await audit(me, 'DAILY_DOC_CREATED', doc.id, `${fields.lighterVesselName} · ${fields.date} · ${rec.status}`);
  return { doc, rec };
}

export async function applyDocEdit(id, f, ctx, actor, { approved = false } = {}) {
  const me = approved ? actor : await requireActor(actor, ROLE_SETS.ADMIN);
  const miss = validateDoc(f);
  if (miss.length) throw new Error(`আবশ্যক তথ্য/ডকুমেন্ট অসম্পূর্ণ: ${miss.join(', ')}`);
  const old = await E().get(id);
  if (!old) throw new Error('ডকুমেন্ট পাওয়া যায়নি।');
  const rec = R.reconcileDocs(f);
  const fields = docFields(f, ctx, rec);
  if (old.company && canonicalCompany(old.company) !== fields.company) throw new Error('বিদ্যমান Document-এর কোম্পানি বদলানো হবে না; Admin Review প্রয়োজন।');
  if (old.company) fields.company = old.company;
  const updated = await E().update(id, { ...fields, lastEditedBy: me.name, lastEditedAt: api.nowISO() });
  await docAlerts({ ...fields, id }, rec, me, old);
  await audit(me, 'DAILY_DOC_EDITED', id, `${fields.lighterVesselName} · ${fields.date}`, { status: old.reconciliationStatus, trucks: old.weighmentSheetTotalTrucks, khata: old.pointKhataTotalTrucks }, { status: rec.status, trucks: rec.wsCount, khata: rec.pkCount });
  return updated;
}

export async function deleteDailyDoc(id, actor, { approved = false } = {}) {
  const me = approved ? actor : await requireActor(actor, ROLE_SETS.ADMIN);
  const old = await E().get(id);
  if (!old) return;
  await E().delete(id);
  await audit(me, 'DAILY_DOC_DELETED', id, `${old.lighterVesselName} · ${old.date}`, old);
}

// Text form of a saved document (for the edit form).
export const docToForm = (d) => {
  const list = (s) => { try { return JSON.parse(s || '[]').join('\n'); } catch (e) { return ''; } };
  return {
    date: d.date, motherVesselId: d.motherVesselId, lighterVesselId: d.lighterVesselId, ghatName: d.ghatName,
    weighmentSheetPhoto: d.weighmentSheetPhoto || '', pointKhataPhoto: d.pointKhataPhoto || '', remarks: d.remarks || '',
    wsText: list(d.weighmentTruckNumbers), pkText: list(d.pointKhataTruckNumbers),
    wsRows: docRows(d.weighmentRows, d.weighmentTruckNumbers), pkRows: docRows(d.pointKhataRows, d.pointKhataTruckNumbers),
    wsBags: String(d.scaleTotalBags || ''), pkBags: String(d.pointKhataTotalBags || ''),
  };
};