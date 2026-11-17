import test from 'node:test';
import assert from 'node:assert/strict';
import { runTool, parseAllow } from '../src/runner.mjs';
import { runSql } from '../src/tools/minisql.mjs';
import { normalCdf, normalInv, tTwoSidedP, chiSquareP, parseCsv } from '../src/tools/util.mjs';

const opts = { cwd: process.cwd() };

test('runner: unknown tool, invalid input, path confinement, permissions', async () => {
  assert.equal((await runTool('nope.nope', {}, opts)).error.code, 'unknown_tool');
  assert.equal((await runTool('data.query', {}, opts)).error.code, 'invalid_input');
  assert.equal((await runTool('data.profile', { path: '/etc/passwd' }, opts)).error.code, 'path_outside_workspace');
  assert.equal((await runTool('data.profile', { path: '../../etc/passwd' }, opts)).error.code, 'path_outside_workspace');
  assert.equal((await runTool('data.profile', { content: 'a\n1\n' }, { ...opts, allow: [] })).error.code, 'permission_denied');
  assert.deepEqual(parseAllow('all'), ['read', 'write', 'network', 'exec']);
  assert.throws(() => parseAllow('root'));
});

test('statistics distributions', () => {
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-4);
  assert.ok(Math.abs(normalInv(0.975) - 1.959964) < 1e-5);
  assert.ok(Math.abs(tTwoSidedP(2.228, 10) - 0.05) < 1e-3);
  assert.ok(Math.abs(chiSquareP(3.841, 1) - 0.05) < 1e-3);
});

test('csv parser handles quotes and newlines', () => {
  assert.deepEqual(parseCsv('a,b\n"x, y",2\n"multi\nline","q""z"\n').rows, [['a', 'b'], ['x, y', '2'], ['multi\nline', 'q"z']]);
  assert.equal(parseCsv('a;b\n1;2\n').delimiter, ';');
});

test('minisql: grouping, having, ordering, case, like', () => {
  const d = [{ r: 'N', s: '1,200', y: '2024' }, { r: 'S', s: '300', y: '2024' }, { r: 'N', s: '50', y: '2023' }, { r: 'S', s: '', y: '2024' }];
  const out = runSql('SELECT r, SUM(s) AS total, COUNT(*) n FROM data WHERE y = 2024 GROUP BY r HAVING total > 100 ORDER BY total DESC', d);
  assert.deepEqual(out.rows, [{ r: 'N', total: 1200, n: 1 }, { r: 'S', total: 300, n: 2 }]);
  assert.equal(runSql("SELECT COUNT(*) c FROM t WHERE r LIKE 'n%'", d).rows[0].c, 2);
  assert.equal(runSql("SELECT CASE WHEN s > 100 THEN 'big' ELSE 'small' END k FROM t LIMIT 1", d).rows[0].k, 'big');
  assert.throws(() => runSql('DROP TABLE x', d));
});

test('data.profile reports types and issues', async () => {
  const r = await runTool('data.profile', { content: 'id,amount,city\n1,10,Dhaka\n2,12,dhaka\n3,,Paris\n4,1000,Paris\n4,1000,Paris\n' }, opts);
  assert.ok(r.ok);
  const amount = r.result.columns.find((c) => c.name === 'amount');
  assert.equal(amount.type, 'integer');
  assert.equal(amount.missing, 1);
  assert.ok(r.result.issues.some((i) => i.issue === 'duplicate-rows'));
  assert.ok(r.result.issues.some((i) => i.issue === 'inconsistent-casing'));
});

test('data.chart_svg produces accessible svg', async () => {
  const r = await runTool('data.chart_svg', { type: 'bar', title: 'Sales', categories: ['a', 'b'], series: [{ name: 's', values: [1, 3] }] }, opts);
  assert.ok(r.ok);
  assert.match(r.result.svg, /^<svg[^>]+role="img"/);
  assert.match(r.result.svg, /<title id="t">Sales<\/title>/);
});

