export const WATERMARK = 'SAMPLE — not a real court filing';

// Escapes text for a PDF literal string in WinAnsi encoding.
function pdfText(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/—/g, '\\227')
    .replace(/§/g, '\\247')
    .replace(/[^\x20-\x7e\\]/g, '?');
}

// Greedy word wrap by character count.
function wrap(line, width) {
  const out = [];
  let cur = '';
  const words = String(line).split(/\s+/).flatMap((w) => w.match(new RegExp(`.{1,${width}}`, 'g')) || ['']);
  for (const word of words) {
    if (cur && (cur + ' ' + word).length > width) {
      out.push(cur);
      cur = word;
    } else cur = cur ? cur + ' ' + word : word;
  }
  out.push(cur);
  return out;
}

// Builds the content stream for one page with a diagonal watermark.
function pageStream(page) {
  const ops = ['q 0.85 g BT /F2 44 Tf 0.7071 0.7071 -0.7071 0.7071 110 220 Tm (' + pdfText(WATERMARK) + ') Tj ET Q'];
  ops.push('BT /F2 9 Tf 50 810 Td (' + pdfText(WATERMARK) + ') Tj ET');
  let y = 770;
  ops.push('BT /F2 15 Tf 50 ' + y + ' Td (' + pdfText(page.title) + ') Tj ET');
  y -= 28;
  for (const raw of page.lines) {
    for (const line of raw === '' ? [''] : wrap(raw, 95)) {
      if (y < 50) break;
      ops.push('BT /F1 10 Tf 50 ' + y + ' Td (' + pdfText(line) + ') Tj ET');
      y -= 14;
    }
  }
  return ops.join('\n');
}

// Writes a small text-only PDF with no timestamps, so identical input gives identical bytes.
export function buildPdf(pages, meta = {}) {
  const objs = [];
  const add = (body) => objs.push(body) && objs.length;
  const catalog = add(null);
  const pagesObj = add(null);
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  for (const p of pages) {
    const stream = pageStream(p);
    const content = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`,
      ),
    );
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Title (${pdfText(meta.title || 'Sample')}) /Producer (servechain) >>`);
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
