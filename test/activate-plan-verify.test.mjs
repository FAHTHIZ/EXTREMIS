import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadCatalog } from '../src/catalog.mjs';
import { buildIndex } from '../src/search.mjs';
import { activate, readResource, card, ActivationError } from '../src/activate.mjs';
import { plan } from '../src/plan.mjs';
import { runChecks, match, getPath } from '../src/verify.mjs';

async function fixtureCatalog() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'extremis-apv-'));
  const mk = async (name, manifest, body = `# ${name}\n\nDo the ${name} thing carefully.\n`, extra = {}) => {
    const dir = path.join(root, name);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${manifest.description}\n---\n${body}`);
    const { description, ...rest } = manifest;
    await writeFile(path.join(dir, 'capability.json'), JSON.stringify({ version: '1.0.0', domain: 'test', ...rest }));
    for (const [rel, content] of Object.entries(extra)) { await mkdir(path.dirname(path.join(dir, rel)), { recursive: true }); await writeFile(path.join(dir, rel), content); }
    return dir;
  };
  await mk('csv-profiling', { description: 'Profile CSV datasets for missing values and outliers.', summary: 'Profile CSV data quality.', tools: ['data.profile'], phase: 'discover', verify: [{ tool: 'data.profile', args: { path: '${dataset}' }, expect: { rows: { gt: 0 } } }] }, undefined, { 'references/checklist.md': '# Checklist\n- nulls\n' });
  await mk('chart-making', { description: 'Make SVG charts from tabular data.', summary: 'Render charts from tables.', tools: ['data.chart_svg'], requires: ['csv-profiling'], phase: 'build', verify: ['chart has a title and labelled axes'] });
  await mk('report-writing', { description: 'Write a findings report for stakeholders.', summary: 'Write a findings report.', phase: 'deliver' });
  await mk('data-report', { kind: 'workflow', description: 'Workflow: turn a dataset into a stakeholder data report with charts.', summary: 'Dataset to stakeholder report workflow.', keywords: ['data report', 'dataset report'], workflow: { steps: [{ id: 'profile', capability: 'csv-profiling', goal: 'profile the dataset' }, { id: 'chart', capability: 'chart-making', goal: 'chart the key metric', after: ['profile'] }, { id: 'write', capability: 'report-writing', goal: 'write the report', after: ['chart'] }], done_when: ['report answers the question'] } });
  const outside = path.join(root, '..', `outside-${path.basename(root)}.txt`);
  await writeFile(outside, 'secret');
  await symlink(outside, path.join(root, 'csv-profiling', 'leak.txt'));
  return loadCatalog({ roots: [{ dir: root, type: 'external', trust: 'trusted' }] });
}

test('activate resolves dependencies and exposes tools, resources and digests', async () => {
  const catalog = await fixtureCatalog();
  const a = await activate(catalog, ['chart-making']);
  assert.deepEqual(a.order, ['csv-profiling', 'chart-making']);
  assert.equal(a.capabilities[0].requested, false);
  assert.deepEqual(a.capabilities[0].required_by, ['chart-making']);
  assert.equal(a.capabilities[1].tools[0].id, 'data.chart_svg');
  assert.ok(a.capabilities[1].tools[0].input_schema);
  assert.match(a.capabilities[0].digest, /^sha256:[0-9a-f]{64}$/);
  assert.ok(a.capabilities[0].resources.some((r) => r.path === 'references/checklist.md'));
  assert.ok(a.context_tokens > 0);
  assert.deepEqual(card(catalog.get('chart-making')).requires, ['csv-profiling']);
  await assert.rejects(() => activate(catalog, ['chart-makng']), (e) => e instanceof ActivationError && e.details.suggestions['chart-makng'][0] === 'chart-making');
});

test('readResource is confined to the capability folder', async () => {
  const catalog = await fixtureCatalog();
  const r = await readResource(catalog, 'csv-profiling', 'references/checklist.md');
  assert.equal(r.mime_type, 'text/markdown');
  assert.match(r.content, /nulls/);
  for (const bad of ['../chart-making/SKILL.md', '/etc/passwd', 'leak.txt', 'a//b']) {
    await assert.rejects(() => readResource(catalog, 'csv-profiling', bad), (e) => e.code === 'invalid_path' || e.code === 'not_found', bad);
  }
});

test('plan picks a matching workflow and orders steps', async () => {
  const catalog = await fixtureCatalog();
  const index = buildIndex(catalog);
  const p = plan(catalog, index, 'build a data report from this dataset');
  assert.equal(p.strategy, 'workflow');
  assert.deepEqual(p.steps.map((s) => s.id), ['profile', 'chart', 'write']);
  assert.ok(p.verification.some((v) => v.statement === 'report answers the question'));
  assert.ok(p.verification.some((v) => v.type === 'tool' && v.tool === 'data.profile'));
  const composed = plan(catalog, index, 'make charts from tabular data');
  assert.equal(composed.strategy, 'composed');
  assert.deepEqual(composed.steps.map((s) => s.id), ['csv-profiling', 'chart-making']);
  assert.equal(plan(catalog, index, 'quantum entanglement poetry').ok, false);
  const blocked = plan(catalog, index, 'make charts from tabular data', { allow: [] });
  assert.deepEqual(blocked.blocked_permissions, ['read']);
});

test('verify runs tool checks with parameters and matchers', async () => {
  const out = await runChecks([
    { tool: 'data.profile', args: { content: '${csv}' }, expect: { rows: { gt: 1 }, 'columns.length': 2 } },
    { tool: 'data.profile', args: { path: '${missing}' } },
    { tool: 'security.secret_scan', args: { content: 'key = AKIAIOSFODNN7EXAMPLE' }, expect: { 'findings.length': 0 } },
    'a human confirms the chart',
  ], { params: { csv: 'a,b\n1,2\n3,4\n' } });
  assert.deepEqual([out.passed, out.failed, out.skipped, out.manual], [1, 1, 1, 1]);
  assert.equal(out.ok, false);
  assert.equal(out.results[1].needs[0], 'missing');
  assert.ok(match(5, { gte: 5, lt: 6 }).ok);
  assert.ok(match(['a', 'b'], { contains: 'b', length: 2 }).ok);
  assert.ok(!match('abc', { matches: '^b' }).ok);
  assert.equal(getPath({ a: [{ b: 3 }] }, 'a.0.b'), 3);
});