test('security tools mask values and find patterns', async () => {
  const s = await runTool('security.secret_scan', { content: 'k=AKIAABCDEFGHIJKLMNOP\n-----BEGIN RSA PRIVATE KEY-----\napi_key = "${API_KEY}"' }, opts);
  assert.deepEqual(s.result.findings.map((f) => f.rule).sort(), ['aws-access-key-id', 'private-key']);
  assert.ok(!JSON.stringify(s).includes('AKIAABCDEFGHIJKLMNOP'));
  const c = await runTool('security.code_patterns', { content: 'cursor.execute(f"SELECT * FROM u WHERE id={uid}")\nsubprocess.run(cmd, shell=True)', filename: 'a.py' }, opts);
  assert.deepEqual(c.result.findings.map((f) => f.rule), ['sql-concat', 'shell-true']);
  const p = await runTool('privacy.pii_scan', { content: 'card 4111 1111 1111 1111, not 4111 1111 1111 1112, mail a.b@example.org' }, opts);
  assert.deepEqual(Object.keys(p.result.by_type).sort(), ['credit-card', 'email']);
  const d = await runTool('container.dockerfile_lint', { content: 'FROM node:latest\nENV API_TOKEN=abc\nCMD node a.js\n' }, opts);
  assert.ok(['no-latest-tag', 'secret-in-env', 'exec-form', 'run-as-non-root'].every((rule) => d.result.findings.some((f) => f.rule === rule)));
});

test('code tools: stack traces, diffs, test reports, logs', async () => {
  const js = await runTool('code.parse_stacktrace', { content: 'TypeError: x is undefined\n    at run (/app/src/a.js:10:5)\n    at Module._compile (node:internal/modules/cjs/loader:1105:14)' }, opts);
  assert.equal(js.result.language, 'javascript');
  assert.equal(js.result.top_project_frame.file, '/app/src/a.js');
  const jvm = await runTool('code.parse_stacktrace', { content: 'java.lang.IllegalStateException: boom\n\tat com.acme.App.main(App.java:12)\nCaused by: java.io.IOException: disk' }, opts);
  assert.equal(jvm.result.language, 'jvm');
  assert.equal(jvm.result.causes.length, 2);
  const diff = 'diff --git a/src/auth.js b/src/auth.js\n--- a/src/auth.js\n+++ b/src/auth.js\n@@ -1,2 +1,3 @@\n const a = 1;\n+console.log(a);\n-const b = 2;\n';
  const ds = await runTool('code.diff_stats', { content: diff }, opts);
  assert.equal(ds.result.additions, 1);
  assert.equal(ds.result.deletions, 1);
  assert.ok(ds.result.findings.some((f) => f.kind === 'debug-artifact' && f.line === 2));
  assert.ok(ds.result.findings.some((f) => f.kind === 'no-tests-changed'));
  const junit = await runTool('test.parse_report', { content: '<testsuite><testcase name="a" time="0.1"/><testcase name="b"><failure message="expected 1">trace</failure></testcase><testcase name="c"><skipped/></testcase></testsuite>' }, opts);
  assert.deepEqual([junit.result.total, junit.result.passed, junit.result.failed, junit.result.skipped], [3, 1, 1, 1]);
  const logs = await runTool('logs.summarize', { content: '2026-01-01T10:00:01Z ERROR timeout user=42\n2026-01-01T10:00:02Z ERROR timeout user=43\n2026-01-01T10:00:03Z INFO ok' }, opts);
  assert.equal(logs.result.templates[0].count, 2);
});

test('code.repo_map and dependency inventory on this repository', async () => {
  const map = await runTool('code.repo_map', { outline: ['src/search.mjs'] }, opts);
  assert.ok(map.ok);
  assert.ok(map.result.manifests.some((m) => m.path === 'package.json'));
  assert.ok(map.result.outlines['src/search.mjs'].some((s) => s.name === 'search'));
  const deps = await runTool('code.dependency_inventory', { content: undefined }, opts);
  assert.ok(deps.ok);
});

test('secret_scan: code expressions are not secrets, quoted literals still are', async () => {
  const code = await runTool('security.secret_scan', { content: 'const tokens = alternative.trim().split(/\\s+/);' }, opts);
  assert.equal(code.result.count, 0);
  const fake = ['q8Zr2v', 'Lx9TmW', '4kPa7NbE'].join(''); // assembled so repo scanners do not flag the fixture
  const lit = await runTool('security.secret_scan', { content: `const token = "${fake}";` }, opts);
  assert.equal(lit.result.count, 1);
  const env = await runTool('security.secret_scan', { content: `API_KEY=${fake}` }, opts);
  assert.equal(env.result.count, 1);
});
