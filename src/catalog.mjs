// Catalog: discovers capability folders across sources and normalizes them.
//
// A capability is any folder containing SKILL.md (Agent Skills format). An optional
// capability.json adds EXTREMIS data; without it, a manifest is derived from the
// frontmatter so plain third-party skills (Claude Code, Hermes, OpenHands, Codex)
// are searchable and activatable too.

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkillDocument } from './frontmatter.mjs';
import { validate, formatErrors } from './jsonschema.mjs';
import { firstSentence } from './text.mjs';

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BUILTIN_DIR = path.join(PACKAGE_ROOT, 'capabilities');
export const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', 'evals', 'references', 'scripts', 'assets']);

let manifestSchema;
export function getManifestSchema() {
  if (!manifestSchema) {
    manifestSchema = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'schemas', 'capability.schema.json'), 'utf8'));
  }
  return manifestSchema;
}

/** EXTREMIS state directory (installed capabilities, lockfile, cache). */
export function extremisHome(env = process.env) {
  if (env.EXTREMIS_HOME) return path.resolve(env.EXTREMIS_HOME);
  return path.join(env.HOME || os.homedir(), '.extremis');
}

/**
 * Default source roots in precedence order (first wins on name collisions):
 * project-installed, user-installed, EXTREMIS_PATH entries, built-in catalog.
 */
export function defaultRoots({ cwd = process.cwd(), env = process.env, builtin = true, project = true, user = true } = {}) {
  const roots = [];
  if (project) roots.push({ dir: path.join(cwd, '.extremis', 'capabilities'), type: 'project', trust: 'community' });
  if (user) roots.push({ dir: path.join(extremisHome(env), 'capabilities'), type: 'user', trust: 'community' });
  for (const entry of String(env.EXTREMIS_PATH || '').split(path.delimiter).filter(Boolean)) {
    roots.push({ dir: path.resolve(cwd, entry), type: 'external', trust: 'trusted' });
  }
  if (builtin && env.EXTREMIS_NO_BUILTIN !== '1') roots.push({ dir: BUILTIN_DIR, type: 'builtin', trust: 'builtin' });
  return roots;
}

async function findSkillDirs(root, depth = 0) {
  if (!existsSync(root)) return [];
  if (existsSync(path.join(root, 'SKILL.md'))) return [root];
  if (depth > 2) return [];
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return []; }
  const found = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    found.push(...await findSkillDirs(path.join(root, entry.name), depth + 1));
  }
  return found;
}

function asList(value) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

function parseDependency(dep) {
  if (typeof dep === 'string') {
    const at = dep.indexOf('@');
    return at > 0 ? { name: dep.slice(0, at), range: dep.slice(at + 1) } : { name: dep, range: '*' };
  }
  return { name: dep.name, range: dep.version || '*', reason: dep.reason };
}

function deriveManifest(frontmatter) {
  const meta = frontmatter.metadata && typeof frontmatter.metadata === 'object' ? frontmatter.metadata : {};
  const hermes = meta.hermes && typeof meta.hermes === 'object' ? meta.hermes : {};
  return {
    kind: 'skill',
    domain: String(meta['extremis.domain'] || hermes.category || meta.category || frontmatter.category || 'general')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general',
    version: String(frontmatter.version || meta['extremis.version'] || meta.version || '0.0.0'),
    summary: firstSentence(frontmatter.description || '', 200),
    keywords: [...asList(hermes.tags), ...asList(meta.tags), ...asList(frontmatter.tags), ...asList(frontmatter.triggers)],
    risk: 'medium',
    maturity: 'draft',
  };
}

