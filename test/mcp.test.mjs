import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer, MODERN_VERSION } from '../src/mcp.mjs';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'extremis.mjs');
const meta = { _meta: { 'io.modelcontextprotocol/protocolVersion': MODERN_VERSION, 'io.modelcontextprotocol/clientCapabilities': {} } };

function client(args = []) {
  const child = spawn(process.execPath, [BIN, 'mcp', ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = ''; let id = 0; const waiting = new Map(); const notes = [];
  child.stdout.on('data', (d) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      const msg = JSON.parse(line);
      if (msg.id !== undefined && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); } else notes.push(msg);
    }
  });
  return {
    notes,
    request(method, params = {}) { const n = ++id; child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: n, method, params })}\n`); return new Promise((r) => waiting.set(n, r)); },
    notify(method, params = {}) { child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`); },
    raw(line) { child.stdin.write(`${line}\n`); },
    close() { child.stdin.end(); return new Promise((r) => child.on('close', r)); },
  };
}

test('mcp over stdio: legacy handshake, gateway tools and skills extension', async () => {
  const c = client();
  const init = await c.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.ok(init.result.capabilities.extensions['io.modelcontextprotocol/skills'].directoryRead);
  c.notify('notifications/initialized');
  const tools = await c.request('tools/list');
  assert.deepEqual(tools.result.tools.map((t) => t.name), ['extremis_search', 'extremis_plan', 'extremis_activate', 'extremis_read', 'extremis_run', 'extremis_verify']);
  for (const t of tools.result.tools) assert.doesNotMatch(t.description, /\b(you must|always|never|ignore|important)\b/i);
  const search = await c.request('tools/call', { name: 'extremis_search', arguments: { query: 'review a pull request diff', limit: 3 } });
  assert.equal(search.result.isError, false);
  assert.ok(search.result.structuredContent.results.length > 0);
  const act = await c.request('tools/call', { name: 'extremis_activate', arguments: { names: ['code-review'] } });
  assert.match(act.result.structuredContent.capabilities[0].instructions, /\w/);
  const bad = await c.request('tools/call', { name: 'extremis_activate', arguments: { names: ['code-reveiw'] } });
  assert.equal(bad.result.isError, true);
  assert.ok(bad.result.structuredContent.error.details.suggestions['code-reveiw'].includes('code-review'));
  const run = await c.request('tools/call', { name: 'extremis_run', arguments: { tool: 'a11y.contrast', input: { foreground: '#000', background: '#fff' } } });
  assert.equal(run.result.structuredContent.result.ratio, 21);
  const denied = await c.request('tools/call', { name: 'extremis_run', arguments: { tool: 'web.fetch_text', input: { url: 'https://example.com' } } });
  assert.equal(denied.result.isError, true);
  assert.equal(denied.result.structuredContent.error.code, 'permission_denied');
  const list = await c.request('skills/list');
  assert.equal(list.result.resultType, 'complete');
  assert.ok(list.result.ttlMs > 0 && list.result.cacheScope);
  const entry = list.result.skills.find((s) => s.frontmatter.name === 'code-review');
  assert.equal(entry.uri, 'skill://code-review/SKILL.md');
  const read = await c.request('resources/read', { uri: entry.uri });
  const text = read.result.contents[0].text;
  const manifestEntry = entry.resources.find((r) => r.uri === entry.uri);
  assert.equal(Buffer.byteLength(text), manifestEntry.size);
  assert.equal(`sha256:${createHash('sha256').update(text).digest('hex')}`, manifestEntry.digest);
  const got = await c.request('skills/get', { uri: entry.uri });
  assert.deepEqual(got.result.skill, entry);
  const dir = await c.request('resources/directory/read', { uri: 'skill://code-review' });
  assert.ok(dir.result.resources.some((r) => r.uri === 'skill://code-review/SKILL.md'));
  assert.equal((await c.request('skills/get', { uri: 'skill://nope/SKILL.md' })).error.code, -32602);
  assert.equal((await c.request('resources/read', { uri: 'skill://code-review/../x' })).error.code, -32602);
  assert.equal((await c.request('nope/nope')).error.code, -32601);
  c.raw('{not json');
  await c.close();
  assert.ok(c.notes.some((n) => n.error?.code === -32700));
});

test('mcp modern era: server/discover, _meta and version errors', async () => {
  const server = new McpServer({});
  const d = await server.handle({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: meta });
  assert.ok(d.result.supportedVersions.includes(MODERN_VERSION));
  assert.equal(d.result.resultType, 'complete');
  assert.equal(d.result._meta['io.modelcontextprotocol/serverInfo'].name, 'extremis');
  const t = await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: meta });
  assert.equal(t.result.resultType, 'complete');
  assert.ok(t.result.ttlMs > 0);
  assert.ok(t.result._meta['io.modelcontextprotocol/serverInfo']);
  const v = await server.handle({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '1999-01-01' } } });
  assert.equal(v.error.code, -32022);
  assert.deepEqual(v.error.data.requested, '1999-01-01');
  assert.equal(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});

test('mcp dynamic tool exposure adds activated tools and notifies', async () => {
  const sent = [];
  const server = new McpServer({ exposeTools: 'dynamic', send: (m) => sent.push(m), roots: [path.join(path.dirname(BIN), '..', 'capabilities')] });
  const before = await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(before.result.tools.length, 6);
  const cat = await server.service.catalog();
  const withTools = cat.list().find((c) => c.tools.length);
  if (!withTools) return; // catalog without tools: nothing to expose
  await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'extremis_activate', arguments: { names: [withTools.name] } } });
  assert.ok(sent.some((m) => m.method === 'notifications/tools/list_changed'));
  const after = await server.handle({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
  assert.ok(after.result.tools.length > 6);
  const all = new McpServer({ exposeTools: 'all' });
  const allTools = await all.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const direct = allTools.result.tools.find((x) => x.name === 'x_a11y__contrast');
  assert.ok(direct);
  const r = await all.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'x_a11y__contrast', arguments: { foreground: 'black', background: 'white' } } });
  assert.equal(r.result.structuredContent.ratio, 21);
});
