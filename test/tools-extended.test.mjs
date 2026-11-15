import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { runTool } from '../src/runner.mjs';

const opts = { cwd: process.cwd() };
const run = async (id, input, extra = {}) => {
  const r = await runTool(id, input, { ...opts, ...extra });
  assert.ok(r.ok, `${id} failed: ${JSON.stringify(r.error)}`);
  return r.result;
};

test('analysis: finance, stats, decisions, schedules', async () => {
  const cf = await run('finance.cashflow', { cash_flows: [-1000, 300, 400, 500], discount_rate: 0.1 });
  assert.ok(Math.abs(cf.npv - -21.04) < 0.01);
  assert.ok(Math.abs(cf.irr - 0.0889) < 0.001);
  const loan = await run('finance.loan_schedule', { principal: 200000, annual_rate: 0.06, years: 30 });
  assert.ok(Math.abs(loan.payment - 1199.10) < 0.01);
  const ab = await run('stats.ab_test', { control: { visitors: 10000, conversions: 500 }, variants: [{ visitors: 10000, conversions: 570 }] });
  assert.ok(ab.results[0].significant && ab.results[0].p_value > 0.01);
  const n = await run('stats.sample_size', { baseline_rate: 0.05, mde: 0.1 });
  assert.ok(n.per_group > 30000 && n.per_group < 32500);
  const cp = await run('pm.critical_path', { tasks: [{ id: 'a', duration: 3 }, { id: 'b', duration: 2, depends_on: ['a'] }, { id: 'c', duration: 4, depends_on: ['a'] }, { id: 'd', duration: 1, depends_on: ['b', 'c'] }] });
  assert.deepEqual(cp.critical_path, ['a', 'c', 'd']);
  assert.equal(cp.project_duration, 8);
});

test('doc.extract_text reads PDF, DOCX, XLSX and PPTX', async () => {
  const pdf = await run('doc.extract_text', { path: 'test/fixtures/report.pdf' });
  assert.equal(pdf.page_count, 2);
  assert.match(pdf.text, /Revenue grew 12% to \$4\.2M \(unicode: café\)/);
  const lo = await run('doc.extract_text', { path: 'test/fixtures/contract-lo.pdf' });
  assert.match(lo.text, /The term is 12 months/);
  const docx = await run('doc.extract_text', { path: 'test/fixtures/contract.docx' });
  assert.equal(docx.headings[0].text, 'Contract Summary');
  assert.match(docx.text, /Party\tAcme/);
  const xlsx = await run('doc.extract_text', { path: 'test/fixtures/sales.xlsx' });
  assert.deepEqual(xlsx.sheets[0].data.slice(0, 3), [['region', 'amount'], ['east', 10], ['west', 20]]);
  assert.equal(xlsx.sheets[0].formulas, 1);
  const pptx = await run('doc.extract_text', { path: 'test/fixtures/deck.pptx' });
  assert.equal(pptx.slides[0].notes, 'Speaker note here');
});

test('docs: markdown, readability, locales', async () => {
  const md = await run('docs.markdown_check', { content: '# A\n### C\n![](x.png)\n[go](#missing)\n```\nx\n```\n' });
  for (const rule of ['heading-increment', 'image-alt', 'broken-anchor', 'fence-language']) assert.ok(md.issues.some((i) => i.rule === rule), rule);
  const r = await run('text.readability', { content: 'The cat sat on the mat. It was happy.' });
  assert.ok(r.flesch_reading_ease > 90);
  const loc = await run('i18n.compare_locales', { source: { greet: 'Hello {name}', save: 'Save changes' }, targets: { fr: { greet: 'Bonjour', save: 'Save changes' } } });
  assert.equal(loc.locales[0].placeholder_mismatches[0].key, 'greet');
  assert.deepEqual(loc.locales[0].untranslated, ['save']);
});

