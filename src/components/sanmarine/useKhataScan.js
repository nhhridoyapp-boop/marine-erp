import { useState } from 'react';
import { extractFromKhata } from '@/lib/sanmarineKhataOcr';
import { parsePhotos } from '@/lib/sanmarinePhotos';
import { withRows, summarizeRows } from '@/lib/sanmarineKhataRows';
import { matchHeader } from '@/lib/khataHeaderMatch';

// Scans every photo of the Weighment Sheet / Point Khata and fills: the truck + bag rows (totals follow automatically)
// and Date / Ghat / Mother Vessel / Lighter when they clearly match. Nothing is guessed: unreadable cells stay empty
// and the row is marked "Needs Verification" for the user to correct.
export default function useKhataScan(f, setF, { vessels = [], lighters = [], ghats = [], editId = null } = {}) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);

  const scan = async (kind) => {
    const photoKey = kind === 'ws' ? 'weighmentSheetPhoto' : 'pointKhataPhoto';
    const rowsKey = kind === 'ws' ? 'wsRows' : 'pkRows';
    const bagKey = kind === 'ws' ? 'wsBags' : 'pkBags';
    const uris = parsePhotos(f[photoKey]);
    if (!uris.length) return;
    if ((f[rowsKey] || []).some((r) => r.truck || r.bags) && !window.confirm('আগে লেখা ট্রাক/ব্যাগ তালিকা স্ক্যানের ফলাফল দিয়ে বদলাবেন?')) return;
    setBusy(kind); setMsg(null);
    const name = kind === 'ws' ? 'ওয়েইমেন্ট শিট' : 'পয়েন্ট খাতা';
    try {
      const r = await extractFromKhata(uris, kind);
      if (!r.rows.length) {
        setMsg({ kind: 'warn', text: `${name}: কোনো ট্রাক লাইন নিশ্চিতভাবে পড়া যায়নি — আগের তালিকা অপরিবর্তিত। ছবি পরিষ্কার করে আবার স্ক্যান করুন অথবা হাতে লিখুন।` });
        return;
      }
      const sum = summarizeRows(r.rows);
      const header = matchHeader(r, f, { vessels, lighters, ghats, allowDate: !editId });
      setF((p) => {
        const n = withRows(p, kind, r.rows);
        if (!sum.anyBags && r.totalBags) n[bagKey] = String(r.totalBags);
        return { ...n, ...header.patch };
      });
      const notes = [];
      if (r.failedPages.length) notes.push(`পৃষ্ঠা ${r.failedPages.join(', ')} স্ক্যান হয়নি — আবার চেষ্টা করুন`);
      if (sum.unresolved) notes.push(`Needs Verification — ${sum.unresolved}টি লাইনের ট্রাক/ব্যাগ নিশ্চিতভাবে পড়া যায়নি (অনুমান করা হয়নি), নিজে যাচাই করুন`);
      if (r.totalTrucksWritten != null && r.totalTrucksWritten !== sum.trucks) notes.push(`কাগজে মোট ${r.totalTrucksWritten} ট্রাক লেখা, পড়া গেছে ${sum.trucks}টি (ইউনিক)`);
      if (r.totalBags != null && sum.anyBags && r.totalBags !== sum.bags) notes.push(`কাগজে মোট ব্যাগ ${r.totalBags}, লাইনের যোগফল ${sum.bags}`);
      if (!sum.anyBags && r.totalBags == null) notes.push('ব্যাগ সংখ্যা পড়া যায়নি — হাতে লিখুন');
      if (header.dateIgnored) notes.push(`কাগজের তারিখ ${r.date} নেওয়া হয়নি (ফর্মের তারিখ ${f.date})`);
      const filled = header.filled.length ? ` কাগজ থেকে বসেছে: ${header.filled.join(', ')}।` : '';
      setMsg({
        kind: notes.length ? 'warn' : 'success',
        text: `${name}: ${sum.trucks}টি ট্রাক, ${sum.bags} ব্যাগ স্ক্যান হয়েছে।${filled}${notes.length ? ` ${notes.join(' · ')}` : ''}`,
      });
    } catch (e) {
      setMsg({ kind: 'error', text: `স্ক্যান ব্যর্থ: ${e.message || 'অজানা ত্রুটি'}। হাতে লিখুন।` });
    } finally { setBusy(''); }
  };
  return { busy, msg, scan };
}