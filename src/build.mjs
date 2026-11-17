// Static publishing artifacts for the built-in catalog:
//
//   registry/catalog.json                    machine-readable capability index
//   .well-known/agent-skills/index.json      Agent Skills discovery index (RFC draft v0.2.0)
//   .well-known/agent-skills/<name>.tar.gz   one archive per capability (SKILL.md at the root)
//
// Output is byte-reproducible: entries are sorted, tar mtimes/uids are zero and the
// gzip header carries no timestamp, so unchanged capabilities keep the same digest
// and `extremis build --check` can fail CI when committed artifacts are stale.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { loadCatalog, BUILTIN_DIR, PACKAGE_ROOT } from './catalog.mjs';
import { computeFolderHash, listFiles } from './hash.mjs';
import { unpackArchive } from './archive.mjs';

export const DISCOVERY_SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';
export const CATALOG_SCHEMA_VERSION = '1.0.0';
const ARCHIVE_EXCLUDE = [/^evals\//, /(^|\/)\.DS_Store$/];

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function tarHeader(name, size, mode) {
  const h = Buffer.alloc(512);
  let prefix = '';
  let base = name;
  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf('/', 155);
    if (cut <= 0 || Buffer.byteLength(name.slice(cut + 1)) > 100) throw new Error(`path too long for ustar: ${name}`);
    prefix = name.slice(0, cut);
    base = name.slice(cut + 1);
  }
  h.write(base, 0, 100, 'utf8');
  h.write(`${mode.toString(8).padStart(7, '0')}\0`, 100, 8, 'ascii');
  h.write('0000000\0', 108, 8, 'ascii'); // uid
  h.write('0000000\0', 116, 8, 'ascii'); // gid
  h.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  h.write('00000000000\0', 136, 12, 'ascii'); // mtime 0
  h.write('        ', 148, 8, 'ascii'); // checksum placeholder
  h.write('0', 156, 1, 'ascii'); // regular file
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');
  h.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return h;
}

/** Deterministic .tar.gz of [{ path, data, mode? }] with files at the archive root. */
export function createTarGz(files) {
  const parts = [];
  for (const f of [...files].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)))) {
    const data = Buffer.from(f.data);
    parts.push(tarHeader(f.path, data.length, f.mode || 0o644), data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) parts.push(Buffer.alloc(pad));
  }
  parts.push(Buffer.alloc(1024));
  const gz = gzipSync(Buffer.concat(parts), { level: 9 });
  gz[9] = 0xff; // OS byte "unknown" so the digest does not depend on the build platform
  return gz;
}

async function archiveFor(cap) {
  const files = [];
  for (const rel of await listFiles(cap.dir)) {
    if (ARCHIVE_EXCLUDE.some((re) => re.test(rel))) continue;
    const data = await readFile(path.join(cap.dir, ...rel.split('/')));
    files.push({ path: rel, data, mode: rel.startsWith('scripts/') ? 0o755 : 0o644 });
  }
  return createTarGz(files);
}

const stable = (value) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * Compute every artifact in memory. Returns { files: Map<relPath, Buffer>, catalog, index }.
 * @param {{ dir?: string, baseUrl?: string }} options
 */
export async function buildArtifacts({ dir = BUILTIN_DIR, baseUrl = '', reuse = null } = {}) {
  const catalog = await loadCatalog({ roots: [{ dir, type: 'builtin', trust: 'builtin' }] });
  const errors = catalog.diagnostics.filter((d) => d.level === 'error');
  if (errors.length) throw new Error(`catalog has errors: ${errors.map((e) => `${e.capability || e.path}: ${e.message}`).join('; ')}`);
  const caps = catalog.list().sort((a, b) => a.name.localeCompare(b.name));
  const files = new Map();
  const entries = [];
  const capabilities = [];
  const prefix = baseUrl ? `${baseUrl.replace(/\/+$/, '')}/.well-known/agent-skills/` : '';
  for (const cap of caps) {
    const rel = `.well-known/agent-skills/${cap.name}.tar.gz`;
    const fresh = await archiveFor(cap);
    // gzip bytes vary between zlib builds (Node 18/20/22); keep an existing archive
    // whose unpacked contents are identical so digests only change with content.
    const previous = reuse ? await reuse(rel) : null;
    const archive = previous && sameContents(previous, fresh) ? previous : fresh;
    files.set(rel, archive);
    entries.push({ name: cap.name, type: 'archive', description: cap.description, url: `${prefix}${cap.name}.tar.gz`, digest: `sha256:${sha256(archive)}` });
    capabilities.push({
      name: cap.name,
      kind: cap.kind,
      domain: cap.domain,
      version: cap.version,
      phase: cap.phase || null,
      summary: cap.summary,
      description: cap.description,
      risk: cap.risk,
      maturity: cap.maturity,
      permissions: cap.permissions,
      tools: cap.tools.map((t) => (t.builtin ? t.id : t.name)),
      requires: cap.requires.map((r) => r.name),
      suggests: cap.suggests.map((r) => r.name),
      ...(cap.kind === 'workflow' ? { steps: cap.workflow.steps.map((s) => s.capability || s.id) } : {}),
      path: path.relative(PACKAGE_ROOT, cap.dir).split(path.sep).join('/'),
      hash: await computeFolderHash(cap.dir),
    });
  }
  const index = { $schema: DISCOVERY_SCHEMA, skills: entries };
  const registry = { schema_version: CATALOG_SCHEMA_VERSION, generator: 'extremis build', count: capabilities.length, workflows: capabilities.filter((c) => c.kind === 'workflow').length, capabilities };
  files.set('.well-known/agent-skills/index.json', Buffer.from(stable(index)));
  files.set('registry/catalog.json', Buffer.from(stable(registry)));
  return { files, index, catalog: registry };
}

function sameContents(a, b) {
  try {
    const key = (buf) => unpackArchive(buf).map((f) => `${f.path}\0${sha256(f.data)}`).sort().join('\n');
    return key(a) === key(b);
  } catch { return false; }
}

/**
 * Write (or with check=true, compare) the artifacts under `out`.
 * Returns { written, stale, removed } as lists of relative paths.
 */
export async function build({ out = PACKAGE_ROOT, check = false, ...options } = {}) {
  const reuse = async (rel) => { const p = path.join(out, rel); return existsSync(p) ? readFile(p) : null; };
  const { files } = await buildArtifacts({ ...options, reuse });
  const stale = [];
  const written = [];
  for (const [rel, data] of files) {
    const target = path.join(out, rel);
    const current = existsSync(target) ? await readFile(target) : null;
    if (current && current.equals(data)) continue;
    stale.push(rel);
    if (!check) { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, data); written.push(rel); }
  }
  const removed = [];
  const wellKnown = path.join(out, '.well-known', 'agent-skills');
  if (existsSync(wellKnown)) {
    for (const name of await readdir(wellKnown)) {
      const rel = `.well-known/agent-skills/${name}`;
      if (files.has(rel)) continue;
      removed.push(rel);
      if (!check) await rm(path.join(wellKnown, name), { recursive: true, force: true });
    }
  }
  return { written, stale, removed, total: files.size };
}
