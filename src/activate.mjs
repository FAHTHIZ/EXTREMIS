// Progressive disclosure: three levels of capability context.
//
//   level 1  card      ~40-80 tokens: name, summary, tools, permissions, risk
//   level 2  activate  instructions (SKILL.md body) + tool schemas + resource list,
//                      for the requested capabilities and their resolved dependencies
//   level 3  resource  one bundled file, read on demand
//
// Hosts keep only level-1 cards (or nothing) in context and pull the rest when a
// task needs it. Every activation carries a content digest so hosts can cache.

import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { listResources } from './catalog.mjs';
import { resolve } from './resolve.mjs';
import { getBuiltinTool, describeTool } from './tools/index.mjs';
import { estimateTokens } from './text.mjs';

export class ActivationError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}

const MAX_RESOURCE_BYTES = 1024 * 1024;

/** Public description of every tool a capability declares. */
export function capabilityTools(cap) {
  return cap.tools.map((tool) => {
    if (tool.builtin) {
      const def = getBuiltinTool(tool.id);
      return def ? describeTool(def) : { id: tool.id, missing: true };
    }
    return { id: tool.id, title: tool.name, description: tool.description, permissions: [...new Set(['exec', ...(tool.permissions || [])])], input_schema: tool.input_schema || { type: 'object' } };
  });
}

/** All permissions a capability needs: declared plus those of its tools. */
export function capabilityPermissions(cap) {
  return [...new Set([...cap.permissions, ...capabilityTools(cap).flatMap((t) => t.permissions || [])])].sort();
}

export function digestOf(cap) {
  const h = createHash('sha256');
  h.update(cap.name).update('\0').update(cap.version || '').update('\0').update(cap.description).update('\0').update(cap.body);
  return `sha256:${h.digest('hex')}`;
}

/** Level 1: compact card. */
export function card(cap) {
  return {
    name: cap.name, kind: cap.kind, domain: cap.domain, summary: cap.summary,
    ...(cap.tools.length ? { tools: cap.tools.map((t) => t.id) } : {}),
    permissions: capabilityPermissions(cap), risk: cap.risk,
    ...(cap.requires.length ? { requires: cap.requires.map((d) => d.name) } : {}),
  };
}

function bodyFor(cap, maxTokens) {
  if (!maxTokens || estimateTokens(cap.body) <= maxTokens) return { instructions: cap.body, truncated: false };
  const chars = Math.max(400, maxTokens * 4);
  const cut = cap.body.lastIndexOf('\n', chars);
  return { instructions: `${cap.body.slice(0, cut > chars / 2 ? cut : chars)}\n\n[… truncated; read the full SKILL.md with level 3: resource "SKILL.md"]`, truncated: true };
}

/**
 * Level 2: activate capabilities. Resolves dependencies (dependencies first),
 * returns instructions, tool schemas and resource listings.
 * options: includeSuggests, maxBodyTokens (per capability), includeBody (default true)
 */
export async function activate(catalog, names, options = {}) {
  const list = [].concat(names).filter(Boolean);
  if (!list.length) throw new ActivationError('invalid_request', 'no capability names given');
  const unknown = list.filter((n) => !catalog.has(n));
  if (unknown.length) {
    throw new ActivationError('not_found', `unknown capabilit${unknown.length > 1 ? 'ies' : 'y'}: ${unknown.join(', ')}`, { unknown, suggestions: suggestNames(catalog, unknown) });
  }
  const resolution = resolve(catalog, list, { includeSuggests: options.includeSuggests });
  const capabilities = [];
  for (const name of resolution.order) {
    const cap = catalog.get(name);
    const requested = resolution.requested.includes(name);
    const { instructions, truncated } = options.includeBody === false ? { instructions: undefined, truncated: false } : bodyFor(cap, options.maxBodyTokens);
    const resources = await listResources(cap, { limit: 200 });
    capabilities.push({
      name, version: cap.version, kind: cap.kind, domain: cap.domain, summary: cap.summary, requested,
      ...(requested ? {} : { required_by: resolution.added.filter((a) => a.name === name).map((a) => a.by) }),
      digest: digestOf(cap), source: cap.source.type, trust: cap.source.trust,
      permissions: capabilityPermissions(cap), risk: cap.risk, prerequisites: cap.prerequisites,
      tools: capabilityTools(cap),
      instructions, ...(truncated ? { instructions_truncated: true } : {}),
      resources: resources.filter((r) => !/^(capability\.json|evals\/)/.test(r.path)),
      verify: cap.verify,
      ...(cap.workflow ? { workflow: cap.workflow } : {}),
      ...(cap.suggests.length ? { suggests: cap.suggests.map((d) => d.name) } : {}),
    });
  }
  const permissions = [...new Set(capabilities.flatMap((c) => c.permissions))].sort();
  const result = {
    ok: resolution.ok, order: resolution.order, added: resolution.added,
    ...(resolution.missing.length ? { missing: resolution.missing } : {}),
    ...(resolution.versionMismatches.length ? { version_mismatches: resolution.versionMismatches } : {}),
    ...(resolution.conflicts.length ? { conflicts: resolution.conflicts } : {}),
    ...(resolution.cycles.length ? { cycles: resolution.cycles } : {}),
    permissions, capabilities,
  };
  result.context_tokens = estimateTokens(JSON.stringify(result));
  return result;
}

