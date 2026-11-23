#!/usr/bin/env node
// EXTREMIS command-line interface. Every command maps onto the shared service
// (src/service.mjs); `--json` prints machine-readable output.

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { Extremis, VERSION } from '../src/service.mjs';
import { serveStdio } from '../src/mcp.mjs';
import { loadCapability, loadCatalog, BUILTIN_DIR } from '../src/catalog.mjs';
import { buildIndex } from '../src/search.mjs';
import { loadCases, evaluateCases, loadHoldout } from '../src/evaluate.mjs';
import { estimateTokens } from '../src/text.mjs';
import { commands as extraCommands } from '../src/cli-extra.mjs';

const HELP = `extremis ${VERSION} - capability layer for AI agents

Usage: extremis <command> [arguments] [options]

Discover and use
  search <query>             rank capabilities for a task      [--limit n] [--domain d] [--kind skill|workflow]
  plan <task>                choose and order capabilities, tools and checks
  find <task>                search skills.sh, GitHub and skill indexes; read, scan and rank SKILL.md
                             [--limit n] [--source local,skills.sh,github,index] [--index url]
                             [--owner o] [--official] [--min-installs n] [--no-deep] [--offline]
                             [--install [rank]] [--project] [--accept-risk]
  activate <name...>         print instructions, tools and resources (alias: show)
  read <name> [file]         print a bundled file (default SKILL.md)
  list                       list capabilities                 [--domain d] [--kind k]
  tools [--capability name]  list tools with input schemas
  run <tool> [k=v ...]       run a tool                        [--input JSON] [--input-file f]
  verify                     run checks                        [--capability name] [--checks file] [--param k=v]

Agents
  agents                     list built-in specialist agents (code-reviewer, security-auditor, debugger, ...)
  agent <name> [task]        print the agent's system prompt; with a task, also its plan and what to activate

Integrate
  mcp                        serve MCP over stdio              [--expose-tools none|dynamic|all]
  export <target>            write skills/config for a host    (see: extremis export --help)
  schema <format>            print tool schemas                (openai|anthropic|mcp|gemini|json)

Manage
  install <source>           install capabilities              (path, owner/repo[/path][#ref], git URL, https site)
                             [--skill name] [--project] [--accept-risk] [--force] [--dry-run]
  update [name...] | remove <name...> | lock [--verify]
  validate [dir...]          validate capability folders
  scan <dir>                 security-scan a capability package
  eval                       routing quality on authored evals and the hold-out set
  build                      regenerate registry/catalog.json and .well-known index
                             [--check] [--base-url https://host] [--out dir]
  doctor                     environment, roots and catalog diagnostics

Options
  --json                     machine-readable output
  --allow read,write,network,exec|all   permissions for tools (default: read; env EXTREMIS_ALLOW)
  --cwd <dir>                workspace root for tool file access
  -h, --help | -v, --version`;

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') { positional.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = (eq > 0 ? a.slice(2, eq) : a.slice(2)).replace(/-/g, '_');
      let value;
      if (eq > 0) value = a.slice(eq + 1);
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('-') && !BOOLEAN_FLAGS.has(key)) value = argv[++i];
      else value = true;
      if (key in flags && MULTI_FLAGS.has(key)) flags[key] = [].concat(flags[key], value);
      else flags[key] = MULTI_FLAGS.has(key) ? [value] : value;
    } else if (a === '-h') flags.help = true;
    else if (a === '-v') flags.version = true;
    else positional.push(a);
  }
  return { positional, flags };
}
const BOOLEAN_FLAGS = new Set(['json', 'help', 'version', 'verify', 'holdout', 'include_suggests', 'force', 'dry_run', 'global', 'project', 'check', 'yes', 'all', 'full', 'gateway', 'misses', 'accept_risk', 'verbose', 'local', 'user', 'official', 'offline', 'no_deep', 'no_cache']);
const MULTI_FLAGS = new Set(['param', 'skill', 'target', 'index', 'source']);

