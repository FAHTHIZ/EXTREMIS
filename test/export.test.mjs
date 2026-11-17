import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exportSkills, mcpConfig, writeAgentsMd, agentsMdBlock, ExportError } from '../src/export.mjs';
import { loadCapability } from '../src/catalog.mjs';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'extremis-export-'));

test('export skills copies capabilities without evals and is idempotent', async () => {
  const cwd = tmp();
  const first = await exportSkills({ target: 'claude', cwd, skills: 'code-review,release-readiness' });
  assert.deepEqual(first.written, ['code-review', 'release-readiness']);
  const dest = path.join(cwd, '.claude', 'skills', 'code-review');
  assert.ok(existsSync(path.join(dest, 'SKILL.md')) && !existsSync(path.join(dest, 'evals')));
  assert.equal((await loadCapability(dest)).name, 'code-review');
  const again = await exportSkills({ target: 'claude', cwd, skills: 'code-review,release-readiness' });
  assert.deepEqual([again.written, again.unchanged], [[], ['code-review', 'release-readiness']]);
  appendFileSync(path.join(dest, 'SKILL.md'), '\nlocal edit\n');
  const conflict = await exportSkills({ target: 'claude', cwd, skills: 'code-review' });
  assert.deepEqual(conflict.conflicts, ['code-review']);
  assert.match(readFileSync(path.join(dest, 'SKILL.md'), 'utf8'), /local edit/);
  const forced = await exportSkills({ target: 'claude', cwd, skills: 'code-review', force: true });
  assert.deepEqual(forced.written, ['code-review']);
  assert.doesNotMatch(readFileSync(path.join(dest, 'SKILL.md'), 'utf8'), /local edit/);
  const dry = await exportSkills({ target: 'skills', cwd, kind: 'workflow', dryRun: true });
  assert.ok(dry.written.length >= 5 && !existsSync(path.join(cwd, '.agents')));
  const gw = await exportSkills({ target: 'skills', cwd, gateway: true });
  assert.deepEqual(gw.written, ['extremis']);
  await assert.rejects(exportSkills({ cwd, skills: 'no-such-skill' }), ExportError);
});

test('mcp config snippets per host', () => {
  assert.deepEqual(mcpConfig('claude').content.mcpServers.extremis.args, ['-y', 'github:FAHTHIZ/EXTREMIS', 'mcp']);
  assert.equal(mcpConfig('cursor').file, '.cursor/mcp.json');
  assert.equal(mcpConfig('vscode').content.servers.extremis.type, 'stdio');
  assert.match(mcpConfig('codex').content, /^\[mcp_servers\.extremis\]\ncommand = "npx"\nargs = \["-y", "github:FAHTHIZ\/EXTREMIS", "mcp"\]/);
  const local = mcpConfig('claude', { local: true, exposeTools: 'dynamic' }).content.mcpServers.extremis;
  assert.ok(local.args[0].endsWith(path.join('bin', 'extremis.mjs')) && local.args.includes('--expose-tools=dynamic'));
  assert.throws(() => mcpConfig('emacs'), ExportError);
});

test('AGENTS.md block is inserted once and updated in place', async () => {
  const file = path.join(tmp(), 'AGENTS.md');
  assert.equal(await writeAgentsMd(file), 'created');
  assert.equal(await writeAgentsMd(file), 'unchanged');
  writeFileSync(file, readFileSync(file, 'utf8').replace('Do not load every skill up front.', 'old text') + '\n## Other\n\nkeep me\n');
  assert.equal(await writeAgentsMd(file), 'updated');
  const text = readFileSync(file, 'utf8');
  assert.equal(text.split('<!-- extremis:start -->').length, 2);
  assert.ok(text.includes(agentsMdBlock().trim()) && text.includes('keep me'));
});

test('Claude Code SessionStart hook emits a short additionalContext and can be disabled', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const hooks = JSON.parse(readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf8'));
  const entry = hooks.hooks.SessionStart[0].hooks[0];
  assert.match(entry.command, /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/session-start\.mjs/);
  const script = path.join(root, 'hooks', 'session-start.mjs');
  const out = JSON.parse(execFileSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, EXTREMIS_SESSION_HOOK: '' } }));
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(out.hookSpecificOutput.additionalContext, /extremis_plan/);
  assert.ok(out.hookSpecificOutput.additionalContext.length / 4 < 200);
  const silent = execFileSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, EXTREMIS_SESSION_HOOK: 'off' } });
  assert.equal(silent, '');
});
