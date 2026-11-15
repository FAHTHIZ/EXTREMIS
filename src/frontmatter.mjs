// Frontmatter parser for SKILL.md files.
//
// Agent Skills frontmatter is YAML, but only a small, predictable subset is used in
// practice: scalars (plain, single- or double-quoted), block scalars (| and >),
// nested maps, dash lists and simple flow lists/maps. This parser covers that subset
// without a dependency. Plain scalars stay strings: the Agent Skills metadata field is
// defined as string -> string, and hosts interpret booleans themselves.

const KEY_RE = /^([A-Za-z0-9_.\-/]+|"[^"]*"|'[^']*')\s*:(?:\s+|$)(.*)$/;

export class FrontmatterError extends Error {}

/**
 * Split a SKILL.md document into frontmatter data and Markdown body.
 * @param {string} text
 * @returns {{ data: Record<string, any>, body: string, raw: string, hasFrontmatter: boolean }}
 */
export function parseSkillDocument(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = source.split('\n');
  if (!lines.length || lines[0].trim() !== '---') {
    return { data: {}, body: source.trim(), raw: '', hasFrontmatter: false };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---' || lines[i].trim() === '...') { end = i; break; }
  }
  if (end === -1) throw new FrontmatterError('missing closing frontmatter delimiter (---)');
  const rawLines = lines.slice(1, end);
  const data = parseYamlSubset(rawLines.join('\n'));
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new FrontmatterError('frontmatter must be a mapping');
  }
  return { data, body: lines.slice(end + 1).join('\n').trim(), raw: rawLines.join('\n'), hasFrontmatter: true };
}

/** Parse the YAML subset described above. */
export function parseYamlSubset(text) {
  const lines = String(text).split('\n').map((line, index) => ({ line, index }));
  const state = { lines, pos: 0 };
  skipBlank(state);
  if (state.pos >= lines.length) return {};
  const indent = indentOf(lines[state.pos].line);
  return parseBlock(state, indent);
}

function indentOf(line) {
  const match = /^( *)/.exec(line);
  return match ? match[1].length : 0;
}

function isBlank(line) {
  const trimmed = line.trim();
  return trimmed === '' || trimmed.startsWith('#');
}

function skipBlank(state) {
  while (state.pos < state.lines.length && isBlank(state.lines[state.pos].line)) state.pos += 1;
}

function fail(state, message) {
  const at = state.lines[Math.min(state.pos, state.lines.length - 1)];
  throw new FrontmatterError(`${message} (frontmatter line ${(at ? at.index : 0) + 2})`);
}

function parseBlock(state, indent) {
  skipBlank(state);
  const first = state.lines[state.pos];
  if (!first) return null;
  const trimmed = first.line.slice(indent);
  if (trimmed.startsWith('- ') || trimmed === '-') return parseList(state, indent);
  return parseMap(state, indent);
}

function parseMap(state, indent) {
  const out = {};
  while (true) {
    skipBlank(state);
    const current = state.lines[state.pos];
    if (!current) break;
    const lineIndent = indentOf(current.line);
    if (lineIndent < indent) break;
    if (lineIndent > indent) fail(state, 'unexpected indentation');
    const content = current.line.slice(indent);
    if (content.startsWith('- ')) break;
    const match = KEY_RE.exec(content);
    if (!match) fail(state, `expected "key: value", got "${content.trim().slice(0, 40)}"`);
    let key = match[1];
    if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1, -1);
    if (Object.prototype.hasOwnProperty.call(out, key)) fail(state, `duplicate key "${key}"`);
    const rest = match[2];
    state.pos += 1;
    out[key] = parseValue(state, rest, indent);
  }
  return out;
}

