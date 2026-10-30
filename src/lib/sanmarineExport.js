// Export helpers for company-scoped reports: CSV, XLSX, print, PDF, WhatsApp.
import createReportXlsx from '@/components/sanmarine/company/createReportXlsx';
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const show = (v, c) => (c.num && typeof v === 'number' ? v.toLocaleString('en-IN') : (v ?? ''));
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const stamp = () => new Date().toISOString().slice(0, 10);

export const reportFileName = (report, ext) => `${report.title.replace(/[^\w\u0980-\u09FF]+/g, '_').slice(0, 40)}_${stamp()}.${ext}`;

function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function downloadExcel(report, header) {
  save(createReportXlsx(report, header), reportFileName(report, 'xlsx'));
}

export function downloadCsv(report, header) {
  const lines = [[header.companyName], [report.title], [report.subtitle]];
  (report.meta || []).forEach((m) => lines.push(m));
  lines.push([]);
  lines.push(report.columns.map((c) => c.label));
  report.rows.forEach((r) => lines.push(report.columns.map((c) => r[c.key])));
  if (report.totals) lines.push(report.columns.map((c) => report.totals[c.key] ?? ''));
  (report.notes || []).forEach((n) => lines.push([n]));
  const csv = lines.map((l) => l.map(csvCell).join(',')).join('\r\n');
  save(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }), reportFileName(report, 'csv'));
}

