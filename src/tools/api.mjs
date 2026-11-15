// API and schema tools: OpenAPI linting, OpenAPI breaking-change diff,
// JSON Schema compatibility diff and SQL DDL / migration linting.

import { readTextInput, ToolInputError } from './util.mjs';
import { parseYamlSubset } from '../frontmatter.mjs';

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

export function parseSpec(text) {
  const t = String(text).trim();
  if (!t) throw new ToolInputError('empty specification');
  if (t.startsWith('{')) { try { return JSON.parse(t); } catch (err) { throw new ToolInputError(`invalid JSON: ${err.message}`); } }
  try { return parseYamlSubset(t, { typed: true }); } catch (err) { throw new ToolInputError(`could not parse YAML (${err.message}); convert anchors/complex YAML to JSON first`); }
}

async function loadSpec(ctx, input, key) {
  if (input[key] && typeof input[key] === 'object') return input[key];
  const text = await readTextInput(ctx, input, { contentKey: `${key}_content`, pathKey: `${key}_path` });
  return parseSpec(text.text);
}

function deref(spec, node, seen = new Set()) {
  if (!node || typeof node !== 'object' || !node.$ref) return node;
  const ref = node.$ref;
  if (!ref.startsWith('#/') || seen.has(ref)) return node;
  seen.add(ref);
  let cur = spec;
  for (const part of ref.slice(2).split('/')) cur = cur?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  return cur ? deref(spec, cur, seen) : node;
}

function operations(spec) {
  const ops = [];
  for (const [p, item] of Object.entries(spec.paths || {})) {
    if (!item || typeof item !== 'object') continue;
    for (const m of METHODS) if (item[m]) ops.push({ path: p, method: m, op: item[m], shared: item.parameters || [] });
  }
  return ops;
}

function collectRefs(node, out = new Set()) {
  if (Array.isArray(node)) node.forEach((x) => collectRefs(x, out));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) { if (k === '$ref' && typeof v === 'string') out.add(v); else collectRefs(v, out); }
  return out;
}