function parseList(state, indent) {
  const out = [];
  while (true) {
    skipBlank(state);
    const current = state.lines[state.pos];
    if (!current) break;
    const lineIndent = indentOf(current.line);
    if (lineIndent < indent) break;
    const content = current.line.slice(indent);
    if (lineIndent !== indent || !(content.startsWith('- ') || content === '-')) break;
    const rest = content === '-' ? '' : content.slice(2);
    const itemIndent = indent + 2;
    const keyMatch = KEY_RE.exec(rest.trimStart());
    if (keyMatch && !/^["'[{]/.test(rest.trimStart())) {
      // "- key: value" starts an inline map item; continue the map at itemIndent.
      const synthetic = ' '.repeat(itemIndent) + rest.trimStart();
      state.lines[state.pos] = { line: synthetic, index: current.index };
      out.push(parseMap(state, itemIndent));
    } else {
      state.pos += 1;
      out.push(parseValue(state, rest, indent));
    }
  }
  return out;
}

function parseValue(state, rest, parentIndent) {
  const value = stripComment(rest).trim();
  if (value === '' ) {
    skipBlank(state);
    const next = state.lines[state.pos];
    if (next && indentOf(next.line) > parentIndent) return parseBlock(state, indentOf(next.line));
    if (next && indentOf(next.line) === parentIndent && next.line.slice(parentIndent).startsWith('- ')) {
      return parseList(state, parentIndent);
    }
    return '';
  }
  if (/^[|>][+-]?\d*$/.test(value)) return parseBlockScalar(state, value, parentIndent);
  if (value.startsWith('[')) return parseFlow(collectFlow(state, value, '[', ']'));
  if (value.startsWith('{')) return parseFlow(collectFlow(state, value, '{', '}'));
  if (value.startsWith('"')) return parseDoubleQuoted(collectQuoted(state, value, '"'));
  if (value.startsWith("'")) return collectQuoted(state, value, "'").slice(1, -1).replace(/''/g, "'");
  // Plain multi-line scalars: continuation lines indented deeper than the key.
  let text = value;
  while (state.pos < state.lines.length) {
    const next = state.lines[state.pos].line;
    if (next.trim() === '' || indentOf(next) <= parentIndent) break;
    text += ' ' + stripComment(next).trim();
    state.pos += 1;
  }
  return text;
}

function stripComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if ((ch === '"' || ch === "'") && (i === 0 || /\s/.test(text[i - 1]) || text.slice(0, i).trim() === '')) { quote = ch; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i);
  }
  return text;
}

function collectQuoted(state, value, quote) {
  let text = value;
  const closed = (t) => {
    for (let i = 1; i < t.length; i += 1) {
      if (quote === '"' && t[i] === '\\') { i += 1; continue; }
      if (t[i] === quote) {
        if (quote === "'" && t[i + 1] === "'") { i += 1; continue; }
        return i === t.length - 1;
      }
    }
    return false;
  };
  while (!closed(text)) {
    if (state.pos >= state.lines.length) fail(state, 'unterminated quoted string');
    text += ' ' + state.lines[state.pos].line.trim();
    state.pos += 1;
  }
  return text;
}

function parseDoubleQuoted(text) {
  const inner = text.slice(1, -1);
  return inner.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, esc) => {
    if (esc[0] === 'u' || esc[0] === 'x') return String.fromCharCode(parseInt(esc.slice(1), 16));
    return { n: '\n', t: '\t', r: '\r', '0': '\0', '"': '"', '\\': '\\', '/': '/' }[esc] ?? esc;
  });
}

