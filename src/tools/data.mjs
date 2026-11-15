// Data tools: profiling, SQL querying, format conversion, SVG charts, JSON Schema checks.

import { loadTable, parseNumber, isDateLike, quantile, mean, variance, round, toCsv, readTextInput, ToolInputError } from './util.mjs';
import { runSql } from './minisql.mjs';
import { validate } from '../jsonschema.mjs';

const TABLE_INPUT = {
  path: { type: 'string', description: 'CSV, TSV, JSON or JSONL file (relative to the working directory)' },
  content: { type: 'string', description: 'Inline table content instead of a path' },
  format: { enum: ['auto', 'csv', 'tsv', 'json', 'jsonl'], default: 'auto' },
  delimiter: { type: 'string', maxLength: 1 },
};

function inferType(values) {
  const present = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
  if (!present.length) return 'empty';
  const counts = { integer: 0, number: 0, boolean: 0, date: 0, string: 0 };
  for (const v of present) {
    if (typeof v === 'boolean' || /^(true|false|yes|no)$/i.test(String(v).trim())) counts.boolean += 1;
    else if (parseNumber(v) !== null) { const n = parseNumber(v); if (Number.isInteger(n) && !/\./.test(String(v))) counts.integer += 1; else counts.number += 1; }
    else if (isDateLike(String(v))) counts.date += 1;
    else counts.string += 1;
  }
  const total = present.length;
  if ((counts.integer + counts.number) / total >= 0.95) return counts.number ? 'number' : 'integer';
  if (counts.boolean / total >= 0.95) return 'boolean';
  if (counts.date / total >= 0.95) return 'date';
  return 'string';
}

export function profileRecords(records, columns, { maxCategories = 10 } = {}) {
  const issues = [];
  const profile = columns.map((name) => {
    const values = records.map((r) => r[name]);
    const missing = values.filter((v) => v === null || v === undefined || String(v).trim() === '').length;
    const type = inferType(values);
    const present = values.filter((v) => !(v === null || v === undefined || String(v).trim() === ''));
    const distinct = new Map();
    for (const v of present) { const k = typeof v === 'object' ? JSON.stringify(v) : String(v); distinct.set(k, (distinct.get(k) || 0) + 1); }
    const col = { name, type, missing, missing_pct: round((missing / (values.length || 1)) * 100, 2), unique: distinct.size };
    if (type === 'integer' || type === 'number') {
      const nums = present.map(parseNumber).filter((n) => n !== null).sort((a, b) => a - b);
      const q1 = quantile(nums, 0.25), q3 = quantile(nums, 0.75), iqr = q3 - q1;
      const outliers = nums.filter((n) => n < q1 - 1.5 * iqr || n > q3 + 1.5 * iqr).length;
      Object.assign(col, { min: nums[0], p25: round(q1), median: round(quantile(nums, 0.5)), mean: round(mean(nums)), p75: round(q3), max: nums[nums.length - 1], std: round(Math.sqrt(variance(nums))), sum: round(nums.reduce((a, b) => a + b, 0)), outliers_iqr: outliers });
      const nonNumeric = present.length - nums.length;
      if (nonNumeric) issues.push({ column: name, issue: 'mixed-types', detail: `${nonNumeric} non-numeric value(s) in a numeric column` });
      if (outliers) issues.push({ column: name, issue: 'outliers', detail: `${outliers} value(s) outside 1.5×IQR` });
    } else if (type === 'date') {
      const sorted = present.map(String).sort();
      Object.assign(col, { min: sorted[0], max: sorted[sorted.length - 1] });
    }
    if (type === 'string' || type === 'boolean' || distinct.size <= maxCategories) {
      col.top_values = [...distinct.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxCategories).map(([value, count]) => ({ value, count }));
    }
    if (type === 'string') {
      const lengths = present.map((v) => String(v).length);
      col.avg_length = round(mean(lengths), 1);
      const padded = present.filter((v) => String(v) !== String(v).trim()).length;
      if (padded) issues.push({ column: name, issue: 'whitespace', detail: `${padded} value(s) with leading/trailing whitespace` });
      const folded = new Map();
      for (const k of distinct.keys()) { const f = k.trim().toLowerCase(); folded.set(f, (folded.get(f) || 0) + 1); }
      const variants = [...folded.values()].filter((c) => c > 1).length;
      if (variants) issues.push({ column: name, issue: 'inconsistent-casing', detail: `${variants} value(s) differ only by case or whitespace` });
    }
    if (missing / (values.length || 1) > 0.2) issues.push({ column: name, issue: 'high-missing', detail: `${col.missing_pct}% missing` });
    if (distinct.size === 1 && values.length > 1) issues.push({ column: name, issue: 'constant', detail: 'single distinct value' });
    if (distinct.size === present.length && present.length === values.length && values.length > 10 && type !== 'number') col.possible_key = true;
    return col;
  });
  const seen = new Set(); let duplicates = 0;
  for (const r of records) { const k = JSON.stringify(columns.map((c) => r[c])); if (seen.has(k)) duplicates += 1; else seen.add(k); }
  if (duplicates) issues.push({ column: null, issue: 'duplicate-rows', detail: `${duplicates} exact duplicate row(s)` });
  return { rows: records.length, columns: profile, duplicate_rows: duplicates, issues };
}

