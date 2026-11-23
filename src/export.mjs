// Export the catalog into host-native locations and configuration formats.
//
//   skills     copy capability folders to .agents/skills/<name>   (Codex, Cursor, Gemini CLI, ...)
//   claude     copy capability folders to .claude/skills/<name>   (Claude Code)
//   mcp        print an MCP server entry for a host               (--host claude|cursor|vscode|codex)
//   subagents  write the built-in agents as Claude Code subagents to .claude/agents/<name>.md
//   agents-md  print, or with --write insert, an AGENTS.md block that points agents at the gateway
//
// Copies exclude evals/ (authoring fixtures, not instructions). Existing folders are
// only replaced when their content differs and --force is given; identical folders
// are reported as unchanged, so the command is safe to re-run.

import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BUILTIN_DIR, PACKAGE_ROOT, loadCatalog } from './catalog.mjs';

export const GATEWAY_SKILL_DIR = path.join(PACKAGE_ROOT, 'skills');
import { computeFolderHash } from './hash.mjs';
import { loadAgents, renderClaudeAgent } from './agents.mjs';

export const EXPORT_TARGETS = ['skills', 'claude', 'subagents', 'mcp', 'agents-md'];
export const MCP_HOSTS = ['claude', 'cursor', 'vscode', 'codex'];
const SKILL_DIRS = { skills: '.agents/skills', claude: '.claude/skills' };
const MARK_START = '<!-- extremis:start -->';
const MARK_END = '<!-- extremis:end -->';
export const REMOTE_COMMAND = { command: 'npx', args: ['-y', 'github:FAHTHIZ/EXTREMIS', 'mcp'] };

export class ExportError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function selectCaps(catalog, { skills, domain, kind } = {}) {
  let caps = catalog.list();
  const wanted = skills ? String(skills).split(',').map((s) => s.trim()).filter(Boolean) : null;
  if (wanted) {
    const missing = wanted.filter((n) => !catalog.get(n));
    if (missing.length) throw new ExportError('not_found', `unknown capability: ${missing.join(', ')}`);
    caps = wanted.map((n) => catalog.get(n));
  }
  if (domain) caps = caps.filter((c) => c.domain === domain);
  if (kind) caps = caps.filter((c) => c.kind === kind);
  return caps.sort((a, b) => a.name.localeCompare(b.name));
}

async function hashWithoutEvals(dir) {
  // Hash the folder as it would be exported (evals/ excluded).
  const tmp = path.join(os.tmpdir(), `extremis-export-hash-${process.pid}-${Math.random().toString(36).slice(2)}`);
  await cp(dir, tmp, { recursive: true, filter: (src) => !path.relative(dir, src).split(path.sep).includes('evals') });
  try { return await computeFolderHash(tmp); } finally { await rm(tmp, { recursive: true, force: true }); }
}

/**
 * Copy capability folders into a host skills directory.
 * @returns {{ dir, written: string[], unchanged: string[], conflicts: string[] }}
 */
export async function exportSkills({ target = 'skills', cwd = process.cwd(), dir, user = false, force = false, dryRun = false, gateway = false, skills, domain, kind, catalog } = {}) {
  if (!SKILL_DIRS[target]) throw new ExportError('invalid_target', `skill export target must be one of ${Object.keys(SKILL_DIRS).join(', ')}`);
  catalog = catalog || await loadCatalog({ roots: [{ dir: gateway ? GATEWAY_SKILL_DIR : BUILTIN_DIR, type: 'builtin', trust: 'builtin' }] });
  const base = dir ? path.resolve(cwd, dir) : path.join(user ? os.homedir() : cwd, SKILL_DIRS[target]);
  const result = { dir: base, written: [], unchanged: [], conflicts: [], dry_run: Boolean(dryRun) };
  for (const cap of selectCaps(catalog, { skills, domain, kind })) {
    const dest = path.join(base, cap.name);
    if (existsSync(dest)) {
      const [a, b] = await Promise.all([hashWithoutEvals(cap.dir), computeFolderHash(dest)]);
      if (a === b) { result.unchanged.push(cap.name); continue; }
      if (!force) { result.conflicts.push(cap.name); continue; }
      if (!dryRun) await rm(dest, { recursive: true, force: true });
    }
    if (!dryRun) {
      await mkdir(base, { recursive: true });
      await cp(cap.dir, dest, { recursive: true, filter: (src) => !path.relative(cap.dir, src).split(path.sep).includes('evals') });
    }
    result.written.push(cap.name);
  }
  return result;
}

