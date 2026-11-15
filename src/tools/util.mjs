// Shared helpers for built-in tools. Everything here is dependency-free.

import { inflateRawSync, inflateSync } from 'node:zlib';

export class ToolInputError extends Error {}

/** Read tool input either inline (`content`) or from a confined `path`. */
export async function readTextInput(ctx, input, { contentKey = 'content', pathKey = 'path', required = true } = {}) {
  if (typeof input[contentKey] === 'string') return { text: input[contentKey], source: 'inline' };
  if (typeof input[pathKey] === 'string') {
    const buffer = await ctx.readFile(input[pathKey]);
    return { text: buffer.toString('utf8'), source: input[pathKey] };
  }
  if (required) throw new ToolInputError(`provide "${contentKey}" or "${pathKey}"`);
  return { text: '', source: null };
}

export async function readBinaryInput(ctx, input) {
  if (typeof input.content_base64 === 'string') return { buffer: Buffer.from(input.content_base64, 'base64'), source: 'inline' };
  if (typeof input.content === 'string') return { buffer: Buffer.from(input.content, 'utf8'), source: 'inline' };
  if (typeof input.path === 'string') return { buffer: await ctx.readFile(input.path), source: input.path };
  throw new ToolInputError('provide "path", "content" or "content_base64"');
}

// ---------------------------------------------------------------- CSV / tabular

export function sniffDelimiter(text) {
  const sample = text.split('\n').slice(0, 10).join('\n');
  const candidates = [',', '\t', ';', '|'];
  let best = ',', bestScore = -1;
  for (const d of candidates) {
    const counts = sample.split('\n').filter(Boolean).map((line) => splitCsvLine(line, d).length);
    if (!counts.length) continue;
    const consistent = counts.every((c) => c === counts[0]);
    const score = (consistent ? 2 : 1) * (counts[0] - 1);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function splitCsvLine(line, d) {
  const out = []; let cur = ''; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (ch === '"') quoted = false; else cur += ch;
    } else if (ch === '"' && cur === '') quoted = true;
    else if (ch === d) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** RFC 4180 CSV parser (quoted fields, embedded newlines, doubled quotes). */
export function parseCsv(text, { delimiter } = {}) {
  const src = String(text).replace(/^\uFEFF/, '');
  const d = delimiter || sniffDelimiter(src);
  const rows = []; let row = []; let cur = ''; let quoted = false; let fieldStart = true;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"' && fieldStart) { quoted = true; fieldStart = false; continue; }
    if (ch === d) { row.push(cur); cur = ''; fieldStart = true; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cur); rows.push(row); row = []; cur = ''; fieldStart = true;
      continue;
    }
    cur += ch; fieldStart = false;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  return { rows: nonEmpty, delimiter: d };
}

export function toCsv(records, columns) {
  const cols = columns || [...new Set(records.flatMap((r) => Object.keys(r)))];
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map(esc).join(','), ...records.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

const NUMBER_RE = /^[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?([eE][-+]?\d+)?$/;
export function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let s = value.trim();
  if (!s) return null;
  let percent = false;
  if (s.endsWith('%')) { percent = true; s = s.slice(0, -1); }
  s = s.replace(/^[$€£¥]/, '').replace(/^\((.*)\)$/, '-$1');
  if (!NUMBER_RE.test(s) || s === '' || s === '.' || s === '-' || s === '+') return null;
  const n = Number(s.replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return percent ? n / 100 : n;
}

export function isDateLike(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(value.trim()) && !Number.isNaN(Date.parse(value));
}

/** Load tabular data from CSV/TSV/JSON/JSONL text into an array of records. */
export function parseTable(text, format = 'auto', options = {}) {
  const trimmed = String(text).trim();
  let fmt = format;
  if (fmt === 'auto') {
    if (trimmed.startsWith('[') || trimmed.startsWith('{"') && !trimmed.includes('\n')) fmt = 'json';
    else if (trimmed.startsWith('{')) fmt = 'jsonl';
    else fmt = 'csv';
  }
  if (fmt === 'json') {
    const data = JSON.parse(trimmed);
    const records = Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : Array.isArray(data.rows) ? data.rows : [data];
    return { records: records.map((r) => (r && typeof r === 'object' && !Array.isArray(r) ? r : { value: r })), format: 'json' };
  }
  if (fmt === 'jsonl') {
    return { records: trimmed.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)), format: 'jsonl' };
  }
  const { rows, delimiter } = parseCsv(text, { delimiter: fmt === 'tsv' ? '\t' : options.delimiter });
  if (!rows.length) return { records: [], format: 'csv', delimiter };
  const header = rows[0].map((h, i) => (h.trim() || `column_${i + 1}`));
  const seen = new Map();
  const cols = header.map((h) => { const n = (seen.get(h) || 0) + 1; seen.set(h, n); return n > 1 ? `${h}_${n}` : h; });
  const records = rows.slice(1).map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? ''])));
  return { records, format: delimiter === '\t' ? 'tsv' : 'csv', delimiter, columns: cols };
}

