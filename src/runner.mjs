// Tool runner. Every tool call goes through the same gate:
//   1. resolve the tool (built-in id or a capability's script tool)
//   2. validate input against its JSON Schema (defaults applied)
//   3. check the tool's permissions against the caller's allowlist
//   4. execute with a confined context: file access only inside the workspace root,
//      network only to public addresses, subprocesses without a shell and with a
//      scrubbed environment, a timeout and an output cap
// The host agent stays the authority on *whether* to call a tool; the runner makes
// sure a call can only do what the tool declared.

import { readFile, writeFile, mkdir, realpath, stat, readdir, lstat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import { validate, formatErrors } from './jsonschema.mjs';
import { getBuiltinTool } from './tools/index.mjs';
import { ToolInputError } from './tools/util.mjs';
import { SqlError } from './tools/minisql.mjs';

export const PERMISSIONS = ['read', 'write', 'network', 'exec'];
export const DEFAULT_ALLOW = ['read'];

export class ToolError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}

/** Parse an allowlist from a comma string, array or EXTREMIS_ALLOW. */
export function parseAllow(value, env = process.env) {
  const raw = value ?? env.EXTREMIS_ALLOW;
  if (raw === undefined || raw === null || raw === '') return [...DEFAULT_ALLOW];
  const list = (Array.isArray(raw) ? raw : String(raw).split(',')).map((s) => s.trim()).filter(Boolean);
  if (list.includes('all')) return [...PERMISSIONS];
  for (const p of list) if (!PERMISSIONS.includes(p)) throw new ToolError('invalid_permission', `unknown permission "${p}" (use ${PERMISSIONS.join(', ')})`);
  return [...new Set(list)];
}

const DENIED_SEGMENTS = ['.ssh', '.gnupg', '.aws', '.azure', '.kube', '.docker', '.git-credentials', '.netrc', '.npmrc', '.pypirc'];

function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Resolve the tool definition for an id. */
export function resolveTool(id, catalog) {
  const builtin = getBuiltinTool(id);
  if (builtin) return { ...builtin, kind: 'builtin' };
  if (catalog) {
    const owner = catalog.get(id.split('.')[0]);
    const tool = owner?.tools.find((t) => !t.builtin && t.id === id);
    if (tool) {
      return {
        id, kind: 'script', title: tool.name, description: tool.description, owner,
        permissions: [...new Set(['exec', ...(tool.permissions || [])])],
        input_schema: tool.input_schema || { type: 'object' }, command: tool.command, timeout_ms: tool.timeout_ms, input: tool.input,
      };
    }
  }
  return null;
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = address.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('ff');
}

export async function assertPublicUrl(url, env = process.env) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new ToolError('invalid_url', `invalid URL: ${url}`); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new ToolError('invalid_url', 'only http and https URLs are allowed');
  if (env.EXTREMIS_ALLOW_PRIVATE_NETWORK === '1') return parsed;
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host === 'metadata.google.internal') {
    throw new ToolError('blocked_address', `refusing to fetch private host ${host}`);
  }
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => { throw new ToolError('dns_error', `cannot resolve ${host}`); });
  for (const { address } of addresses) if (isPrivateAddress(address)) throw new ToolError('blocked_address', `refusing to fetch ${host} (resolves to private address ${address})`);
  return parsed;
}

