// Minimal semantic-version parsing and range matching (npm-style ranges):
// exact, =, >, >=, <, <=, ^, ~, x/* wildcards, space-separated AND, || OR.

export function parse(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(version).trim());
  if (!match) return null;
  return { major: +match[1], minor: +match[2], patch: +match[3], pre: match[4] ? match[4].split('.') : [] };
}

export function compare(a, b) {
  const x = typeof a === 'string' ? parse(a) : a;
  const y = typeof b === 'string' ? parse(b) : b;
  if (!x || !y) throw new Error(`invalid version: ${!x ? a : b}`);
  for (const key of ['major', 'minor', 'patch']) if (x[key] !== y[key]) return x[key] < y[key] ? -1 : 1;
  if (!x.pre.length && !y.pre.length) return 0;
  if (!x.pre.length) return 1;
  if (!y.pre.length) return -1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i += 1) {
    const p = x.pre[i], q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const pn = /^\d+$/.test(p), qn = /^\d+$/.test(q);
    if (pn && qn) return +p < +q ? -1 : 1;
    if (pn) return -1;
    if (qn) return 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

function partial(text) {
  const parts = text.replace(/^v/, '').split('.');
  const nums = parts.map((p) => (p === 'x' || p === 'X' || p === '*' || p === undefined ? null : p));
  const [major, minor, patch] = [nums[0] ?? null, nums[1] ?? null, (nums[2] ?? null)];
  return { major: major === null ? null : +major, minor: minor === null ? null : +minor, patch: patch === null ? null : (patch.includes('-') ? patch : +patch) };
}

function comparatorsFor(token) {
  const match = /^(\^|~|>=|<=|>|<|=)?\s*(.*)$/.exec(token);
  const op = match[1] || '';
  const rest = match[2];
  if (rest === '' || rest === '*' || rest === 'x' || rest === 'latest') return [];
  const full = parse(rest);
  const p = full ? { major: full.major, minor: full.minor, patch: full.patch } : partial(rest);
  const base = full ? rest.replace(/^v/, '') : `${p.major ?? 0}.${p.minor ?? 0}.${typeof p.patch === 'number' ? p.patch : 0}`;
  const next = (level) => {
    if (level === 'major') return `${(p.major ?? 0) + 1}.0.0-0`;
    if (level === 'minor') return `${p.major}.${(p.minor ?? 0) + 1}.0-0`;
    return `${p.major}.${p.minor}.${(p.patch ?? 0) + 1}-0`;
  };
  if (op === '^') {
    if ((p.major ?? 0) > 0 || p.minor === null) return [['>=', base], ['<', next('major')]];
    if ((p.minor ?? 0) > 0 || p.patch === null) return [['>=', base], ['<', next('minor')]];
    return [['>=', base], ['<', next('patch')]];
  }
  if (op === '~') return p.minor === null ? [['>=', base], ['<', next('major')]] : [['>=', base], ['<', next('minor')]];
  if (!full && (op === '' || op === '=')) {
    if (p.major === null) return [];
    if (p.minor === null) return [['>=', base], ['<', next('major')]];
    if (p.patch === null) return [['>=', base], ['<', next('minor')]];
  }
  return [[op || '=', base]];
}

function test(version, [op, target]) {
  const c = compare(version, target);
  switch (op) {
    case '>': return c > 0;
    case '>=': return c >= 0;
    case '<': return c < 0;
    case '<=': return c <= 0;
    default: return c === 0;
  }
}

/** True when `version` satisfies `range`. Prereleases only match comparators on the same x.y.z. */
export function satisfies(version, range = '*') {
  const v = parse(version);
  if (!v) return false;
  for (const alternative of String(range || '*').split('||')) {
    const tokens = alternative.trim().replace(/(\^|~|>=|<=|>|<|=)\s+/g, '$1').split(/\s+/).filter(Boolean);
    const hyphen = alternative.match(/^\s*(\S+)\s+-\s+(\S+)\s*$/);
    const comparators = hyphen ? [['>=', hyphen[1]], ['<=', hyphen[2]]] : tokens.flatMap(comparatorsFor);
    if (!comparators.every((c) => test(v, c))) continue;
    if (v.pre.length) {
      const sameTuple = comparators.some(([, t]) => {
        const tv = parse(t);
        return tv && tv.pre.length && tv.major === v.major && tv.minor === v.minor && tv.patch === v.patch;
      });
      if (!sameTuple) continue;
    }
    return true;
  }
  return false;
}

export function validRange(range) {
  try { satisfies('0.0.0', range); return true; } catch { return false; }
}