export async function loadTable(ctx, input) {
  const { text, source } = await readTextInput(ctx, input);
  let format = input.format || 'auto';
  if (format === 'auto' && typeof input.path === 'string') {
    const ext = input.path.toLowerCase().split('.').pop();
    if (ext === 'tsv') format = 'tsv'; else if (ext === 'json') format = 'json'; else if (ext === 'jsonl' || ext === 'ndjson') format = 'jsonl';
  }
  const result = parseTable(text, format, input);
  const columns = result.columns || [...new Set(result.records.flatMap((r) => Object.keys(r)))];
  return { ...result, columns, source };
}

// ---------------------------------------------------------------- statistics

export function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
export function variance(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
export function round(x, digits = 4) {
  if (x === null || x === undefined || !Number.isFinite(x)) return x;
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

function erf(x) {
  // Abramowitz-Stegun 7.1.26 refined with a series for small |x| (max error ~1e-12 via series/continued fraction).
  const sign = x < 0 ? -1 : 1; const ax = Math.abs(x);
  if (ax < 2.5) {
    let sum = ax, term = ax; const x2 = ax * ax;
    for (let n = 1; n < 100; n += 1) { term *= -x2 / n; const add = term / (2 * n + 1); sum += add; if (Math.abs(add) < 1e-16) break; }
    return sign * (2 / Math.sqrt(Math.PI)) * sum;
  }
  return sign * (1 - erfcLarge(ax));
}
function erfcLarge(x) {
  // Continued fraction for erfc, accurate for x >= 2.5.
  let f = 0;
  for (let n = 60; n >= 1; n -= 1) f = (n / 2) / (x + f);
  return Math.exp(-x * x) / Math.sqrt(Math.PI) / (x + f);
}
export function normalCdf(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }
export function normalInv(p) {
  if (p <= 0 || p >= 1) throw new ToolInputError('probability must be in (0, 1)');
  // Acklam's algorithm with one Newton refinement step.
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425; let x;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p <= 1 - pl) { const q = p - 0.5; const r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  else { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

function logGamma(x) {
  const g = 7;
  const coef = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = coef[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i += 1) a += coef[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(a, b, x) {
  const MAXIT = 300, EPS = 3e-16, FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d; let h = d;
  for (let m = 1; m <= MAXIT; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function incompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Two-sided p-value for Student's t with df degrees of freedom. */
export function tTwoSidedP(t, df) {
  return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

/** Inverse of the two-sided t critical value (bisection). */
export function tCritical(alpha, df) {
  let lo = 0, hi = 1000;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (tTwoSidedP(mid, df) > alpha) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function lowerGammaRegularized(s, x) {
  if (x <= 0) return 0;
  if (x < s + 1) {
    let sum = 1 / s, term = 1 / s;
    for (let n = 1; n < 500; n += 1) { term *= x / (s + n); sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-15) break; }
    return sum * Math.exp(-x + s * Math.log(x) - logGamma(s));
  }
  // Continued fraction for the upper tail.
  let b = x + 1 - s, c = 1 / 1e-300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i += 1) {
    const an = -i * (i - s); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + s * Math.log(x) - logGamma(s)) * h;
}

/** Upper-tail p-value of the chi-square distribution. */
export function chiSquareP(stat, df) { return 1 - lowerGammaRegularized(df / 2, stat / 2); }

// ---------------------------------------------------------------- HTML

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/**
 * Tolerant HTML tokenizer producing a flat element list with attributes, text and
 * nesting depth. Sufficient for audits (headings, images, links, forms, meta).
 */
export function parseHtml(html) {
  const src = String(html);
  const elements = [];
  const stack = [];
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/gi;
  let last = 0; let match;
  const textParts = [];
  const pushText = (text) => {
    if (!text) return;
    textParts.push(text);
    for (const el of stack) el.textParts.push(text);
  };
  while ((match = re.exec(src))) {
    pushText(src.slice(last, match.index));
    last = re.lastIndex;
    const token = match[0];
    if (token.startsWith('<!')) continue;
    const tag = match[1].toLowerCase();
    if (token.startsWith('</')) {
      const idx = stack.map((e) => e.tag).lastIndexOf(tag);
      if (idx >= 0) stack.splice(idx);
      continue;
    }
    const attrs = {};
    const attrRe = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let a;
    while ((a = attrRe.exec(match[2] || ''))) attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
    const line = src.slice(0, match.index).split('\n').length;
    const el = { tag, attrs, line, depth: stack.length, parent: stack[stack.length - 1] || null, textParts: [] };
    elements.push(el);
    if (tag === 'script' || tag === 'style') {
      const close = src.toLowerCase().indexOf(`</${tag}`, re.lastIndex);
      const end = close === -1 ? src.length : close;
      el.raw = src.slice(re.lastIndex, end);
      re.lastIndex = end; last = end;
      continue;
    }
    if (!VOID.has(tag) && !token.endsWith('/>')) stack.push(el);
  }
  pushText(src.slice(last));
  for (const el of elements) { el.text = decodeEntities(el.textParts.join('')).replace(/\s+/g, ' ').trim(); delete el.textParts; }
  return { elements, text: decodeEntities(textParts.join(' ')).replace(/\s+/g, ' ').trim() };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(code) && code < 0x110000 ? String.fromCodePoint(code) : m; }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Readable text from HTML: drops script/style/nav chrome and keeps block breaks. */
export function htmlToText(html) {
  return decodeEntities(String(html)
    .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|header|footer|blockquote|pre|table|ul|ol)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------- ZIP (Office files)

/** Read entries of a ZIP archive. Returns Map(name -> Buffer). Supports stored and deflate. */
export function readZip(buffer, { maxEntries = 5000, maxTotal = 200 * 1024 * 1024 } = {}) {
  const eocdSig = 0x06054b50;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) {
    if (buffer.readUInt32LE(i) === eocdSig) { eocd = i; break; }
  }
  if (eocd < 0) throw new ToolInputError('not a ZIP archive');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  if (count > maxEntries) throw new ToolInputError('archive has too many entries');
  const entries = new Map();
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new ToolInputError('corrupt ZIP central directory');
    const method = buffer.readUInt16LE(offset + 10);
    const compSize = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const external = buffer.readUInt32LE(offset + 38);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + nameLen).toString('utf8');
    offset += 46 + nameLen + extraLen + commentLen;
    total += size;
    if (total > maxTotal) throw new ToolInputError('archive expands beyond the size limit');
    if (name.endsWith('/')) continue;
    const lNameLen = buffer.readUInt16LE(local + 26);
    const lExtraLen = buffer.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const data = buffer.slice(start, start + compSize);
    entries.set(name, { method, size, data, mode: external >>> 16 });
  }
  return {
    names: [...entries.keys()],
    /** Unix mode bits from the central directory (0 when the archiver did not record them). */
    mode(name) { return entries.get(name)?.mode || 0; },
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      if (e.method === 0) return e.data;
      if (e.method === 8) return inflateRawSync(e.data, { maxOutputLength: Math.max(e.size, 1) + 1024 });
      throw new ToolInputError(`unsupported ZIP compression method ${e.method}`);
    },
  };
}

export function inflate(buffer) {
  try { return inflateSync(buffer); } catch { return inflateRawSync(buffer); }
}

// ---------------------------------------------------------------- misc

export function truncate(text, max) {
  const s = String(text);
  return s.length > max ? { text: s.slice(0, max), truncated: true } : { text: s, truncated: false };
}

export function mask(secret) {
  const s = String(secret);
  if (s.length <= 8) return '*'.repeat(s.length);
  return `${s.slice(0, 4)}${'*'.repeat(Math.min(12, s.length - 6))}${s.slice(-2)}`;
}

export function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

export function shannonEntropy(s) {
  const counts = new Map();
  for (const ch of s) counts.set(ch, (counts.get(ch) || 0) + 1);
  let h = 0;
  for (const c of counts.values()) { const p = c / s.length; h -= p * Math.log2(p); }
  return h;
}
