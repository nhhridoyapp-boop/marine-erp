import { base44 } from '@/api/base44Client';
import { api } from '@/lib/sanmarineApi';
import { reopenClosing } from '@/lib/sanmarineClosing';
import { requireActor } from '@/lib/sanmarineSession';
import { ROLE_SETS } from '@/lib/erpRoles';
import { assertNotLocked, applyRecordEdit, findDuplicateSlip, saveEmptyWeight, saveLoadingEntry } from '@/lib/sanmarineEntries';
import { applyDocEdit, deleteDailyDoc } from '@/lib/sanmarineDocs';
import { createAutoBackup } from '@/lib/sanmarineBackup';
import { getRules, MATCH_FLAG_CODES, mergeFlags, parseFlags, flag } from '@/lib/sanmarineRules';
import { withRetry } from '@/lib/sanmarineNet';

// Approving is a chain of several server calls, so the server's short-term rate limit can refuse one of them
// mid-way. Every step below is retried, and the entry-creating step checks first that it did not already run —
// a retry can therefore never record the same weighing twice.
const RETRY = { tries: 3, base: 1500 };
async function heldEntryAlreadySaved(payload) {
  const form = payload && payload.form;
  if (!form || !form.truckNumber) return false;
  // Same slip identity as the entry forms use (truck + date + time, scale name ignored).
  const dup = await findDuplicateSlip(payload.kind, {
    truckNumber: form.truckNumber,
    date: payload.kind === 'loading' ? form.date : form.emptyWeightDate,
    time: payload.kind === 'loading' ? form.time : form.emptyWeightTime,
    secondWeightDate: form.secondWeightDate,
    secondWeightTime: form.secondWeightTime,
  });
  return !!dup;
}

export async function logAudit(user, action, recordType, recordId, details, oldValue, newValue) {
  return api.addAuditLog({
    userId: user?.id || '', userName: user?.name || 'System', userRole: user?.role || '',
    action, recordType, recordId: recordId || '', details: details || '',
    oldValue: oldValue ? JSON.stringify(oldValue) : '', newValue: newValue ? JSON.stringify(newValue) : '',
  });
}

export async function saveMaster(entityName, id, data) {
  const ent = base44.entities[entityName];
  return id ? ent.update(id, data) : ent.create(data);
}

export async function createApproval(user, { type, targetId, targetDescription, details, payload }) {
  return base44.entities.ApprovalRequest.create({
    type, targetId: targetId || '', targetDescription, details: details || '',
    payload: payload ? JSON.stringify(payload) : '',
    requestedBy: user.id, requestedByName: user.name, requestedRole: user.role,
    requestedAt: api.nowISO(), status: 'pending',
  });
}

// Deletes a record and un-links its counterpart so pending lists stay correct.
// Admin/Super Admin only (role re-checked from the database); a LOCKED lighter's records are immutable.
// The full deleted record is kept in the audit log so it can be recovered.
export async function deleteRecord(kind, id, actor, { approved = false } = {}) {
  const me = approved ? actor : await requireActor(actor, ROLE_SETS.ADMIN);
  if (kind === 'document') return deleteDailyDoc(id, me, { approved: true });
  const ent = kind === 'loading' ? base44.entities.TruckEntry : base44.entities.EmptyWeight;
  const rec = await ent.get(id);
  if (!rec) return;
  await assertNotLocked(kind, rec);
  if (kind === 'loading' && rec.emptyWeightId) {
    await base44.entities.EmptyWeight.update(rec.emptyWeightId, { loadingEntryId: '' }).catch(() => {});
  }
  if (kind === 'empty' && rec.loadingEntryId) {
    const load = await base44.entities.TruckEntry.get(rec.loadingEntryId).catch(() => null);
    if (load) {
      const flags = mergeFlags(parseFlags(load), MATCH_FLAG_CODES, [flag('EMPTY_WEIGHT_MISSING', 'যুক্ত খালি ওজন রেকর্ড মুছে ফেলা হয়েছে')]);
      await base44.entities.TruckEntry.update(load.id, { emptyWeightMatched: false, emptyWeightId: '', missingDocs: true, emptyDocMissing: true, problemFlags: JSON.stringify(flags) });
    }
  }
  await ent.delete(id);
  await logAudit(me, 'RECORD_DELETED', kind === 'loading' ? 'TruckEntry' : 'EmptyWeight', id, rec.truckNumber, rec);
}

