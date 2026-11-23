// The EXTREMIS service: one object that owns a lazily loaded catalog and index
// and exposes every operation hosts need. The MCP server, CLI and JS SDK are thin
// layers over this, so behaviour is identical across integrations.

import { loadCatalog } from './catalog.mjs';
import { buildIndex, search as searchIndex } from './search.mjs';
import { activate as activateCaps, readResource, card, capabilityPermissions, digestOf } from './activate.mjs';
import { plan as planTask } from './plan.mjs';
import { runChecks } from './verify.mjs';
import { runTool, parseAllow, resolveTool, DEFAULT_ALLOW } from './runner.mjs';
import { getBuiltinTool, listBuiltinTools, describeTool } from './tools/index.mjs';
import { resolve as resolveDeps } from './resolve.mjs';
import { find as findRemote } from './find.mjs';

export const VERSION = '0.3.0';

function toolText(id) {
  const t = getBuiltinTool(id);
  return t ? `${id.replace(/[._]/g, ' ')} ${t.title} ${t.description}` : id.replace(/[._]/g, ' ');
}

export class Extremis {
  /**
   * options: cwd, roots, env, allow (array or comma list), builtin/project/user,
   * strict, rerank(query, hits), timeoutMs
   */
  constructor(options = {}) {
    this.options = { ...options };
    this.cwd = options.cwd || process.cwd();
    this.env = options.env || process.env;
    this.allow = Array.isArray(options.allow) ? options.allow : parseAllow(options.allow ?? this.env.EXTREMIS_ALLOW ?? DEFAULT_ALLOW.join(','), this.env);
    this._catalog = null;
    this._index = null;
    this._loading = null;
  }

  async catalog() {
    if (this._catalog) return this._catalog;
    if (!this._loading) {
      this._loading = loadCatalog({ ...this.options, cwd: this.cwd, env: this.env }).then((c) => {
        this._catalog = c;
        this._index = buildIndex(c, { describeTool: toolText });
        return c;
      });
    }
    return this._loading;
  }

  async index() { await this.catalog(); return this._index; }

  /** Drop the cached catalog (after installs or edits). */
  reload() { this._catalog = null; this._index = null; this._loading = null; }

  async search(query, { limit = 5, domain, kind, maxRisk, hasTools, permissions } = {}) {
    const index = await this.index();
    const filters = { ...(domain ? { domain } : {}), ...(kind ? { kind } : {}), ...(maxRisk ? { max_risk: maxRisk } : {}), ...(hasTools ? { has_tools: true } : {}), ...(permissions ? { permissions } : {}) };
    const hits = searchIndex(index, String(query || ''), { limit, filters, rerank: this.options.rerank });
    return {
      query, results: hits.map((h) => ({ ...card(h.cap), score: Math.round(h.score * 100) / 100, confidence: h.confidence, matched: h.matched })),
    };
  }

  /**
   * Find skills for a task across the local catalog and public directories
   * (skills.sh, GitHub, Agent Skills indexes). See src/find.mjs for options.
   */
  async find(query, options = {}) {
    return findRemote(query, {
      env: this.env,
      fetchImpl: this.options.fetchImpl,
      ...options,
      localSearch: async (q, limit) => (await this.search(q, { limit })).results.filter((r) => r.confidence !== 'low'),
    });
  }

  async plan(task, { maxCapabilities, domain } = {}) {
    const catalog = await this.catalog();
    const result = planTask(catalog, this._index, String(task || ''), { maxCapabilities, allow: this.allow, filters: domain ? { domain } : undefined, rerank: this.options.rerank });
    // Nothing installed fits well: point the host at the public skill directories.
    if (result && result.confidence !== 'high') result.discover = { reason: `local match confidence is ${result.confidence}`, next: `extremis find ${JSON.stringify(String(task || ''))}`, tool: 'extremis_find' };
    return result;
  }

  async activate(names, { includeSuggests = false, maxBodyTokens, includeBody = true } = {}) {
    return activateCaps(await this.catalog(), [].concat(names), { includeSuggests, maxBodyTokens, includeBody });
  }

  async read(name, relPath = 'SKILL.md', options = {}) { return readResource(await this.catalog(), name, relPath, options); }

  async get(name) {
    const cap = (await this.catalog()).get(name);
    return cap ? { ...card(cap), version: cap.version, description: cap.description, digest: digestOf(cap), source: cap.source, dir: cap.dir } : null;
  }

  async list({ domain, kind } = {}) {
    const catalog = await this.catalog();
    return catalog.list().filter((c) => (!domain || c.domain === domain) && (!kind || c.kind === kind)).map(card);
  }

  async resolve(names, options) { return resolveDeps(await this.catalog(), [].concat(names), options); }

  /** Run a built-in or capability script tool under this service's permission allowlist. */
  async run(toolId, input = {}, { allow, timeoutMs, cwd } = {}) {
    const catalog = await this.catalog();
    return runTool(toolId, input, { catalog, cwd: cwd || this.cwd, allow: allow || this.allow, env: this.env, timeoutMs: timeoutMs || this.options.timeoutMs });
  }

  /** Describe a tool (schema, permissions). */
  async tool(toolId) {
    const catalog = await this.catalog();
    const t = resolveTool(toolId, catalog);
    return t ? describeTool(t) : null;
  }

  async tools({ capability } = {}) {
    if (capability) {
      const cap = (await this.catalog()).get(capability);
      if (!cap) return [];
      return Promise.all(cap.tools.map((t) => this.tool(t.id))).then((list) => list.filter(Boolean));
    }
    return listBuiltinTools().map(describeTool);
  }

  /** Run verification checks; pass `capability` to use that capability's declared checks. */
  async verify({ checks, capability, params = {}, includeResults = false } = {}) {
    const catalog = await this.catalog();
    let list = checks;
    if (!list && capability) {
      const cap = catalog.get(capability);
      if (!cap) throw Object.assign(new Error(`unknown capability: ${capability}`), { code: 'not_found' });
      list = [...cap.verify, ...(cap.workflow?.done_when || [])];
    }
    return runChecks(list || [], { catalog, cwd: this.cwd, allow: this.allow, env: this.env, params, includeResults });
  }

  async diagnostics() { return (await this.catalog()).diagnostics; }

  async stats() {
    const catalog = await this.catalog();
    const caps = catalog.list();
    return {
      version: VERSION, capabilities: caps.length, workflows: caps.filter((c) => c.kind === 'workflow').length,
      builtin_tools: listBuiltinTools().length, roots: catalog.roots.map((r) => ({ dir: r.dir, type: r.type })),
      domains: [...new Set(caps.map((c) => c.domain).filter(Boolean))].sort(), allow: this.allow,
      permissions_used: [...new Set(caps.flatMap(capabilityPermissions))].sort(),
    };
  }
}

export function createExtremis(options) { return new Extremis(options); }
