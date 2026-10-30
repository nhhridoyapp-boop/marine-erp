import xlsxZip from '@/components/sanmarine/history/xlsxZip';
const xml = (s) => { const d = new DOMParser().parseFromString(s, 'application/xml'); if (d.querySelector('parsererror')) throw new Error('Workbook XML অবৈধ।'); return d; };
const tags = (node, tag) => [...node.getElementsByTagNameNS('*', tag)];
const contents = (node, tag) => tags(node, tag)[0]?.textContent || '';
const excelDate = (n, use1904) => {
  if (!Number.isInteger(n) || n < 0 || (!use1904 && n === 60)) return '';
  const epoch = use1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const at = new Date(epoch + n * 86400000);
  return Number.isFinite(at.getTime()) ? at.toISOString().slice(0, 10) : '';
};
const excelTime = (n) => {
  if (n < 0 || n >= 1) return '';
  const seconds = Math.round(n * 86400);
  if (seconds >= 86400) return '';
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((x) => String(x).padStart(2, '0')).join(':');
};
export default async function parseHistoricalXlsx(buffer) {
  const read = xlsxZip(buffer), book = xml(await read('xl/workbook.xml'));
  const sheet = tags(book, 'sheet').find((s) => s.getAttribute('name') === 'Entry');
  if (!sheet) throw new Error('Entry sheet পাওয়া যায়নি।');
  const relId = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const relations = xml(await read('xl/_rels/workbook.xml.rels'));
  const target = tags(relations, 'Relationship').find((r) => r.getAttribute('Id') === relId)?.getAttribute('Target');
  if (!target || target.includes('..')) throw new Error('Entry sheet reference অবৈধ।');
  const path = target.replace(/^\//, '').replace(/^xl\//, '');
  const sharedXml = await read('xl/sharedStrings.xml', true);
  const shared = sharedXml ? tags(xml(sharedXml), 'si').map((s) => tags(s, 't').map((t) => t.textContent).join('')) : [];
  const cellsOf = (row) => Object.fromEntries(tags(row, 'c').map((c) => {
    const column = (c.getAttribute('r') || '').replace(/\d/g, ''), type = c.getAttribute('t'), raw = contents(c, 'v');
    const value = type === 's' ? shared[Number(raw)] : type === 'inlineStr' ? contents(c, 't') : (!type || type === 'n') && raw !== '' ? Number(raw) : raw;
    return [column, value];
  }));
  const rows = tags(xml(await read(`xl/${path}`)), 'row');
  const head = cellsOf(rows.find((r) => r.getAttribute('r') === '1') || rows[0]);
  if (head.A !== 'Date' || head.F !== 'Truck No' || !String(head.G).replace(/\s+/g, ' ').includes('Empty Weight')) throw new Error('Entry column mapping মেলেনি; Import বন্ধ।');
  const use1904 = ['1', 'true'].includes(tags(book, 'workbookPr')[0]?.getAttribute('date1904'));
  return rows.filter((r) => Number(r.getAttribute('r')) > 1).map((r) => {
    const c = cellsOf(r);
    return { row: Number(r.getAttribute('r')), truck: c.F, weight: c.G, date: typeof c.A === 'number' ? excelDate(c.A, use1904) : c.A, time: typeof c.H === 'number' ? excelTime(c.H) : c.H, rawDate: c.A, rawTime: c.H, ghat: c.D, scale: '', company: '', blank: !Object.values(c).some((v) => v != null && String(v).trim() !== '') };
  }).filter((r) => !r.blank);
}