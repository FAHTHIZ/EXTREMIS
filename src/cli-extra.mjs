// CLI commands outside the core discover/use switch: schema export, installation
// management and security scanning.

import path from 'node:path';
import { exportSchemas, SCHEMA_FORMATS } from './schemas.mjs';
import { install, update, remove, verifyLock, listInstalled, installScope } from './install.mjs';
import { scanDirectory } from './scan.mjs';

const scopeOf = (flags, cwd) => ({ scope: flags.project ? 'project' : 'user', cwd });

function printFindings(print, findings, limit = 20) {
  for (const f of findings.slice(0, limit)) print(`    [${f.severity}] ${f.rule} ${f.file}${f.line ? ':' + f.line : ''} - ${f.message}${f.match ? ` (${f.match})` : ''}`);
  if (findings.length > limit) print(`    ... ${findings.length - limit} more`);
}

export const commands = {
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