function parseBlockScalar(state, header, parentIndent) {
  const folded = header[0] === '>';
  const chomp = header.includes('-') ? 'strip' : header.includes('+') ? 'keep' : 'clip';
  const collected = [];
  let blockIndent = null;
  while (state.pos < state.lines.length) {
    const line = state.lines[state.pos].line;
    if (line.trim() === '') { collected.push(''); state.pos += 1; continue; }
    const lineIndent = indentOf(line);
    if (lineIndent <= parentIndent) break;
    if (blockIndent === null) blockIndent = lineIndent;
    if (lineIndent < blockIndent) break;
    collected.push(line.slice(blockIndent));
    state.pos += 1;
  }
  let trailing = 0;
  while (collected.length && collected[collected.length - 1] === '') { collected.pop(); trailing += 1; }
  let text;
  if (folded) {
    text = '';
    for (let i = 0; i < collected.length; i += 1) {
      const line = collected[i];
      if (i === 0) { text = line; continue; }
      const prev = collected[i - 1];
      if (line === '') text += '\n';
      else if (prev === '' || /^\s/.test(line) || /^\s/.test(prev)) text += (prev === '' ? '' : '\n') + line;
      else text += ' ' + line;
    }
  } else {
    text = collected.join('\n');
  }
  if (chomp === 'clip' && text) text += '\n';
  if (chomp === 'keep') text += '\n'.repeat(trailing + 1);
  return chomp === 'clip' ? text.replace(/\n$/, '') : text;
}

function collectFlow(state, value, open, close) {
  let text = value;
  const balanced = (t) => {
    let depth = 0, quote = null;
    for (const ch of t) {
      if (quote) { if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === open) depth += 1;
      else if (ch === close) depth -= 1;
    }
    return depth === 0;
  };
  while (!balanced(text)) {
    if (state.pos >= state.lines.length) fail(state, `unterminated flow collection ${open}`);
    text += ' ' + stripComment(state.lines[state.pos].line).trim();
    state.pos += 1;
  }
  return text;
}

function parseFlow(text) {
  let i = 0;
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i += 1; };
  const scalar = (stops) => {
    ws();
    if (text[i] === '"' || text[i] === "'") {
      const q = text[i];
      let j = i + 1;
      while (j < text.length && text[j] !== q) { if (q === '"' && text[j] === '\\') j += 1; j += 1; }
      const raw = text.slice(i, j + 1);
      i = j + 1;
      return q === '"' ? parseDoubleQuoted(raw) : raw.slice(1, -1).replace(/''/g, "'");
    }
    let j = i;
    while (j < text.length && !stops.includes(text[j])) j += 1;
    const raw = text.slice(i, j).trim();
    i = j;
    return raw;
  };
  const value = () => {
    ws();
    if (text[i] === '[') {
      i += 1; const arr = [];
      ws();
      if (text[i] === ']') { i += 1; return arr; }
      while (i < text.length) {
        arr.push(value()); ws();
        if (text[i] === ',') { i += 1; continue; }
        if (text[i] === ']') { i += 1; break; }
        throw new FrontmatterError('malformed flow list');
      }
      return arr;
    }
    if (text[i] === '{') {
      i += 1; const obj = {};
      ws();
      if (text[i] === '}') { i += 1; return obj; }
      while (i < text.length) {
        const key = scalar([':', ',', '}']); ws();
        if (text[i] !== ':') throw new FrontmatterError('malformed flow map');
        i += 1;
        obj[key] = value(); ws();
        if (text[i] === ',') { i += 1; continue; }
        if (text[i] === '}') { i += 1; break; }
        throw new FrontmatterError('malformed flow map');
      }
      return obj;
    }
    return scalar([',', ']', '}']);
  };
  const result = value();
  return result;
}

/** Serialize a flat or shallow-nested frontmatter object back to YAML (used by export). */
export function stringifyFrontmatter(data) {
  const lines = [];
  const scalar = (value) => {
    const text = String(value);
    if (text === '' || /[:#\n"'{}[\],&*!|>%@`]|^\s|\s$|^[-?]/.test(text)) return JSON.stringify(text);
    return text;
  };
  const write = (obj, indent) => {
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;
      const pad = ' '.repeat(indent);
      if (Array.isArray(value)) {
        lines.push(`${pad}${key}: [${value.map(scalar).join(', ')}]`);
      } else if (typeof value === 'object') {
        lines.push(`${pad}${key}:`);
        write(value, indent + 2);
      } else {
        lines.push(`${pad}${key}: ${scalar(value)}`);
      }
    }
  };
  write(data, 0);
  return `---\n${lines.join('\n')}\n---\n`;
}
