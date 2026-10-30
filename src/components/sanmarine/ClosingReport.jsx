import React, { useState, useEffect, useRef } from 'react';
import { X, Printer, Loader2, FileText } from 'lucide-react';
import { buildFormalClosingReport } from '@/lib/sanmarineReports';

const fN = (n) => Number(n || 0).toLocaleString('en-IN');
const fmtDMY = (d) => { const p = (d || '').split('-'); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0].slice(2)}` : d || ''; };

export default function ClosingReport({ closing, closings, vessels, lighters, consignees, settings, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setData(null); setError('');
    buildFormalClosingReport(closing.id, { closings, vessels, lighters, consignees })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message || 'রিপোর্ট তৈরি ব্যর্থ।'); });
    return () => { cancelled = true; };
  }, [closing.id]);

  const slNo = (() => {
    const sorted = [...closings].sort((a, b) => (a.created_date || '').localeCompare(b.created_date || ''));
    return sorted.findIndex((c) => c.id === closing.id) + 1;
  })();

  const companyName = data?.company || 'Not Assigned';
  const sameSettingsCompany = settings?.companyName === companyName;
  const subHeader = settings?.reportSubHeader || 'DEDICATED TO SERVING YOUR NEEDS';
  const tagline = settings?.reportTagline || 'MARINE SURVEY AND CONSULTANCY FIRM';
  const address = settings?.address || '1817, Nirman SS Tower (5th Floor) Abdus Sattar By Lane, Sk. Mujib Road, Badamtali, Agrabad, Chattogram.';
  const email = settings?.email || 'smsichittagong@gmail.com';
  const phone = settings?.phone || '+88 02 3333 22848, 01923-008877, 01923-006688';

  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const handlePrint = () => {
    const html = ref.current?.innerHTML;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    // Escape every entity-derived value written into the popup document (the title here) to prevent
    // stored XSS via attacker-controlled vessel names. ${html} is React-serialized DOM (text already escaped).
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Closing Report — ${esc(closing.lighterVesselName)}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>@media print{body{padding:8px}}</style></head>
      <body class="p-4 bg-white">${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-8">
        <div className="flex items-center justify-between p-3 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-teal-600" />
            <h2 className="text-sm font-black text-slate-800">ফাইনাল ডিসচার্জিং রিপোর্ট</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-teal-700">
              <Printer className="h-4 w-4" /> প্রিন্ট
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
              <X className="h-5 w-5 text-slate-600" />
            </button>
          </div>
        </div>

        <div ref={ref} className="p-6 space-y-4">
          {error ? (
            <div className="text-center py-8 text-rose-600 font-bold">{error}</div>
          ) : !data ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>
          ) : (
            <>
              {/* Header */}
              <div className="border-2 border-rose-600 rounded-lg overflow-hidden">
                <div className="bg-rose-600 text-white p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xl font-black tracking-wide">{companyName}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-semibold opacity-90">{subHeader}</div>
                    <div className="text-[10px] font-semibold opacity-90">{tagline}</div>
                    <div className="text-sm font-black mt-1">SL.No {String(slNo).padStart(5, '0')}</div>
                  </div>
                </div>
                <div className="p-2 text-center font-black text-sm text-slate-800 bg-rose-50">
                  Daily / Final Discharging Report
                </div>
              </div>

              {/* Meta info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs border border-slate-300 rounded-lg p-3">
                <div className="flex"><span className="font-bold text-slate-600 w-44 shrink-0">From No:</span><span className="font-bold text-slate-800">—</span></div>
                <div className="flex"><span className="font-bold text-slate-600 w-44 shrink-0">Company:</span><span className="font-bold text-slate-800">{data.company || '—'}</span></div>
                <div className="flex"><span className="font-bold text-slate-600 w-44 shrink-0">Name of Mother Vessel:</span><span className="font-bold text-slate-800">{data.closing.motherVesselName || '—'}</span></div>
                <div className="flex"><span className="font-bold text-slate-600 w-44 shrink-0">Name of Lighter Vessel:</span><span className="font-bold text-slate-800">{data.closing.lighterVesselName || '—'}</span></div>
                <div className="flex"><span className="font-bold text-slate-600 w-44 shrink-0">Name of Consignee:</span><span className="font-bold text-slate-800">A/C: {data.closing.consigneeName || 'Not Assigned'}</span></div>
                <div className="flex"><span className="font-bold text-slate-600 w-44 shrink-0">Name of Ghat:</span><span className="font-bold text-slate-800">{data.closing.ghatName || '—'}</span></div>
                <div className="flex"><span className="font-bold text-slate-600 w-44 shrink-0">Commence Date &amp; Time:</span><span className="font-bold text-slate-800">{fmtDMY(data.commenceDate)} / {data.commenceTime || '—'}</span></div>
                <div className="flex"><span className="font-bold text-slate-600 w-44 shrink-0">Completion Date &amp; Time:</span><span className="font-bold text-slate-800">{fmtDMY(data.completionDate)} / {data.completionTime || '—'}</span></div>
                <div className="flex"><span className="font-bold text-slate-600 w-44 shrink-0">Cargo:</span><span className="font-bold text-slate-800">{data.closing.cargoName || 'Unavailable'}</span></div>
              </div>

              {/* Data table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse border border-slate-400">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-400 px-2 py-1.5 text-left font-black">Date</th>
                      <th className="border border-slate-400 px-2 py-1.5 text-center font-black">No. of Truck</th>
                      <th className="border border-slate-400 px-2 py-1.5 text-center font-black">Total Bags (No.)</th>
                      <th className="border border-slate-400 px-2 py-1.5 text-center font-black">Gross Weight (M/T)</th>
                      <th className="border border-slate-400 px-2 py-1.5 text-center font-black">Net Weight (M/T)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="border border-slate-400 px-2 py-1 font-bold">{fmtDMY(r.date)} ({r.shift === 'Day' ? 'D' : 'N'})</td>
                        <td className="border border-slate-400 px-2 py-1 text-center font-mono font-bold">{r.trucks}</td>
                        <td className="border border-slate-400 px-2 py-1 text-center font-mono">{r.bags > 0 ? fN(r.bags) : 'LOOSE'}</td>
                        <td className="border border-slate-400 px-2 py-1 text-center font-mono">{(r.gross / 1000).toFixed(3)}</td>
                        <td className="border border-slate-400 px-2 py-1 text-center font-mono">{(r.net / 1000).toFixed(3)}</td>
                      </tr>
                    ))}
                    {data.rows.length === 0 && (
                      <tr><td colSpan={5} className="border border-slate-400 px-2 py-4 text-center text-slate-400 font-bold">কোনো তথ্য নেই</td></tr>
                    )}
                    <tr className="bg-slate-100 font-black">
                      <td className="border border-slate-400 px-2 py-1.5">Total</td>
                      <td className="border border-slate-400 px-2 py-1.5 text-center font-mono">{data.totalTrucks} TRUCK</td>
                      <td className="border border-slate-400 px-2 py-1.5 text-center font-mono">{data.totalBags > 0 ? fN(data.totalBags) : 'LOOSE'}</td>
                      <td className="border border-slate-400 px-2 py-1.5 text-center font-mono">{data.totalGrossMT}</td>
                      <td className="border border-slate-400 px-2 py-1.5 text-center font-mono">{data.totalNetMT}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Remarks */}
              <div className="text-xs min-h-[24px]">
                <span className="font-bold text-slate-600">Remarks: </span>
                <span className="text-slate-800">{data.closing.closingNotes || ''}</span>
              </div>

              {/* Summary totals */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs border border-slate-300 rounded-lg p-3">
                <div className="flex justify-between"><span className="font-bold text-slate-600">Total P.P Bags:</span><span className="font-bold text-slate-800">{data.totalBags > 0 ? fN(data.totalBags) : 'NILL'}</span></div>
                <div className="flex justify-between"><span className="font-bold text-slate-600">PP Bags Weight (AVG):</span><span className="font-bold text-slate-800">NILL</span></div>
                <div className="flex justify-between"><span className="font-bold text-slate-600">Total Gunny Bags:</span><span className="font-bold text-slate-800">NILL</span></div>
                <div className="flex justify-between"><span className="font-bold text-slate-600">Gunny Bags Weight (AVG):</span><span className="font-bold text-slate-800">NILL</span></div>
                <div className="flex justify-between col-span-2 border-t border-slate-200 pt-1 mt-1">
                  <span className="font-black text-slate-700">Total Net Weight:</span>
                  <span className="font-black text-teal-700">{data.totalNetMT} M/T</span>
                </div>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-6 mt-6 text-xs">
                <div className="border-t border-slate-400 pt-1 font-bold text-slate-700">Signature of Consignee</div>
                <div className="border-t border-slate-400 pt-1 font-bold text-slate-700">Signature of Master</div>
                <div className="border-t border-slate-400 pt-1 font-bold text-slate-700">Signature of Joint Surveyor</div>
                <div className="border-t border-slate-400 pt-1 font-bold text-slate-700">For: {companyName}</div>
              </div>

              {/* Address bar */}
              <div className="bg-rose-600 text-white text-center py-2 rounded-lg text-[10px] font-semibold leading-tight">
                {sameSettingsCompany ? <>{address} Email: {email} Phone: {phone}</> : 'Company Address / Email / Phone: Unavailable'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}