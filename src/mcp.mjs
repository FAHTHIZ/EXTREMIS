// MCP server over stdio (newline-delimited JSON-RPC 2.0).
//
// Speaks both protocol eras:
//   - legacy (2024-11-05 .. 2025-11-25): initialize / notifications/initialized
//   - modern (2026-07-28): server/discover, per-request _meta, resultType,
//     ttlMs/cacheScope on cacheable results, -32022 for unsupported versions
//
// Surfaces:
//   tools      a small, stable gateway (search, plan, activate, read, run, verify)
//              plus optional direct tools (--expose-tools=all|dynamic)
//   resources  skill://<name>/SKILL.md and bundled files
//   skills     io.modelcontextprotocol/skills extension (SEP-2640):
//              skills/list, skills/get, resources/directory/read
//
// Tool descriptions are factual and stable (no instructions to the model), so
// hosts that pin or screen tool definitions accept them.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { Extremis, VERSION } from './service.mjs';
import { listResources } from './catalog.mjs';
import { ActivationError, mimeOf } from './activate.mjs';
import { getBuiltinTool, listBuiltinTools, describeTool } from './tools/index.mjs';

export const MODERN_VERSION = '2026-07-28';
export const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
export const SUPPORTED_VERSIONS = [MODERN_VERSION, ...LEGACY_VERSIONS];
const SKILLS_EXT = 'io.modelcontextprotocol/skills';
const TTL = 300000;
const MAX_TEXT = 200000;
const PAGE = 100;

export const ERR = { PARSE: -32700, INVALID_REQUEST: -32600, METHOD: -32601, PARAMS: -32602, INTERNAL: -32603, UNSUPPORTED_VERSION: -32022 };

class RpcError extends Error {
  constructor(code, message, data) { super(message); this.code = code; this.data = data; }
}

const INSTRUCTIONS = 'EXTREMIS is a capability catalog. extremis_search and extremis_plan find capabilities for a task; extremis_find searches public skill directories (skills.sh, GitHub) when nothing installed fits; extremis_activate returns their instructions and tool schemas; extremis_run executes a listed tool; extremis_verify checks results. Capabilities are also available as Agent Skills resources (skill://<name>/SKILL.md). Built-in specialist agents (code-reviewer, security-auditor, debugger, ai-engineer, ...) are available as prompts.';

