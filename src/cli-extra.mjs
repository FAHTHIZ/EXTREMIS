// CLI commands outside the core discover/use switch: schema export, installation
// management and security scanning.

import path from 'node:path';
import { exportSchemas, SCHEMA_FORMATS } from './schemas.mjs';
import { install, update, remove, verifyLock, listInstalled, installScope } from './install.mjs';
import { scanDirectory } from './scan.mjs';
import { build } from './build.mjs';
import { EXPORT_TARGETS, MCP_HOSTS, exportSkills, mcpConfig, agentsMdBlock, writeAgentsMd } from './export.mjs';

const scopeOf = (flags, cwd) => ({ scope: flags.project ? 'project' : 'user', cwd });

function printFindings(print, findings, limit = 20) {
  for (const f of findings.slice(0, limit)) print(`    [${f.severity}] ${f.rule} ${f.file}${f.line ? ':' + f.line : ''} - ${f.message}${f.match ? ` (${f.match})` : ''}`);
  if (findings.length > limit) print(`    ... ${findings.length - limit} more`);
}

const EXPORT_HELP = `Usage: extremis export <target> [options]

Targets
  skills      copy capabilities to ./.agents/skills (Codex, Cursor, Gemini CLI and other Agent Skills hosts)
  claude      copy capabilities to ./.claude/skills (Claude Code)
  mcp         print an MCP server entry          [--host ${MCP_HOSTS.join('|')}] [--local] [--expose-tools none|dynamic|all]
  agents-md   print an AGENTS.md block           [--write [file]] inserts or updates it in place

Skill copy options
  --gateway               export only the small "extremis" gateway skill (pair it with the MCP server)
  --skill a,b             only these capabilities      --domain d   --kind skill|workflow
  --user                  write to ~/.agents/skills or ~/.claude/skills instead of the project
  --dir <path>            explicit destination         --force      replace folders that differ
  --dry-run               report without writing`;