export function lintOpenApi(spec) {
  const issues = [];
  const add = (severity, rule, where, message) => issues.push({ severity, rule, where, message });
  const version = spec.openapi || spec.swagger;
  if (!version) add('error', 'version', '$', 'missing openapi/swagger version field');
  else if (!/^(2\.0|3\.[01]\.\d+|3\.[012])/.test(String(version))) add('warning', 'version', '$', `unusual OpenAPI version ${version}`);
  if (!spec.info?.title) add('error', 'info-title', 'info', 'missing info.title');
  if (!spec.info?.version) add('error', 'info-version', 'info', 'missing info.version');
  if (!spec.info?.description) add('info', 'info-description', 'info', 'missing info.description');
  if (!spec.paths || !Object.keys(spec.paths).length) add('warning', 'paths', 'paths', 'no paths defined');
  if (String(version).startsWith('3') && !spec.servers?.length) add('info', 'servers', 'servers', 'no servers defined');
  const opIds = new Map();
  const securitySchemes = spec.components?.securitySchemes || spec.securityDefinitions || {};
  const globalSecurity = spec.security;
  for (const { path: p, method, op, shared } of operations(spec)) {
    const where = `${method.toUpperCase()} ${p}`;
    if (!op.operationId) add('warning', 'operation-id', where, 'missing operationId');
    else if (opIds.has(op.operationId)) add('error', 'operation-id-unique', where, `operationId "${op.operationId}" also used by ${opIds.get(op.operationId)}`);
    else opIds.set(op.operationId, where);
    if (!op.summary && !op.description) add('warning', 'operation-description', where, 'missing summary/description');
    if (!op.tags?.length) add('info', 'operation-tags', where, 'no tags');
    const responses = op.responses || {};
    if (!Object.keys(responses).length) add('error', 'responses', where, 'no responses');
    if (!Object.keys(responses).some((c) => /^2\d\d$|^2XX$|^default$/.test(c))) add('warning', 'success-response', where, 'no 2xx response');
    if (!Object.keys(responses).some((c) => /^[45]\d\d$|^[45]XX$|^default$/.test(c))) add('info', 'error-response', where, 'no 4xx/5xx or default response documented');
    for (const [code, r0] of Object.entries(responses)) { const r = deref(spec, r0); if (r && !r.description && !r0.$ref) add('warning', 'response-description', `${where} ${code}`, 'response without description'); }
    const params = [...shared, ...(op.parameters || [])].map((x) => deref(spec, x));
    const templ = [...p.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    for (const name of templ) if (!params.some((x) => x?.in === 'path' && x.name === name)) add('error', 'path-params', where, `path parameter {${name}} is not declared`);
    for (const x of params) {
      if (x?.in === 'path' && !templ.includes(x.name)) add('error', 'path-params', where, `declared path parameter "${x.name}" is not in the path`);
      if (x?.in === 'path' && x.required !== true) add('error', 'path-param-required', where, `path parameter "${x.name}" must be required: true`);
      if (x && !x.schema && !x.content && !x.type) add('warning', 'param-schema', where, `parameter "${x.name}" has no schema`);
    }
    const dup = params.filter(Boolean).map((x) => `${x.in}:${x.name}`).filter((k, i, a) => a.indexOf(k) !== i);
    for (const d of new Set(dup)) add('error', 'param-unique', where, `duplicate parameter ${d}`);
    if (['get', 'head', 'delete'].includes(method) && op.requestBody) add('warning', 'body-on-safe-method', where, `${method.toUpperCase()} with a request body`);
    const sec = op.security ?? globalSecurity;
    if (sec === undefined && Object.keys(securitySchemes).length) add('info', 'security', where, 'no security requirement (public?)');
    for (const req of sec || []) for (const name of Object.keys(req)) if (!securitySchemes[name]) add('error', 'security-scheme', where, `unknown security scheme "${name}"`);
    if (/[A-Z]/.test(p.replace(/\{[^}]+\}/g, ''))) add('info', 'path-casing', where, 'path contains upper-case letters');
    if (p.length > 1 && p.endsWith('/')) add('info', 'path-trailing-slash', where, 'trailing slash');
  }
  if (!Object.keys(securitySchemes).length && operations(spec).length) add('info', 'security-schemes', 'components', 'no security schemes defined');
  for (const [name, s] of Object.entries(securitySchemes)) if (s?.type === 'http' && s.scheme === 'basic') add('warning', 'basic-auth', `securitySchemes.${name}`, 'HTTP basic auth');
  for (const u of (spec.servers || []).map((s) => s.url)) if (/^http:\/\/(?!localhost|127\.)/.test(u || '')) add('warning', 'server-https', 'servers', `server ${u} is not HTTPS`);
  const defined = new Set();
  for (const [section, entries] of Object.entries(spec.components || {})) for (const k of Object.keys(entries || {})) defined.add(`#/components/${section}/${k}`);
  for (const k of Object.keys(spec.definitions || {})) defined.add(`#/definitions/${k}`);
  const refs = collectRefs(spec);
  for (const r of refs) if (r.startsWith('#/') && !defined.has(r.split('/').slice(0, 4).join('/'))) add('error', 'unresolved-ref', r, 'reference target does not exist');
  for (const d of defined) if (!refs.has(d) && !d.includes('/securitySchemes/')) add('info', 'unused-component', d, 'component is never referenced');
  const order = { error: 0, warning: 1, info: 2 }; issues.sort((a, b) => order[a.severity] - order[b.severity]);
  const counts = issues.reduce((o, i) => ({ ...o, [i.severity]: (o[i.severity] || 0) + 1 }), {});
  return { version: version || null, title: spec.info?.title || null, operations: operations(spec).length, counts, issues, valid: !issues.some((i) => i.severity === 'error') };
}

// ----------------------------------------------------- schema compatibility

function typeOf(s) { if (!s) return undefined; return Array.isArray(s.type) ? [...s.type].sort().join('|') : s.type || (s.properties ? 'object' : s.items ? 'array' : undefined); }

/**
 * Compare two JSON Schemas. direction 'request' = data the client sends
 * (tightening is breaking); 'response' = data the client receives
 * (removing/loosening is breaking).
 */
