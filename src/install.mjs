// Capability installation manager.
//
// Sources (see parseSource):
//   ./path, /abs/path, ~/path            local folder (a skill or a tree of skills)
//   owner/repo[/sub/path][#ref]          GitHub repository (also github:owner/repo)
//   https://github.com/o/r/tree/ref/sub  GitHub web URL
//   https://host/repo.git, git@host:o/r  any git remote (also git+https://...)
//   https://example.com                  Agent Skills well-known index
//                                        (/.well-known/agent-skills/index.json)
//   https://example.com/x/SKILL.md       a single remote SKILL.md
//
// Pipeline for every capability: fetch -> collect files in memory -> verify
// digests (well-known) -> security scan -> stage + validate as a capability ->
// atomic rename into place -> record in extremis-lock.json with the source,
// resolved commit and a content hash compatible with skills-lock.json v2.
//
// A "dangerous" scan verdict always refuses. "caution" requires acceptRisk.

import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile, lstat, realpath, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { loadCapability, extremisHome, BUILTIN_DIR, NAME_RE } from './catalog.mjs';
import { computeFolderHash } from './hash.mjs';
import { scanFiles } from './scan.mjs';
import { unpackArchive } from './archive.mjs';
import { assertPublicUrl } from './runner.mjs';

const run = promisify(execFile);
export const LOCK_FILE = 'extremis-lock.json';
export const LOCK_VERSION = 1;
export const WELL_KNOWN_SCHEMAS = new Set(['https://schemas.agentskills.io/discovery/0.2.0/schema.json']);
const WELL_KNOWN_PATH = '/.well-known/agent-skills/index.json';
const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build', '.extremis']);
const MAX_DOWNLOAD = 50 * 1024 * 1024;

export class InstallError extends Error {
  constructor(code, message, data) { super(message); this.name = 'InstallError'; this.code = code; if (data) this.data = data; }
}

// ------------------------------------------------------------------ sources

function expandHome(p, env) {
  return p === '~' || p.startsWith('~/') ? path.join(env.HOME || os.homedir(), p.slice(1)) : p;
}

/** Parse an install specifier into a normalised source description. */
export function parseSource(spec, { cwd = process.cwd(), env = process.env } = {}) {
  const raw = String(spec || '').trim();
  if (!raw) throw new InstallError('invalid_source', 'empty install source');
  if (/^(\.{1,2}(\/|$)|\/|~(\/|$))/.test(raw) || /^[a-zA-Z]:[\\/]/.test(raw) || existsSync(path.resolve(cwd, raw))) {
    const abs = path.resolve(cwd, expandHome(raw, env));
    return { type: 'local', spec: abs, path: abs };
  }
  let s = raw.replace(/^git\+/, '');
  const hashAt = s.lastIndexOf('#');
  let ref;
  if (hashAt > 0) { ref = s.slice(hashAt + 1) || undefined; s = s.slice(0, hashAt); }
  const gh = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+)(?:\/(.+?))?)?\/?$/.exec(s);
  if (gh) {
    const sub = gh[4] ? gh[4].replace(/\/SKILL\.md$/, '') : undefined;
    return { type: 'git', spec: raw, url: `https://github.com/${gh[1]}/${gh[2]}.git`, ref: ref || gh[3], path: sub, repo: `${gh[1]}/${gh[2]}` };
  }
  if (/^(ssh:\/\/|git@[\w.-]+:|file:\/\/)/.test(s) || /^https?:\/\/.+\.git(\/.*)?$/.test(s)) {
    const m = /^(.+?\.git)(?:\/(.+))?$/.exec(s);
    return { type: 'git', spec: raw, url: m ? m[1] : s, ref, path: m && m[2] ? m[2] : undefined };
  }
  if (/^https?:\/\//.test(s)) {
    const url = new URL(s);
    if (/\/SKILL\.md$/i.test(url.pathname)) return { type: 'skill-md', spec: raw, url: url.href };
    if (/\.(tar\.gz|tgz|zip)$/i.test(url.pathname)) return { type: 'archive', spec: raw, url: url.href };
    const index = url.pathname.endsWith('.json') ? url.href : new URL(WELL_KNOWN_PATH, url.origin).href;
    return { type: 'well-known', spec: raw, url: index };
  }
  const short = /^(?:github:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(.+?))?\/?$/.exec(s);
  if (short) return { type: 'git', spec: raw, url: `https://github.com/${short[1]}/${short[2]}.git`, ref, path: short[3], repo: `${short[1]}/${short[2]}` };
  throw new InstallError('invalid_source', `cannot parse install source "${raw}"`);
}

