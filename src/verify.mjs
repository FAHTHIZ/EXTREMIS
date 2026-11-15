// Verification: run tool-backed checks and evaluate expectations against the
// results. Manual checks are returned for the host to confirm.
//
// A check is either a statement (string) or
//   { tool, args, expect, description }
// `args` values may reference parameters as "${name}"; a check whose
// parameters are not supplied is reported as skipped (needs_input).
// `expect` maps a dotted path in the tool result to a matcher:
//   literal                      deep-equal
//   { eq, ne, lt, lte, gt, gte } comparisons
//   { contains, matches }        array/string membership, regex
//   { exists: true|false }       presence
//   { length: n | matcher }      array/string/object length
//   { empty: true|false }
// Paths support array length via ".length" and indexes via ".0".

import { runTool } from './runner.mjs';

export function getPath(obj, dotted) {
  if (!dotted || dotted === '$') return obj;
  let cur = obj;
  for (const part of String(dotted).replace(/^\$\.?/, '').split('.')) {
    if (cur === null || cur === undefined) return undefined;
    if (part === 'length' && (Array.isArray(cur) || typeof cur === 'string')) cur = cur.length;
    else if (part === 'length' && typeof cur === 'object' && !('length' in cur)) cur = Object.keys(cur).length;
    else cur = cur[part];
  }
  return cur;
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const MATCHER_KEYS = new Set(['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'contains', 'matches', 'exists', 'length', 'empty', 'in']);

export function match(actual, expected) {
  if (!isObj(expected) || !Object.keys(expected).every((k) => MATCHER_KEYS.has(k))) {
    return { ok: JSON.stringify(actual) === JSON.stringify(expected), reason: `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` };
  }
  for (const [op, v] of Object.entries(expected)) {
    let ok;
    switch (op) {
      case 'eq': ok = JSON.stringify(actual) === JSON.stringify(v); break;
      case 'ne': ok = JSON.stringify(actual) !== JSON.stringify(v); break;
      case 'lt': ok = typeof actual === 'number' && actual < v; break;
      case 'lte': ok = typeof actual === 'number' && actual <= v; break;
      case 'gt': ok = typeof actual === 'number' && actual > v; break;
      case 'gte': ok = typeof actual === 'number' && actual >= v; break;
      case 'in': ok = Array.isArray(v) && v.some((x) => JSON.stringify(x) === JSON.stringify(actual)); break;
      case 'contains': ok = Array.isArray(actual) ? actual.some((x) => JSON.stringify(x) === JSON.stringify(v) || (typeof x === 'string' && x === v)) : typeof actual === 'string' && actual.includes(v); break;
      case 'matches': ok = typeof actual === 'string' && new RegExp(v).test(actual); break;
      case 'exists': ok = (actual !== undefined && actual !== null) === Boolean(v); break;
      case 'empty': { const len = Array.isArray(actual) || typeof actual === 'string' ? actual.length : isObj(actual) ? Object.keys(actual).length : actual == null ? 0 : 1; ok = (len === 0) === Boolean(v); break; }
      case 'length': { const len = Array.isArray(actual) || typeof actual === 'string' ? actual.length : isObj(actual) ? Object.keys(actual).length : undefined; ok = isObj(v) ? match(len, v).ok : len === v; break; }
      default: ok = false;
    }
    if (!ok) return { ok: false, reason: `${op} ${JSON.stringify(v)} failed for ${JSON.stringify(actual)?.slice(0, 200)}` };
  }
  return { ok: true };
}

function substitute(value, params, missing) {
  if (typeof value === 'string') {
    const whole = /^\$\{([\w.-]+)\}$/.exec(value);
    if (whole) { if (!(whole[1] in params)) missing.add(whole[1]); return params[whole[1]]; }
    return value.replace(/\$\{([\w.-]+)\}/g, (_, k) => { if (!(k in params)) { missing.add(k); return ''; } return String(params[k]); });
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, params, missing));
  if (isObj(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, params, missing)]));
  return value;
}

/**
 * Run checks. options: params (for ${...}), catalog, cwd, root, allow, env, timeoutMs
 * Returns { ok, passed, failed, skipped, manual, results }
 */
export async function runChecks(checks, options = {}) {
  const params = options.params || {};
  const results = [];
  for (const raw of checks || []) {
    const check = typeof raw === 'string' ? { type: 'manual', statement: raw } : raw;
    if (check.type === 'manual' || check.statement) { results.push({ status: 'manual', statement: check.statement, ...(check.from ? { from: check.from } : {}) }); continue; }
    const missing = new Set();
    const args = substitute(check.args || {}, params, missing);
    const label = check.description || check.tool;
    if (missing.size) { results.push({ status: 'skipped', tool: check.tool, description: label, reason: 'needs_input', needs: [...missing], ...(check.from ? { from: check.from } : {}) }); continue; }
    const envelope = await runTool(check.tool, args, options);
    if (!envelope.ok) { results.push({ status: 'error', tool: check.tool, description: label, error: envelope.error, ...(check.from ? { from: check.from } : {}) }); continue; }
    const failures = [];
    for (const [p, expected] of Object.entries(check.expect || {})) {
      const m = match(getPath(envelope.result, p), expected);
      if (!m.ok) failures.push({ path: p, reason: m.reason });
    }
    results.push({ status: failures.length ? 'failed' : 'passed', tool: check.tool, description: label, ...(failures.length ? { failures } : {}), duration_ms: envelope.duration_ms, ...(check.from ? { from: check.from } : {}), ...(options.includeResults ? { result: envelope.result } : {}) });
  }
  const count = (s) => results.filter((r) => r.status === s).length;
  return {
    ok: !results.some((r) => r.status === 'failed' || r.status === 'error'),
    passed: count('passed'), failed: count('failed'), errors: count('error'), skipped: count('skipped'), manual: count('manual'),
    results,
  };
}