export const GATEWAY_TOOLS = [
  {
    name: 'extremis_search',
    title: 'Search capabilities',
    description: 'Search the EXTREMIS capability catalog. Returns ranked capability cards (name, summary, tools, permissions, risk, confidence).',
    inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string', description: 'Task or need in natural language' }, limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 }, domain: { type: 'string' }, kind: { type: 'string', enum: ['skill', 'workflow'] } }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'extremis_find',
    title: 'Find skills anywhere',
    description: 'Find Agent Skills for a task beyond the installed catalog: searches the local catalog, the skills.sh directory, GitHub and Agent Skills well-known indexes, reads and security-scans the top SKILL.md files and returns ranked results with install commands. Sends the query to those public services; set EXTREMIS_OFFLINE=1 to disable.',
    inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string', description: 'Task or need in natural language' }, limit: { type: 'integer', minimum: 1, maximum: 25, default: 8 }, sources: { type: 'array', items: { type: 'string', enum: ['local', 'skills.sh', 'github', 'index'] } }, indexes: { type: 'array', items: { type: 'string' }, description: 'Extra Agent Skills index URLs or site origins' }, owner: { type: 'string', description: 'Only results from this GitHub owner' }, official_only: { type: 'boolean', default: false }, deep: { type: 'boolean', default: true, description: 'Read and scan SKILL.md of top candidates' } }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'extremis_plan',
    title: 'Plan capabilities for a task',
    description: 'Select and order EXTREMIS capabilities for a task. Returns steps (capability, goal, tools, phase), a verification checklist, required permissions and alternatives.',
    inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' }, max_capabilities: { type: 'integer', minimum: 1, maximum: 8, default: 4 } }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'extremis_activate',
    title: 'Activate capabilities',
    description: 'Load one or more EXTREMIS capabilities with their dependencies. Returns instructions, tool input schemas, resource lists, permissions and content digests.',
    inputSchema: { type: 'object', required: ['names'], properties: { names: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8 }, include_suggests: { type: 'boolean', default: false }, max_body_tokens: { type: 'integer', minimum: 200, maximum: 20000 } }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'extremis_read',
    title: 'Read capability resource',
    description: 'Read a file bundled with an EXTREMIS capability, such as SKILL.md, a reference document, template or script.',
    inputSchema: { type: 'object', required: ['capability'], properties: { capability: { type: 'string' }, path: { type: 'string', default: 'SKILL.md' } }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'extremis_run',
    title: 'Run capability tool',
    description: 'Run an EXTREMIS tool by id (for example data.profile or security.secret_scan) with JSON input. Paths are confined to the workspace; network, write and exec need server permission.',
    inputSchema: { type: 'object', required: ['tool'], properties: { tool: { type: 'string' }, input: { type: 'object', default: {} } }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  {
    name: 'extremis_verify',
    title: 'Verify results',
    description: 'Run verification checks: either explicit checks ({tool, args, expect}) or the checks declared by a capability. Returns pass/fail per check and manual checks to confirm.',
    inputSchema: {
      type: 'object',
      properties: {
        capability: { type: 'string' },
        checks: { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'object', required: ['tool'], properties: { tool: { type: 'string' }, args: { type: 'object' }, expect: { type: 'object' }, description: { type: 'string' } } }] } },
        params: { type: 'object', description: 'Values for ${name} placeholders in check arguments' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
];

function directToolName(id) { return `x_${id.replace(/\./g, '__')}`; }
function directToolId(name) { return name.startsWith('x_') ? name.slice(2).replace(/__/g, '.') : null; }

function mcpToolFromBuiltin(def) {
  const readOnly = !def.permissions.some((p) => p === 'write' || p === 'exec');
  return {
    name: directToolName(def.id), title: def.title, description: def.description,
    inputSchema: def.input_schema,
    annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: def.permissions.includes('network') },
  };
}

function skillUri(name, rel = 'SKILL.md') { return `skill://${name}/${rel}`; }

function parseSkillUri(uri) {
  const m = /^skill:\/\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/(.*))?$/.exec(String(uri || ''));
  if (!m) return null;
  return { name: m[1], rel: m[2] ?? '' };
}

function encodeCursor(n) { return Buffer.from(String(n)).toString('base64url'); }
function decodeCursor(c) {
  if (c === undefined || c === null) return 0;
  const n = Number(Buffer.from(String(c), 'base64url').toString());
  if (!Number.isInteger(n) || n < 0) throw new RpcError(ERR.PARAMS, 'invalid cursor');
  return n;
}

export class McpServer {
  /**
   * options: all Extremis options plus exposeTools ('none'|'dynamic'|'all'), send(message)
   */
  constructor(options = {}) {
    this.service = options.service || new Extremis(options);
    this.exposeTools = options.exposeTools || 'none';
    this.send = options.send || (() => {});
    this.dynamic = new Set();
    this.manifestCache = new Map();
    this.era = null;
    this.protocolVersion = null;
  }

  // ------------------------------------------------------------ transport

  async handle(message) {
    if (Array.isArray(message)) {
      const out = (await Promise.all(message.map((m) => this.handle(m)))).filter(Boolean);
      return out.length ? out : null;
    }
    if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      if (message && (message.result !== undefined || message.error !== undefined)) return null; // response to us; ignore
      return { jsonrpc: '2.0', id: message?.id ?? null, error: { code: ERR.INVALID_REQUEST, message: 'invalid JSON-RPC request' } };
    }
    const isNotification = message.id === undefined || message.id === null;
    try {
      const result = await this.dispatch(message.method, message.params || {});
      if (isNotification) return null;
      return { jsonrpc: '2.0', id: message.id, result };
    } catch (err) {
      if (isNotification) return null;
      const rpc = err instanceof RpcError ? err : new RpcError(ERR.INTERNAL, err.message || 'internal error');
      return { jsonrpc: '2.0', id: message.id, error: { code: rpc.code, message: rpc.message, ...(rpc.data !== undefined ? { data: rpc.data } : {}) } };
    }
  }

  modern(params) {
    const v = params?._meta?.['io.modelcontextprotocol/protocolVersion'];
    if (v === undefined) return this.era === 'modern';
    if (!SUPPORTED_VERSIONS.includes(v)) throw new RpcError(ERR.UNSUPPORTED_VERSION, `unsupported protocol version ${v}`, { supported: SUPPORTED_VERSIONS, requested: v });
    return v === MODERN_VERSION;
  }

  /** Decorate a result for the active era. */
  finish(result, params, { cache = false } = {}) {
    const out = { ...result, resultType: 'complete' };
    if (cache) { out.ttlMs = TTL; out.cacheScope = 'private'; }
    if (this.modern(params)) out._meta = { ...(out._meta || {}), 'io.modelcontextprotocol/serverInfo': { name: 'extremis', version: VERSION } };
    return out;
  }

  capabilities() {
    return {
      tools: { listChanged: this.exposeTools === 'dynamic' },
      resources: { listChanged: false },
      prompts: { listChanged: false },
      extensions: { [SKILLS_EXT]: { directoryRead: true } },
    };
  }

  async dispatch(method, params) {
    switch (method) {
      case 'initialize': {
        this.era = 'legacy';
        const requested = params.protocolVersion;
        this.protocolVersion = LEGACY_VERSIONS.includes(requested) ? requested : LEGACY_VERSIONS[0];
        return { protocolVersion: this.protocolVersion, capabilities: this.capabilities(), serverInfo: { name: 'extremis', title: 'EXTREMIS', version: VERSION }, instructions: INSTRUCTIONS };
      }
      case 'server/discover':
        this.modern(params);
        return { resultType: 'complete', supportedVersions: SUPPORTED_VERSIONS, capabilities: this.capabilities(), instructions: INSTRUCTIONS, _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'extremis', title: 'EXTREMIS', version: VERSION } }, ttlMs: 3600000, cacheScope: 'public' };
      case 'notifications/initialized':
      case 'notifications/cancelled':
      case 'notifications/roots/list_changed':
        return {};
      case 'ping':
        return {};
      case 'tools/list': return this.finish({ tools: await this.listTools() }, params, { cache: true });
      case 'tools/call': return this.finish(await this.callTool(params), params);
      case 'resources/list': return this.finish(await this.listResourcesRpc(params), params, { cache: true });
      case 'resources/templates/list': return this.finish({ resourceTemplates: [{ uriTemplate: 'skill://{name}/SKILL.md', name: 'skill', title: 'EXTREMIS capability instructions', mimeType: 'text/markdown' }] }, params, { cache: true });
      case 'resources/read': return this.finish(await this.readResourceRpc(params), params, { cache: true });
      case 'resources/directory/read': return this.finish(await this.readDirectory(params), params, { cache: true });
      case 'skills/list': return this.finish(await this.skillsList(params), params, { cache: true });
      case 'skills/get': return this.finish(await this.skillsGet(params), params, { cache: true });
      case 'prompts/list': return this.finish(await this.listPrompts(), params, { cache: true });
      case 'prompts/get': return this.finish(await this.getPrompt(params), params);
      case 'completion/complete': return this.finish(await this.complete(params), params);
      case 'logging/setLevel': return {};
      default:
        throw new RpcError(ERR.METHOD, `method not found: ${method}`);
    }
  }

  // ------------------------------------------------------------ tools

  async listTools() {
    const tools = [...GATEWAY_TOOLS];
    if (this.exposeTools === 'all') tools.push(...listBuiltinTools().map(mcpToolFromBuiltin));
    else if (this.exposeTools === 'dynamic') for (const id of [...this.dynamic].sort()) { const def = getBuiltinTool(id); if (def) tools.push(mcpToolFromBuiltin(def)); }
    return tools;
  }

  async callTool(params) {
    const name = params.name;
    const args = params.arguments || {};
    if (typeof name !== 'string') throw new RpcError(ERR.PARAMS, 'tools/call requires a tool name');
    const ok = (value) => {
      const text = JSON.stringify(value, null, 1);
      return { content: [{ type: 'text', text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n… [truncated]` : text }], structuredContent: value, isError: false };
    };
    const fail = (code, message, extra = {}) => {
      const value = { ok: false, error: { code, message, ...extra } };
      return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value, isError: true };
    };
    try {
      switch (name) {
        case 'extremis_search': return ok(await this.service.search(args.query, { limit: args.limit, domain: args.domain, kind: args.kind }));
        case 'extremis_find': {
          const r = await this.service.find(args.query, { limit: args.limit ?? 8, sources: args.sources, indexes: args.indexes, owner: args.owner, officialOnly: args.official_only, deep: args.deep });
          return ok({ ...r, results: r.results.map(({ findings, ...x }) => ({ ...x, ...(findings?.length ? { findings } : {}) })) });
        }
        case 'extremis_plan': return ok(await this.service.plan(args.task, { maxCapabilities: args.max_capabilities }));
        case 'extremis_activate': {
          const result = await this.service.activate(args.names || [], { includeSuggests: args.include_suggests, maxBodyTokens: args.max_body_tokens });
          if (this.exposeTools === 'dynamic') {
            const before = this.dynamic.size;
            for (const c of result.capabilities) for (const t of c.tools) if (getBuiltinTool(t.id)) this.dynamic.add(t.id);
            if (this.dynamic.size !== before) {
              this.send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
              result.direct_tools = [...this.dynamic].map(directToolName);
            }
          }
          return ok(result);
        }
        case 'extremis_read': return ok(await this.service.read(args.capability, args.path || 'SKILL.md'));
        case 'extremis_run': {
          const envelope = await this.service.run(args.tool, args.input || {});
          if (!envelope.ok && envelope.error?.code === 'unknown_tool') {
            const hits = await this.service.search(String(args.tool).replace(/[._]/g, ' '), { limit: 3, hasTools: true });
            envelope.error.suggestions = hits.results.flatMap((r) => r.tools || []).slice(0, 5);
          }
          return envelope.ok ? ok(envelope) : { ...ok(envelope), isError: true };
        }
        case 'extremis_verify': return ok(await this.service.verify({ checks: args.checks, capability: args.capability, params: args.params }));
        default: {
          const id = directToolId(name);
          if (id && (this.exposeTools === 'all' || this.dynamic.has(id)) && getBuiltinTool(id)) {
            const envelope = await this.service.run(id, args);
            return envelope.ok ? ok(envelope.result) : fail(envelope.error.code, envelope.error.message);
          }
          throw new RpcError(ERR.PARAMS, `unknown tool: ${name}`);
        }
      }
    } catch (err) {
      if (err instanceof RpcError) throw err;
      if (err instanceof ActivationError) return fail(err.code, err.message, err.details ? { details: err.details } : {});
      return fail(err.code || 'error', err.message);
    }
  }

  // ------------------------------------------------------------ resources and skills

  async capOrThrow(name) {
    const cap = (await this.service.catalog()).get(name);
    if (!cap) throw new RpcError(ERR.PARAMS, `unknown skill: ${name}`);
    return cap;
  }

  /** Complete manifest computed from the served bytes (cached per digest of SKILL.md body). */
  async manifest(cap) {
    const key = `${cap.name}:${cap.dir}`;
    const cached = this.manifestCache.get(key);
    if (cached) return cached;
    const files = [{ path: 'SKILL.md' }, ...(await listResources(cap, { limit: 511 }))];
    const resources = [];
    let total = 0;
    for (const f of files) {
      const buf = await readFile(path.join(cap.dir, f.path));
      total += buf.length;
      if (total > 16 * 1024 * 1024) break;
      resources.push({ uri: skillUri(cap.name, f.path), digest: `sha256:${createHash('sha256').update(buf).digest('hex')}`, size: buf.length });
    }
    const entry = { uri: skillUri(cap.name), frontmatter: cap.frontmatter, resources };
    this.manifestCache.set(key, entry);
    return entry;
  }

  async skillsList(params) {
    const caps = (await this.service.catalog()).list().sort((a, b) => a.name.localeCompare(b.name));
    const start = decodeCursor(params.cursor);
    const page = caps.slice(start, start + PAGE);
    const skills = await Promise.all(page.map((c) => this.manifest(c)));
    return { skills, ...(start + PAGE < caps.length ? { nextCursor: encodeCursor(start + PAGE) } : {}) };
  }

  async skillsGet(params) {
    const parsed = parseSkillUri(params.uri);
    if (!parsed || parsed.rel !== 'SKILL.md') throw new RpcError(ERR.PARAMS, `not a skill URI: ${params.uri}`);
    return { skill: await this.manifest(await this.capOrThrow(parsed.name)) };
  }

  async listResourcesRpc(params) {
    const caps = (await this.service.catalog()).list().sort((a, b) => a.name.localeCompare(b.name));
    const start = decodeCursor(params.cursor);
    const page = caps.slice(start, start + PAGE);
    return {
      resources: page.map((c) => ({ uri: skillUri(c.name), name: c.name, title: c.name, description: c.summary, mimeType: 'text/markdown' })),
      ...(start + PAGE < caps.length ? { nextCursor: encodeCursor(start + PAGE) } : {}),
    };
  }

  async readResourceRpc(params) {
    const parsed = parseSkillUri(params.uri);
    if (!parsed || !parsed.rel) throw new RpcError(ERR.PARAMS, `unknown resource: ${params.uri}`);
    await this.capOrThrow(parsed.name);
    const manifest = await this.manifest((await this.service.catalog()).get(parsed.name));
    if (!manifest.resources.some((r) => r.uri === params.uri)) throw new RpcError(ERR.PARAMS, `unknown resource: ${params.uri}`);
    let r;
    try { r = await this.service.read(parsed.name, parsed.rel, { maxBytes: 16 * 1024 * 1024 }); } catch (err) { throw new RpcError(ERR.PARAMS, err.message); }
    return { contents: [r.encoding === 'base64' ? { uri: params.uri, mimeType: r.mime_type, blob: r.content } : { uri: params.uri, mimeType: r.mime_type, text: r.content }] };
  }

  async readDirectory(params) {
    const parsed = parseSkillUri(params.uri);
    if (!parsed || params.uri.endsWith('/')) throw new RpcError(ERR.PARAMS, `invalid directory URI: ${params.uri}`);
    const manifest = await this.manifest(await this.capOrThrow(parsed.name));
    const prefix = parsed.rel ? `${parsed.rel}/` : '';
    const children = new Map();
    for (const r of manifest.resources) {
      const rel = r.uri.slice(`skill://${parsed.name}/`.length);
      if (!rel.startsWith(prefix)) continue;
      const rest = rel.slice(prefix.length);
      const [head, ...tail] = rest.split('/');
      const uri = `skill://${parsed.name}/${prefix}${head}`;
      if (!children.has(uri)) children.set(uri, { uri, name: head, mimeType: tail.length ? 'inode/directory' : mimeOf(head) });
    }
    if (!children.size) throw new RpcError(ERR.PARAMS, `invalid directory URI: ${params.uri}`);
    const all = [...children.values()].sort((a, b) => a.uri.localeCompare(b.uri));
    const start = decodeCursor(params.cursor);
    return { resources: all.slice(start, start + PAGE), ...(start + PAGE < all.length ? { nextCursor: encodeCursor(start + PAGE) } : {}) };
  }

  // ------------------------------------------------------------ prompts (agents)

  async listPrompts() {
    const agents = await this.service.agents();
    return { prompts: agents.map((a) => ({ name: a.name, title: a.title, description: a.description, arguments: [{ name: 'task', description: 'What the agent should do', required: false }] })) };
  }

  async getPrompt(params) {
    const name = params?.name;
    if (typeof name !== 'string') throw new RpcError(ERR.PARAMS, 'prompts/get requires a prompt name');
    let brief;
    try { brief = await this.service.agent(name, String(params.arguments?.task || '')); } catch (err) { throw new RpcError(ERR.PARAMS, err.message); }
    let text = brief.system_prompt;
    if (brief.task) {
      text += `\n\n---\n\n## Task\n\n${brief.task}\n\n## Suggested start\n\nActivate: ${brief.activate.map((n) => `\`${n}\``).join(', ')}`;
      if (brief.plan?.steps?.length) text += `\n\nPlan (${brief.plan.strategy}, confidence ${brief.plan.confidence}):\n${brief.plan.steps.map((s, i) => `${i + 1}. [${s.phase}] ${s.id}${s.tools.length ? ` (tools: ${s.tools.join(', ')})` : ''}`).join('\n')}`;
    }
    return { description: brief.agent.description, messages: [{ role: 'user', content: { type: 'text', text } }] };
  }

  async complete(params) {
    const value = String(params.argument?.value || '');
    if (params.ref?.type === 'ref/prompt') return { completion: { values: [], total: 0, hasMore: false } };
    const names = (await this.service.catalog()).list().map((c) => c.name).filter((n) => n.startsWith(value)).slice(0, 100);
    return { completion: { values: names, total: names.length, hasMore: false } };
  }
}

/** Run the server on stdio. */
export async function serveStdio(options = {}) {
  const out = options.output || process.stdout;
  const write = (msg) => out.write(`${JSON.stringify(msg)}\n`);
  const server = new McpServer({ ...options, send: write });
  // Warm the catalog in the background so the first request is fast.
  server.service.catalog().catch((err) => process.stderr.write(`extremis: catalog load failed: ${err.message}\n`));
  const rl = readline.createInterface({ input: options.input || process.stdin, crlfDelay: Infinity });
  const pending = new Set();
  for await (const line of rl) {
    if (!line.trim()) continue;
    let message;
    try { message = JSON.parse(line); } catch { write({ jsonrpc: '2.0', id: null, error: { code: ERR.PARSE, message: 'parse error' } }); continue; }
    const p = server.handle(message).then((response) => { if (response) write(response); }).catch((err) => process.stderr.write(`extremis: ${err.stack || err}\n`)).finally(() => pending.delete(p));
    pending.add(p);
  }
  await Promise.all(pending);
}

export { describeTool };