export function printReport(report, header) {
  const head = report.columns.map((c) => `<th style="text-align:${c.num ? 'right' : 'left'}">${esc(c.label)}</th>`).join('');
  const body = report.rows.map((r) => `<tr>${report.columns.map((c) => `<td style="text-align:${c.num ? 'right' : 'left'}">${esc(show(r[c.key], c))}</td>`).join('')}</tr>`).join('');
  const total = report.totals ? `<tr class="t">${report.columns.map((c) => `<td style="text-align:${c.num ? 'right' : 'left'}">${esc(show(report.totals[c.key], c))}</td>`).join('')}</tr>` : '';
  const meta = (report.meta || []).map((m) => `<tr><td><b>${esc(m[0])}</b></td><td>${esc(m[1])}</td></tr>`).join('');
  const notes = (report.notes || []).map((n) => `<p>${esc(n)}</p>`).join('');
  const w = window.open('', '_blank');
  if (!w) throw new Error('পপ-আপ ব্লক করা আছে — ব্রাউজারে পপ-আপ অনুমতি দিন।');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(report.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&display=swap" rel="stylesheet">
<style>body{font-family:'Hind Siliguri',sans-serif;padding:16px;color:#0f172a}h1,h2,h3{text-align:center;margin:2px}table{width:100%;border-collapse:collapse;margin-top:10px;font-size:11px}
th,td{border:1px solid #cbd5e1;padding:4px 6px}th{background:#f1f5f9}.t td{font-weight:700;background:#f8fafc}.m td{border:none;padding:2px 6px}@media print{body{padding:0}}</style></head><body>
<h2>${esc(header.companyName)}</h2><h3 style="font-weight:400">${esc(header.reportHeader)}</h3><h3>${esc(report.title)}</h3><p style="text-align:center;margin:2px">${esc(report.subtitle)}</p>
${meta ? `<table class="m">${meta}</table>` : ''}<table><thead><tr>${head}</tr></thead><tbody>${body}${total}</tbody></table>${notes}
<script>window.onload=function(){setTimeout(function(){window.print()},600)}</script></body></html>`);
  w.document.close();
}

export async function downloadPdf(el, report) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const scrollers = [...el.querySelectorAll('[data-scroll]')];
  const prev = scrollers.map((s) => s.style.overflow);
  scrollers.forEach((s) => { s.style.overflow = 'visible'; });
  let canvas;
  try { canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', width: el.scrollWidth, windowWidth: el.scrollWidth + 40 }); }
  finally { scrollers.forEach((s, i) => { s.style.overflow = prev[i]; }); }
  const pdf = new jsPDF('p', 'mm', 'a4');
  const margin = 8;
  const imgW = pdf.internal.pageSize.getWidth() - margin * 2;
  const pxPerMm = canvas.width / imgW;
  const sliceH = Math.floor((pdf.internal.pageSize.getHeight() - margin * 2) * pxPerMm);
  for (let y = 0, page = 0; y < canvas.height; y += sliceH, page += 1) {
    const h = Math.min(sliceH, canvas.height - y);
    const part = document.createElement('canvas');
    part.width = canvas.width; part.height = h;
    part.getContext('2d').drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (page > 0) pdf.addPage();
    pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, h / pxPerMm);
  }
  pdf.save(reportFileName(report, 'pdf'));
}

export function whatsappText(report, header) {
  const lines = [`*${header.companyName}*`, `*${report.title}*`, report.subtitle, ''];
  (report.meta || []).forEach((m) => lines.push(`${m[0]}: ${m[1]}`));
  const shown = report.rows.slice(0, 25);
  shown.forEach((r, i) => lines.push(`${i + 1}. ${report.columns.map((c) => show(r[c.key], c)).filter((v) => v !== '' && v !== 0).join(' | ')}`));
  if (report.rows.length > shown.length) lines.push(`... আরও ${report.rows.length - shown.length}টি`);
  if (report.totals) lines.push('', `*মোট:* ${report.columns.filter((c) => report.totals[c.key] !== undefined).map((c) => `${c.label} ${show(report.totals[c.key], c)}`).join(' · ')}`);
  (report.notes || []).forEach((n) => lines.push(n));
  return lines.join('\n');
}

export const openWhatsapp = (text) => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');

// ---- Copy & WhatsApp share ----
const fmtDate = (d) => { const p = (d || '').split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d || ''; };
const fN = (n) => Number(n || 0).toLocaleString('en-IN');
const fMT = (kg) => (kg > 0 ? (kg / 1000).toFixed(3) : '0.000');

export async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); return true;
}

// On Android/mobile, navigator.share opens the native share sheet (includes WhatsApp). Fallback: wa.me.
export async function shareToWhatsapp(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function dailyLighterText(report, header) {
  const L = [];
  if (header.companyName) L.push(`*${header.companyName}*`);
  L.push(`*${report.title}*`, report.subtitle, '');
  const lighterOrder = [];
  const byLighter = new Map();
  for (const s of report.sections) {
    if (!byLighter.has(s.lighter)) { byLighter.set(s.lighter, []); lighterOrder.push(s.lighter); }
    byLighter.get(s.lighter).push(s);
  }
  for (const lighterName of lighterOrder) {
    const secs = byLighter.get(lighterName);
    for (const s of secs) {
      L.push(`Date: ${fmtDate(s.date)}.`);
      L.push(`Shift: ${s.shift.toUpperCase()}.`);
      L.push('');
      if (s.ghatLocation) L.push(`Area. : ${s.ghatLocation}.`);
      L.push(`Place: ${s.ghat}.`);
      L.push('');
      L.push('°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°');
      L.push('');
      L.push(`M.V. ${s.motherVessel}.`);
      L.push(`Cargo : ${s.cargo}.`);
      L.push('');
      L.push(`M.V. ${s.lighter}`);
      L.push(`Consignee: ${s.consignee}.`);
      L.push('');
      L.push('Report:');
      L.push(`"""""""""""""'`);
      L.push(`Total Truck= ${String(s.trucks).padStart(2, '0')}`);
      L.push(`          Bag. = ${fN(s.bags)} PP`);
      L.push(`          N.W. = ${fMT(s.net)} M/T.`);
      L.push('');
      L.push(`          A/B. = ${s.ab} KG.`);
      L.push('');
      L.push(`          Bag Average = ${s.bagAverage.toFixed(2)} KG`);
      L.push('');
      // Cumulative up to this day (that day + every earlier day of the same lighter) — not the day's figures again.
      const cT = Number(s.cumTrucks ?? s.trucks);
      const cB = Number(s.cumBags ?? s.bags);
      const cN = Number(s.cumNet ?? s.net);
      const cAb = Number(s.cumAb ?? s.ab);
      const cAvg = Number(s.cumBagAverage ?? s.bagAverage);
      L.push(`Summery (up to ${fmtDate(s.date)}):`);
      L.push(`"""""""""""""'""`);
      L.push(`Total Truck= ${String(cT).padStart(2, '0')}.`);
      L.push(`          Bag. = ${fN(cB)} PP`);
      L.push(`          N.W. = ${fMT(cN)} M/T.`);
      L.push('');
      L.push(`          A/B. = ${cAb} KG.`);
      L.push('');
      L.push(`          Bag Average = ${cAvg.toFixed(2)} KG`);
      L.push('');
    }
    const ls = report.lighterSummaries.find((l) => l.lighter === lighterName) || {};
    L.push('Lighter Final Summary:');
    L.push(`"""""""""""""""""""""""""""`);
    L.push(`Lighter Name: ${lighterName}`);
    L.push(`Total Truck = ${String(ls.totalTrucks || 0).padStart(2, '0')}`);
    L.push(`Total Bag = ${fN(ls.totalBags || 0)} PP`);
    L.push(`Total N.W. = ${fMT(ls.totalNet || 0)} M/T`);
    L.push(`Total A/B. = ${ls.ab || 0} KG`);
    L.push(`Bag Average = ${(ls.bagAverage || 0).toFixed(2)} KG`);
    L.push('');
    L.push('°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°');
    L.push('');
  }
  if (report.vesselSummaries && report.vesselSummaries.length > 0) {
    for (const v of report.vesselSummaries) {
      L.push('Mother Vessel Final Summary:');
      L.push(`"""""""""""""""""""""""""""`);
      L.push(`Total Lighter = ${v.totalLighters}`);
      L.push(`Total Truck = ${v.totalTrucks}`);
      L.push(`Total Bag = ${fN(v.totalBags)} PP`);
      L.push(`Total Weight = ${fMT(v.totalNet)} M/T`);
      L.push(`Total A/B. = ${v.ab} KG`);
      L.push(`Overall Bag Average = ${v.bagAverage.toFixed(2)} KG`);
      L.push('');
    }
  }
  return L.join('\n');
}

function closingText(report, header) {
  const L = [];
  if (header.companyName) L.push(`*${header.companyName}*`);
  L.push(`*${report.title}*`, report.subtitle, '');
  for (const m of report.meta) L.push(`${m[0]}: ${typeof m[1] === 'number' ? fN(m[1]) : m[1]}`);
  L.push('');
  L.push('DAY-BY-DAY SUMMARY');
  L.push(`"""""""""""""'`);
  for (const d of report.dayBreakdown) {
    L.push(`${fmtDate(d.date)} | ${d.shift} | ${d.ghat} | ${d.lighter}`);
    L.push(`  Truck= ${d.trucks} | Bag= ${fN(d.bags)} PP | Net= ${fN(d.net)} KG | G.W.= ${fN(d.gross)} KG | A/B= ${d.ab} KG | Bag Avg= ${d.bagAverage.toFixed(2)} KG`);
  }
  L.push('');
  if (report.vesselSummary) {
    const v = report.vesselSummary;
    L.push('VESSEL FINAL SUMMARY');
    L.push(`"""""""""""""""""""""""""""`);
    L.push(`Total Truck = ${v.totalTrucks}`);
    L.push(`Total Bag = ${fN(v.totalBags)} PP`);
    L.push(`Total Weight = ${fMT(v.totalWeight)} M/T`);
    L.push(`Total A/B. = ${v.ab} KG`);
    L.push(`Overall Bag Average = ${v.bagAverage.toFixed(2)} KG`);
    L.push('');
  }
  if (report.bagDeduction) {
    const b = report.bagDeduction;
    L.push('BAG WEIGHT DEDUCTION');
    L.push(`"""""""""""""'`);
    L.push(`Total Bag = ${fN(b.totalBags)} PP`);
    L.push(`Weight per Bag = ${b.bagWeightPerBag} GM`);
    L.push(`Total Bag Weight = ${fN(b.totalBagWeight)} KG`);
    L.push('');
    L.push(`Gross Weight = ${fN(b.grossWeight)} KG`);
    L.push(`− Total Bag Weight = ${fN(b.totalBagWeight)} KG`);
    L.push(`= Final Net Weight = ${fN(b.finalNetWeight)} KG (${b.finalNetMT} M/T)`);
  }
  return L.join('\n');
}

export function reportWhatsappText(report, header) {
  if (report.type === 'daily_lighter') return dailyLighterText(report, header);
  if (report.type === 'closing') return closingText(report, header);
  return whatsappText(report, header);
}