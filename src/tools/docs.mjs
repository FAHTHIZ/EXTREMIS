// Document tools: text extraction (DOCX, XLSX, PPTX, ODT, PDF, HTML, EPUB-lite),
// Markdown checks, readability metrics and locale-file comparison.

import path from 'node:path';
import { readBinaryInput, readTextInput, readZip, htmlToText, decodeEntities, inflate, round, ToolInputError, parseHtml } from './util.mjs';
import { parseYamlSubset } from '../frontmatter.mjs';

function xmlText(xml, { paragraph = /<\/w:p>|<\/a:p>|<\/text:p>|<\/text:h>/g } = {}) {
  return decodeEntities(xml.replace(/<w:tab\/>|<text:tab\/>/g, '\t').replace(/<w:br\/>|<a:br\/>|<text:line-break\/>/g, '\n').replace(paragraph, '\n').replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function docxText(zip) {
  const doc = zip.read('word/document.xml');
  if (!doc) throw new ToolInputError('DOCX has no word/document.xml');
  const xml = doc.toString('utf8');
  const headings = [];
  for (const m of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const style = /<w:pStyle w:val="([^"]+)"/.exec(m[1]);
    if (style && /^(Heading|Title)/i.test(style[1])) headings.push({ style: style[1], text: xmlText(m[1]) });
  }
  const tables = (xml.match(/<w:tbl>/g) || []).length;
  return { text: xmlText(xml.replace(/<\/w:p>\s*<\/w:tc>/g, '</w:tc>\t').replace(/\t?<\/w:tr>/g, '</w:p>')), headings, tables };
}

function colIndex(ref) { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }

function xlsxSheets(zip, maxRows) {
  const shared = [];
  const ss = zip.read('xl/sharedStrings.xml');
  if (ss) for (const m of ss.toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(decodeEntities([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  const wb = zip.read('xl/workbook.xml')?.toString('utf8') || '';
  const rels = zip.read('xl/_rels/workbook.xml.rels')?.toString('utf8') || '';
  const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  const relMap = Object.fromEntries([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], 'Id'), attr(m[0], 'Target')]));
  const sheets = [];
  for (const m0 of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const m = [m0[0], attr(m0[0], 'name') || 'Sheet', attr(m0[0], 'r:id')];
    let target = relMap[m[2]] || ''; target = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const xml = zip.read(target)?.toString('utf8');
    if (!xml) continue;
    const rows = []; let formulas = 0;
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      if (rows.length >= maxRows) break;
      const row = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1]; const body = c[2] || '';
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1]; const type = /t="(\w+)"/.exec(attrs)?.[1];
        if (/<f[ >]/.test(body)) formulas += 1;
        let v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        if (type === 's' && v !== undefined) v = shared[Number(v)];
        else if (type === 'inlineStr') v = decodeEntities([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
        else if (type === 'b') v = v === '1';
        else if (v !== undefined && type !== 'str' && type !== 'e' && !Number.isNaN(Number(v))) v = Number(v);
        else if (v !== undefined) v = decodeEntities(v);
        const idx = ref ? colIndex(ref) : row.length;
        row[idx] = v ?? null;
      }
      rows.push(Array.from(row, (x) => (x === undefined ? null : x)));
    }
    sheets.push({ name: decodeEntities(m[1]), rows, formulas });
  }
  return sheets;
}

function pptxText(zip) {
  const slides = zip.names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(/(\d+)\.xml/.exec(a)[1]) - Number(/(\d+)\.xml/.exec(b)[1]));
  return slides.map((name, i) => {
    const notesName = `ppt/notesSlides/notesSlide${/(\d+)\.xml/.exec(name)[1]}.xml`;
    const notes = zip.read(notesName);
    return { slide: i + 1, text: xmlText(zip.read(name).toString('utf8')), ...(notes ? { notes: xmlText(notes.toString('utf8')).replace(/^\d+$/m, '').trim() } : {}) };
  });
}

// ------------------------------------------------------------ PDF

