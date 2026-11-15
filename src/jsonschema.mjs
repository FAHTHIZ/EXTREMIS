// Dependency-free JSON Schema validator covering the draft 2020-12 keywords that
// tool input schemas and EXTREMIS manifests use. Unknown keywords are ignored, as
// the specification requires. Optional default filling makes tool calls forgiving.

const FORMATS = {
  'date-time': (v) => !Number.isNaN(Date.parse(v)) && /\d{4}-\d{2}-\d{2}T/.test(v),
  date: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)),
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  uri: (v) => { try { return Boolean(new URL(v).protocol); } catch { return false; } },
  'uri-reference': (v) => typeof v === 'string',
  uuid: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  ipv4: (v) => /^(\d{1,3})(\.\d{1,3}){3}$/.test(v) && v.split('.').every((p) => Number(p) <= 255),
  regex: (v) => { try { new RegExp(v); return true; } catch { return false; } },
};

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function matchesType(value, type) {
  const actual = typeOf(value);
  if (type === 'number') return actual === 'number' || actual === 'integer';
  return actual === type;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

function resolveRef(root, ref) {
  if (!ref.startsWith('#')) throw new Error(`unsupported $ref ${ref}`);
  const parts = ref.slice(1).split('/').filter(Boolean).map((p) => decodeURIComponent(p.replace(/~1/g, '/').replace(/~0/g, '~')));
  let node = root;
  for (const part of parts) {
    node = node?.[part];
    if (node === undefined) throw new Error(`unresolvable $ref ${ref}`);
  }
  return node;
}

/**
 * Validate a value. Returns { valid, errors: [{ path, message }], value }.
 * With { applyDefaults: true } missing properties with a `default` are filled in a copy.
 */
export function validate(schema, value, options = {}) {
  const errors = [];
  const root = schema;
  const applyDefaults = Boolean(options.applyDefaults);
  const maxErrors = options.maxErrors ?? 20;
  const input = applyDefaults ? structuredClone(value) : value;

  function check(s, v, path) {
    if (errors.length >= maxErrors) return true;
    if (s === true || s === undefined) return true;
    if (s === false) { errors.push({ path, message: 'is not allowed' }); return false; }
    if (s.$ref) return check(resolveRef(root, s.$ref), v, path);
    const before = errors.length;
    const add = (message) => errors.push({ path: path || '$', message });

    if (s.type !== undefined) {
      const types = Array.isArray(s.type) ? s.type : [s.type];
      if (!types.some((t) => matchesType(v, t))) { add(`must be ${types.join(' or ')}, got ${typeOf(v)}`); return false; }
    }
    if (s.const !== undefined && !deepEqual(s.const, v)) add(`must equal ${JSON.stringify(s.const)}`);
    if (s.enum && !s.enum.some((e) => deepEqual(e, v))) add(`must be one of ${s.enum.map((e) => JSON.stringify(e)).join(', ')}`);

    if (typeof v === 'string') {
      const length = [...v].length;
      if (s.minLength !== undefined && length < s.minLength) add(`must have at least ${s.minLength} characters`);
      if (s.maxLength !== undefined && length > s.maxLength) add(`must have at most ${s.maxLength} characters`);
      if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) add(`must match pattern ${s.pattern}`);
      if (s.format && FORMATS[s.format] && !FORMATS[s.format](v)) add(`must be a valid ${s.format}`);
    }
    if (typeof v === 'number') {
      if (s.minimum !== undefined && v < s.minimum) add(`must be >= ${s.minimum}`);
      if (s.maximum !== undefined && v > s.maximum) add(`must be <= ${s.maximum}`);
      if (s.exclusiveMinimum !== undefined && v <= s.exclusiveMinimum) add(`must be > ${s.exclusiveMinimum}`);
      if (s.exclusiveMaximum !== undefined && v >= s.exclusiveMaximum) add(`must be < ${s.exclusiveMaximum}`);
      if (s.multipleOf !== undefined && Math.abs(v / s.multipleOf - Math.round(v / s.multipleOf)) > 1e-9) add(`must be a multiple of ${s.multipleOf}`);
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) add(`must have at least ${s.minItems} items`);
      if (s.maxItems !== undefined && v.length > s.maxItems) add(`must have at most ${s.maxItems} items`);
      if (s.uniqueItems) {
        for (let i = 0; i < v.length; i += 1) for (let j = i + 1; j < v.length; j += 1) {
          if (deepEqual(v[i], v[j])) { add('items must be unique'); i = v.length; break; }
        }
      }
      const prefix = s.prefixItems || [];
      prefix.forEach((ps, i) => { if (i < v.length) check(ps, v[i], `${path}[${i}]`); });
      if (s.items !== undefined) for (let i = prefix.length; i < v.length; i += 1) check(s.items, v[i], `${path}[${i}]`);
      if (s.contains !== undefined) {
        const count = v.filter((item) => validate({ ...s.contains, $defs: root.$defs }, item).valid).length;
        if (count < (s.minContains ?? 1)) add('must contain a matching item');
      }
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const keys = Object.keys(v);
      if (s.minProperties !== undefined && keys.length < s.minProperties) add(`must have at least ${s.minProperties} properties`);
      if (s.maxProperties !== undefined && keys.length > s.maxProperties) add(`must have at most ${s.maxProperties} properties`);
      const props = s.properties || {};
      if (applyDefaults) {
        for (const [key, ps] of Object.entries(props)) {
          if (v[key] === undefined && ps && typeof ps === 'object' && ps.default !== undefined) v[key] = structuredClone(ps.default);
        }
      }
      for (const req of s.required || []) if (v[req] === undefined) add(`missing required property "${req}"`);
      for (const [key, deps] of Object.entries(s.dependentRequired || {})) {
        if (v[key] !== undefined) for (const dep of deps) if (v[dep] === undefined) add(`property "${dep}" is required when "${key}" is present`);
      }
      const patterns = Object.entries(s.patternProperties || {}).map(([p, ps]) => [new RegExp(p, 'u'), ps]);
      for (const key of keys) {
        const childPath = path ? `${path}.${key}` : key;
        let matched = false;
        if (Object.prototype.hasOwnProperty.call(props, key)) { matched = true; check(props[key], v[key], childPath); }
        for (const [re, ps] of patterns) if (re.test(key)) { matched = true; check(ps, v[key], childPath); }
        if (!matched && s.additionalProperties !== undefined) {
          if (s.additionalProperties === false) errors.push({ path: childPath, message: 'is not a recognized property' });
          else check(s.additionalProperties, v[key], childPath);
        }
        if (s.propertyNames) check(s.propertyNames, key, `${childPath}(name)`);
      }
    }
    if (s.allOf) s.allOf.forEach((sub) => check(sub, v, path));
    if (s.anyOf && !s.anyOf.some((sub) => validate({ ...sub, $defs: root.$defs }, v).valid)) add('must match at least one allowed schema');
    if (s.oneOf) {
      const count = s.oneOf.filter((sub) => validate({ ...sub, $defs: root.$defs }, v).valid).length;
      if (count !== 1) add(count === 0 ? 'must match one allowed schema' : 'matches more than one exclusive schema');
    }
    if (s.not && validate({ ...s.not, $defs: root.$defs }, v).valid) add('must not match the excluded schema');
    if (s.if) {
      const ok = validate({ ...s.if, $defs: root.$defs }, v).valid;
      if (ok && s.then) check(s.then, v, path);
      if (!ok && s.else) check(s.else, v, path);
    }
    return errors.length === before;
  }

  check(schema, input, '');
  return { valid: errors.length === 0, errors, value: input };
}

/** Format validation errors as a single readable line. */
export function formatErrors(errors) {
  return errors.map((e) => `${e.path || '$'} ${e.message}`).join('; ');
}