export function diffSchema(spec0, spec1, a0, b0, where, direction, out, depth = 0) {
  if (depth > 12) return;
  const a = deref(spec0, a0) || {}; const b = deref(spec1, b0) || {};
  const push = (level, message) => out.push({ level, where, message });
  const ta = typeOf(a), tb = typeOf(b);
  if (ta && tb && ta !== tb) push('breaking', `type changed ${ta} -> ${tb}`);
  if (a.enum && b.enum) {
    const removed = a.enum.filter((v) => !b.enum.includes(v)); const added = b.enum.filter((v) => !a.enum.includes(v));
    if (removed.length) push(direction === 'request' ? 'breaking' : 'warning', `enum values removed: ${removed.join(', ')}`);
    if (added.length) push(direction === 'response' ? 'breaking' : 'non-breaking', `enum values added: ${added.join(', ')}`);
  } else if (!a.enum && b.enum && direction === 'request') push('breaking', 'enum constraint added');
  for (const [k, cmp] of [['maxLength', 'lt'], ['maximum', 'lt'], ['maxItems', 'lt'], ['minLength', 'gt'], ['minimum', 'gt'], ['minItems', 'gt']]) {
    if (direction !== 'request') continue;
    if (b[k] !== undefined && (a[k] === undefined || (cmp === 'lt' ? b[k] < a[k] : b[k] > a[k]))) push('breaking', `${k} tightened ${a[k] ?? 'none'} -> ${b[k]}`);
  }
  if (direction === 'request' && b.pattern && b.pattern !== a.pattern) push('warning', `pattern changed to ${b.pattern}`);
  if (a.format !== b.format && a.format && b.format) push('warning', `format changed ${a.format} -> ${b.format}`);
  if (a.nullable === true && b.nullable !== true && direction === 'request') push('breaking', 'no longer nullable');
  if (a.nullable !== true && b.nullable === true && direction === 'response') push('breaking', 'response may now be null');
  const pa = a.properties || {}, pb = b.properties || {};
  const ra = new Set(a.required || []), rb = new Set(b.required || []);
  for (const k of Object.keys(pa)) {
    if (!(k in pb)) { push(direction === 'response' ? 'breaking' : (b.additionalProperties === false ? 'breaking' : 'warning'), `property "${k}" removed`); continue; }
    diffSchema(spec0, spec1, pa[k], pb[k], `${where}.${k}`, direction, out, depth + 1);
  }
  for (const k of Object.keys(pb)) if (!(k in pa)) push(direction === 'request' && rb.has(k) ? 'breaking' : 'non-breaking', `property "${k}" added${rb.has(k) ? ' (required)' : ''}`);
  for (const k of rb) if (!ra.has(k) && k in pa && direction === 'request') push('breaking', `property "${k}" became required`);
  for (const k of ra) if (!rb.has(k) && k in pb && direction === 'response') push('breaking', `property "${k}" is no longer guaranteed (not required)`);
  if (a.items || b.items) diffSchema(spec0, spec1, a.items, b.items, `${where}[]`, direction, out, depth + 1);
  if (a.additionalProperties !== false && b.additionalProperties === false && direction === 'request') push('breaking', 'additionalProperties now false');
}

function mediaSchema(spec, content) { const c = deref(spec, content) || {}; const m = c['application/json'] || Object.values(c)[0]; return m?.schema; }