function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (/^[[{]/.test(v)) { try { return JSON.parse(v); } catch { /* keep string */ } }
  return v;
}

function kvPairs(list) {
  const out = {};
  for (const item of [].concat(list || [])) {
    const i = String(item).indexOf('=');
    if (i <= 0) throw new UsageError(`expected key=value, got "${item}"`);
    out[item.slice(0, i)] = coerce(item.slice(i + 1));
  }
  return out;
}

export class UsageError extends Error {}

const print = (s = '') => process.stdout.write(`${s}\n`);
const json = (v) => print(JSON.stringify(v, null, 2));

function wrap(text, width = 96, indent = '    ') {
  const words = String(text).split(/\s+/); const lines = []; let line = '';
  for (const w of words) { if ((line + ' ' + w).trim().length > width - indent.length) { lines.push(line.trim()); line = w; } else line += ` ${w}`; }
  if (line.trim()) lines.push(line.trim());
  return lines.map((l) => indent + l).join('\n');
}

export async function main(argv = process.argv.slice(2)) {
  const { positional, flags } = parseArgs(argv);
  const [command, ...args] = positional;
  if (flags.version || command === 'version') { print(VERSION); return 0; }
  if (!command || command === 'help' || (flags.help && !command)) { print(HELP); return 0; }
  const cwd = flags.cwd ? path.resolve(String(flags.cwd)) : process.cwd();
  const service = new Extremis({ cwd, allow: flags.allow === undefined ? undefined : String(flags.allow) });
  const asJson = Boolean(flags.json);

  switch (command) {
    case 'search': {
      const query = args.join(' ');
      if (!query) throw new UsageError('search needs a query');
      const r = await service.search(query, { limit: Number(flags.limit || 5), domain: flags.domain, kind: flags.kind });
      if (asJson) return json(r), 0;
      if (!r.results.length) { print('No capability matched.'); return 1; }
      for (const [i, c] of r.results.entries()) {
        print(`${i + 1}. ${c.name}  [${c.kind}, ${c.domain || '-'}]  score ${c.score} (${c.confidence})`);
        print(wrap(c.summary));
        if (c.tools?.length) print(`    tools: ${c.tools.join(', ')}`);
      }
      return 0;
    }
    case 'find': {
      const query = args.join(' ');
      if (!query) throw new UsageError('find needs a task or keywords, e.g. extremis find "review a terraform module"');
      const r = await service.find(query, {
        limit: Number(flags.limit || 8), sources: flags.source, indexes: flags.index, owner: flags.owner,
        officialOnly: Boolean(flags.official), minInstalls: flags.min_installs ? Number(flags.min_installs) : undefined,
        deep: !flags.no_deep, offline: flags.offline ? true : undefined, cache: flags.no_cache ? false : undefined,
      });
      let installed;
      if (flags.install !== undefined) {
        const pick = r.results[(flags.install === true ? 1 : Number(flags.install)) - 1];
        if (!pick) throw new UsageError(`no result at rank ${flags.install}`);
        if (pick.verdict === 'dangerous' && !flags.accept_risk) throw new UsageError(`${pick.id} was flagged dangerous by the scanner; review it or pass --accept-risk`);
        const { install } = await import('../src/install.mjs');
        const spec = pick.install.replace(/^extremis install /, '').split(' --skill ')[0];
        const scope = flags.project ? { scope: 'project', cwd } : { scope: 'user', cwd };
        installed = await install(spec, { ...scope, skills: pick.skill ? [pick.skill] : undefined, acceptRisk: Boolean(flags.accept_risk) });
      }
      if (asJson) return json(installed ? { ...r, installed } : r), 0;
      if (r.local.length) {
        print('Already available:');
        for (const c of r.local) print(`  ${c.name}  (${c.confidence})  ->  ${c.next}`);
        print('');
      }
      if (!r.results.length) print(r.offline ? 'Offline: only the local catalog was searched.' : 'No public skill matched.');
      for (const [i, c] of r.results.entries()) {
        const meta = [c.official ? 'official' : null, c.installs != null ? `${c.installs.toLocaleString('en-US')} installs` : null, c.stars != null ? `${c.stars.toLocaleString('en-US')} stars` : null, c.type === 'repository' ? 'repository' : null, `scan ${c.verdict}`, `${c.confidence} match`].filter(Boolean).join(' · ');
        print(`${String(i + 1).padStart(2)}. ${c.id}`);
        print(`    ${meta}`);
        if (c.summary) print(wrap(c.summary));
        for (const f of (c.findings || []).slice(0, 2)) print(`    ! ${f.severity}: ${f.message} (${f.file}:${f.line})`);
        print(`    ${c.install}`);
      }
      const used = Object.entries(r.sources).map(([k, v]) => `${k} ${v.ok ? v.results : 'failed'}`).join(', ');
      print(`\n${r.considered} candidates from ${used || 'no sources'}; ${r.deep ? 'top results read and scanned' : 'not inspected (--no-deep)'} in ${(r.ms / 1000).toFixed(1)}s`);
      for (const w of r.warnings) print(`note: ${w}`);
      if (installed) for (const i of installed.installed) print(`installed ${i.name} -> ${i.dir} [scan: ${i.verdict}]`);
      return 0;
    }
    case 'plan': {
      const task = args.join(' ');
      if (!task) throw new UsageError('plan needs a task description');
      const p = await service.plan(task, { maxCapabilities: flags.max ? Number(flags.max) : undefined });
      if (asJson) return json(p), 0;
      if (!p.steps.length) { print('No capability matched this task.'); return 1; }
      print(`Plan (${p.strategy}${p.workflow ? `: ${p.workflow}` : ''}, confidence ${p.confidence})`);
      for (const [i, s] of p.steps.entries()) {
        print(`${i + 1}. [${s.phase}] ${s.id}${s.capability && s.capability !== s.id ? ` (${s.capability})` : ''}${s.optional ? ' (optional)' : ''}`);
        print(wrap(s.goal));
        if (s.tools.length) print(`    tools: ${s.tools.join(', ')}`);
      }
      if (p.verification.length) { print('\nVerify:'); for (const v of p.verification) print(`  - ${v.type === 'tool' ? `${v.description || v.tool} (${v.tool})` : v.statement}`); }
      print(`\nPermissions: ${p.permissions.join(', ') || 'none'}${p.blocked_permissions ? `  (not allowed: ${p.blocked_permissions.join(', ')})` : ''}`);
      if (p.alternatives.length) print(`Alternatives: ${p.alternatives.map((a) => a.name).join(', ')}`);
      return 0;
    }
    case 'agents': {
      const list = await service.agents();
      if (asJson) return json(list), 0;
      for (const a of list) print(`${a.name.padEnd(20)} ${a.description.split(/[.:] /)[0].replace(/^Use (to|for) /, '').replace(/\.$/, '')}`);
      print(`\n${list.length} agents. Brief one: extremis agent <name> "<task>"  |  Claude Code: extremis export subagents`);
      return 0;
    }
    case 'agent': {
      if (!args[0]) throw new UsageError('agent needs a name (see: extremis agents)');
      const b = await service.agent(args[0], args.slice(1).join(' '));
      if (asJson) return json(b), 0;
      print(b.system_prompt);
      if (b.task) {
        print(`\n---\nTask: ${b.task}`);
        if (b.plan?.steps?.length) { print(`Plan (${b.plan.strategy}${b.plan.workflow ? `: ${b.plan.workflow}` : ''}, confidence ${b.plan.confidence}):`); for (const [i, st] of b.plan.steps.entries()) print(`  ${i + 1}. [${st.phase}] ${st.id}${st.tools.length ? `  tools: ${st.tools.join(', ')}` : ''}`); }
        print(`Activate: ${b.activate.join(', ')}`);
        if (b.outside_profile.length) print(`Also planned (outside this agent's profile): ${b.outside_profile.join(', ')}`);
      }
      return 0;
    }
    case 'show':
    case 'activate': {
      if (!args.length) throw new UsageError(`${command} needs at least one capability name`);
      const a = await service.activate(args, { includeSuggests: flags.include_suggests, maxBodyTokens: flags.max_tokens ? Number(flags.max_tokens) : undefined });
      if (asJson) return json(a), 0;
      for (const c of a.capabilities) {
        print(`${'='.repeat(72)}\n${c.name} ${c.version || ''}${c.requested ? '' : `  (dependency of ${c.required_by.join(', ')})`}\n${c.summary}`);
        print(`permissions: ${c.permissions.join(', ') || 'none'}  risk: ${c.risk}  digest: ${c.digest.slice(0, 19)}…`);
        if (c.tools.length) print(`tools: ${c.tools.map((t) => t.id).join(', ')}`);
        if (c.resources.length) print(`resources: ${c.resources.map((r) => r.path).join(', ')}`);
        print(`${'-'.repeat(72)}\n${c.instructions}\n`);
      }
      if (!a.ok) print(`warning: ${JSON.stringify({ missing: a.missing, conflicts: a.conflicts, cycles: a.cycles })}`);
      process.stderr.write(`(~${a.context_tokens} tokens)\n`);
      return a.ok ? 0 : 1;
    }
    case 'read': {
      if (!args[0]) throw new UsageError('read needs a capability name');
      const r = await service.read(args[0], args[1] || 'SKILL.md');
      if (asJson) return json(r), 0;
      process.stdout.write(r.encoding === 'base64' ? Buffer.from(r.content, 'base64') : r.content);
      return 0;
    }
    case 'list': {
      const list = await service.list({ domain: flags.domain, kind: flags.kind });
      if (asJson) return json(list), 0;
      const byDomain = new Map();
      for (const c of list) { if (!byDomain.has(c.domain)) byDomain.set(c.domain, []); byDomain.get(c.domain).push(c); }
      for (const [d, caps] of [...byDomain].sort()) {
        print(`${d || '(no domain)'}`);
        for (const c of caps) print(`  ${c.name.padEnd(30)} ${c.kind === 'workflow' ? '[workflow] ' : ''}${c.summary}`);
      }
      print(`\n${list.length} capabilities`);
      return 0;
    }
    case 'tools': {
      const list = await service.tools({ capability: flags.capability });
      if (asJson) return json(list), 0;
      for (const t of list) print(`${t.id.padEnd(28)} [${t.permissions.join(',') || '-'}] ${t.description}`);
      return 0;
    }
    case 'tool': {
      const t = await service.tool(args[0]);
      if (!t) { print(`unknown tool ${args[0]}`); return 1; }
      json(t); return 0;
    }
    case 'run': {
      const id = args[0];
      if (!id) throw new UsageError('run needs a tool id, e.g. extremis run data.profile path=data.csv');
      let input = {};
      if (flags.input) input = JSON.parse(String(flags.input));
      if (flags.input_file) input = JSON.parse(await readFile(path.resolve(cwd, String(flags.input_file)), 'utf8'));
      if (flags.input === '-' ) input = JSON.parse(await readStdin());
      Object.assign(input, kvPairs(args.slice(1)));
      const r = await service.run(id, input, { timeoutMs: flags.timeout ? Number(flags.timeout) : undefined });
      json(asJson ? r : (r.ok ? r.result : r));
      return r.ok ? 0 : 1;
    }
    case 'verify': {
      let checks;
      if (flags.checks) checks = JSON.parse(await readFile(path.resolve(cwd, String(flags.checks)), 'utf8'));
      if (!checks && !flags.capability) throw new UsageError('verify needs --capability <name> or --checks <file.json>');
      const r = await service.verify({ checks, capability: flags.capability, params: kvPairs(flags.param) });
      if (asJson) return json(r), r.ok ? 0 : 1;
      for (const x of r.results) print(`${x.status.toUpperCase().padEnd(8)} ${x.statement || x.description}${x.failures ? `: ${x.failures.map((f) => `${f.path} ${f.reason}`).join('; ')}` : ''}${x.needs ? ` (needs ${x.needs.join(', ')})` : ''}${x.error ? `: ${x.error.message}` : ''}`);
      print(`\n${r.passed} passed, ${r.failed} failed, ${r.errors} errors, ${r.skipped} skipped, ${r.manual} manual`);
      return r.ok ? 0 : 1;
    }
    case 'mcp': {
      const expose = String(flags.expose_tools || process.env.EXTREMIS_EXPOSE_TOOLS || 'none');
      if (!['none', 'dynamic', 'all'].includes(expose)) throw new UsageError('--expose-tools must be none, dynamic or all');
      await serveStdio({ cwd, allow: flags.allow === undefined ? undefined : String(flags.allow), exposeTools: expose });
      return 0;
    }
    case 'validate': {
      const dirs = args.length ? args.map((d) => path.resolve(cwd, d)) : null;
      const results = [];
      if (dirs) {
        for (const d of dirs) {
          const catalog = await loadCatalog({ roots: [{ dir: d, type: 'external', trust: 'trusted' }], strict: false });
          if (!catalog.size && !catalog.diagnostics.length) {
            try { const cap = await loadCapability(d); results.push({ name: cap.name, dir: d, problems: cap.problems }); } catch (err) { results.push({ dir: d, problems: [{ level: 'error', message: err.message }] }); }
            continue;
          }
          for (const c of catalog.list()) results.push({ name: c.name, dir: c.dir, problems: c.problems });
          for (const diag of catalog.diagnostics) if (!catalog.has(diag.capability)) results.push({ dir: diag.path, problems: [diag] });
        }
      } else {
        const catalog = await loadCatalog({ roots: [{ dir: BUILTIN_DIR, type: 'builtin', trust: 'builtin' }], strict: false });
        for (const c of catalog.list()) results.push({ name: c.name, dir: c.dir, problems: c.problems });
        for (const diag of catalog.diagnostics) if (!catalog.has(diag.capability)) results.push({ dir: diag.path, problems: [diag] });
      }
      const { lintCapabilities } = await import('../src/lint.mjs');
      const lint = await lintCapabilities(results.filter((r) => r.name).map((r) => r.dir));
      for (const r of results) r.problems = [...r.problems, ...(lint.get(r.dir) || [])];
      if (!dirs) {
        const { loadAgents, checkAgentReferences } = await import('../src/agents.mjs');
        const catalog = await loadCatalog({ roots: [{ dir: BUILTIN_DIR, type: 'builtin', trust: 'builtin' }], strict: false });
        const { agents, diagnostics } = await loadAgents({ cwd, user: false, project: false });
        const problems = [...diagnostics.map((d) => ({ level: 'error', message: d.message })), ...checkAgentReferences(agents, catalog).map((message) => ({ level: 'error', message }))];
        results.push({ dir: 'agents', agents: agents.size, problems });
      }
      const errors = results.reduce((n, r) => n + r.problems.filter((p) => p.level === 'error').length, 0);
      const warnings = results.reduce((n, r) => n + r.problems.filter((p) => p.level === 'warning').length, 0);
      if (asJson) json({ ok: !errors, errors, warnings, results });
      else {
        for (const r of results) for (const p of r.problems) print(`${p.level.padEnd(7)} ${r.name || r.dir}: ${p.message}`);
        print(`${results.filter((r) => !('agents' in r)).length} capabilities${results.find((r) => 'agents' in r) ? `, ${results.find((r) => 'agents' in r).agents} agents` : ''}, ${errors} errors, ${warnings} warnings`);
      }
      return errors ? 1 : 0;
    }
    case 'eval': {
      const catalog = await loadCatalog({ roots: [{ dir: BUILTIN_DIR, type: 'builtin', trust: 'builtin' }] });
      const { getBuiltinTool } = await import('../src/tools/index.mjs');
      const index = buildIndex(catalog, { describeTool: (id) => { const t = getBuiltinTool(id); return t ? `${id.replace(/[._]/g, ' ')} ${t.title} ${t.description}` : id; } });
      const fixtures = evaluateCases(index, await loadCases(catalog));
      const holdout = evaluateCases(index, await loadHoldout(path.join(path.dirname(BUILTIN_DIR), 'evals', 'routing-holdout.json')));
      const contextCards = catalog.list().map((c) => `${c.name}: ${c.summary}`).join('\n');
      const report = { fixtures: { ...fixtures, misses: flags.misses ? fixtures.misses : fixtures.misses.length }, holdout: { ...holdout, misses: flags.misses ? holdout.misses : holdout.misses.length }, catalog_card_tokens: estimateTokens(contextCards) };
      if (asJson) return json(report), 0;
      const fmt = (r) => `Hit@1 ${r.hit_at_1}%  Hit@5 ${r.hit_at_5}%  MRR ${r.mrr}${r.negatives ? `  FA@1 ${r.false_activation_at_1}%  FA@5 ${r.false_activation_at_5}%` : ''}  (${r.positives} positive${r.negatives ? `, ${r.negatives} negative` : ''})`;
      print(`authored evals  ${fmt(fixtures)}`);
      print(`hold-out set    ${fmt(holdout)}`);
      print(`catalog cards   ~${report.catalog_card_tokens} tokens for ${catalog.size} capabilities`);
      if (flags.misses) for (const m of holdout.misses) print(`  miss: "${m.prompt}" expected ${m.expected.join('|')} got ${m.got.join(', ')}`);
      return 0;
    }
    case 'doctor': {
      const stats = await service.stats();
      const diags = await service.diagnostics();
      const report = { ...stats, node: process.version, platform: `${process.platform}-${process.arch}`, cwd, diagnostics: diags };
      if (asJson) return json(report), 0;
      print(`extremis ${stats.version} on node ${process.version} (${report.platform})`);
      print(`capabilities: ${stats.capabilities} (${stats.workflows} workflows), built-in tools: ${stats.builtin_tools}`);
      print(`allowed permissions: ${stats.allow.join(', ')}`);
      print('roots (highest precedence first):');
      for (const r of stats.roots) print(`  ${r.type.padEnd(8)} ${r.dir}`);
      if (diags.length) { print('diagnostics:'); for (const d of diags) print(`  ${d.level} ${d.capability || d.path}: ${d.message}`); } else print('diagnostics: none');
      return 0;
    }
    default: {
      const extra = extraCommands[command];
      if (extra) return extra({ args, flags, cwd, service, asJson, print, json });
      throw new UsageError(`unknown command "${command}" (see extremis --help)`);
    }
  }
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain || process.argv[1]?.endsWith('extremis') || process.argv[1]?.endsWith('extremis.mjs')) {
  process.stdout.on('error', (err) => { if (err.code === 'EPIPE') process.exit(0); throw err; });
  main().then((code) => { if (typeof code === 'number') process.exitCode = code; }).catch((err) => {
    if (err instanceof UsageError) { process.stderr.write(`extremis: ${err.message}\n`); process.exitCode = 2; return; }
    process.stderr.write(`extremis: ${err.code ? `[${err.code}] ` : ''}${err.message}\n`);
    if (process.env.EXTREMIS_DEBUG) process.stderr.write(`${err.stack}\n`);
    process.exitCode = 1;
  });
}