function markdownTable(records, columns) {
  const esc = (v) => (v === null || v === undefined ? '' : String(typeof v === 'object' ? JSON.stringify(v) : v).replace(/\|/g, '\\|').replace(/\n/g, ' '));
  return [`| ${columns.map(esc).join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`, ...records.map((r) => `| ${columns.map((c) => esc(r[c])).join(' | ')} |`)].join('\n') + '\n';
}

// ------------------------------------------------------------------- charts

const PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563'];
function escXml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])); }
function niceTicks(min, max, count = 5) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(round(v, 10));
  return ticks;
}
function fmt(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return `${round(n / 1e9, 2)}B`;
  if (a >= 1e6) return `${round(n / 1e6, 2)}M`;
  if (a >= 1e4) return `${round(n / 1e3, 1)}k`;
  return String(round(n, 2));
}

export function renderChart({ type, title = '', x_label = '', y_label = '', categories, series, width = 720, height = 400 }) {
  const m = { top: title ? 48 : 20, right: 20, bottom: 56, left: 64 };
  const w = width - m.left - m.right, h = height - m.top - m.bottom;
  const all = series.flatMap((s) => s.values.filter((v) => v !== null && Number.isFinite(v)));
  if (!all.length) throw new ToolInputError('no numeric values to plot');
  const isScatter = type === 'scatter';
  const ticks = niceTicks(Math.min(0, ...all), Math.max(...all));
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const y = (v) => m.top + h - ((v - yMin) / (yMax - yMin)) * h;
  const parts = [];
  const desc = `${type} chart of ${series.map((s) => s.name).join(', ')}${categories ? ` across ${categories.length} categories` : ''}`;
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="t d" font-family="system-ui, sans-serif" font-size="12">`);
  parts.push(`<title id="t">${escXml(title || desc)}</title><desc id="d">${escXml(desc)}</desc><rect width="100%" height="100%" fill="#ffffff"/>`);
  if (title) parts.push(`<text x="${width / 2}" y="28" text-anchor="middle" font-size="16" font-weight="600" fill="#111827">${escXml(title)}</text>`);
  for (const t of ticks) parts.push(`<line x1="${m.left}" x2="${m.left + w}" y1="${y(t)}" y2="${y(t)}" stroke="#e5e7eb"/><text x="${m.left - 8}" y="${y(t) + 4}" text-anchor="end" fill="#374151">${escXml(fmt(t))}</text>`);
  parts.push(`<line x1="${m.left}" x2="${m.left}" y1="${m.top}" y2="${m.top + h}" stroke="#9ca3af"/><line x1="${m.left}" x2="${m.left + w}" y1="${y(Math.max(yMin, 0))}" y2="${y(Math.max(yMin, 0))}" stroke="#9ca3af"/>`);
  if (isScatter) {
    const xs = series.flatMap((s) => s.x);
    const xt = niceTicks(Math.min(...xs), Math.max(...xs));
    const x = (v) => m.left + ((v - xt[0]) / (xt[xt.length - 1] - xt[0])) * w;
    for (const t of xt) parts.push(`<text x="${x(t)}" y="${m.top + h + 18}" text-anchor="middle" fill="#374151">${escXml(fmt(t))}</text>`);
    series.forEach((s, si) => s.values.forEach((v, i) => { if (Number.isFinite(v) && Number.isFinite(s.x[i])) parts.push(`<circle cx="${round(x(s.x[i]), 2)}" cy="${round(y(v), 2)}" r="3.5" fill="${PALETTE[si % PALETTE.length]}" fill-opacity="0.75"><title>${escXml(`${s.name}: (${s.x[i]}, ${v})`)}</title></circle>`); }));
  } else {
    const n = categories.length;
    const band = w / n;
    const labelEvery = Math.ceil(n / Math.max(1, Math.floor(w / 60)));
    categories.forEach((c, i) => { if (i % labelEvery === 0) parts.push(`<text x="${round(m.left + band * (i + 0.5), 2)}" y="${m.top + h + 18}" text-anchor="middle" fill="#374151">${escXml(String(c).slice(0, 14))}</text>`); });
    if (type === 'bar') {
      const inner = band * 0.8 / series.length;
      series.forEach((s, si) => s.values.forEach((v, i) => {
        if (!Number.isFinite(v)) return;
        const x0 = m.left + band * i + band * 0.1 + inner * si;
        const y0 = y(Math.max(v, 0)), y1 = y(Math.min(v, 0));
        parts.push(`<rect x="${round(x0, 2)}" y="${round(y0, 2)}" width="${round(Math.max(inner - 1, 1), 2)}" height="${round(Math.max(y1 - y0, 0.5), 2)}" fill="${PALETTE[si % PALETTE.length]}"><title>${escXml(`${s.name} · ${categories[i]}: ${v}`)}</title></rect>`);
      }));
    } else {
      series.forEach((s, si) => {
        const pts = s.values.map((v, i) => (Number.isFinite(v) ? `${round(m.left + band * (i + 0.5), 2)},${round(y(v), 2)}` : null)).filter(Boolean);
        parts.push(`<polyline fill="none" stroke="${PALETTE[si % PALETTE.length]}" stroke-width="2" points="${pts.join(' ')}"/>`);
        s.values.forEach((v, i) => { if (Number.isFinite(v)) parts.push(`<circle cx="${round(m.left + band * (i + 0.5), 2)}" cy="${round(y(v), 2)}" r="2.5" fill="${PALETTE[si % PALETTE.length]}"><title>${escXml(`${s.name} · ${categories[i]}: ${v}`)}</title></circle>`); });
      });
    }
  }
  if (x_label) parts.push(`<text x="${m.left + w / 2}" y="${height - 12}" text-anchor="middle" fill="#111827">${escXml(x_label)}</text>`);
  if (y_label) parts.push(`<text transform="translate(16 ${m.top + h / 2}) rotate(-90)" text-anchor="middle" fill="#111827">${escXml(y_label)}</text>`);
  if (series.length > 1) series.forEach((s, si) => parts.push(`<rect x="${m.left + 8 + si * 120}" y="${m.top - 14}" width="10" height="10" fill="${PALETTE[si % PALETTE.length]}"/><text x="${m.left + 22 + si * 120}" y="${m.top - 5}" fill="#111827">${escXml(s.name.slice(0, 16))}</text>`));
  parts.push('</svg>');
  return parts.join('');
}

export default [
  {
    id: 'data.profile',
    title: 'Profile a table',
    description: 'Column types, missing values, distinct counts, numeric summaries, outliers, duplicates and data-quality issues for CSV/TSV/JSON/JSONL data.',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { ...TABLE_INPUT, max_categories: { type: 'integer', minimum: 1, maximum: 50, default: 10 } } },
    async run(input, ctx) {
      const { records, columns, format, source } = await loadTable(ctx, input);
      return { source, format, ...profileRecords(records, columns, { maxCategories: input.max_categories }) };
    },
  },
  {
    id: 'data.query',
    title: 'Query a table with SQL',
    description: 'Run a read-only SQL SELECT (WHERE, GROUP BY, HAVING, ORDER BY, LIMIT, aggregates, CASE, LIKE, IN) over CSV/TSV/JSON/JSONL data.',
    permissions: ['read'],
    input_schema: {
      type: 'object', required: ['sql'],
      properties: { ...TABLE_INPUT, sql: { type: 'string', description: 'SELECT statement; the table may be called anything, e.g. FROM data' }, max_rows: { type: 'integer', minimum: 1, maximum: 5000, default: 200 }, output: { enum: ['records', 'csv', 'markdown'], default: 'records' } },
    },
    async run(input, ctx) {
      const { records } = await loadTable(ctx, input);
      const result = runSql(input.sql, records, { maxRows: input.max_rows });
      if (input.output === 'csv') return { ...result, rows: undefined, csv: toCsv(result.rows, result.columns) };
      if (input.output === 'markdown') return { ...result, rows: undefined, markdown: markdownTable(result.rows, result.columns) };
      return result;
    },
  },
  {
    id: 'data.convert',
    title: 'Convert table formats',
    description: 'Convert tabular data between CSV, TSV, JSON, JSONL and Markdown tables, optionally selecting columns.',
    permissions: ['read'],
    input_schema: {
      type: 'object', required: ['to'],
      properties: { ...TABLE_INPUT, to: { enum: ['csv', 'tsv', 'json', 'jsonl', 'markdown'] }, columns: { type: 'array', items: { type: 'string' } }, max_rows: { type: 'integer', minimum: 1, maximum: 100000 } },
    },
    async run(input, ctx) {
      const { records, columns } = await loadTable(ctx, input);
      const cols = input.columns || columns;
      const rows = records.slice(0, input.max_rows || records.length).map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
      let content;
      if (input.to === 'csv') content = toCsv(rows, cols);
      else if (input.to === 'tsv') content = [cols.join('\t'), ...rows.map((r) => cols.map((c) => String(r[c] ?? '').replace(/[\t\n]/g, ' ')).join('\t'))].join('\n') + '\n';
      else if (input.to === 'json') content = JSON.stringify(rows, null, 2) + '\n';
      else if (input.to === 'jsonl') content = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
      else content = markdownTable(rows, cols);
      return { format: input.to, rows: rows.length, columns: cols, content };
    },
  },
  {
    id: 'data.chart_svg',
    title: 'Render an SVG chart',
    description: 'Render an accessible bar, line or scatter chart (SVG) from inline series or from columns of a table.',
    permissions: ['read'],
    input_schema: {
      type: 'object', required: ['type'],
      properties: {
        ...TABLE_INPUT,
        type: { enum: ['bar', 'line', 'scatter'] },
        title: { type: 'string', maxLength: 120 },
        x: { type: 'string', description: 'Category (bar/line) or numeric (scatter) column when using a table' },
        y: { type: 'array', items: { type: 'string' }, description: 'One or more numeric columns' },
        categories: { type: 'array', items: { type: ['string', 'number'] } },
        series: { type: 'array', items: { type: 'object', required: ['name', 'values'], properties: { name: { type: 'string' }, values: { type: 'array', items: { type: ['number', 'null'] } }, x: { type: 'array', items: { type: 'number' } } } } },
        x_label: { type: 'string' }, y_label: { type: 'string' },
        width: { type: 'integer', minimum: 200, maximum: 2000, default: 720 }, height: { type: 'integer', minimum: 150, maximum: 1500, default: 400 },
      },
    },
    async run(input, ctx) {
      let { categories, series } = input;
      if (!series) {
        if (!input.x || !input.y) throw new ToolInputError('provide series, or a table with x and y columns');
        const { records } = await loadTable(ctx, input);
        const limited = records.slice(0, 2000);
        if (input.type === 'scatter') series = input.y.map((c) => ({ name: c, x: limited.map((r) => parseNumber(r[input.x])), values: limited.map((r) => parseNumber(r[c])) }));
        else { categories = limited.map((r) => r[input.x]); series = input.y.map((c) => ({ name: c, values: limited.map((r) => parseNumber(r[c])) })); }
      }
      if (input.type !== 'scatter' && !categories) categories = series[0].values.map((_, i) => String(i + 1));
      if (input.type === 'scatter' && series.some((s) => !s.x)) throw new ToolInputError('scatter series need x values');
      const svg = renderChart({ ...input, categories, series });
      return { svg, bytes: svg.length, points: series.reduce((a, s) => a + s.values.length, 0) };
    },
  },
  {
    id: 'data.validate_json',
    title: 'Validate JSON against a schema',
    description: 'Validate a JSON document (inline or file) against a JSON Schema and report each violation with its path.',
    permissions: ['read'],
    input_schema: {
      type: 'object', required: ['schema'],
      properties: { schema: { type: ['object', 'boolean'] }, data: {}, path: { type: 'string' }, content: { type: 'string' } },
    },
    async run(input, ctx) {
      let data = input.data;
      if (data === undefined) {
        const { text } = await readTextInput(ctx, input);
        try { data = JSON.parse(text); } catch (error) { return { valid: false, errors: [{ path: '$', message: `invalid JSON: ${error.message}` }] }; }
      }
      const result = validate(input.schema, data, { maxErrors: 100 });
      return { valid: result.valid, errors: result.errors };
    },
  },
];