// ------------------------------------------------------------------ fetching

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function download(url, { env = process.env, fetchImpl = fetch, accept } = {}) {
  let current;
  try { current = new URL(url); } catch { throw new InstallError('invalid_source', `invalid download URL: ${url}`); }
  const headers = accept ? { accept } : {};
  for (let hop = 0; hop <= 5; hop += 1) {
    if (!['https:', 'http:'].includes(current.protocol)) {
      throw new InstallError('blocked_source', `refusing download protocol ${current.protocol}`);
    }
    if (current.username || current.password) {
      throw new InstallError('blocked_source', 'download URLs must not contain embedded credentials');
    }
    await assertPublicUrl(current.href, env).catch((error) => {
      throw new InstallError('blocked_source', error.message);
    });
    const host = current.hostname.replace(/^\\[|\\]$/g, '').toLowerCase();
    const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host);
    if (current.protocol !== 'https:' && env.EXTREMIS_ALLOW_INSECURE_INSTALL !== '1' && !loopback) {
      throw new InstallError('insecure_source', `refusing to install over plain HTTP: ${current.href} (set EXTREMIS_ALLOW_INSECURE_INSTALL=1 to override)`);
    }

    const response = await fetchImpl(current.href, {
      redirect: 'manual',
      headers,
      signal: AbortSignal.timeout(15000),
    }).catch((error) => {
      throw new InstallError('fetch_failed', `cannot fetch ${current.href}: ${error.message}`);
    });

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel?.().catch(() => {});
      if (!location) throw new InstallError('invalid_redirect', `redirect from ${current.href} has no Location header`);
      let next;
      try { next = new URL(location, current); } catch { throw new InstallError('invalid_redirect', `invalid redirect destination from ${current.href}`); }
      if (!['https:', 'http:'].includes(next.protocol)) {
        throw new InstallError('blocked_source', `refusing redirect to unsupported protocol ${next.protocol}`);
      }
      if (next.username || next.password) throw new InstallError('blocked_source', 'redirect destination contains embedded credentials');
      current = next;
      continue;
    }

    if (!response.ok) throw new InstallError('fetch_failed', `cannot fetch ${current.href}: HTTP ${response.status}`);
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_DOWNLOAD) {
      await response.body?.cancel?.().catch(() => {});
      throw new InstallError('too_large', `${current.href} is larger than ${MAX_DOWNLOAD} bytes`);
    }
    const chunks = [];
    let total = 0;
    if (response.body) {
      for await (const chunk of response.body) {
        total += chunk.length;
        if (total > MAX_DOWNLOAD) {
          await response.body.cancel?.().catch(() => {});
          throw new InstallError('too_large', `${current.href} is larger than ${MAX_DOWNLOAD} bytes`);
        }
        chunks.push(Buffer.from(chunk));
      }
    }
    return { data: Buffer.concat(chunks), contentType: response.headers.get('content-type') || '', url: current.href };
  }
  throw new InstallError('too_many_redirects', 'download exceeded the five-redirect limit');
}

function sha256(data) { return createHash('sha256').update(data).digest('hex'); }