/** Build the confined execution context handed to built-in tools. */
export function createContext({ cwd = process.cwd(), root, allow = DEFAULT_ALLOW, env = process.env, maxFileBytes = 50 * 1024 * 1024, signal } = {}) {
  const workspace = path.resolve(root || cwd);
  const allowed = new Set(allow);
  const need = (perm, what) => { if (!allowed.has(perm)) throw new ToolError('permission_denied', `${what} requires the "${perm}" permission (allowed: ${[...allowed].join(', ') || 'none'})`); };
  async function confine(p, { mustExist = true } = {}) {
    if (typeof p !== 'string' || !p) throw new ToolError('invalid_path', 'path must be a non-empty string');
    const abs = path.resolve(cwd, p);
    if (!isInside(workspace, abs)) throw new ToolError('path_outside_workspace', `path is outside the workspace root (${workspace}): ${p}`);
    const realRoot = await realpath(workspace).catch(() => workspace);
    let real;
    if (mustExist) {
      real = await realpath(abs).catch(() => { throw new ToolError('not_found', `no such file or directory: ${p}`); });
    } else {
      // Resolve the nearest existing ancestor before creating anything. Checking
      // only the lexical path lets a symlinked parent escape the workspace.
      let cursor = abs;
      const missing = [];
      while (true) {
        try {
          const info = await lstat(cursor);
          if (info.isSymbolicLink()) throw new ToolError('path_symlink', `refusing to write through a symbolic link: ${p}`);
          break;
        } catch (error) {
          if (error instanceof ToolError) throw error;
          if (error.code !== 'ENOENT') throw error;
          const parent = path.dirname(cursor);
          if (parent === cursor) throw new ToolError('invalid_path', `cannot resolve a safe parent for: ${p}`);
          missing.unshift(path.basename(cursor));
          cursor = parent;
        }
      }
      const realAncestor = await realpath(cursor).catch(() => {
        throw new ToolError('not_found', `no existing parent directory for: ${p}`);
      });
      if (!isInside(realRoot, realAncestor)) {
        throw new ToolError('path_outside_workspace', `path is outside the workspace root (${workspace}): ${p}`);
      }
      real = path.join(realAncestor, ...missing);
    }
    if (!isInside(realRoot, real)) throw new ToolError('path_outside_workspace', `path is outside the workspace root (${workspace}): ${p}`);
    const segments = path.relative(realRoot, real).split(path.sep);
    if (segments.some((s) => DENIED_SEGMENTS.includes(s))) throw new ToolError('path_denied', `access to credential stores is not allowed: ${p}`);
    return real;
  }
  const ctx = {
    cwd, root: workspace, allow: [...allowed], env, signal,
    async resolvePath(p) { need('read', 'reading files'); return confine(p); },
    async readFile(p) {
      need('read', 'reading files');
      const real = await confine(p);
      const info = await stat(real);
      if (info.isDirectory()) throw new ToolError('is_directory', `${p} is a directory`);
      if (info.size > maxFileBytes) throw new ToolError('file_too_large', `${p} is ${info.size} bytes (limit ${maxFileBytes})`);
      return readFile(real);
    },
    async exists(p) { try { await confine(p); return true; } catch { return false; } },
    async writeFile(p, content) {
      need('write', 'writing files');
      const target = await confine(p, { mustExist: false });
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
      return path.relative(workspace, target);
    },
    async walk(dir = '.', { maxFiles = 20000, ignore = [] } = {}) {
      need('read', 'listing files');
      const start = await confine(dir);
      const out = [];
      const skip = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', '.mypy_cache', '.pytest_cache', 'dist', 'build', '.next', '.nuxt', 'target', 'vendor', '.tox', '.gradle', '.idea', 'coverage', '.cache', '.terraform', ...ignore]);
      async function recurse(abs, rel) {
        if (out.length >= maxFiles) return;
        let entries;
        try { entries = await readdir(abs, { withFileTypes: true }); } catch { return; }
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
          if (out.length >= maxFiles) return;
          const childRel = rel ? `${rel}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            if (skip.has(entry.name) || DENIED_SEGMENTS.includes(entry.name)) continue;
            await recurse(path.join(abs, entry.name), childRel);
          } else if (entry.isFile()) {
            const info = await lstat(path.join(abs, entry.name)).catch(() => null);
            out.push({ path: childRel, size: info ? info.size : 0 });
          }
        }
      }
      await recurse(start, '');
      return { root: path.relative(workspace, start) || '.', files: out, truncated: out.length >= maxFiles };
    },
    async fetch(url, options = {}) {
      need('network', 'network access');
      const maxBytes = options.maxBytes || 5 * 1024 * 1024;
      let current = url;
      let method = (options.method || 'GET').toUpperCase();
      let body = options.body;
      let headers = { 'user-agent': 'extremis/1 (+https://github.com/FAHTHIZ/EXTREMIS)', ...(options.headers || {}) };
      const redirects = [];
      for (let hop = 0; hop <= 5; hop += 1) {
        await assertPublicUrl(current, env);
        const response = await fetch(current, { method, headers, body, redirect: 'manual', signal: options.signal || AbortSignal.timeout(options.timeoutMs || 15000) });
        if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get('location') && options.followRedirects !== false) {
          const next = new URL(response.headers.get('location'), current);
          redirects.push({ status: response.status, from: current, to: next.toString() });
          if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) { method = 'GET'; body = undefined; }
          if (next.origin !== new URL(current).origin) headers = Object.fromEntries(Object.entries(headers).filter(([k]) => !/^(authorization|cookie|proxy-authorization)$/i.test(k)));
          current = next.toString();
          await response.body?.cancel().catch(() => {});
          continue;
        }
        const reader = response.body?.getReader();
        const chunks = []; let size = 0; let truncated = false;
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > maxBytes) { truncated = true; chunks.push(value.slice(0, value.length - (size - maxBytes))); await reader.cancel().catch(() => {}); break; }
            chunks.push(value);
          }
        }
        return { url: current, status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.concat(chunks.map((c) => Buffer.from(c))), truncated, redirects };
      }
      throw new ToolError('too_many_redirects', 'more than 5 redirects');
    },
  };
  return ctx;
}

function capOutput(value, maxChars) {
  const text = JSON.stringify(value);
  if (text === undefined || text.length <= maxChars) return { value, truncated: false };
  // Trim the largest string or array fields until the payload fits.
  const copy = structuredClone(value);
  const shrink = (obj, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 4) return;
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && v.length > 2000) obj[k] = `${v.slice(0, Math.max(2000, Math.floor(maxChars / 4)))}… [truncated ${v.length} chars]`;
      else if (Array.isArray(v) && v.length > 50) { obj[k] = v.slice(0, 50); obj[`${k}_truncated`] = v.length; }
      else shrink(v, depth + 1);
    }
  };
  shrink(copy);
  const again = JSON.stringify(copy);
  if (again.length <= maxChars) return { value: copy, truncated: true };
  return { value: { truncated_json: again.slice(0, maxChars) }, truncated: true };
}

const SAFE_ENV = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'PATHEXT', 'TERM'];

function runScript(tool, input, ctx, timeoutMs) {
  return new Promise((resolve, reject) => {
    const skillDir = tool.owner.dir;
    const subst = (s) => s.replace(/\$\{(SKILL_DIR|CAPABILITY_DIR)\}|\{baseDir\}/g, skillDir);
    const [cmd, ...rest] = tool.command.map(subst);
    const args = tool.input === 'args' ? [...rest, ...Object.entries(input).flatMap(([k, v]) => [`--${k}`, typeof v === 'string' ? v : JSON.stringify(v)])] : rest;
    const env = Object.fromEntries(SAFE_ENV.filter((k) => ctx.env[k]).map((k) => [k, ctx.env[k]]));
    Object.assign(env, { EXTREMIS_CAPABILITY_DIR: skillDir, EXTREMIS_WORKSPACE: ctx.root, EXTREMIS_ALLOW: ctx.allow.join(',') });
    const child = spawn(cmd, args, { cwd: ctx.cwd, env, shell: false, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const out = []; const err = []; let size = 0; let killed = false;
    const limit = 4 * 1024 * 1024;
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', (d) => { size += d.length; if (size <= limit) out.push(d); else if (!killed) { killed = true; child.kill('SIGKILL'); } });
    child.stderr.on('data', (d) => { if (err.reduce((a, b) => a + b.length, 0) < 64 * 1024) err.push(d); });
    child.on('error', (e) => { clearTimeout(timer); reject(new ToolError('spawn_failed', `cannot start ${cmd}: ${e.message}`)); });
    child.on('close', (code, signalName) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(out).toString('utf8');
      const stderr = Buffer.concat(err).toString('utf8');
      if (killed) return reject(new ToolError(size > limit ? 'output_too_large' : 'timeout', size > limit ? 'script output exceeded 4 MiB' : `script exceeded ${timeoutMs} ms`));
      let parsed = null;
      try { parsed = JSON.parse(stdout); } catch { /* plain text output */ }
      resolve({ exit_code: code, signal: signalName, ...(parsed !== null ? { output: parsed } : { stdout }), ...(stderr ? { stderr: stderr.slice(0, 8000) } : {}) });
    });
    if (tool.input !== 'args') child.stdin.end(JSON.stringify(input));
    else child.stdin.end();
  });
}

/**
 * Run a tool. Never throws for tool failures: returns { ok, tool, result?, error?, duration_ms }.
 * options: catalog, cwd, root, allow, env, timeoutMs, maxOutputChars
 */
export async function runTool(id, input = {}, options = {}) {
  const started = Date.now();
  const envelope = (extra) => ({ tool: id, duration_ms: Date.now() - started, ...extra });
  try {
    const tool = resolveTool(id, options.catalog);
    if (!tool) throw new ToolError('unknown_tool', `unknown tool "${id}"`);
    const allow = options.allow ? parseAllow(options.allow, options.env) : parseAllow(undefined, options.env);
    const missing = tool.permissions.filter((p) => !allow.includes(p));
    if (missing.length) throw new ToolError('permission_denied', `tool ${id} needs permission(s) ${missing.join(', ')}; allowed: ${allow.join(', ') || 'none'}. Grant with --allow or EXTREMIS_ALLOW.`);
    const checked = validate(tool.input_schema || { type: 'object' }, input ?? {}, { applyDefaults: true });
    if (!checked.valid) throw new ToolError('invalid_input', `invalid input for ${id}: ${formatErrors(checked.errors)}`, checked.errors);
    const ctx = createContext({ ...options, allow });
    const timeoutMs = Math.min(options.timeoutMs || tool.timeout_ms || 60000, 600000);
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new ToolError('timeout', `tool ${id} exceeded ${timeoutMs} ms`)), timeoutMs); });
    let result;
    try {
      result = await Promise.race([tool.kind === 'script' ? runScript(tool, checked.value, ctx, timeoutMs) : tool.run(checked.value, ctx), timeout]);
    } finally { clearTimeout(timer); }
    const capped = capOutput(result, options.maxOutputChars || 200000);
    return envelope({ ok: true, result: capped.value, ...(capped.truncated ? { truncated: true } : {}) });
  } catch (error) {
    const code = error instanceof ToolError ? error.code : error instanceof ToolInputError || error instanceof SqlError || error instanceof SyntaxError ? 'invalid_input' : 'tool_failed';
    return envelope({ ok: false, error: { code, message: error.message } });
  }
}