/** Level 3: read one bundled resource, confined to the capability folder. */
export async function readResource(catalog, name, relPath, { maxBytes = MAX_RESOURCE_BYTES } = {}) {
  const cap = catalog.get(name);
  if (!cap) throw new ActivationError('not_found', `unknown capability: ${name}`, { suggestions: suggestNames(catalog, [name]) });
  const rel = String(relPath || 'SKILL.md').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!rel || path.isAbsolute(rel) || rel.split('/').some((p) => p === '..' || p === '')) throw new ActivationError('invalid_path', `invalid resource path "${relPath}"`);
  const root = await realpath(cap.dir);
  let full;
  try { full = await realpath(path.join(cap.dir, rel)); } catch { throw new ActivationError('not_found', `${name} has no resource "${rel}"`, { available: (await listResources(cap, { limit: 100 })).map((r) => r.path) }); }
  if (full !== root && !full.startsWith(root + path.sep)) throw new ActivationError('invalid_path', `resource "${rel}" resolves outside the capability`);
  const info = await stat(full);
  if (!info.isFile()) throw new ActivationError('invalid_path', `"${rel}" is not a file`);
  const buffer = await readFile(full);
  const binary = buffer.subarray(0, 8000).includes(0);
  const truncated = buffer.length > maxBytes;
  const data = buffer.subarray(0, maxBytes);
  return {
    capability: name, path: rel, size: info.size, mime_type: mimeOf(rel, binary),
    digest: `sha256:${createHash('sha256').update(buffer).digest('hex')}`,
    ...(binary ? { encoding: 'base64', content: data.toString('base64') } : { encoding: 'utf8', content: data.toString('utf8') }),
    ...(truncated ? { truncated: true } : {}),
  };
}

const MIME = { md: 'text/markdown', json: 'application/json', yaml: 'application/yaml', yml: 'application/yaml', txt: 'text/plain', py: 'text/x-python', js: 'text/javascript', mjs: 'text/javascript', ts: 'text/typescript', sh: 'text/x-shellscript', html: 'text/html', css: 'text/css', csv: 'text/csv', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', pdf: 'application/pdf', sql: 'application/sql', toml: 'application/toml', xml: 'application/xml' };
export function mimeOf(rel, binary = false) {
  const ext = rel.split('.').pop().toLowerCase();
  return MIME[ext] || (binary ? 'application/octet-stream' : 'text/plain');
}

/** Close-name suggestions (edit distance and substring) for typos. */
export function suggestNames(catalog, names) {
  const all = catalog.list().map((c) => c.name);
  const dist = (a, b) => {
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      let prev = dp[0]; dp[0] = i;
      for (let j = 1; j <= b.length; j += 1) { const tmp = dp[j]; dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
    }
    return dp[b.length];
  };
  return Object.fromEntries(names.map((n) => [n, all.map((c) => ({ c, d: c.includes(n) || n.includes(c) ? 1 : dist(n, c) })).filter((x) => x.d <= Math.max(2, Math.floor(n.length / 3))).sort((a, b) => a.d - b.d).slice(0, 3).map((x) => x.c)]));
}
