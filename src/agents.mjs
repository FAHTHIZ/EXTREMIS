// Built-in EXTREMIS agents: named specialists (code reviewer, security auditor,
// debugger, ...) that bundle a system prompt with the capabilities, permissions and
// workflow they lead with. Agent files are Markdown with YAML frontmatter, in the
// format Claude Code uses for subagents (`agents/<name>.md`), plus an `extremis:` map.
//
// Roots, in order (later roots override earlier ones by name):
//   <package>/agents, ~/.extremis/agents, <cwd>/.extremis/agents

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseSkillDocument } from './frontmatter.mjs';
import { PACKAGE_ROOT, extremisHome } from './catalog.mjs';

export const BUILTIN_AGENTS_DIR = path.join(PACKAGE_ROOT, 'agents');
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PERMS = new Set(['read', 'write', 'network', 'exec']);

export class AgentError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function agentRoots({ cwd = process.cwd(), env = process.env, builtin = true, user = true, project = true } = {}) {
  const roots = [];
  if (builtin) roots.push({ dir: BUILTIN_AGENTS_DIR, type: 'builtin' });
  if (user) roots.push({ dir: path.join(extremisHome(env), 'agents'), type: 'user' });
  if (project) roots.push({ dir: path.join(cwd, '.extremis', 'agents'), type: 'project' });
  return roots;
}

/** Parse one agent document. Returns { agent, errors }. */
export function parseAgent(text, file = 'agent.md') {
  const errors = [];
  let doc;
  try { doc = parseSkillDocument(text); } catch (err) { return { agent: null, errors: [`${file}: ${err.message}`] }; }
  const d = doc.data || {};
  const x = d.extremis && typeof d.extremis === 'object' ? d.extremis : {};
  const name = String(d.name || path.basename(file, '.md'));
  if (!NAME_RE.test(name)) errors.push(`${file}: invalid name "${name}"`);
  if (!d.description) errors.push(`${file}: missing description`);
  if (!doc.body) errors.push(`${file}: empty system prompt`);
  const capabilities = [].concat(x.capabilities || []).map(String);
  if (!capabilities.length) errors.push(`${file}: extremis.capabilities is empty`);
  const permissions = [].concat(x.permissions || ['read']).map(String);
  for (const p of permissions) if (!PERMS.has(p)) errors.push(`${file}: unknown permission "${p}"`);
  const agent = {
    name, title: (doc.body.match(/^#\s+(.+)$/m) || [])[1]?.trim() || name, description: String(d.description || ''), model: d.model ? String(d.model) : 'inherit',
    color: d.color ? String(d.color) : undefined, tools: d.tools ? String(d.tools) : undefined,
    capabilities, permissions, workflow: x.workflow ? String(x.workflow) : undefined,
    prompt: doc.body, file,
  };
  return { agent, errors };
}

/** Load agents from all roots. Returns { agents: Map, diagnostics: [] }. */
export async function loadAgents(options = {}) {
  const agents = new Map();
  const diagnostics = [];
  for (const root of options.roots || agentRoots(options)) {
    let entries;
    try { entries = await fs.readdir(root.dir); } catch { continue; }
    for (const entry of entries.sort()) {
      if (!entry.endsWith('.md') || entry.toUpperCase() === 'README.MD') continue;
      const file = path.join(root.dir, entry);
      const { agent, errors } = parseAgent(await fs.readFile(file, 'utf8'), file);
      diagnostics.push(...errors.map((message) => ({ level: 'error', file, message })));
      if (agent && !errors.length) agents.set(agent.name, { ...agent, source: root.type });
    }
  }
  return { agents, diagnostics };
}

/** Problems with capability references (for lint and tests). */
export function checkAgentReferences(agents, catalog) {
  const problems = [];
  for (const a of agents.values()) {
    for (const c of a.capabilities) if (!catalog.get(c)) problems.push(`${a.name}: unknown capability "${c}"`);
    if (a.workflow) {
      const w = catalog.get(a.workflow);
      if (!w) problems.push(`${a.name}: unknown workflow "${a.workflow}"`);
      else if (w.kind !== 'workflow') problems.push(`${a.name}: "${a.workflow}" is not a workflow`);
    }
  }
  return problems;
}

export function agentCard(a) {
  return { name: a.name, title: a.title, description: a.description, capabilities: a.capabilities, permissions: a.permissions, ...(a.workflow ? { workflow: a.workflow } : {}), source: a.source };
}

/**
 * Brief an agent for a task: its system prompt, plus (when a task is given) a plan
 * restricted to the agent's capabilities first and the context to activate.
 */
export async function briefAgent(service, agent, task = '') {
  const brief = { agent: agentCard(agent), system_prompt: agent.prompt, task: task || null };
  if (task) {
    const plan = await service.plan(task);
    const planned = (plan.capabilities || []).map((c) => c.name);
    const lead = agent.workflow ? [agent.workflow] : [];
    const own = planned.filter((n) => agent.capabilities.includes(n));
    const activate = [...new Set([...lead, ...own, ...(own.length || lead.length ? [] : agent.capabilities.slice(0, 2))])];
    brief.plan = plan;
    brief.activate = activate;
    brief.outside_profile = planned.filter((n) => !agent.capabilities.includes(n) && n !== agent.workflow);
    brief.next = `extremis_activate ${JSON.stringify(activate)}`;
  } else {
    brief.activate = agent.workflow ? [agent.workflow] : agent.capabilities.slice(0, 2);
  }
  return brief;
}

/** Render a Claude Code subagent file for an agent. */
export function renderClaudeAgent(a) {
  const lines = ['---', `name: ${a.name}`, `description: ${JSON.stringify(a.description)}`];
  if (a.tools) lines.push(`tools: ${a.tools}`);
  lines.push(`model: ${a.model || 'inherit'}`);
  if (a.color) lines.push(`color: ${a.color}`);
  lines.push('---', '', a.prompt.trim(), '');
  return lines.join('\n');
}