function verifyDigest(data, digest, what) {
  if (!digest) return;
  const m = /^sha256:([0-9a-f]{64})$/.exec(String(digest));
  if (!m) throw new InstallError('invalid_digest', `malformed digest for ${what}: ${digest}`);
  const actual = sha256(data);
  if (actual !== m[1]) throw new InstallError('digest_mismatch', `digest mismatch for ${what}: expected ${m[1]}, got ${actual}`);
}

async function gitFetch(source, env) {
  const isScp = /^git@/i.test(source.url);
  let protocol;
  if (isScp || /^ssh:\/\//i.test(source.url)) {
    if (env.EXTREMIS_ALLOW_SSH_GIT !== '1') {
      throw new InstallError('unsupported_transport', 'SSH Git sources are disabled by default; use HTTPS or explicitly set EXTREMIS_ALLOW_SSH_GIT=1 for a trusted source');
    }
    protocol = 'ssh';
  } else {
    let remote;
    try { remote = new URL(source.url); } catch { throw new InstallError('invalid_source', `invalid Git remote: ${source.url}`); }
    protocol = remote.protocol.replace(':', '');
    if (remote.username || remote.password) throw new InstallError('invalid_source', 'Git remote URLs must not contain embedded credentials');
    if (protocol === 'file') {
      if (remote.hostname && remote.hostname !== 'localhost') {
        throw new InstallError('invalid_source', 'file Git sources must refer to the local machine');
      }
    } else if (protocol === 'https' || protocol === 'http') {
      if (protocol === 'http' && env.EXTREMIS_ALLOW_INSECURE_INSTALL !== '1') {
        throw new InstallError('insecure_source', 'plain HTTP Git remotes require EXTREMIS_ALLOW_INSECURE_INSTALL=1');
      }
      await assertPublicUrl(remote.href, env).catch((error) => {
        throw new InstallError('blocked_source', error.message);
      });
    } else {
      throw new InstallError('unsupported_transport', `Git transport ${protocol} is not supported`);
    }
  }

  const dir = await mkdtemp(path.join(os.tmpdir(), 'extremis-git-'));
  const nullDevice = os.platform() === 'win32' ? 'NUL' : '/dev/null';
  const gitEnv = {
    ...env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: 'echo',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: nullDevice,
    GCM_INTERACTIVE: 'Never',
  };
  const config = [
    '-c', 'protocol.allow=never',
    '-c', 'protocol.ext.allow=never',
    '-c', `protocol.${protocol}.allow=always`,
    '-c', 'http.followRedirects=false',
    '-c', 'credential.helper=',
    '-c', `core.hooksPath=${nullDevice}`,
  ];
  const git = (args) => run('git', [...config, ...args], {
    cwd: dir, env: gitEnv, maxBuffer: 16 * 1024 * 1024, timeout: 120000,
  });
  try {
    await git(['init', '-q']);
    await git(['fetch', '-q', '--depth', '1', '--no-tags', '--no-recurse-submodules', source.url, source.ref || 'HEAD']);
    await git(['-c', 'core.symlinks=true', 'checkout', '-q', 'FETCH_HEAD']);
    const { stdout } = await git(['rev-parse', 'HEAD']);
    return { dir, commit: stdout.trim() };
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    const detail = String(error.stderr || error.message).trim().split('\\n').slice(-2).join(' ');
    throw new InstallError('fetch_failed', `git fetch failed for ${source.url}${source.ref ? '#' + source.ref : ''}: ${detail}`);
  }
}

/** Find skill directories under root (depth-limited, skipping vendored trees). */
export async function findSkillRoots(root, depth = 0, max = 6) {
  if (existsSync(path.join(root, 'SKILL.md'))) return [root];
  if (depth >= max) return [];
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || (entry.name.startsWith('.') && !['.claude', '.agents', '.oasis', '.well-known', '.codex', '.github'].includes(entry.name))) continue;
    out.push(...await findSkillRoots(path.join(root, entry.name), depth + 1, max));
  }
  return out;
}