export async function resolveApproval(approval, decision, user) {
  // A held weight-mismatch entry is approved by an Admin; edit/delete/reopen requests stay Super Admin only.
  const weightMismatch = approval.type === 'WEIGHT_MISMATCH';
  const me = await requireActor(user, weightMismatch ? ROLE_SETS.ADMIN : ROLE_SETS.SUPER);
  // The request comes from the backend list, so no client entity read is needed here — an ERP admin whose
  // platform role is "user" cannot read the entity directly, and the backend re-checks "pending" on deciding.
  if (!approval || approval.status !== 'pending') throw new Error('এই অনুরোধ ইতিমধ্যে নিষ্পত্তি হয়েছে।');
  if (decision === 'approved') {
    const payload = approval.payload ? JSON.parse(approval.payload) : {};
    // The held entry is created now, exactly as it was submitted, and stays under the identity of the operator
    // who weighed the truck — the approving admin is recorded in its audit trail instead.
    if (approval.type === 'WEIGHT_MISMATCH') {
      const rules = getRules(await withRetry(() => api.getErpSettings(), RETRY));
      if (!(await withRetry(() => heldEntryAlreadySaved(payload), RETRY))) {
        if (payload.kind === 'loading') {
          const entry = await withRetry(() => saveLoadingEntry(payload.form, me, rules, { approved: true, enteredBy: payload.submitter }), { ...RETRY, timeoutMs: 40000 });
          await logAudit(me, 'LOADING_ENTRY_CREATED', 'TruckEntry', entry.id, `${entry.truckNumber} · নেট ${entry.net} KG · সিরিয়াল ${entry.serial} (ওজন গড়মিল অনুমোদিত)`);
        } else {
          const saved = await withRetry(() => saveEmptyWeight(payload.form, me, rules, { approved: true, enteredBy: payload.submitter }), { ...RETRY, timeoutMs: 40000 });
          await logAudit(me, 'EMPTY_WEIGHT_CREATED', 'EmptyWeight', saved.record.id, `${saved.record.truckNumber} · মনিটর ${saved.record.monitorWeight} KG (ওজন গড়মিল অনুমোদিত)`);
        }
      }
    }
    if (approval.type === 'RECORD_DELETE') await withRetry(() => deleteRecord(payload.kind, approval.targetId, me, { approved: true }), RETRY);
    if (approval.type === 'RECORD_EDIT') {
      if (payload.kind === 'document') await withRetry(() => applyDocEdit(approval.targetId, payload.form, payload.ctx, me, { approved: true }), RETRY);
      else await withRetry(() => applyRecordEdit(payload.kind, approval.targetId, payload.patch, me, { approved: true }), RETRY);
    }
    if (approval.type === 'VESSEL_REOPEN' || approval.type === 'LIGHTER_REOPEN') {
      await createAutoBackup(me, 'before-reopen', 'লাইটার পুনরায় খোলার আগে স্বয়ংক্রিয় ব্যাকআপ');
      await reopenClosing(me, approval.targetId);
    }
  }
  // The decision itself is stored by the backend (ERP role re-checked there, audit logged there), so it works
  // for an ERP admin whose platform role is "user", and the status can never be flipped from the browser.
  // A temporarily busy server is retried; "already decided" (a retry whose first attempt did go through) is a success.
  try {
    return await withRetry(() => api.decideApproval(approval.id, decision), { tries: 4, base: 1500 });
  } catch (e) {
    if (e && (e.status === 409 || (e.response && e.response.status) === 409)) return approval;
    throw e;
  }
}