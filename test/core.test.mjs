import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSkillDocument, FrontmatterError } from '../src/frontmatter.mjs';
import { hashEntries } from '../src/hash.mjs';
import { satisfies, compare } from '../src/semver.mjs';
import { validate } from '../src/jsonschema.mjs';
import { tokenize, stem } from '../src/text.mjs';
import { loadCatalog } from '../src/catalog.mjs';
import { buildIndex, search } from '../src/search.mjs';

test('frontmatter: folded, nested, lists, quotes, comments', () => {
  const doc = parseSkillDocument('---\nname: x\ndescription: >\n  one\n  two\nmetadata:\n  a.b: "1.0"\n  tags: [p, "q r"]\nlist:\n  - one\n  - k: v\n    j: w\nq: "a: b # c" # note\n---\n# Body\n');
  assert.equal(doc.data.description, 'one two');
  assert.deepEqual(doc.data.metadata, { 'a.b': '1.0', tags: ['p', 'q r'] });
  assert.deepEqual(doc.data.list, ['one', { k: 'v', j: 'w' }]);
  assert.equal(doc.data.q, 'a: b # c');
  assert.equal(doc.body, '# Body');
});

test('frontmatter: literal block keeps newlines; errors are reported', () => {
  assert.equal(parseSkillDocument('---\nd: |\n  a\n  b\n---\n').data.d, 'a\nb');
  assert.throws(() => parseSkillDocument('---\nname: x\n'), FrontmatterError);
  assert.throws(() => parseSkillDocument('---\na: 1\na: 2\n---\n'), /duplicate/);
  assert.deepEqual(parseSkillDocument('# no frontmatter').data, {});
});

test('hash: matches vercel-labs/skills computedHash vectors', () => {
  assert.equal(hashEntries([]), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(hashEntries([{ path: 'SKILL.md', content: '# hi\n' }]), '93c36952d8843b33e68ae970ebabcc03e1687c9bb0dd1ecaf357060318952f55');
  assert.equal(hashEntries([{ path: 'SKILL.md', content: 'a\n' }, { path: 'docs/b.md', content: 'b\n' }]), 'b22c4d22aa319d2924312fa18fcbfedc88fa89c74dbd8f298c683e1caf7b7f24');
  assert.equal(hashEntries([{ path: 'SKILL.md', content: 'a\r\n' }]), hashEntries([{ path: 'SKILL.md', content: 'a\n' }]));
});

test('semver ranges', () => {
  assert.ok(satisfies('1.2.3', '^1.0.0'));
  assert.ok(!satisfies('2.0.0', '^1.0.0'));
  assert.ok(satisfies('0.2.5', '^0.2.0'));
  assert.ok(!satisfies('0.3.0', '^0.2.0'));
  assert.ok(satisfies('1.2.9', '~1.2.0'));
  assert.ok(satisfies('1.5.0', '>=1.2 <2'));
  assert.ok(satisfies('3.0.0', '^1 || ^3'));
  assert.ok(satisfies('1.2.0', '1.x'));
  assert.ok(!satisfies('1.0.0-beta', '^1.0.0'));
  assert.equal(compare('1.0.0-alpha', '1.0.0'), -1);
});

test('json schema validation and defaults', () => {
  const schema = { type: 'object', required: ['a'], properties: { a: { type: 'integer', minimum: 1 }, b: { enum: ['x', 'y'], default: 'x' }, c: { type: 'array', items: { type: 'string' }, maxItems: 2 } }, additionalProperties: false };
  assert.ok(validate(schema, { a: 2 }).valid);
  assert.equal(validate(schema, { a: 2 }, { applyDefaults: true }).value.b, 'x');
  const bad = validate(schema, { a: 0, c: ['1', '2', 3], z: 1 });
  assert.ok(!bad.valid);
  assert.ok(bad.errors.length >= 3);
  assert.ok(validate({ oneOf: [{ type: 'string' }, { type: 'object', required: ['n'] }] }, { n: 1 }).valid);
  assert.ok(validate({ $defs: { p: { type: 'string' } }, items: { $ref: '#/$defs/p' } }, ['a']).valid);
});

test('text analysis', () => {
  assert.equal(stem('tests'), stem('testing'));
  assert.ok(tokenize('Run an A/B test on the p-value').includes('abtest'));
  assert.ok(!tokenize('the and of').length);
});

test('built-in catalog loads cleanly and search ranks sensibly', async () => {
  const catalog = await loadCatalog({ project: false, user: false });
  assert.ok(catalog.size >= 50);
  assert.deepEqual(catalog.diagnostics.filter((d) => d.level === 'error'), []);
  const index = buildIndex(catalog);
  assert.equal(search(index, 'the app crashes with a stack trace')[0].cap.name, 'debugging');
  assert.equal(search(index, 'design REST endpoints with pagination')[0].cap.name, 'api-design');
  assert.deepEqual(search(index, ''), []);
});

test('sdk entry point exposes the service and schema export', async () => {
  const sdk = await import('../src/index.mjs');
  const x = sdk.createExtremis({ allow: ['read'] });
  assert.ok((await x.stats()).capabilities > 0);
  const openai = sdk.exportSchemas(await x.tools(), 'openai');
  assert.ok(openai.every((t) => /^[a-zA-Z0-9_-]{1,64}$/.test(t.function.name)));
  assert.ok(openai.every((t) => !JSON.stringify(t.function.parameters).includes('"$ref"')));
  assert.equal(sdk.toolIdFromName('data__profile'), 'data.profile');
  const gemini = sdk.exportSchemas([], 'gemini', { gateway: true });
  assert.equal(gemini[0].functionDeclarations.length, 6);
});

test('cli parses arguments and runs commands', async () => {
  const { parseArgs } = await import('../bin/extremis.mjs');
  assert.deepEqual(parseArgs(['run', 'x.y', 'a=1', '--json', '--allow', 'read,network', '--param', 'p=1', '--param', 'q=2']), { positional: ['run', 'x.y', 'a=1'], flags: { json: true, allow: 'read,network', param: ['p=1', 'q=2'] } });
});

test('built-in workflows are well formed and selected for multi-step requests', async () => {
  const { plan } = await import('../src/plan.mjs');
  const catalog = await loadCatalog({ project: false, user: false });
  const index = buildIndex(catalog);
  const workflows = catalog.list().filter((c) => c.kind === 'workflow');
  assert.ok(workflows.length >= 5);
  const names = new Set(catalog.list().map((c) => c.name));
  for (const wf of workflows) {
    assert.ok(wf.workflow.steps.length >= 2, wf.name);
    assert.ok(wf.workflow.done_when.length, wf.name);
    for (const s of wf.workflow.steps) assert.ok(names.has(s.capability), `${wf.name}/${s.id}`);
  }
  const p = plan(catalog, index, 'is this build ready to release? run a go or no-go check');
  assert.equal(p.strategy, 'workflow');
  assert.equal(p.workflow, 'release-readiness');
  assert.equal(plan(catalog, index, 'the app crashes with a stack trace').strategy, 'composed');
  // Broad requests that merely mention a workflow's step domains must not trigger it.
  const audit = plan(catalog, index, 'audit a Node.js API for reliability and security');
  assert.equal(audit.strategy, 'composed');
  assert.equal(plan(catalog, index, 'run a full security assessment of this repository').workflow, 'security-assessment');
});