/** MCP server configuration for a host. `local` points at this checkout instead of npx. */
export function mcpConfig(host = 'claude', { local = false, exposeTools } = {}) {
  if (!MCP_HOSTS.includes(host)) throw new ExportError('invalid_host', `host must be one of ${MCP_HOSTS.join(', ')}`);
  const base = local ? { command: 'node', args: [path.join(PACKAGE_ROOT, 'bin', 'extremis.mjs'), 'mcp'] } : { ...REMOTE_COMMAND, args: [...REMOTE_COMMAND.args] };
  if (exposeTools) base.args.push(`--expose-tools=${exposeTools}`);
  if (host === 'vscode') return { format: 'json', file: '.vscode/mcp.json', content: { servers: { extremis: { type: 'stdio', ...base } } } };
  if (host === 'codex') {
    const toml = `[mcp_servers.extremis]\ncommand = ${JSON.stringify(base.command)}\nargs = [${base.args.map((a) => JSON.stringify(a)).join(', ')}]\n`;
    return { format: 'toml', file: '~/.codex/config.toml', content: toml };
  }
  return { format: 'json', file: host === 'cursor' ? '.cursor/mcp.json' : '.mcp.json', content: { mcpServers: { extremis: base } } };
}

/** The AGENTS.md block, delimited so it can be updated in place. */
export function agentsMdBlock() {
  return `${MARK_START}
## Capabilities (EXTREMIS)

This project uses [EXTREMIS](https://github.com/FAHTHIZ/EXTREMIS) for reusable capabilities. Do not load every skill up front.

1. Find capabilities for the task: \`extremis_plan\` (or \`npx extremis plan "<task>"\`); use \`extremis_search\` to browse.
2. Load only what the plan selects: \`extremis_activate\` returns instructions, tool schemas and resources.
3. Run listed tools with \`extremis_run\`; they are permission-gated (read by default; write, network and exec need explicit approval).
4. Before reporting done, run \`extremis_verify\` with the plan's checks and state any manual checks you could not run.
${MARK_END}
`;
}

/** Insert or replace the EXTREMIS block in an AGENTS.md file. Returns 'created'|'updated'|'unchanged'. */
export async function writeAgentsMd(file) {
  const block = agentsMdBlock();
  if (!existsSync(file)) { await writeFile(file, `# AGENTS.md\n\n${block}`); return 'created'; }
  const text = await readFile(file, 'utf8');
  const start = text.indexOf(MARK_START);
  const end = text.indexOf(MARK_END);
  let next;
  if (start >= 0 && end > start) next = text.slice(0, start) + block.trimEnd() + text.slice(end + MARK_END.length);
  else next = `${text.replace(/\s*$/, '')}\n\n${block}`;
  if (next === text) return 'unchanged';
  await writeFile(file, next);
  return 'updated';
}

/**
 * Write agents as Claude Code subagents (.claude/agents/<name>.md).
 * @returns {{ dir, written: string[], unchanged: string[], conflicts: string[] }}
 */
export async function exportSubagents({ cwd = process.cwd(), dir, user = false, force = false, dryRun = false, agents: only } = {}) {
  const { agents } = await loadAgents({ cwd, user: false, project: false });
  const base = dir ? path.resolve(cwd, dir) : path.join(user ? os.homedir() : cwd, '.claude', 'agents');
  const wanted = only ? String(only).split(',').map((s) => s.trim()).filter(Boolean) : null;
  if (wanted) {
    const missing = wanted.filter((n) => !agents.has(n));
    if (missing.length) throw new ExportError('not_found', `unknown agent: ${missing.join(', ')}`);
  }
  const result = { dir: base, written: [], unchanged: [], conflicts: [], dry_run: Boolean(dryRun) };
  for (const a of [...agents.values()].filter((x) => !wanted || wanted.includes(x.name))) {
    const file = path.join(base, `${a.name}.md`);
    const text = renderClaudeAgent(a);
    if (existsSync(file)) {
      const current = await readFile(file, 'utf8');
      if (current === text) { result.unchanged.push(a.name); continue; }
      if (!force) { result.conflicts.push(a.name); continue; }
    }
    if (!dryRun) { await mkdir(base, { recursive: true }); await writeFile(file, text); }
    result.written.push(a.name);
  }
  return result;
}
