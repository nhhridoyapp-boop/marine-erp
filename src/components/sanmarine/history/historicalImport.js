import { base44 } from '@/api/base44Client';
import { createAutoBackup, loadBackupFile, verifyBackupIntegrity } from '@/lib/sanmarineBackup';
import { assertHistoryAdmin, previewCounts } from '@/components/sanmarine/history/historicalPreview';
import historicalExisting from '@/components/sanmarine/history/historicalExisting';
import { digest } from '@/components/sanmarine/history/historicalValues';

let running = false;
export default async function historicalImport(preview, actor, progress) {
  if (running) throw new Error('একটি Historical Import ইতিমধ্যে চলছে।');
  running = true;
  try {
    await assertHistoryAdmin(actor);
    progress('সেফটি ব্যাকআপ তৈরি ও সংরক্ষিত কপি যাচাই হচ্ছে...');
    const backup = await createAutoBackup(actor, 'manual', 'Historical Empty Weight Import-এর আগে পূর্ণ সেফটি ব্যাকআপ');
    if (!backup.verified) throw new Error('ব্যাকআপ ভেরিফাই হয়নি; কোনো Historical Record Import করা হয়নি।');
    const stored = await loadBackupFile(backup.log.fileUri);
    const integrity = await verifyBackupIntegrity(stored);
    if (!integrity.ok || stored.hash !== backup.hash) throw new Error('সংরক্ষিত ব্যাকআপ পুনরায় পড়ে মেলেনি; Import বন্ধ।');
    progress('বর্তমান রেকর্ডের সঙ্গে আবার Duplicate/Conflict যাচাই হচ্ছে...');
    const candidates = await historicalExisting(preview.localCandidates), counts = previewCounts(candidates);
    const ready = candidates.filter((c) => c.status === 'VALID');
    if (!ready.length) return { status: 'COMPLETED', successful: 0, counts, message: 'যাচাইয়ের পরে নতুন বৈধ রেকর্ড নেই; কোনো ডেটা বদলানো হয়নি।' };
    progress('উৎস ফাইল ও Validation Summary গোপনে সংরক্ষিত হচ্ছে...');
    const sources = [];
    for (const s of preview.sources) {
      if (await digest(await s.file.arrayBuffer()) !== s.hash) throw new Error('Preview-এর পর উৎস ফাইল বদলেছে; Import বন্ধ।');
      const uploaded = await base44.integrations.Core.UploadPrivateFile({ file: s.file });
      if (!uploaded.file_uri) throw new Error('উৎস ফাইল সংরক্ষণ ব্যর্থ; Import বন্ধ।');
      sources.push({ fileName: s.file.name, fileUri: uploaded.file_uri, hash: s.hash });
    }
    const summary = new File([JSON.stringify({ sources, counts, candidates })], 'historical-import-validation.json', { type: 'application/json' });
    const uploadedSummary = await base44.integrations.Core.UploadPrivateFile({ file: summary });
    if (!uploadedSummary.file_uri) throw new Error('Validation Summary সংরক্ষণ ব্যর্থ; Import বন্ধ।');
    const batchId = crypto.randomUUID();
    const log = await base44.entities.HistoricalImportLog.create({ batchId, status: 'STARTED', backupId: backup.log.id, sourceFiles: sources, summaryFileUri: uploadedSummary.file_uri, totalRows: candidates.length, successful: 0, duplicates: counts.DUPLICATE, invalid: counts.INVALID, review: counts.REVIEW, skipped: counts.SKIPPED });
    let failure = '';
    for (let i = 0; i < ready.length; i += 50) {
      progress(`${i}/${ready.length} — Historical Record Import হচ্ছে...`);
      try {
        await base44.entities.HistoricalEmptyWeight.bulkCreate(ready.slice(i, i + 50).map(({ record }) => ({ ...record, importBatchId: batchId, backupId: backup.log.id })));
      } catch (e) { failure = e.message || 'Save-এর ফল অনিশ্চিত; আবার Preview করলে বিদ্যমান রেকর্ড বাদ যাবে।'; break; }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    const successful = await base44.entities.HistoricalEmptyWeight.count({ importBatchId: batchId });
    const status = !failure && successful === ready.length ? 'COMPLETED' : 'PARTIAL';
    await base44.entities.HistoricalImportLog.update(log.id, { status, successful, errorMessage: failure });
    return { status, successful, counts, batchId, backupId: backup.log.id, remaining: ready.length - successful, message: failure };
  } finally { running = false; }
}