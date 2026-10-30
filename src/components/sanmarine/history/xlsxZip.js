// XLSX container reader: only stored/deflate entries; never executes workbook content.
export default function xlsxZip(buffer) {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer), entries = new Map();
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) if (view.getUint32(end, true) === 0x06054b50) break;
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50) throw new Error('XLSX ZIP container অবৈধ।');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true), total = 0;
  if (count > 2000) throw new Error('Workbook অতিরিক্ত বড়।');
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('Workbook directory অবৈধ।');
    const packed = view.getUint32(at + 20, true), size = view.getUint32(at + 24, true), n = view.getUint16(at + 28, true);
    total += size;
    if (total > 50 * 1024 * 1024 || view.getUint16(at + 8, true) & 1) throw new Error('বড়/Encrypted workbook সমর্থিত নয়।');
    const name = new TextDecoder().decode(bytes.slice(at + 46, at + 46 + n));
    entries.set(name, { offset: view.getUint32(at + 42, true), method: view.getUint16(at + 10, true), packed, size });
    at += 46 + n + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return async (name, optional = false) => {
    const e = entries.get(name);
    if (!e) { if (optional) return ''; throw new Error(`Workbook অংশ নেই: ${name}`); }
    const start = e.offset + 30 + view.getUint16(e.offset + 26, true) + view.getUint16(e.offset + 28, true);
    let data = bytes.slice(start, start + e.packed);
    if (e.method === 8) {
      if (!window.DecompressionStream) throw new Error('XLSX পড়তে হালনাগাদ Chrome ব্যবহার করুন অথবা CSV/JSON দিন।');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    } else if (e.method !== 0) throw new Error('Workbook compression সমর্থিত নয়।');
    if (data.length !== e.size) throw new Error('Workbook অংশ অসম্পূর্ণ।');
    return new TextDecoder().decode(data);
  };
}