test('web: accessibility, seo and contrast', async () => {
  const html = '<html><head><title>Hi</title></head><body><img src="a.png"><input name="q"><button></button><h1>T</h1><h3>x</h3></body></html>';
  const a = await run('a11y.html_audit', { content: html });
  for (const rule of ['image-alt', 'form-label', 'button-name', 'html-lang', 'heading-order', 'landmark-main']) assert.ok(a.issues.some((i) => i.rule === rule), rule);
  assert.equal(a.passed, false);
  const seo = await run('seo.html_audit', { content: html });
  assert.ok(seo.issues.some((i) => i.rule === 'meta-description'));
  const c = await run('a11y.contrast', { foreground: '#777777', background: '#ffffff' });
  assert.equal(c.ratio, 4.48);
  assert.equal(c.aa_normal, false);
  assert.equal(c.aa_large, true);
});

test('web: fetch, http and link checking against a local server', async (t) => {
  const server = http.createServer((req, res) => {
    if (req.url === '/') { res.setHeader('content-type', 'text/html'); res.end('<html><head><title>Home</title></head><body><main><h1>Welcome</h1><p>Hello world.</p><a href="/ok">ok</a><a href="/missing">bad</a><a href="/moved">moved</a></main></body></html>'); return; }
    if (req.url === '/ok') { res.end('fine'); return; }
    if (req.url === '/moved') { res.statusCode = 301; res.setHeader('location', '/ok'); res.end(); return; }
    if (req.url === '/api') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ method: req.method })); return; }
    res.statusCode = 404; res.end('nope');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const net = { allow: ['read', 'network'], env: { ...process.env, EXTREMIS_ALLOW_PRIVATE_NETWORK: '1' } };
  const blocked = await runTool('web.fetch_text', { url: base }, { ...opts, allow: ['read', 'network'], env: { PATH: process.env.PATH } });
  assert.equal(blocked.error.code, 'blocked_address');
  const denied = await runTool('web.fetch_text', { url: base }, opts);
  assert.equal(denied.error.code, 'permission_denied');
  const page = await run('web.fetch_text', { url: base, include_links: true }, net);
  assert.equal(page.title, 'Home');
  assert.match(page.text, /Hello world/);
  const api = await run('http.request', { url: `${base}/api`, method: 'POST', json: { a: 1 } }, net);
  assert.equal(api.json.method, 'POST');
  const links = await run('web.check_links', { url: base }, net);
  assert.equal(links.broken_count, 1);
  assert.match(links.broken[0].url, /missing$/);
  assert.equal(links.redirected.length, 1);
});

test('api: openapi lint and breaking-change diff from YAML', async () => {
  const yaml = `openapi: 3.0.3
info:
  title: Pets
  version: 1.0.0
paths:
  /pets/{id}:
    get:
      operationId: getPet
      summary: Get a pet
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Pet'
components:
  schemas:
    Pet:
      type: object
      required: [id]
      properties:
        id: { type: string }
        tag: { type: string }
`;
  const lint = await run('api.openapi_lint', { content: yaml });
  assert.ok(lint.issues.some((i) => i.rule === 'path-params' && i.severity === 'error'));
  const head = yaml.replace('        tag: { type: string }\n', '').replace("version: 1.0.0", "version: 1.1.0");
  const diff = await run('api.openapi_diff', { base_content: yaml, head_content: head });
  assert.equal(diff.breaking, true);
  assert.equal(diff.recommended_bump, 'major');
  assert.equal(diff.version_bump_ok, false);
  const js = await run('schema.json_diff', { base: { type: 'object', properties: { a: { type: 'string' } } }, head: { type: 'object', required: ['a'], properties: { a: { type: 'integer' } } } });
  assert.equal(js.breaking, true);
});

test('sql.schema_lint flags unsafe migrations', async () => {
  const r = await run('sql.schema_lint', { content: "CREATE TABLE orders (id bigint, price float, created_at timestamp);\nALTER TABLE orders ADD COLUMN status text NOT NULL;\nDELETE FROM orders;\nCREATE INDEX i ON orders(created_at);\n" });
  for (const rule of ['primary-key', 'money-float', 'add-not-null', 'unbounded-write', 'timestamptz', 'index-concurrently']) assert.ok(r.issues.some((i) => i.rule === rule), rule);
  assert.equal(r.safe, false);
});
