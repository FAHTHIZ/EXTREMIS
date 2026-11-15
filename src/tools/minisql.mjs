// A small, safe SQL engine over in-memory records (one table named `data`, or any
// name). Supports SELECT [DISTINCT] expressions with aliases, WHERE, GROUP BY,
// HAVING, ORDER BY, LIMIT/OFFSET, aggregates COUNT/SUM/AVG/MIN/MAX/MEDIAN/STDDEV,
// COUNT(DISTINCT x), CASE WHEN, IN, BETWEEN, LIKE, IS [NOT] NULL, arithmetic and
// scalar functions. No I/O, no side effects: queries cannot touch anything else.

import { parseNumber } from './util.mjs';

export class SqlError extends Error {}

const KEYWORDS = new Set(['select', 'distinct', 'from', 'where', 'group', 'by', 'having', 'order', 'asc', 'desc', 'limit', 'offset',
  'and', 'or', 'not', 'in', 'is', 'null', 'like', 'between', 'as', 'case', 'when', 'then', 'else', 'end', 'true', 'false', 'nulls', 'first', 'last']);
const AGGREGATES = new Set(['count', 'sum', 'avg', 'min', 'max', 'median', 'stddev']);

function lex(sql) {
  const tokens = [];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (sql.startsWith('--', i)) { while (i < sql.length && sql[i] !== '\n') i += 1; continue; }
    if (ch === "'") {
      let j = i + 1, s = '';
      while (j < sql.length) { if (sql[j] === "'" && sql[j + 1] === "'") { s += "'"; j += 2; continue; } if (sql[j] === "'") break; s += sql[j]; j += 1; }
      if (j >= sql.length) throw new SqlError('unterminated string literal');
      tokens.push({ t: 'str', v: s }); i = j + 1; continue;
    }
    if (ch === '"' || ch === '`' || ch === '[') {
      const close = ch === '[' ? ']' : ch;
      const j = sql.indexOf(close, i + 1);
      if (j < 0) throw new SqlError('unterminated quoted identifier');
      tokens.push({ t: 'id', v: sql.slice(i + 1, j) }); i = j + 1; continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(sql.slice(i));
    if (num) { tokens.push({ t: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(i));
    if (word) {
      const lower = word[0].toLowerCase();
      tokens.push(KEYWORDS.has(lower) ? { t: 'kw', v: lower } : { t: 'id', v: word[0] });
      i += word[0].length; continue;
    }
    const op = /^(<>|!=|<=|>=|\|\||[=<>+\-*/%(),.])/.exec(sql.slice(i));
    if (op) { tokens.push({ t: 'op', v: op[0] }); i += op[0].length; continue; }
    if (ch === ';') { i += 1; continue; }
    throw new SqlError(`unexpected character "${ch}"`);
  }
  return tokens;
}

function parse(sql) {
  const tokens = lex(sql);
  let p = 0;
  const peek = () => tokens[p];
  const isKw = (v) => tokens[p]?.t === 'kw' && tokens[p].v === v;
  const isOp = (v) => tokens[p]?.t === 'op' && tokens[p].v === v;
  const expectKw = (v) => { if (!isKw(v)) throw new SqlError(`expected ${v.toUpperCase()}`); p += 1; };
  const expectOp = (v) => { if (!isOp(v)) throw new SqlError(`expected "${v}"`); p += 1; };

  function primary() {
    const tok = peek();
    if (!tok) throw new SqlError('unexpected end of query');
    if (tok.t === 'num') { p += 1; return { k: 'lit', v: tok.v }; }
    if (tok.t === 'str') { p += 1; return { k: 'lit', v: tok.v }; }
    if (tok.t === 'kw' && (tok.v === 'true' || tok.v === 'false')) { p += 1; return { k: 'lit', v: tok.v === 'true' }; }
    if (tok.t === 'kw' && tok.v === 'null') { p += 1; return { k: 'lit', v: null }; }
    if (tok.t === 'kw' && tok.v === 'case') {
      p += 1; const whens = []; let otherwise = { k: 'lit', v: null };
      while (isKw('when')) { p += 1; const cond = expr(); expectKw('then'); whens.push([cond, expr()]); }
      if (isKw('else')) { p += 1; otherwise = expr(); }
      expectKw('end');
      return { k: 'case', whens, otherwise };
    }
    if (tok.t === 'op' && tok.v === '(') { p += 1; const e = expr(); expectOp(')'); return e; }
    if (tok.t === 'op' && tok.v === '*') { p += 1; return { k: 'star' }; }
    if (tok.t === 'id') {
      p += 1;
      if (isOp('(')) {
        p += 1;
        const name = tok.v.toLowerCase();
        let distinct = false;
        if (isKw('distinct')) { distinct = true; p += 1; }
        const args = [];
        if (!isOp(')')) { do { args.push(expr()); } while (isOp(',') && ++p); }
        expectOp(')');
        return AGGREGATES.has(name) ? { k: 'agg', name, args, distinct } : { k: 'fn', name, args };
      }
      if (isOp('.')) { p += 1; const col = peek(); p += 1; return { k: 'col', v: col.v }; }
      return { k: 'col', v: tok.v };
    }
    throw new SqlError(`unexpected token "${tok.v}"`);
  }
  function unary() {
    if (isOp('-')) { p += 1; return { k: 'neg', e: unary() }; }
    if (isOp('+')) { p += 1; return unary(); }
    return primary();
  }
  function mul() { let l = unary(); while (isOp('*') || isOp('/') || isOp('%')) { const op = peek().v; p += 1; l = { k: 'bin', op, l, r: unary() }; } return l; }
  function add() { let l = mul(); while (isOp('+') || isOp('-') || isOp('||')) { const op = peek().v; p += 1; l = { k: 'bin', op, l, r: mul() }; } return l; }
  function cmp() {
    let l = add();
    while (true) {
      let negate = false;
      if (isKw('not') && tokens[p + 1]?.t === 'kw' && ['in', 'like', 'between'].includes(tokens[p + 1].v)) { negate = true; p += 1; }
      if (isOp('=') || isOp('!=') || isOp('<>') || isOp('<') || isOp('>') || isOp('<=') || isOp('>=')) { const op = peek().v; p += 1; l = { k: 'bin', op, l, r: add() }; continue; }
      if (isKw('is')) { p += 1; let not = false; if (isKw('not')) { not = true; p += 1; } expectKw('null'); l = { k: 'isnull', e: l, not }; continue; }
      if (isKw('in')) { p += 1; expectOp('('); const list = []; do { list.push(expr()); } while (isOp(',') && ++p); expectOp(')'); l = { k: 'in', e: l, list, not: negate }; continue; }
      if (isKw('like')) { p += 1; l = { k: 'like', e: l, pattern: add(), not: negate }; continue; }
      if (isKw('between')) { p += 1; const lo = add(); expectKw('and'); const hi = add(); l = { k: 'between', e: l, lo, hi, not: negate }; continue; }
      return l;
    }
  }
  function not() { if (isKw('not')) { p += 1; return { k: 'not', e: not() }; } return cmp(); }
  function and() { let l = not(); while (isKw('and')) { p += 1; l = { k: 'and', l, r: not() }; } return l; }
  function expr() { let l = and(); while (isKw('or')) { p += 1; l = { k: 'or', l, r: and() }; } return l; }

  expectKw('select');
  let distinct = false;
  if (isKw('distinct')) { distinct = true; p += 1; }
  const columns = [];
  do {
    const e = expr();
    let alias = null;
    if (isKw('as')) { p += 1; alias = peek().v; p += 1; } else if (peek()?.t === 'id') { alias = peek().v; p += 1; }
    columns.push({ e, alias });
  } while (isOp(',') && ++p);
  if (isKw('from')) { p += 1; p += 1; }
  let where = null, groupBy = [], having = null, orderBy = [], limit = null, offset = 0;
  if (isKw('where')) { p += 1; where = expr(); }
  if (isKw('group')) { p += 1; expectKw('by'); do { groupBy.push(expr()); } while (isOp(',') && ++p); }
  if (isKw('having')) { p += 1; having = expr(); }
  if (isKw('order')) {
    p += 1; expectKw('by');
    do {
      const e = expr(); let dir = 'asc';
      if (isKw('asc') || isKw('desc')) { dir = peek().v; p += 1; }
      if (isKw('nulls')) { p += 2; }
      orderBy.push({ e, dir });
    } while (isOp(',') && ++p);
  }
  if (isKw('limit')) { p += 1; limit = Number(peek().v); p += 1; }
  if (isKw('offset')) { p += 1; offset = Number(peek().v); p += 1; }
  if (p < tokens.length) throw new SqlError(`unexpected token "${tokens[p].v}"`);
  return { distinct, columns, where, groupBy, having, orderBy, limit, offset };
}

function num(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = parseNumber(v);
  return n;
}
function cmpValues(a, b) {
  if (a === null || a === undefined || a === '') return b === null || b === undefined || b === '' ? 0 : -1;
  if (b === null || b === undefined || b === '') return 1;
  const na = num(a), nb = num(b);
  if (na !== null && nb !== null) return na < nb ? -1 : na > nb ? 1 : 0;
  return String(a).localeCompare(String(b));
}
function truthy(v) { return v !== null && v !== undefined && v !== false && v !== 0 && v !== ''; }
function likeToRegex(pattern) {
  return new RegExp(`^${String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, 'is');
}

const FUNCTIONS = {
  lower: (s) => (s == null ? null : String(s).toLowerCase()),
  upper: (s) => (s == null ? null : String(s).toUpperCase()),
  trim: (s) => (s == null ? null : String(s).trim()),
  length: (s) => (s == null ? null : String(s).length),
  substr: (s, start, len) => (s == null ? null : String(s).substr(Number(start) - 1, len === undefined ? undefined : Number(len))),
  substring: (s, start, len) => FUNCTIONS.substr(s, start, len),
  replace: (s, a, b) => (s == null ? null : String(s).split(String(a)).join(String(b))),
  round: (x, d = 0) => { const n = num(x); if (n === null) return null; const f = 10 ** Number(d); return Math.round(n * f) / f; },
  abs: (x) => { const n = num(x); return n === null ? null : Math.abs(n); },
  floor: (x) => { const n = num(x); return n === null ? null : Math.floor(n); },
  ceil: (x) => { const n = num(x); return n === null ? null : Math.ceil(n); },
  sqrt: (x) => { const n = num(x); return n === null ? null : Math.sqrt(n); },
  ln: (x) => { const n = num(x); return n === null ? null : Math.log(n); },
  coalesce: (...xs) => xs.find((x) => x !== null && x !== undefined && x !== '') ?? null,
  nullif: (a, b) => (cmpValues(a, b) === 0 ? null : a),
  cast_number: (x) => num(x),
  number: (x) => num(x),
  year: (d) => (d ? Number(String(d).slice(0, 4)) || null : null),
  month: (d) => (d ? Number(String(d).slice(5, 7)) || null : null),
  day: (d) => (d ? Number(String(d).slice(8, 10)) || null : null),
  date: (d) => (d ? String(d).slice(0, 10) : null),
  year_month: (d) => (d ? String(d).slice(0, 7) : null),
  concat: (...xs) => xs.map((x) => (x == null ? '' : String(x))).join(''),
};

function evaluate(node, row, group) {
  switch (node.k) {
    case 'lit': return node.v;
    case 'col': {
      if (Object.prototype.hasOwnProperty.call(row, node.v)) return row[node.v];
      const key = Object.keys(row).find((k) => k.toLowerCase() === String(node.v).toLowerCase());
      if (key === undefined) throw new SqlError(`unknown column "${node.v}"`);
      return row[key];
    }
    case 'star': return '*';
    case 'neg': { const n = num(evaluate(node.e, row, group)); return n === null ? null : -n; }
    case 'bin': {
      const l = evaluate(node.l, row, group), r = evaluate(node.r, row, group);
      if (node.op === '||') return `${l ?? ''}${r ?? ''}`;
      if (['=', '!=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
        if (l === null || r === null || l === undefined || r === undefined) return null;
        const c = cmpValues(l, r);
        return { '=': c === 0, '!=': c !== 0, '<>': c !== 0, '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0 }[node.op];
      }
      const a = num(l), b = num(r);
      if (a === null || b === null) return null;
      if (node.op === '+') return a + b;
      if (node.op === '-') return a - b;
      if (node.op === '*') return a * b;
      if (node.op === '/') return b === 0 ? null : a / b;
      if (node.op === '%') return b === 0 ? null : a % b;
      throw new SqlError(`unknown operator ${node.op}`);
    }
    case 'and': return truthy(evaluate(node.l, row, group)) && truthy(evaluate(node.r, row, group));
    case 'or': return truthy(evaluate(node.l, row, group)) || truthy(evaluate(node.r, row, group));
    case 'not': return !truthy(evaluate(node.e, row, group));
    case 'isnull': { const v = evaluate(node.e, row, group); const isNull = v === null || v === undefined || v === ''; return node.not ? !isNull : isNull; }
    case 'in': { const v = evaluate(node.e, row, group); const r = node.list.some((x) => cmpValues(v, evaluate(x, row, group)) === 0); return node.not ? !r : r; }
    case 'like': { const v = evaluate(node.e, row, group); const r = v != null && likeToRegex(evaluate(node.pattern, row, group)).test(String(v)); return node.not ? !r : r; }
    case 'between': { const v = evaluate(node.e, row, group); const r = cmpValues(v, evaluate(node.lo, row, group)) >= 0 && cmpValues(v, evaluate(node.hi, row, group)) <= 0; return node.not ? !r : r; }
    case 'case': { for (const [c, v] of node.whens) if (truthy(evaluate(c, row, group))) return evaluate(v, row, group); return evaluate(node.otherwise, row, group); }
    case 'fn': {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new SqlError(`unknown function ${node.name.toUpperCase()}`);
      return fn(...node.args.map((a) => evaluate(a, row, group)));
    }
    case 'agg': {
      if (!group) throw new SqlError(`aggregate ${node.name.toUpperCase()} used outside of a group`);
      const arg = node.args[0];
      if (node.name === 'count' && (!arg || arg.k === 'star')) return group.length;
      let values = group.map((r) => evaluate(arg, r, null)).filter((v) => v !== null && v !== undefined && v !== '');
      if (node.distinct) values = [...new Map(values.map((v) => [typeof v === 'string' ? v : JSON.stringify(v), v])).values()];
      if (node.name === 'count') return values.length;
      if (node.name === 'min' || node.name === 'max') {
        if (!values.length) return null;
        return values.reduce((a, b) => ((node.name === 'min' ? cmpValues(b, a) < 0 : cmpValues(b, a) > 0) ? b : a));
      }
      const nums = values.map(num).filter((v) => v !== null);
      if (!nums.length) return null;
      if (node.name === 'sum') return nums.reduce((a, b) => a + b, 0);
      if (node.name === 'avg') return nums.reduce((a, b) => a + b, 0) / nums.length;
      if (node.name === 'median') { const s = [...nums].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
      if (node.name === 'stddev') { if (nums.length < 2) return null; const m = nums.reduce((a, b) => a + b, 0) / nums.length; return Math.sqrt(nums.reduce((a, b) => a + (b - m) ** 2, 0) / (nums.length - 1)); }
      throw new SqlError(`unknown aggregate ${node.name}`);
    }
    default: throw new SqlError(`cannot evaluate ${node.k}`);
  }
}

function hasAgg(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.k === 'agg') return true;
  return Object.values(node).some((v) => (Array.isArray(v) ? v.some((x) => (Array.isArray(x) ? x.some(hasAgg) : hasAgg(x))) : hasAgg(v)));
}

function label(node) {
  switch (node.k) {
    case 'col': return node.v;
    case 'agg': return `${node.name}(${node.distinct ? 'distinct ' : ''}${node.args[0] ? label(node.args[0]) : '*'})`;
    case 'fn': return `${node.name}(${node.args.map(label).join(', ')})`;
    case 'star': return '*';
    case 'lit': return String(node.v);
    default: return 'expr';
  }
}

/** Run a query against records. Returns { columns, rows }. */
export function runSql(sql, records, { maxRows = 10000 } = {}) {
  const q = parse(sql);
  let rows = q.where ? records.filter((r) => truthy(evaluate(q.where, r, null))) : records;
  const aggregate = q.groupBy.length > 0 || q.columns.some((c) => hasAgg(c.e)) || hasAgg(q.having);
  const names = q.columns.map((c) => c.alias || label(c.e));
  let output;
  if (aggregate) {
    const groups = new Map();
    for (const r of rows) {
      const key = JSON.stringify(q.groupBy.map((g) => evaluate(g, r, null)));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    if (!q.groupBy.length && !groups.size) groups.set('[]', []);
    output = [];
    for (const group of groups.values()) {
      const sample = group[0] || {};
      const out = {};
      q.columns.forEach((c, i) => {
        if (c.e.k === 'star') Object.assign(out, sample);
        else out[names[i]] = evaluate(c.e, sample, group);
      });
      if (q.having) {
        const ctx = { ...sample, ...out };
        if (!truthy(evaluate(q.having, ctx, group))) continue;
      }
      output.push({ out, sample, group });
    }
  } else {
    output = rows.map((r) => {
      const out = {};
      q.columns.forEach((c, i) => { if (c.e.k === 'star') Object.assign(out, r); else out[names[i]] = evaluate(c.e, r, null); });
      return { out, sample: r, group: null };
    });
  }
  if (q.orderBy.length) {
    output.sort((a, b) => {
      for (const o of q.orderBy) {
        const ctxA = { ...a.sample, ...a.out }, ctxB = { ...b.sample, ...b.out };
        const va = o.e.k === 'lit' && typeof o.e.v === 'number' ? Object.values(a.out)[o.e.v - 1] : evaluate(o.e, ctxA, a.group);
        const vb = o.e.k === 'lit' && typeof o.e.v === 'number' ? Object.values(b.out)[o.e.v - 1] : evaluate(o.e, ctxB, b.group);
        const c = cmpValues(va, vb);
        if (c) return o.dir === 'desc' ? -c : c;
      }
      return 0;
    });
  }
  let result = output.map((o) => o.out);
  if (q.distinct) {
    const seen = new Set();
    result = result.filter((r) => { const k = JSON.stringify(r); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  const total = result.length;
  result = result.slice(q.offset, q.limit !== null ? q.offset + q.limit : undefined);
  const truncated = result.length > maxRows;
  if (truncated) result = result.slice(0, maxRows);
  const columns = q.columns.some((c) => c.e.k === 'star') ? [...new Set(result.flatMap((r) => Object.keys(r)))] : names;
  return { columns, rows: result, total_rows: total, truncated };
}