// Tokenise a PDF content stream and interpret only text operators.
function* pdfTokens(s) {
  let i = 0; const n = s.length;
  while (i < n) {
    const ch = s[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '%') { while (i < n && s[i] !== '\n' && s[i] !== '\r') i += 1; continue; }
    if (ch === '(') {
      let depth = 1, j = i + 1, buf = '';
      while (j < n && depth) {
        const c = s[j];
        if (c === '\\') {
          const e = s[j + 1];
          const oct = /^[0-7]{1,3}/.exec(s.slice(j + 1, j + 4));
          if (oct) { buf += String.fromCharCode(parseInt(oct[0], 8)); j += 1 + oct[0].length; continue; }
          buf += { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[e] ?? (e === '\n' || e === '\r' ? '' : e); j += 2; continue;
        }
        if (c === '(') depth += 1;
        else if (c === ')') { depth -= 1; if (!depth) break; }
        buf += c; j += 1;
      }
      yield { t: 'str', v: buf, raw: true }; i = j + 1; continue;
    }
    if (ch === '<' && s[i + 1] === '<') { yield { t: 'op', v: '<<' }; i += 2; continue; }
    if (ch === '>' && s[i + 1] === '>') { yield { t: 'op', v: '>>' }; i += 2; continue; }
    if (ch === '<') { const end = s.indexOf('>', i); yield { t: 'str', v: s.slice(i + 1, end < 0 ? n : end).replace(/\s/g, ''), hex: true }; i = end < 0 ? n : end + 1; continue; }
    if (ch === '[' || ch === ']') { yield { t: ch }; i += 1; continue; }
    if (ch === '/') { const m = /^\/[^\s\/\[\]()<>{}%]*/.exec(s.slice(i, i + 128)); yield { t: 'name', v: m[0].slice(1) }; i += m[0].length; continue; }
    const num = /^[+-]?(\d+\.?\d*|\.\d+)/.exec(s.slice(i, i + 32));
    if (num) { yield { t: 'num', v: Number(num[0]) }; i += num[0].length; continue; }
    const op = /^[^\s\/\[\]()<>{}%]+/.exec(s.slice(i, i + 32));
    if (op) { yield { t: 'op', v: op[0] }; i += op[0].length; continue; }
    i += 1;
  }
}

function decodePdfString(tok, cmap) {
  let bytes;
  if (tok.hex) { const h = tok.v.length % 2 ? `${tok.v}0` : tok.v; bytes = []; for (let k = 0; k < h.length; k += 2) bytes.push(parseInt(h.slice(k, k + 2), 16)); }
  else bytes = [...tok.v].map((c) => c.charCodeAt(0) & 0xff);
  if (cmap && cmap.size) {
    const w = (cmap.width || 4) / 2; let out = '';
    for (let k = 0; k < bytes.length; k += w) {
      const key = bytes.slice(k, k + w).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      out += cmap.get(key) ?? '';
    }
    return out;
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) { let out = ''; for (let k = 2; k + 1 < bytes.length; k += 2) out += String.fromCharCode((bytes[k] << 8) | bytes[k + 1]); return out; }
  return String.fromCharCode(...bytes);
}

function pdfContentText(content, fontCMap) {
  const lines = []; let line = ''; let cmap = null; const stack = []; let lastY = null;
  const flush = () => { if (line.trim()) lines.push(line.replace(/\s+/g, ' ').trim()); line = ''; };
  for (const tok of pdfTokens(content)) {
    if (tok.t !== 'op') { stack.push(tok); if (stack.length > 2048) stack.splice(0, 1024); continue; }
    const op = tok.v;
    if (op === 'Tf') { const name = stack.filter((x) => x.t === 'name').pop(); cmap = name ? fontCMap(name.v) : null; }
    else if (op === 'Tj' || op === "'" || op === '"') { if (op !== 'Tj') flush(); const s = stack.filter((x) => x.t === 'str').pop(); if (s) line += decodePdfString(s, cmap); }
    else if (op === 'TJ') {
      const start = stack.map((x) => x.t).lastIndexOf('[');
      for (const x of stack.slice(start + 1)) { if (x.t === 'str') line += decodePdfString(x, cmap); else if (x.t === 'num' && x.v < -180) line += ' '; }
    } else if (op === 'Td' || op === 'TD' || op === 'Tm') {
      const nums = stack.filter((x) => x.t === 'num').map((x) => x.v);
      const y = op === 'Tm' ? nums[nums.length - 1] : nums[nums.length - 1];
      if (op === 'Tm') { if (lastY !== null && Math.abs(y - lastY) > 1) flush(); else if (line && !line.endsWith(' ')) line += ' '; lastY = y; }
      else if (Math.abs(y || 0) > 1) flush(); else if (line && !line.endsWith(' ')) line += ' ';
    } else if (op === 'T*') flush();
    else if (op === 'ET') { flush(); }
    stack.length = 0;
  }
  flush();
  return lines;
}

function parseCMap(text) {
  const map = new Map(); let width = 4;
  const cs = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*endcodespacerange/.exec(text); if (cs) width = cs[1].length;
  const toStr = (hex) => { let s = ''; for (let i = 0; i < hex.length; i += 4) s += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16)); return s; };
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const m of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map.set(m[1].toUpperCase().padStart(width, '0'), toStr(m[2]));
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g)) {
      const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16);
      if (hi - lo > 65535) continue;
      if (m[4]) { const base = parseInt(m[4], 16); for (let c = lo; c <= hi; c += 1) map.set(c.toString(16).toUpperCase().padStart(width, '0'), String.fromCharCode(base + c - lo)); }
      else { const list = [...m[5].matchAll(/<([0-9A-Fa-f]+)>/g)].map((x) => toStr(x[1])); for (let c = lo; c <= hi; c += 1) map.set(c.toString(16).toUpperCase().padStart(width, '0'), list[c - lo] ?? ''); }
    }
  }
  map.width = width;
  return map;
}

