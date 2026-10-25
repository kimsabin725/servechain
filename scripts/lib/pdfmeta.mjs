import fs from 'node:fs';

// Finds the end index of a PDF literal string that starts at i (the opening parenthesis).
function literalEnd(s, i) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (ch === '\\') { j++; continue; }
    if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return j;
  }
  return -1;
}

// Replaces each /Creator or /Producer string value with spaces of the same length, so byte offsets stay valid.
function blankValues(s) {
  const re = /\/(Creator|Producer)\s*([(<])/g;
  let out = s;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length - 1;
    const end = m[2] === '(' ? literalEnd(s, start) : s.indexOf('>', start);
    if (end < 0) continue;
    const blank = m[2] === '(' ? `(${' '.repeat(end - start - 1)})` : `<${' '.repeat(end - start - 1)}>`;
    out = out.slice(0, start) + blank + out.slice(end + 1);
  }
  return out;
}

// Encodes text as a PDF literal string.
const lit = (t) => `(${String(t).replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, '-')})`;

// Sets Creator and Producer to a fixed name with an incremental update that keeps the original bytes' offsets.
export function setPdfMeta(buf, { name = 'ServeChain', title } = {}) {
  const s = blankValues(buf.toString('latin1'));
  const trailers = [...s.matchAll(/trailer\s*<<([\s\S]*?)>>\s*startxref\s*(\d+)/g)];
  if (!trailers.length) throw new Error('PDF has no classic trailer; cannot set metadata');
  const t = trailers[trailers.length - 1];
  const size = Number(t[1].match(/\/Size\s+(\d+)/)[1]);
  const root = t[1].match(/\/Root\s+(\d+\s+\d+\s+R)/)[1];
  const prev = Number(t[2]);
  const oldInfo = t[1].match(/\/Info\s+(\d+)\s+(\d+)\s+R/);
  let oldTitle = null;
  if (!title && oldInfo) {
    const obj = s.match(new RegExp(`(^|\\s)${oldInfo[1]}\\s+${oldInfo[2]}\\s+obj([\\s\\S]*?)endobj`));
    oldTitle = obj?.[2].match(/\/Title\s*(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>)/)?.[1] ?? null;
  }
  const body = s.endsWith('\n') ? s : s + '\n';
  const offset = Buffer.byteLength(body, 'latin1');
  const info = `${size} 0 obj\n<< ${title ? `/Title ${lit(title)} ` : oldTitle ? `/Title ${oldTitle} ` : ''}/Creator ${lit(name)} /Producer ${lit(name)} >>\nendobj\n`;
  const xref = offset + Buffer.byteLength(info, 'latin1');
  const tail = `xref\n0 1\n0000000000 65535 f \n${size} 1\n${String(offset).padStart(10, '0')} 00000 n \ntrailer\n<< /Size ${size + 1} /Root ${root} /Info ${size} 0 R /Prev ${prev} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body + info + tail, 'latin1');
}

// Rewrites a PDF file in place with fixed Creator and Producer.
export function fixPdfFile(p, opts) {
  fs.writeFileSync(p, setPdfMeta(fs.readFileSync(p), opts));
}