export function diffOpenApi(base, head) {
  const changes = [];
  const add = (level, where, message) => changes.push({ level, where, message });
  const opsA = new Map(operations(base).map((o) => [`${o.method.toUpperCase()} ${o.path.replace(/\{[^}]+\}/g, '{}')}`, o]));
  const opsB = new Map(operations(head).map((o) => [`${o.method.toUpperCase()} ${o.path.replace(/\{[^}]+\}/g, '{}')}`, o]));
  for (const [key, a] of opsA) {
    const b = opsB.get(key);
    const where = `${a.method.toUpperCase()} ${a.path}`;
    if (!b) { add(a.op.deprecated ? 'warning' : 'breaking', where, a.op.deprecated ? 'deprecated operation removed' : 'operation removed'); continue; }
    if (!a.op.deprecated && b.op.deprecated) add('warning', where, 'operation deprecated');
    if (a.op.operationId && b.op.operationId && a.op.operationId !== b.op.operationId) add('warning', where, `operationId changed ${a.op.operationId} -> ${b.op.operationId} (breaks generated SDKs)`);
    const pa = [...a.shared, ...(a.op.parameters || [])].map((x) => deref(base, x)).filter(Boolean);
    const pb = [...b.shared, ...(b.op.parameters || [])].map((x) => deref(head, x)).filter(Boolean);
    const key2 = (x) => `${x.in}:${x.name}`;
    for (const x of pa) {
      const y = pb.find((p) => key2(p) === key2(x));
      if (!y) { if (x.in !== 'path') add(x.required ? 'breaking' : 'warning', where, `${x.in} parameter "${x.name}" removed`); continue; }
      if (!x.required && y.required) add('breaking', where, `${x.in} parameter "${x.name}" became required`);
      diffSchema(base, head, x.schema, y.schema, `${where} param ${x.name}`, 'request', changes);
    }
    for (const y of pb) if (!pa.some((x) => key2(x) === key2(y))) add(y.required ? 'breaking' : 'non-breaking', where, `${y.in} parameter "${y.name}" added${y.required ? ' (required)' : ''}`);
    const ba = deref(base, a.op.requestBody), bb = deref(head, b.op.requestBody);
    if (!ba && bb?.required) add('breaking', where, 'required request body added');
    if (ba && bb) { if (!ba.required && bb.required) add('breaking', where, 'request body became required'); diffSchema(base, head, mediaSchema(base, ba.content), mediaSchema(head, bb.content), `${where} body`, 'request', changes); }
    const resA = a.op.responses || {}, resB = b.op.responses || {};
    for (const code of Object.keys(resA)) {
      if (!(code in resB)) { add(/^2/.test(code) ? 'breaking' : 'warning', where, `response ${code} removed`); continue; }
      const ra = deref(base, resA[code]), rb = deref(head, resB[code]);
      diffSchema(base, head, mediaSchema(base, ra?.content), mediaSchema(head, rb?.content), `${where} ${code}`, 'response', changes);
    }
    for (const code of Object.keys(resB)) if (!(code in resA)) add(/^2/.test(code) && Object.keys(resA).some((c) => /^2/.test(c)) ? 'warning' : 'non-breaking', where, `response ${code} added`);
    const secA = JSON.stringify(a.op.security ?? base.security ?? []), secB = JSON.stringify(b.op.security ?? head.security ?? []);
    if (secA !== secB) add(secA === '[]' ? 'breaking' : 'warning', where, `security changed ${secA} -> ${secB}`);
  }
  for (const [key, b] of opsB) if (!opsA.has(key)) add('non-breaking', `${b.method.toUpperCase()} ${b.path}`, 'operation added');
  const order = { breaking: 0, warning: 1, 'non-breaking': 2 }; changes.sort((x, y) => order[x.level] - order[y.level]);
  const counts = changes.reduce((o, c) => ({ ...o, [c.level]: (o[c.level] || 0) + 1 }), {});
  const va = base.info?.version, vb = head.info?.version;
  const major = (v) => Number(String(v || '0').split('.')[0]);
  const bump = counts.breaking ? 'major' : counts['non-breaking'] || counts.warning ? 'minor' : 'none';
  return { base_version: va || null, head_version: vb || null, counts, breaking: Boolean(counts.breaking), recommended_bump: bump, version_bump_ok: !counts.breaking || major(vb) > major(va), changes };
}

// ----------------------------------------------------------- SQL linting

const RESERVED = new Set('user order group select table from where index key column check default primary references desc asc limit offset'.split(' '));