export const commands = {
  async export({ args, flags, cwd, asJson, print, json }) {
    const target = args[0];
    if (!target || flags.help) { print(EXPORT_HELP); return target ? 0 : 2; }
    if (!EXPORT_TARGETS.includes(target)) throw new Error(`unknown export target "${target}" (one of ${EXPORT_TARGETS.join(', ')})`);
    if (target === 'mcp') {
      const cfg = mcpConfig(String(flags.host || 'claude'), { local: Boolean(flags.local), exposeTools: flags.expose_tools ? String(flags.expose_tools) : undefined });
      if (asJson) json(cfg);
      else print(cfg.format === 'json' ? `// ${cfg.file}\n${JSON.stringify(cfg.content, null, 2)}` : `# ${cfg.file}\n${cfg.content.trimEnd()}`);
      return 0;
    }
    if (target === 'agents-md') {
      if (flags.write === undefined) { print(agentsMdBlock().trimEnd()); return 0; }
      const file = path.resolve(cwd, typeof flags.write === 'string' ? flags.write : 'AGENTS.md');
      const status = await writeAgentsMd(file);
      if (asJson) json({ file, status }); else print(`${status} ${path.relative(cwd, file) || file}`);
      return 0;
    }
    const result = await exportSkills({ target, cwd, dir: flags.dir ? String(flags.dir) : undefined, user: Boolean(flags.user), force: Boolean(flags.force), dryRun: Boolean(flags.dry_run), gateway: Boolean(flags.gateway), skills: flags.skill, domain: flags.domain, kind: flags.kind });
    if (asJson) json(result);
    else {
      const where = path.relative(cwd, result.dir) || result.dir;
      print(`${result.dry_run ? 'would write' : 'wrote'} ${result.written.length} to ${where}${result.unchanged.length ? `, ${result.unchanged.length} unchanged` : ''}`);
      if (result.conflicts.length) print(`skipped ${result.conflicts.length} that differ from the catalog (use --force to replace): ${result.conflicts.join(', ')}`);
    }
    return result.conflicts.length ? 1 : 0;
  },

  async build({ flags, cwd, asJson, print, json }) {
    const out = flags.out ? path.resolve(cwd, String(flags.out)) : undefined;
    const result = await build({ out, check: Boolean(flags.check), baseUrl: flags.base_url ? String(flags.base_url) : '' });
    if (asJson) json(result);
    else if (flags.check) {
      if (!result.stale.length && !result.removed.length) print(`build artifacts are up to date (${result.total} files)`);
      else {
        for (const f of result.stale) print(`stale   ${f}`);
        for (const f of result.removed) print(`extra   ${f}`);
        print('run `extremis build` and commit the result');
      }
    } else print(`wrote ${result.written.length} of ${result.total} files${result.removed.length ? `, removed ${result.removed.length}` : ''}`);
    return flags.check && (result.stale.length || result.removed.length) ? 1 : 0;
  },

  async schema({ args, flags, service, json }) {
    const format = args[0] || 'json';
    if (!SCHEMA_FORMATS.includes(format)) throw new Error(`format must be one of ${SCHEMA_FORMATS.join(', ')}`);
    const tools = flags.capability ? await service.tools({ capability: flags.capability }) : await service.tools();
    json(exportSchemas(tools, format, { gateway: flags.gateway }));
    return 0;
  },

  async install({ args, flags, cwd, asJson, print, json }) {
    if (!args.length) throw new Error('usage: extremis install <source> [--skill name] [--project] [--accept-risk] [--force] [--dry-run]');
    let failed = 0;
    for (const spec of args) {
      const result = await install(spec, { ...scopeOf(flags, cwd), skills: flags.skill, acceptRisk: Boolean(flags.accept_risk), force: Boolean(flags.force), dryRun: Boolean(flags.dry_run) });
      if (asJson) { json(result); } else {
        const where = installScope(scopeOf(flags, cwd));
        for (const i of result.installed) {
          print(`${i.dry_run ? 'would install' : 'installed'} ${i.name}${i.version && i.version !== '0.0.0' ? '@' + i.version : ''} -> ${path.relative(cwd, i.dir) || i.dir} [scan: ${i.verdict}]${i.shadows_builtin ? ' (overrides the built-in capability)' : ''}`);
          for (const w of i.warnings) print(`    warning: ${w}`);
        }
        for (const s of result.skipped) {
          print(`skipped ${s.name}: ${s.reason}`);
          if (s.scan) printFindings(print, s.scan.findings);
        }
        for (const w of result.warnings) print(`warning: ${w}`);
        if (result.installed.length && !flags.dry_run) print(`lock: ${where.lockPath}`);
      }
      if (!result.installed.length) failed += 1;
    }
    return failed ? 1 : 0;
  },

  async update({ args, flags, cwd, asJson, print, json }) {
    const result = await update(args, scopeOf(flags, cwd));
    if (asJson) json(result);
    else {
      for (const u of result.updated) print(`updated ${u.name}${u.commit ? ' @ ' + u.commit.slice(0, 12) : ''}`);
      for (const u of result.unchanged) print(`up to date ${u.name}`);
      for (const f of result.failed) { print(`failed ${f.name}: ${f.reason}`); if (f.scan) printFindings(print, f.scan.findings); }
      if (!result.updated.length && !result.unchanged.length && !result.failed.length) print('nothing installed');
    }
    return result.failed.length ? 1 : 0;
  },

  async remove({ args, flags, cwd, asJson, print, json }) {
    if (!args.length) throw new Error('usage: extremis remove <name...> [--project]');
    const result = await remove(args, scopeOf(flags, cwd));
    if (asJson) json(result);
    else {
      for (const n of result.removed) print(`removed ${n}`);
      for (const n of result.missing) print(`not installed: ${n}`);
    }
    return result.missing.length ? 1 : 0;
  },

  async lock({ flags, cwd, asJson, print, json }) {
    if (flags.verify) {
      const report = await verifyLock(scopeOf(flags, cwd));
      if (asJson) json(report);
      else {
        print(`${report.lock}: ${report.ok.length} ok, ${report.modified.length} modified, ${report.missing.length} missing, ${report.untracked.length} untracked`);
        for (const m of report.modified) print(`  modified ${m.name} (expected ${m.expected.slice(0, 12)}, found ${m.actual.slice(0, 12)})`);
        for (const m of report.missing) print(`  missing ${m}`);
        for (const m of report.untracked) print(`  untracked ${m}`);
      }
      return report.clean ? 0 : 1;
    }
    const items = await listInstalled(scopeOf(flags, cwd));
    if (asJson) json(items);
    else if (!items.length) print('no capabilities installed');
    else for (const i of items) print(`${i.name.padEnd(28)} ${String(i.version || '').padEnd(8)} ${i.source}${i.commit ? ' @ ' + i.commit.slice(0, 12) : ''} [${i.verdict}]`);
    return 0;
  },

  async scan({ args, cwd, asJson, print, json, flags }) {
    if (!args.length) throw new Error('usage: extremis scan <dir...>');
    let worst = 0;
    const reports = [];
    for (const dir of args) {
      const report = { dir, ...await scanDirectory(path.resolve(cwd, dir)) };
      reports.push(report);
      worst = Math.max(worst, report.verdict === 'dangerous' ? 2 : report.verdict === 'caution' ? 1 : 0);
      if (!asJson) {
        print(`${dir}: ${report.verdict} (${report.files} files, ${report.findings.length} findings)`);
        printFindings(print, flags.verbose ? report.findings : report.findings.filter((f) => f.severity !== 'info' && f.severity !== 'low'), flags.verbose ? 1000 : 20);
      }
    }
    if (asJson) json(reports.length === 1 ? reports[0] : reports);
    return worst === 2 ? 2 : worst === 1 ? 1 : 0;
  },
};