function ascii85(text) {
  const src = text.replace(/^<~/, '').replace(/~>[\s\S]*$/, '').replace(/\s/g, '');
  const out = []; let group = [];
  for (const ch of src) {
    if (ch === 'z' && !group.length) { out.push(0, 0, 0, 0); continue; }
    group.push(ch.charCodeAt(0) - 33);
    if (group.length === 5) { let v = 0; for (const d of group) v = v * 85 + d; out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); group = []; }
  }
  if (group.length) { const n = group.length; while (group.length < 5) group.push(84); let v = 0; for (const d of group) v = v * 85 + d; out.push(...[(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].slice(0, n - 1)); }
  return Buffer.from(out);
}

export function pdfText(buffer, { maxPages = 500 } = {}) {
  const src = buffer.toString('latin1');
  if (!src.startsWith('%PDF')) throw new ToolInputError('not a PDF file');
  if (/\/Encrypt\s/.test(src)) return { pages: [], encrypted: true, warning: 'PDF is encrypted; text extraction is not possible without the password' };
  const objects = new Map();
  for (const m of src.matchAll(/(\d+)\s+(\d+)\s+obj\b([\s\S]*?)endobj/g)) objects.set(Number(m[1]), m[3]);
  const streamOf = (body) => {
    const sm = /stream\r?\n/.exec(body); if (!sm) return null;
    const start = sm.index + sm[0].length; const end = body.lastIndexOf('endstream');
    let data = Buffer.from(body.slice(start, end).replace(/\r?\n$/, ''), 'latin1');
    const dict = body.slice(0, sm.index);
    const filters = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict)?.[1].match(/\/\w+/g) || [];
    for (const f of filters) {
      if (f === '/FlateDecode' || f === '/Fl') { try { data = inflate(data); } catch { return null; } }
      else if (f === '/ASCII85Decode' || f === '/A85') data = ascii85(data.toString('latin1'));
      else if (f === '/ASCIIHexDecode' || f === '/AHx') data = Buffer.from(data.toString('latin1').replace(/[^0-9a-fA-F]/g, ''), 'hex');
      else return null;
    }
    return data.toString('latin1');
  };
  // Expand object streams (PDF 1.5+) so pages/fonts inside them are visible.
  for (const [, body] of [...objects]) {
    if (!/\/Type\s*\/ObjStm/.test(body)) continue;
    const data = streamOf(body); if (!data) continue;
    const n = Number(/\/N\s+(\d+)/.exec(body)?.[1] || 0); const first = Number(/\/First\s+(\d+)/.exec(body)?.[1] || 0);
    const header = data.slice(0, first).trim().split(/\s+/).map(Number);
    for (let k = 0; k < n; k += 1) { const num = header[2 * k], off = header[2 * k + 1], next = k + 1 < n ? header[2 * k + 3] : data.length - first; if (!objects.has(num)) objects.set(num, data.slice(first + off, first + next)); }
  }
  const ref = (s) => { const m = /(\d+)\s+0\s+R/.exec(s || ''); return m ? Number(m[1]) : null; };
  const fontCMaps = new Map();
  const cmapFor = (fontObj) => {
    if (fontCMaps.has(fontObj)) return fontCMaps.get(fontObj);
    const body = objects.get(fontObj) || ''; const tu = ref(/\/ToUnicode\s+(\d+\s+0\s+R)/.exec(body)?.[1]);
    const cmap = tu && objects.has(tu) ? parseCMap(streamOf(objects.get(tu)) || '') : null;
    fontCMaps.set(fontObj, cmap); return cmap;
  };
  const pageIds = [...objects.entries()].filter(([, b]) => /\/Type\s*\/Page(?!s)\b/.test(b)).map(([id]) => id);
  const ordered = [];
  const rootPages = [...objects.entries()].find(([, b]) => /\/Type\s*\/Pages\b/.test(b) && !/\/Parent\s/.test(b));
  const walk = (id, depth = 0) => { if (depth > 50) return; const b = objects.get(id) || ''; if (/\/Type\s*\/Page(?!s)\b/.test(b)) { ordered.push(id); return; } const kids = /\/Kids\s*\[([^\]]*)\]/.exec(b); if (kids) for (const m of kids[1].matchAll(/(\d+)\s+0\s+R/g)) walk(Number(m[1]), depth + 1); };
  if (rootPages) walk(rootPages[0]);
  const pages = [];
  for (const id of (ordered.length ? ordered : pageIds).slice(0, maxPages)) {
    const body = objects.get(id);
    let resources = /\/Resources\s*(<<[\s\S]*?>>\s*>>|\d+\s+0\s+R)/.exec(body)?.[1] || '';
    if (/^\d+\s+0\s+R$/.test(resources.trim())) resources = objects.get(ref(resources)) || '';
    let fontDict = /\/Font\s*(<<[\s\S]*?>>|\d+\s+0\s+R)/.exec(resources)?.[1] || '';
    if (/^\d+\s+0\s+R$/.test(fontDict.trim())) fontDict = objects.get(ref(fontDict)) || '';
    const fonts = Object.fromEntries([...fontDict.matchAll(/\/([\w.+-]+)\s+(\d+)\s+0\s+R/g)].map((m) => [m[1], Number(m[2])]));
    const contentsRaw = /\/Contents\s*(\[[^\]]*\]|\d+\s+0\s+R)/.exec(body)?.[1] || '';
    const streamIds = [...contentsRaw.matchAll(/(\d+)\s+0\s+R/g)].map((m) => Number(m[1]));
    const text = [];
    for (const sid of streamIds) {
      const data = streamOf(objects.get(sid) || ''); if (!data) continue;
      text.push(...pdfContentText(data, (name) => (fonts[name] ? cmapFor(fonts[name]) : null)));
    }
    pages.push({ page: pages.length + 1, text: text.join('\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() });
  }
  const info = /\/Title\s*\(([^)]*)\)/.exec(src);
  const empty = pages.length && pages.every((p) => !p.text);
  return { pages, page_count: pages.length, title: info ? info[1] : undefined, ...(empty ? { warning: 'no extractable text; the PDF may be scanned images (OCR required)' } : {}) };
}