export function lintSql(sql, { dialect = 'postgres', migration = true } = {}) {
  const issues = [];
  const stripped = String(sql).replace(/--[^\n]*/g, (m) => ' '.repeat(m.length)).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const statements = [];
  let start = 0; let inStr = false; let dollar = null;
  for (let i = 0; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (dollar) { if (stripped.startsWith(dollar, i)) { i += dollar.length - 1; dollar = null; } continue; }
    if (inStr) { if (ch === "'") inStr = false; continue; }
    if (ch === "'") { inStr = true; continue; }
    const d = /^\$[A-Za-z_]*\$/.exec(stripped.slice(i, i + 40)); if (d) { dollar = d[0]; i += d[0].length - 1; continue; }
    if (ch === ';') { statements.push({ text: stripped.slice(start, i), offset: start }); start = i + 1; }
  }
  if (stripped.slice(start).trim()) statements.push({ text: stripped.slice(start), offset: start });
  const lineAt = (off) => sql.slice(0, off).split('\n').length;
  const tables = []; const fkCols = []; const indexed = new Set();
  const inTx = /\bBEGIN\b|\bSTART\s+TRANSACTION\b/i.test(stripped);
  for (const st of statements) {
    const s = st.text.trim(); if (!s) continue;
    const line = lineAt(st.offset + st.text.search(/\S/));
    const add = (severity, rule, message) => issues.push({ severity, rule, line, statement: s.replace(/\s+/g, ' ').slice(0, 120), message });
    const up = s.toUpperCase();
    let m;
    if ((m = /^CREATE\s+(?:UNLOGGED\s+|TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)\s*\(([\s\S]*)\)/i.exec(s))) {
      const name = m[1].replace(/"/g, ''); const body = m[2];
      const cols = []; let depth = 0, buf = '';
      for (const ch of body) { if (ch === '(') depth += 1; if (ch === ')') depth -= 1; if (ch === ',' && !depth) { cols.push(buf.trim()); buf = ''; } else buf += ch; }
      if (buf.trim()) cols.push(buf.trim());
      const defs = cols.filter((c) => !/^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|EXCLUDE|INDEX|KEY)\b/i.test(c));
      tables.push({ name, columns: defs.map((c) => c.split(/\s+/)[0].replace(/"/g, '')) });
      if (!/PRIMARY\s+KEY/i.test(body)) add('error', 'primary-key', `table ${name} has no primary key`);
      if (RESERVED.has(name.split('.').pop().toLowerCase())) add('warning', 'reserved-name', `table name "${name}" is a reserved word`);
      for (const c of defs) {
        const [col, ...rest] = c.split(/\s+/); const type = rest.join(' ').toUpperCase(); const colName = col.replace(/"/g, '');
        if (RESERVED.has(colName.toLowerCase())) add('warning', 'reserved-name', `column "${colName}" is a reserved word`);
        if (dialect === 'postgres' && /^(VARCHAR|CHARACTER VARYING)\s*\(\s*\d+\s*\)/.test(type)) add('info', 'prefer-text', `${name}.${colName}: prefer TEXT (with a CHECK if needed) over VARCHAR(n) in PostgreSQL`);
        if (dialect === 'postgres' && /^TIMESTAMP(?!\s*WITH\s+TIME\s+ZONE|TZ)\b(?!TZ)/.test(type) && !/^TIMESTAMPTZ/.test(type)) add('warning', 'timestamptz', `${name}.${colName}: TIMESTAMP without time zone; prefer TIMESTAMPTZ`);
        if (/^(FLOAT|REAL|DOUBLE)/.test(type) && /(price|amount|cost|total|balance|money|fee)/i.test(colName)) add('error', 'money-float', `${name}.${colName}: money stored as floating point; use NUMERIC/DECIMAL or integer cents`);
        if (/^MONEY\b/.test(type)) add('warning', 'money-type', `${name}.${colName}: MONEY type is locale-dependent`);
        if (/^SERIAL|^BIGSERIAL/.test(type) && dialect === 'postgres') add('info', 'identity', `${name}.${colName}: prefer GENERATED ... AS IDENTITY over SERIAL`);
        if (/\bREFERENCES\s+([\w."]+)/i.test(c)) fkCols.push({ table: name, column: colName, line });
        if (/(_id|Id)$/.test(colName) && !/\bREFERENCES\b|PRIMARY\s+KEY/i.test(c) && !new RegExp(`FOREIGN\\s+KEY\\s*\\(\\s*"?${colName}"?\\s*\\)`, 'i').test(body)) add('info', 'missing-fk', `${name}.${colName} looks like a reference but has no FOREIGN KEY`);
        if (/(email|password|ssn|token)/i.test(colName) && /password/i.test(colName) && !/hash/i.test(colName)) add('warning', 'plaintext-password', `${name}.${colName}: store password hashes, never plaintext (name the column *_hash)`);
      }
      for (const fk of body.matchAll(/FOREIGN\s+KEY\s*\(([^)]+)\)/gi)) for (const c of fk[1].split(',')) fkCols.push({ table: name, column: c.trim().replace(/"/g, ''), line });
      const pk = /PRIMARY\s+KEY\s*\(([^)]+)\)/i.exec(body); if (pk) indexed.add(`${name}:${pk[1].split(',')[0].trim().replace(/"/g, '')}`);
      for (const c of defs) if (/PRIMARY\s+KEY|UNIQUE/i.test(c)) indexed.add(`${name}:${c.split(/\s+/)[0].replace(/"/g, '')}`);
      for (const u of body.matchAll(/UNIQUE\s*\(([^)]+)\)/gi)) indexed.add(`${name}:${u[1].split(',')[0].trim().replace(/"/g, '')}`);
    }
    if ((m = /^CREATE\s+(UNIQUE\s+)?INDEX\s+(CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:[\w."]+\s+)?ON\s+(?:ONLY\s+)?([\w."]+)\s*(?:USING\s+\w+\s*)?\(([^)]+)\)/i.exec(s))) {
      indexed.add(`${m[3].replace(/"/g, '')}:${m[4].split(',')[0].trim().replace(/"/g, '').split(/\s+/)[0]}`);
      if (migration && dialect === 'postgres' && !m[2]) add('warning', 'index-concurrently', 'CREATE INDEX without CONCURRENTLY locks writes on the table');
      if (m[2] && inTx) add('error', 'concurrently-in-transaction', 'CREATE INDEX CONCURRENTLY cannot run inside a transaction');
    }
    if (/^DROP\s+(TABLE|COLUMN|SCHEMA|DATABASE)\b/i.test(s) || /\bDROP\s+COLUMN\b/i.test(s)) add('error', 'destructive', 'drops data; ensure a backup and a deploy-safe (expand/contract) sequence');
    if (/^TRUNCATE\b/i.test(s)) add('error', 'destructive', 'TRUNCATE removes all rows');
    if (/^(DELETE|UPDATE)\b/i.test(s) && !/\bWHERE\b/i.test(s)) add('error', 'unbounded-write', `${up.split(/\s+/)[0]} without WHERE affects every row`);
    if (/^ALTER\s+TABLE/i.test(s)) {
      if (/ADD\s+COLUMN[\s\S]*NOT\s+NULL/i.test(s) && !/DEFAULT/i.test(s)) add('error', 'add-not-null', 'adding a NOT NULL column without DEFAULT fails on non-empty tables');
      if (/ADD\s+COLUMN[\s\S]*DEFAULT\s+(now\(\)|random\(\)|gen_random_uuid\(\)|clock_timestamp\(\))/i.test(s)) add('warning', 'volatile-default', 'volatile DEFAULT rewrites the whole table');
      if (/ALTER\s+COLUMN[\s\S]*\bTYPE\b/i.test(s)) add('warning', 'column-type-change', 'changing a column type may rewrite the table and break readers');
      if (/RENAME\s+(COLUMN|TO)\b/i.test(s)) add('warning', 'rename', 'renames break running application versions; use expand/contract');
      if (/SET\s+NOT\s+NULL/i.test(s)) add('warning', 'set-not-null', 'SET NOT NULL scans the table under an exclusive lock; add a NOT VALID CHECK first');
      if (/ADD\s+(CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY/i.test(s) && !/NOT\s+VALID/i.test(s) && dialect === 'postgres') add('warning', 'fk-not-valid', 'add foreign keys NOT VALID, then VALIDATE CONSTRAINT separately');
      for (const fk of s.matchAll(/FOREIGN\s+KEY\s*\(([^)]+)\)/gi)) fkCols.push({ table: (/ALTER\s+TABLE\s+(?:ONLY\s+)?([\w."]+)/i.exec(s)?.[1] || '').replace(/"/g, ''), column: fk[1].split(',')[0].trim().replace(/"/g, ''), line });
    }
    if (/^GRANT\s+ALL\b/i.test(s)) add('warning', 'grant-all', 'GRANT ALL is broader than needed');
    if (/\bSELECT\s+\*/i.test(s) && /^CREATE\s+(OR\s+REPLACE\s+)?VIEW/i.test(s)) add('info', 'view-select-star', 'views with SELECT * freeze the column list at creation time');
  }
  for (const fk of fkCols) if (!indexed.has(`${fk.table}:${fk.column}`)) issues.push({ severity: 'info', rule: 'fk-index', line: fk.line, message: `foreign key ${fk.table}.${fk.column} has no index (slow joins and cascading deletes)` });
  const order = { error: 0, warning: 1, info: 2 }; issues.sort((a, b) => order[a.severity] - order[b.severity] || a.line - b.line);
  const counts = issues.reduce((o, i) => ({ ...o, [i.severity]: (o[i.severity] || 0) + 1 }), {});
  return { dialect, statements: statements.filter((s) => s.text.trim()).length, tables, counts, issues, safe: !issues.some((i) => i.severity === 'error') };
}

export default [
  {
    id: 'api.openapi_lint', title: 'Lint OpenAPI spec',
    description: 'Lint an OpenAPI 3.x / Swagger 2.0 document (JSON or YAML): operationIds, path parameters, responses, security schemes, unresolved and unused $refs, HTTPS servers.',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, spec: { type: 'object' } } },
    async run(input, ctx) { const spec = input.spec || parseSpec((await readTextInput(ctx, input)).text); return lintOpenApi(spec); },
  },
  {
    id: 'api.openapi_diff', title: 'Diff OpenAPI specs',
    description: 'Compare two OpenAPI documents and classify every change as breaking, warning or non-breaking (removed operations, new required parameters, tightened request schemas, removed response fields, security changes) with a semver recommendation.',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { base_path: { type: 'string' }, base_content: { type: 'string' }, base: { type: 'object' }, head_path: { type: 'string' }, head_content: { type: 'string' }, head: { type: 'object' } } },
    async run(input, ctx) { return diffOpenApi(await loadSpec(ctx, input, 'base'), await loadSpec(ctx, input, 'head')); },
  },
  {
    id: 'schema.json_diff', title: 'Diff JSON Schemas',
    description: 'Compatibility diff between two JSON Schemas for data that is sent (request/producer) or received (response/consumer); reports breaking type, enum, required and constraint changes.',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { base: { type: 'object' }, head: { type: 'object' }, base_path: { type: 'string' }, head_path: { type: 'string' }, base_content: { type: 'string' }, head_content: { type: 'string' }, direction: { enum: ['request', 'response'], default: 'request' } } },
    async run(input, ctx) {
      const a = await loadSpec(ctx, input, 'base'), b = await loadSpec(ctx, input, 'head');
      const changes = []; diffSchema(a, b, a, b, '$', input.direction, changes);
      return { direction: input.direction, breaking: changes.some((c) => c.level === 'breaking'), changes };
    },
  },
  {
    id: 'sql.schema_lint', title: 'Lint SQL schema or migration',
    description: 'Lint SQL DDL and migrations: missing primary keys, unindexed foreign keys, float money, TIMESTAMP without time zone, locking index creation, NOT NULL without default, destructive drops, unbounded UPDATE/DELETE.',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, dialect: { enum: ['postgres', 'mysql', 'sqlite', 'generic'], default: 'postgres' }, migration: { type: 'boolean', default: true, description: 'Apply online-migration safety rules' } } },
    async run(input, ctx) { const { text, source } = await readTextInput(ctx, input); return { file: source, ...lintSql(text, input) }; },
  },
];