/** Normalize a raw capability folder into a capability record. */
export async function loadCapability(dir, source = { type: 'external', trust: 'community', dir: path.dirname(dir) }) {
  const skillPath = path.join(dir, 'SKILL.md');
  const text = await readFile(skillPath, 'utf8');
  const doc = parseSkillDocument(text);
  const fm = doc.data;
  const problems = [];
  const name = String(fm.name || path.basename(dir));
  if (!NAME_RE.test(name) || name.length > 64) problems.push({ level: 'error', message: `invalid skill name "${name}"` });
  if (fm.name && name !== path.basename(dir)) problems.push({ level: 'warning', message: `name "${name}" does not match folder "${path.basename(dir)}"` });
  const description = String(fm.description || '').replace(/\s+/g, ' ').trim();
  if (!description) problems.push({ level: 'error', message: 'missing description' });
  if (description.length > 1024) problems.push({ level: 'warning', message: 'description exceeds 1024 characters' });

  let manifest = deriveManifest(fm);
  let hasManifest = false;
  const manifestPath = path.join(dir, 'capability.json');
  if (existsSync(manifestPath)) {
    hasManifest = true;
    let raw;
    try { raw = JSON.parse(await readFile(manifestPath, 'utf8')); } catch (error) {
      problems.push({ level: 'error', message: `capability.json is not valid JSON: ${error.message}` });
    }
    if (raw) {
      const result = validate(getManifestSchema(), raw);
      if (!result.valid) problems.push({ level: 'error', message: `capability.json: ${formatErrors(result.errors)}` });
      manifest = { ...manifest, ...raw };
    }
  }
  const tools = (manifest.tools || []).map((tool) => (typeof tool === 'string'
    ? { id: tool, builtin: true }
    : { ...tool, id: `${name}.${tool.name}`, builtin: false, input: tool.input || 'stdin-json' }));

  return {
    name,
    kind: manifest.kind || 'skill',
    domain: manifest.domain,
    version: manifest.version,
    description,
    summary: manifest.summary || firstSentence(description, 200),
    keywords: asList(manifest.keywords),
    intents: asList(manifest.intents),
    not_for: asList(manifest.not_for),
    requires: (manifest.requires || []).map(parseDependency),
    suggests: (manifest.suggests || []).map(parseDependency),
    conflicts: asList(manifest.conflicts),
    tools,
    permissions: asList(manifest.permissions),
    prerequisites: asList(manifest.prerequisites),
    risk: manifest.risk || 'medium',
    maturity: manifest.maturity || 'draft',
    phase: manifest.phase || (manifest.kind === 'workflow' ? 'plan' : 'build'),
    provenance: manifest.provenance || (source.type === 'builtin' ? 'extremis' : 'third-party'),
    verify: manifest.verify || [],
    workflow: manifest.workflow || null,
    license: fm.license ? String(fm.license) : undefined,
    compatibility: fm.compatibility ? String(fm.compatibility) : undefined,
    allowedTools: fm['allowed-tools'] ? String(fm['allowed-tools']) : undefined,
    frontmatter: fm,
    body: doc.body,
    dir,
    skillPath,
    hasManifest,
    source: { type: source.type, trust: source.trust, root: source.dir },
    problems,
  };
}

export class Catalog {
  constructor(capabilities, diagnostics, roots) {
    this.capabilities = capabilities;
    this.diagnostics = diagnostics;
    this.roots = roots;
  }
  list() { return [...this.capabilities.values()]; }
  get(name) { return this.capabilities.get(name); }
  has(name) { return this.capabilities.has(name); }
  get size() { return this.capabilities.size; }
  /** Every tool id declared by any capability (built-in ids are shared). */
  toolOwners() {
    const owners = new Map();
    for (const cap of this.list()) for (const tool of cap.tools) {
      if (!owners.has(tool.id)) owners.set(tool.id, []);
      owners.get(tool.id).push(cap.name);
    }
    return owners;
  }
}

/**
 * Load the catalog. Options: roots (explicit list of {dir,type,trust} or paths),
 * cwd, env, builtin/project/user toggles, strict (drop capabilities with errors; default true).
 */
export async function loadCatalog(options = {}) {
  const roots = (options.roots || defaultRoots(options)).map((root) => (typeof root === 'string'
    ? { dir: path.resolve(options.cwd || process.cwd(), root), type: 'external', trust: 'trusted' }
    : root));
  const strict = options.strict !== false;
  const capabilities = new Map();
  const diagnostics = [];
  for (const root of roots) {
    const dirs = await findSkillDirs(root.dir);
    for (const dir of dirs) {
      let cap;
      try {
        cap = await loadCapability(dir, root);
      } catch (error) {
        diagnostics.push({ level: 'error', path: dir, message: error.message });
        continue;
      }
      for (const problem of cap.problems) diagnostics.push({ ...problem, path: dir, capability: cap.name });
      if (strict && cap.problems.some((p) => p.level === 'error')) continue;
      const existing = capabilities.get(cap.name);
      if (existing) {
        diagnostics.push({ level: 'warning', path: dir, capability: cap.name, message: `shadowed by ${existing.source.type} capability at ${existing.dir}` });
        existing.shadows = [...(existing.shadows || []), dir];
        continue;
      }
      capabilities.set(cap.name, cap);
    }
  }
  return new Catalog(capabilities, diagnostics, roots);
}

/** List a capability's bundled files (relative POSIX paths), excluding SKILL.md. */
export async function listResources(cap, { limit = 512 } = {}) {
  const out = [];
  async function walk(dir, rel) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= limit) return;
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') continue;
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), relPath);
      else if (entry.isFile() && relPath !== 'SKILL.md') {
        const info = await stat(path.join(dir, entry.name));
        out.push({ path: relPath, size: info.size });
      }
    }
  }
  await walk(cap.dir, '');
  return out;
}