// ------------------------------------------------------------ markdown & text

export function markdownCheck(text, { file } = {}) {
  const issues = []; const headings = []; const links = []; const anchors = new Set();
  const lines = text.split('\n'); let inFence = false; let fenceChar = ''; let prevLevel = 0; let h1 = 0;
  const slug = (s) => s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
  lines.forEach((line, i) => {
    const n = i + 1;
    const fence = /^\s*(```|~~~)/.exec(line);
    if (fence) { if (!inFence) { inFence = true; fenceChar = fence[1]; if (!/^\s*(```|~~~)\s*\S/.test(line)) issues.push({ line: n, rule: 'fence-language', message: 'code fence without a language' }); } else if (line.trim().startsWith(fenceChar)) inFence = false; return; }
    if (inFence) return;
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      const level = h[1].length; headings.push({ level, text: h[2], line: n });
      if (level === 1) h1 += 1;
      if (prevLevel && level > prevLevel + 1) issues.push({ line: n, rule: 'heading-increment', message: `heading jumps from h${prevLevel} to h${level}` });
      prevLevel = level;
      const s = slug(h[2]); let k = s; let c = 1; while (anchors.has(k)) k = `${s}-${c++}`; anchors.add(k);
      if (headings.filter((x) => x.text === h[2] && x.level === level).length > 1) issues.push({ line: n, rule: 'duplicate-heading', message: `duplicate heading "${h[2]}"` });
    } else if (/^#{1,6}[^#\s]/.test(line)) issues.push({ line: n, rule: 'heading-space', message: 'missing space after #' });
    if (/\s+$/.test(line) && !/ {2}$/.test(line)) issues.push({ line: n, rule: 'trailing-whitespace', message: 'trailing whitespace' });
    if (line.length > 400) issues.push({ line: n, rule: 'long-line', message: `line is ${line.length} characters` });
    for (const m of line.matchAll(/!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const isImage = m[0].startsWith('!');
      links.push({ line: n, text: m[1], url: m[2], image: isImage });
      if (isImage && !m[1].trim()) issues.push({ line: n, rule: 'image-alt', message: `image without alt text: ${m[2]}` });
      if (!isImage && /^(click here|here|link|this)$/i.test(m[1].trim())) issues.push({ line: n, rule: 'link-text', message: `non-descriptive link text "${m[1]}"` });
      if (!m[1].trim() && !isImage) issues.push({ line: n, rule: 'empty-link', message: 'link without text' });
    }
    if (/\]\(\s*\)/.test(line)) issues.push({ line: n, rule: 'empty-url', message: 'link with an empty URL' });
    for (const m of line.matchAll(/(?<![("<\w])(https?:\/\/[^\s)>\]]+)/g)) if (!line.includes(`](${m[1]}`)) links.push({ line: n, text: m[1], url: m[1], bare: true });
  });
  if (inFence) issues.push({ line: lines.length, rule: 'unclosed-fence', message: 'code fence is not closed' });
  if (h1 > 1) issues.push({ line: null, rule: 'single-h1', message: `${h1} top-level headings` });
  for (const l of links) if (l.url.startsWith('#') && !anchors.has(l.url.slice(1).toLowerCase())) issues.push({ line: l.line, rule: 'broken-anchor', message: `no heading for anchor ${l.url}` });
  return { file, headings, links, issues, words: text.replace(/```[\s\S]*?```/g, '').split(/\s+/).filter(Boolean).length };
}

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0; if (w.length <= 3) return 1;
  const s = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, s ? s.length : 1);
}

export function readability(text) {
  const clean = String(text).replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`|]/g, ' ');
  const sentences = clean.split(/(?<=[.!?])\s+|\n{2,}/).map((s) => s.trim()).filter((s) => /\w/.test(s));
  const words = clean.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  if (!words.length) throw new ToolInputError('no words found');
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  const complex = words.filter((w) => syllables(w) >= 3).length;
  const wps = words.length / Math.max(1, sentences.length); const spw = syl / words.length;
  const long = sentences.map((s) => ({ text: s.slice(0, 160), words: (s.match(/[A-Za-z][A-Za-z'-]*/g) || []).length })).filter((s) => s.words > 30);
  const passive = (clean.match(/\b(am|is|are|was|were|be|been|being)\s+(\w+ed|written|given|taken|made|done|seen|known|shown|built|sent)\b/gi) || []).length;
  const ease = 206.835 - 1.015 * wps - 84.6 * spw;
  return {
    words: words.length, sentences: sentences.length, avg_words_per_sentence: round(wps, 1), avg_syllables_per_word: round(spw, 2),
    flesch_reading_ease: round(ease, 1), flesch_kincaid_grade: round(0.39 * wps + 11.8 * spw - 15.59, 1), gunning_fog: round(0.4 * (wps + 100 * (complex / words.length)), 1),
    reading_time_minutes: round(words.length / 238, 1), passive_voice_candidates: passive, long_sentences: long.slice(0, 20),
    band: ease >= 70 ? 'easy' : ease >= 50 ? 'standard' : ease >= 30 ? 'difficult' : 'very difficult',
  };
}

// ------------------------------------------------------------ locales

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out); else out[key] = v;
  }
  return out;
}
function parseLocale(text, name = '') {
  const t = text.trim();
  if (/\.(ya?ml)$/i.test(name)) return flatten(parseYamlSubset(t, { typed: false }));
  if (/\.properties$/i.test(name)) return Object.fromEntries(t.split('\n').filter((l) => l.trim() && !/^[#!]/.test(l.trim())).map((l) => { const i = l.search(/[=:]/); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  if (/\.po$/i.test(name) || /^msgid /m.test(t)) {
    const out = {}; for (const m of t.matchAll(/msgid "((?:[^"\\]|\\.)*)"\s*\nmsgstr "((?:[^"\\]|\\.)*)"/g)) if (m[1]) out[m[1]] = m[2]; return out;
  }
  if (/\.strings$/i.test(name)) { const out = {}; for (const m of t.matchAll(/"((?:[^"\\]|\\.)+)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;/g)) out[m[1]] = m[2]; return out; }
  if (/\.xml$/i.test(name) || t.startsWith('<')) { const out = {}; for (const m of t.matchAll(/<string name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g)) out[m[1]] = decodeEntities(m[2]); return out; }
  return flatten(JSON.parse(t));
}
const PLACEHOLDER_RE = /\{\{\s*[\w.]+\s*\}\}|\{[\w.]+(?:,[^{}]*(?:\{[^{}]*\}[^{}]*)*)?\}|%(?:\d+\$)?[-+ 0#]*\d*(?:\.\d+)?[sdifuxXeEgGcpo@]|%\{[\w]+\}|\$\{[\w.]+\}|<\/?[a-zA-Z][^>]*>/g;
function placeholders(s) { return String(s ?? '').match(PLACEHOLDER_RE)?.map((p) => p.replace(/\s+/g, '')).sort() || []; }

export function compareLocales(source, targets) {
  const report = [];
  for (const [locale, data] of Object.entries(targets)) {
    const missing = [], extra = [], untranslated = [], placeholderMismatch = [], empty = [], lengthRisk = [];
    for (const [key, value] of Object.entries(source)) {
      if (!(key in data)) { missing.push(key); continue; }
      const t = data[key];
      if (t === '' || t === null) { empty.push(key); continue; }
      if (typeof value === 'string' && t === value && /[A-Za-z]{4,}/.test(value) && value.split(/\s+/).length > 1) untranslated.push(key);
      const a = placeholders(value), b = placeholders(t);
      if (JSON.stringify(a) !== JSON.stringify(b)) placeholderMismatch.push({ key, source: a, target: b });
      if (typeof value === 'string' && typeof t === 'string' && value.length >= 8 && t.length > value.length * 1.6) lengthRisk.push({ key, ratio: round(t.length / value.length, 2) });
    }
    for (const key of Object.keys(data)) if (!(key in source)) extra.push(key);
    const total = Object.keys(source).length;
    report.push({ locale, keys: Object.keys(data).length, coverage_pct: round(((total - missing.length - empty.length) / (total || 1)) * 100, 1), missing, empty, extra, untranslated, placeholder_mismatches: placeholderMismatch, length_expansion_risk: lengthRisk });
  }
  return { source_keys: Object.keys(source).length, locales: report, ok: report.every((r) => !r.missing.length && !r.placeholder_mismatches.length && !r.empty.length) };
}

export default [
  {
    id: 'doc.extract_text', title: 'Extract document text',
    description: 'Extract text and structure from PDF, DOCX, XLSX, PPTX, ODT/ODS/ODP, HTML, Markdown, CSV or plain-text files without external tools.',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { path: { type: 'string' }, content_base64: { type: 'string' }, format: { enum: ['auto', 'pdf', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'html', 'text'], default: 'auto' }, max_chars: { type: 'integer', minimum: 100, maximum: 2000000, default: 100000 }, max_rows: { type: 'integer', minimum: 1, maximum: 100000, default: 2000 } } },
    async run(input, ctx) {
      const { buffer, source } = await readBinaryInput(ctx, input);
      let format = input.format;
      const ext = source && source !== 'inline' ? path.extname(source).slice(1).toLowerCase() : '';
      if (format === 'auto') {
        if (buffer.slice(0, 4).toString('latin1') === '%PDF') format = 'pdf';
        else if (buffer.readUInt32LE(0) === 0x04034b50) {
          const zip = readZip(buffer); const names = zip.names;
          format = names.includes('word/document.xml') ? 'docx' : names.includes('xl/workbook.xml') ? 'xlsx' : names.some((n) => n.startsWith('ppt/slides/')) ? 'pptx' : names.includes('content.xml') ? (ext || 'odt') : 'zip';
        } else if (/^\s*<(!doctype html|html|head|body)/i.test(buffer.slice(0, 500).toString('utf8')) || ['html', 'htm'].includes(ext)) format = 'html';
        else format = 'text';
      }
      const limit = (s) => (s.length > input.max_chars ? { text: s.slice(0, input.max_chars), truncated: true } : { text: s, truncated: false });
      if (format === 'pdf') { const r = pdfText(buffer); const joined = r.pages.map((p) => p.text).join('\n\f\n'); const { text, truncated } = limit(joined); return { format, source, page_count: r.page_count, title: r.title, text, truncated, characters: joined.length, ...(r.warning ? { warning: r.warning } : {}), ...(r.encrypted ? { encrypted: true } : {}) }; }
      if (format === 'docx') { const r = docxText(readZip(buffer)); const { text, truncated } = limit(r.text); return { format, source, headings: r.headings, tables: r.tables, text, truncated, characters: r.text.length }; }
      if (format === 'xlsx') { const sheets = xlsxSheets(readZip(buffer), input.max_rows); return { format, source, sheets: sheets.map((s) => ({ name: s.name, rows: s.rows.length, formulas: s.formulas, data: s.rows })) }; }
      if (format === 'pptx') { const slides = pptxText(readZip(buffer)); return { format, source, slide_count: slides.length, slides }; }
      if (['odt', 'ods', 'odp'].includes(format)) { const xml = readZip(buffer).read('content.xml')?.toString('utf8') || ''; const { text, truncated } = limit(xmlText(xml.replace(/<\/table:table-cell>/g, '\t</table:table-cell>').replace(/<\/table:table-row>/g, '\n</table:table-row>'))); return { format, source, text, truncated }; }
      if (format === 'html') { const html = buffer.toString('utf8'); const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]; const { text, truncated } = limit(htmlToText(html)); return { format, source, title: title ? decodeEntities(title).trim() : undefined, text, truncated }; }
      if (format === 'zip') throw new ToolInputError('ZIP archive is not an Office document');
      const { text, truncated } = limit(buffer.toString('utf8')); return { format: 'text', source, text, truncated };
    },
  },
  {
    id: 'docs.markdown_check', title: 'Check Markdown',
    description: 'Lint Markdown structure: heading levels, duplicate headings, broken in-page anchors, image alt text, link text, code-fence languages and unclosed fences.',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } },
    async run(input, ctx) { const { text, source } = await readTextInput(ctx, input); return markdownCheck(text, { file: source }); },
  },
  {
    id: 'text.readability', title: 'Measure readability',
    description: 'Flesch reading ease, Flesch-Kincaid grade, Gunning fog, sentence length, long sentences and passive-voice candidates for English text.',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } },
    async run(input, ctx) { return readability((await readTextInput(ctx, input)).text); },
  },
  {
    id: 'i18n.compare_locales', title: 'Compare locale files',
    description: 'Compare translation files (JSON, YAML, .properties, .po, .strings, Android XML) against a source locale: missing, empty, extra and untranslated keys, placeholder mismatches and length expansion.',
    permissions: ['read'],
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'object', description: 'Source strings (key -> text), or use source_path' }, source_path: { type: 'string' },
        targets: { type: 'object', additionalProperties: { type: 'object' } }, target_paths: { type: 'object', additionalProperties: { type: 'string' }, description: 'locale -> file path' },
      },
    },
    async run(input, ctx) {
      const source = input.source ? flatten(input.source) : input.source_path ? parseLocale((await ctx.readFile(input.source_path)).toString('utf8'), input.source_path) : null;
      if (!source) throw new ToolInputError('provide source or source_path');
      const targets = {};
      for (const [loc, data] of Object.entries(input.targets || {})) targets[loc] = flatten(data);
      for (const [loc, p] of Object.entries(input.target_paths || {})) targets[loc] = parseLocale((await ctx.readFile(p)).toString('utf8'), p);
      if (!Object.keys(targets).length) throw new ToolInputError('provide targets or target_paths');
      return compareLocales(source, targets);
    },
  },
];

export { parseHtml };
