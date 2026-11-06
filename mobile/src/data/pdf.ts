/**
 * Tiny dependency-free PDF writer for the transaction export: A4, standard Helvetica fonts, text + filled rectangles.
 * The output is pure ASCII (no binary streams) so it can be saved through the app's text file bridge unchanged.
 */
const W = 595.28, H = 841.89, M = 36;

// Helvetica advance widths (1/1000 em) for ASCII 32..126, used for right-alignment and truncation.
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const width = (s: string, size: number) => { let w = 0; for (const ch of s) w += HELV[ch.charCodeAt(0) - 32] ?? 556; return (w * size) / 1000; };

/** Keep ASCII only: ₹ becomes "Rs ", dashes and quotes are simplified, anything else becomes "?". */
export const ascii = (s: string) =>
  s.replace(/₹/g, 'Rs ').replace(/[–—−]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/•/g, '*').replace(/[^\x20-\x7e]/g, '?');
const esc = (s: string) => ascii(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const fit = (s: string, max: number, size: number) => {
  let t = ascii(s);
  if (width(t, size) <= max) return t;
  while (t.length > 1 && width(t + '..', size) > max) t = t.slice(0, -1);
  return t + '..';
};
const rgb = (hex: string) => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
const n = (x: number) => x.toFixed(2);

export interface PdfColumn { title: string; w: number; align?: 'left' | 'right' }
export interface PdfRow { cells: string[]; color?: string }
export interface PdfDoc {
  title: string;
  subtitle: string[];
  summary: { label: string; value: string; color: string }[];
  columns: PdfColumn[];
  rows: PdfRow[];
  footer: string;
}

export function buildPdf(d: PdfDoc): string {
  const pages: string[][] = [];
  let ops: string[] = [];
  let y = H - M;
  const text = (x: number, yy: number, s: string, size = 9, bold = false, color = '#141629', align: 'left' | 'right' = 'left') => {
    const t = ascii(s);
    const xx = align === 'right' ? x - width(t, size) : x;
    ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb(color)} rg ${n(xx)} ${n(yy)} Td (${esc(t)}) Tj ET`);
  };
  const rect = (x: number, yy: number, w: number, h: number, color: string) => ops.push(`${rgb(color)} rg ${n(x)} ${n(yy)} ${n(w)} ${n(h)} re f`);
  const tableW = d.columns.reduce((a, c) => a + c.w, 0);
  const newPage = (first: boolean) => {
    if (ops.length) pages.push(ops);
    ops = []; y = H - M;
    if (first) return;
    text(M, y - 10, d.title, 10, true, '#6C4CF5'); y -= 26;
  };
  const header = () => {
    rect(M, y - 17, tableW, 20, '#6C4CF5');
    let x = M;
    for (const c of d.columns) {
      text(c.align === 'right' ? x + c.w - 6 : x + 6, y - 11, c.title, 8.5, true, '#FFFFFF', c.align === 'right' ? 'right' : 'left');
      x += c.w;
    }
    y -= 22;
  };

  // ── first page: brand bar, title, filters, totals ──
  rect(0, H - 8, W, 8, '#6C4CF5');
  text(M, y - 18, 'Paisa', 20, true, '#6C4CF5');
  text(W - M, y - 18, d.title, 12, true, '#141629', 'right');
  y -= 34;
  for (const line of d.subtitle) { text(M, y - 9, line, 9, false, '#6A6F8A'); y -= 13; }
  y -= 8;
  if (d.summary.length) {
    const gap = 10, bw = (tableW - gap * (d.summary.length - 1)) / d.summary.length;
    d.summary.forEach((s, i) => {
      const x = M + i * (bw + gap);
      rect(x, y - 42, bw, 42, '#F3F1FF');
      text(x + 10, y - 15, s.label, 8.5, false, '#6A6F8A');
      text(x + 10, y - 33, s.value, 14, true, s.color);
    });
    y -= 56;
  }
  header();

  const rowH = 16;
  d.rows.forEach((r, i) => {
    if (y - rowH < M + 24) { newPage(false); header(); }
    if (i % 2 === 0) rect(M, y - rowH + 4, tableW, rowH, '#F7F7FC');
    let x = M;
    r.cells.forEach((cellText, ci) => {
      const c = d.columns[ci]!;
      const last = ci === d.columns.length - 1;
      const t = fit(cellText, c.w - 12, 8.5);
      text(c.align === 'right' ? x + c.w - 6 : x + 6, y - 7, t, 8.5, last && !!r.color, r.color && last ? r.color : '#141629', c.align === 'right' ? 'right' : 'left');
      x += c.w;
    });
    y -= rowH;
  });
  if (!d.rows.length) text(M + 6, y - 14, 'No transactions match these filters.', 10, false, '#6A6F8A');
  pages.push(ops);

  // ── assemble the file: catalog, pages, fonts, then per-page content streams ──
  const total = pages.length;
  const objs: string[] = [];
  const kids: number[] = [];
  // 1 catalog, 2 page tree, 3 Helvetica, 4 Helvetica-Bold, then (page, content) pairs
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((p, i) => {
    const pageNo = 5 + i * 2, contentNo = pageNo + 1;
    const footer = `BT /F1 8 Tf ${rgb('#6A6F8A')} rg ${n(M)} ${n(M - 14)} Td (${esc(d.footer)}) Tj ET BT /F1 8 Tf ${rgb('#6A6F8A')} rg ${n(W - M - width(`Page ${i + 1} of ${total}`, 8))} ${n(M - 14)} Td (Page ${i + 1} of ${total}) Tj ET`;
    const stream = p.join('\n') + '\n' + footer;
    objs[pageNo] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(W)} ${n(H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNo} 0 R >>`;
    objs[contentNo] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    kids.push(pageNo);
  });
  objs[2] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${total} >>`;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) { offsets[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info << /Title (${esc(d.title)}) /Producer (Paisa) >> >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}