/** Read a skill directory into memory, materialising in-tree symlinks and refusing escapes. */
export async function collectFiles(dir) {
  const root = await realpath(dir);
  const files = [];
  const problems = [];
  async function walk(abs, rel) {
    for (const entry of (await readdir(abs, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const full = path.join(abs, entry.name);
      const info = await lstat(full);
      if (info.isSymbolicLink()) {
        let target;
        try { target = await realpath(full); } catch { problems.push({ rule: 'dangling-symlink', severity: 'medium', file: relPath, line: 0, message: 'dangling symbolic link (skipped)' }); continue; }
        if (target !== root && !target.startsWith(root + path.sep)) {
          problems.push({ rule: 'symlink-escape', severity: 'critical', file: relPath, line: 0, message: 'symbolic link resolves outside the capability' });
          continue;
        }
        const tinfo = await stat(target);
        if (tinfo.isFile()) files.push({ path: relPath, data: await readFile(target), mode: tinfo.mode });
        continue;
      }
      if (info.isDirectory()) await walk(full, relPath);
      else if (info.isFile()) files.push({ path: relPath, data: await readFile(full), mode: info.mode });
      else problems.push({ rule: 'special-file', severity: 'high', file: relPath, line: 0, message: 'device, socket or FIFO (skipped)' });
    }
  }
  await walk(root, '');
  return { files, problems };
}

/**
 * Resolve a source into candidate bundles [{files, problems, origin}] plus
 * source metadata to record in the lock. Callers must invoke cleanup().
 */
export async function fetchSource(source, { env = process.env, fetchImpl } = {}) {
  const cleanup = [];
  const done = async () => { for (const dir of cleanup) await rm(dir, { recursive: true, force: true }); };
  try {
    if (source.type === 'local' || source.type === 'git') {
      let base = source.path;
      const meta = {};
      if (source.type === 'git') {
        const fetched = await gitFetch(source, env);
        cleanup.push(fetched.dir);
        meta.commit = fetched.commit;
        base = source.path ? path.join(fetched.dir, source.path) : fetched.dir;
        const real = await realpath(base).catch(() => null);
        if (!real || !real.startsWith(await realpath(fetched.dir))) throw new InstallError('not_found', `path "${source.path}" not found in ${source.url}`);
      } else if (!existsSync(base)) throw new InstallError('not_found', `no such directory: ${source.path}`);
      const dirs = await findSkillRoots(base);
      const bundles = [];
      for (const dir of dirs) {
        const { files, problems } = await collectFiles(dir);
        const rel = path.relative(source.type === 'git' ? cleanup[0] : base, dir).split(path.sep).join('/');
        bundles.push({ files, problems, origin: { path: source.type === 'git' ? rel : (rel ? path.join(source.path, rel) : source.path) } });
      }
      return { bundles, meta, cleanup: done };
    }
    if (source.type === 'skill-md') {
      const { data } = await download(source.url, { env, fetchImpl });
      verifyDigest(data, source.digest, source.url);
      return { bundles: [{ files: [{ path: 'SKILL.md', data }], problems: [], origin: { url: source.url, digest: `sha256:${sha256(data)}` } }], meta: {}, cleanup: done };
    }
    if (source.type === 'archive') {
      const { data, contentType } = await download(source.url, { env, fetchImpl });
      verifyDigest(data, source.digest, source.url); // RFC: verify before unpacking
      let files;
      try { files = unpackArchive(data, { contentType, filename: new URL(source.url).pathname }); } catch (error) { throw new InstallError('invalid_archive', `${source.url}: ${error.message}`); }
      return { bundles: [{ files, problems: [], origin: { url: source.url, digest: `sha256:${sha256(data)}` } }], meta: {}, cleanup: done };
    }
    if (source.type === 'well-known') {
      const { data, url } = await download(source.url, { env, fetchImpl, accept: 'application/json' });
      let index;
      try { index = JSON.parse(data.toString('utf8')); } catch { throw new InstallError('invalid_index', `${source.url} is not valid JSON`); }
      if (!index || !Array.isArray(index.skills)) throw new InstallError('invalid_index', `${source.url} has no skills array`);
      if (index.$schema && !WELL_KNOWN_SCHEMAS.has(index.$schema)) throw new InstallError('unsupported_index', `unsupported discovery schema ${index.$schema}`);
      if (!index.$schema) throw new InstallError('unsupported_index', 'discovery index v0.1.0 (no $schema, no digests) is not supported; v0.2.0 is required');
      const bundles = [];
      const warnings = [];
      for (const entry of index.skills) {
        if (!entry || !NAME_RE.test(String(entry.name || '')) || !entry.url || !entry.digest) { warnings.push(`skipped malformed index entry ${entry && entry.name}`); continue; }
        if (!['skill-md', 'archive'].includes(entry.type)) { warnings.push(`skipped ${entry.name}: unknown type ${entry.type}`); continue; }
        if (source.only && !source.only.includes(entry.name)) continue;
        const sub = { type: entry.type, url: new URL(entry.url, url).href, digest: entry.digest };
        const fetched = await fetchSource(sub, { env, fetchImpl });
        for (const b of fetched.bundles) bundles.push({ ...b, expectedName: entry.name });
      }
      return { bundles, meta: { index: source.url }, warnings, cleanup: done };
    }
    throw new InstallError('invalid_source', `unsupported source type ${source.type}`);
  } catch (error) {
    await done();
    throw error;
  }
}

// ------------------------------------------------------------------ scope & lock

/** Resolve install locations. scope: 'user' (default) or 'project'. */
export function installScope({ scope = 'user', cwd = process.cwd(), env = process.env } = {}) {
  const base = scope === 'project' ? path.join(cwd, '.extremis') : extremisHome(env);
  return { scope, base, dir: path.join(base, 'capabilities'), lockPath: path.join(base, LOCK_FILE) };
}

export async function readLock(lockPath) {
  if (!existsSync(lockPath)) return { version: LOCK_VERSION, capabilities: {} };
  let lock;
  try { lock = JSON.parse(await readFile(lockPath, 'utf8')); } catch (error) { throw new InstallError('invalid_lock', `cannot read ${lockPath}: ${error.message}`); }
  if (!lock || typeof lock.capabilities !== 'object') throw new InstallError('invalid_lock', `${lockPath} is not an EXTREMIS lockfile`);
  return lock;
}

async function writeLock(lockPath, lock) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  const sorted = { version: LOCK_VERSION, capabilities: Object.fromEntries(Object.entries(lock.capabilities).sort(([a], [b]) => a.localeCompare(b))) };
  const tmp = `${lockPath}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmp, JSON.stringify(sorted, null, 2) + '\n');
  await rename(tmp, lockPath);
}

// ------------------------------------------------------------------ install

async function writeFiles(dir, files) {
  for (const file of files) {
    const target = path.join(dir, ...file.path.split('/'));
    if (!target.startsWith(dir + path.sep)) throw new InstallError('invalid_path', `refusing to write outside the capability: ${file.path}`);
    await mkdir(path.dirname(target), { recursive: true });
    const executable = file.mode ? (file.mode & 0o111) !== 0 : false;
    await writeFile(target, file.data, { mode: executable ? 0o755 : 0o644 });
  }
}

async function readFrontmatterName(files) {
  const skill = files.find((f) => f.path === 'SKILL.md');
  if (!skill) return null;
  const m = /^---\r?\n[\s\S]*?^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(skill.data.toString('utf8'));
  return m ? m[1].trim() : null;
}

/**
 * Install capabilities from a source.
 * Options: scope, cwd, env, skills (names to select), acceptRisk, force (overwrite
 * an existing capability from a different source), dryRun, fetchImpl.
 * Returns { source, installed: [...], skipped: [...], warnings: [...] }.
 */
export async function install(spec, options = {}) {
  const { cwd = process.cwd(), env = process.env, skills, acceptRisk = false, force = false, dryRun = false, fetchImpl } = options;
  const source = typeof spec === 'object' ? spec : parseSource(spec, { cwd, env });
  if (skills && skills.length && source.type === 'well-known') source.only = skills;
  const where = installScope(options);
  const fetched = await fetchSource(source, { env, fetchImpl });
  const result = { source: { type: source.type, spec: source.spec, url: source.url, ref: source.ref, commit: fetched.meta.commit }, scope: where.scope, installed: [], skipped: [], warnings: [...(fetched.warnings || [])] };
  try {
    if (!fetched.bundles.length) throw new InstallError('not_found', `no SKILL.md found in ${source.spec}`);
    const lock = await readLock(where.lockPath);
    const seen = new Set();
    for (const bundle of fetched.bundles) {
      const declared = await readFrontmatterName(bundle.files);
      const name = declared || (bundle.origin.path ? path.posix.basename(bundle.origin.path) : null) || bundle.expectedName;
      if (skills && skills.length && !skills.includes(name)) continue;
      if (bundle.expectedName && name !== bundle.expectedName) { result.skipped.push({ name: bundle.expectedName, reason: `index entry name does not match SKILL.md name "${name}"` }); continue; }
      if (!name || !NAME_RE.test(name) || name.length > 64) { result.skipped.push({ name: name || bundle.origin.path || '?', reason: 'invalid or missing skill name' }); continue; }
      if (seen.has(name)) { result.skipped.push({ name, reason: 'duplicate name in source' }); continue; }
      seen.add(name);

      const scan = scanFiles(bundle.files);
      if (bundle.problems.length) {
        scan.findings.unshift(...bundle.problems);
        scan.verdict = bundle.problems.some((p) => p.severity === 'critical') ? 'dangerous' : scan.verdict === 'safe' && bundle.problems.some((p) => ['high', 'medium'].includes(p.severity)) ? 'caution' : scan.verdict;
      }
      const summary = { verdict: scan.verdict, findings: scan.findings.slice(0, 50) };
      if (scan.verdict === 'dangerous') { result.skipped.push({ name, reason: 'security scan verdict is dangerous (not overridable)', scan: summary }); continue; }
      if (scan.verdict === 'caution' && !acceptRisk) { result.skipped.push({ name, reason: 'security scan needs review: re-run with --accept-risk after reading the findings', scan: summary }); continue; }

      const existing = lock.capabilities[name];
      const target = path.join(where.dir, name);
      if (existsSync(target) && !force && (!existing || existing.source.spec !== source.spec)) {
        result.skipped.push({ name, reason: `already installed at ${target}${existing ? ` from ${existing.source.spec}` : ' (not managed by EXTREMIS)'}; use --force to replace` });
        continue;
      }

      await mkdir(where.dir, { recursive: true });
      const staging = await mkdtemp(path.join(where.dir, '.staging-'));
      const stageDir = path.join(staging, name);
      try {
        await mkdir(stageDir);
        await writeFiles(stageDir, bundle.files);
        const cap = await loadCapability(stageDir, { type: where.scope, trust: 'community', dir: where.dir });
        const errors = cap.problems.filter((p) => p.level === 'error');
        if (errors.length) { result.skipped.push({ name, reason: `invalid capability: ${errors.map((e) => e.message).join('; ')}` }); continue; }
        const hash = await computeFolderHash(stageDir);
        const entry = {
          name,
          version: cap.version || null,
          source: { type: source.type, spec: source.spec, url: source.url || null, ref: source.ref || null, path: bundle.origin.path || null, commit: fetched.meta.commit || null, digest: bundle.origin.digest || null },
          hash,
          scan: { verdict: scan.verdict, findings: scan.findings.length },
          installed_at: existing ? existing.installed_at : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const changed = !existing || existing.hash !== hash;
        const shadowsBuiltin = existsSync(path.join(BUILTIN_DIR, name, 'SKILL.md'));
        if (!dryRun) {
          if (existsSync(target)) {
            const trash = path.join(staging, '.previous');
            await rename(target, trash);
            try { await rename(stageDir, target); } catch (error) { await rename(trash, target); throw error; }
          } else {
            await rename(stageDir, target);
          }
          lock.capabilities[name] = entry;
        }
        result.installed.push({ name, dir: target, version: entry.version, hash, changed, verdict: scan.verdict, findings: scan.findings.length, shadows_builtin: shadowsBuiltin || undefined, dry_run: dryRun || undefined, warnings: cap.problems.filter((p) => p.level === 'warning').map((p) => p.message) });
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    }
    if (!dryRun && result.installed.length) await writeLock(where.lockPath, lock);
    if (skills && skills.length) for (const want of skills) if (!seen.has(want)) result.skipped.push({ name: want, reason: 'not found in source' });
    return result;
  } finally {
    await fetched.cleanup();
  }
}

/** Re-install locked capabilities from their recorded sources. */
export async function update(names = [], options = {}) {
  const where = installScope(options);
  const lock = await readLock(where.lockPath);
  const targets = names.length ? names : Object.keys(lock.capabilities);
  const out = { updated: [], unchanged: [], failed: [] };
  for (const name of targets) {
    const entry = lock.capabilities[name];
    if (!entry) { out.failed.push({ name, reason: 'not installed by EXTREMIS' }); continue; }
    try {
      const source = parseSource(entry.source.spec, options);
      const res = await install(source, { ...options, skills: [name], force: true });
      const done = res.installed.find((i) => i.name === name);
      if (done) (done.changed ? out.updated : out.unchanged).push({ name, hash: done.hash, commit: res.source.commit });
      else out.failed.push({ name, reason: (res.skipped.find((s) => s.name === name) || {}).reason || 'not found in source', scan: (res.skipped.find((s) => s.name === name) || {}).scan });
    } catch (error) {
      out.failed.push({ name, reason: error.message });
    }
  }
  return out;
}

/** Remove installed capabilities. */
export async function remove(names, options = {}) {
  const where = installScope(options);
  const lock = await readLock(where.lockPath);
  const out = { removed: [], missing: [] };
  for (const name of names) {
    if (!NAME_RE.test(name)) { out.missing.push(name); continue; }
    const target = path.join(where.dir, name);
    const present = existsSync(target);
    if (!present && !lock.capabilities[name]) { out.missing.push(name); continue; }
    if (present) await rm(target, { recursive: true, force: true });
    delete lock.capabilities[name];
    out.removed.push(name);
  }
  if (out.removed.length) await writeLock(where.lockPath, lock);
  return out;
}

/** Compare installed folders against the lockfile: ok, modified, missing, untracked. */
export async function verifyLock(options = {}) {
  const where = installScope(options);
  const lock = await readLock(where.lockPath);
  const report = { lock: where.lockPath, ok: [], modified: [], missing: [], untracked: [] };
  for (const [name, entry] of Object.entries(lock.capabilities)) {
    const dir = path.join(where.dir, name);
    if (!existsSync(path.join(dir, 'SKILL.md'))) { report.missing.push(name); continue; }
    const hash = await computeFolderHash(dir);
    if (hash === entry.hash) report.ok.push(name);
    else report.modified.push({ name, expected: entry.hash, actual: hash });
  }
  if (existsSync(where.dir)) {
    for (const entry of await readdir(where.dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && !lock.capabilities[entry.name]) report.untracked.push(entry.name);
    }
  }
  report.clean = !report.modified.length && !report.missing.length;
  return report;
}

/** List installed capabilities from the lockfile. */
export async function listInstalled(options = {}) {
  const where = installScope(options);
  const lock = await readLock(where.lockPath);
  return Object.values(lock.capabilities).map((e) => ({ name: e.name, version: e.version, source: e.source.spec, commit: e.source.commit, verdict: e.scan && e.scan.verdict, updated_at: e.updated_at }));
}
