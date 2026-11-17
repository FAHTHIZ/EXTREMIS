// Task planning: turn a task description into a small, ordered set of
// capabilities with tools and verification checks. This is retrieval and
// composition, not reasoning: the host agent still decides what to do. The
// plan is a suggestion the host can accept, trim or extend.
//
// Selection: BM25F hits -> workflow shortcut when a workflow clearly matches ->
// otherwise coverage-greedy selection (each pick must add uncovered query terms,
// a light MMR) -> requires-closure -> phase ordering
// (discover, plan, build, verify, deliver) -> merged verification checklist.

import { search } from './search.mjs';
import { resolve } from './resolve.mjs';
import { capabilityPermissions } from './activate.mjs';
import { tokenize } from './text.mjs';

export const PHASES = ['discover', 'plan', 'build', 'verify', 'deliver'];

/**
 * @param {import('./catalog.mjs').Catalog} catalog
 * @param {object} index  from buildIndex
 * @param {string} task
 * @param {{ maxCapabilities?: number, allow?: string[], filters?: object, rerank?: Function, minRelative?: number }} options
 */
export function plan(catalog, index, task, options = {}) {
  const maxCaps = Math.max(1, Math.min(options.maxCapabilities ?? 4, 8));
  const minRelative = options.minRelative ?? 0.35;
  const hits = search(index, task, { limit: 15, filters: options.filters, rerank: options.rerank });
  const terms = [...new Set(tokenize(task))];
  if (!hits.length) {
    return { task, ok: false, confidence: 'none', reason: 'no capability matched the task', capabilities: [], steps: [], verification: [], permissions: [], candidates: [] };
  }

  // Workflow shortcut: a workflow among the top hits that is close to the best score.
  const top = hits[0].score;
  // A workflow's body and description name every step's domain, so broad requests match
  // it lexically; require the query to hit the workflow's own identity as well.
  const identity = (cap) => new Set(tokenize([cap.name.replace(/-/g, ' '), ...cap.keywords, ...cap.intents].join(' ')));
  const ownsQuery = (cap) => { const id = identity(cap); return terms.some((t) => id.has(t)) && hitsIdentity(id, terms); };
  const workflowHit = hits.slice(0, 5).find((h) => h.cap.kind === 'workflow' && h.score >= top * 0.75 && (h.confidence !== 'low' || (h === hits[0] && h.coverage >= 0.5)) && ownsQuery(h.cap));
  let selected;
  let strategy;
  if (workflowHit) {
    selected = [workflowHit];
    strategy = 'workflow';
  } else {
    strategy = 'composed';
    selected = [];
    const covered = new Set();
    for (const hit of hits) {
      if (selected.length >= maxCaps) break;
      if (hit.cap.kind === 'workflow') continue;
      if (selected.length && hit.score < top * minRelative) break;
      const fresh = hit.matched.filter((t) => !covered.has(t));
      // After the first pick, require new coverage (or near-top relevance).
      if (selected.length && !fresh.length && hit.score < top * 0.85) continue;
      if (selected.length && fresh.length / Math.max(1, hit.matched.length) < 0.34 && hit.score < top * 0.6) continue;
      selected.push(hit);
      hit.matched.forEach((t) => covered.add(t));
    }
  }

  const resolution = resolve(catalog, selected.map((h) => h.cap.name));
  const byName = new Map(selected.map((h) => [h.cap.name, h]));
  const allow = options.allow ? new Set(options.allow) : null;

  let steps;
  if (strategy === 'workflow') {
    const wf = workflowHit.cap;
    steps = wf.workflow.steps.map((s) => {
      const cap = s.capability ? catalog.get(s.capability) : null;
      return {
        id: s.id, goal: s.goal, capability: s.capability || null, phase: cap?.phase || 'build',
        tools: s.tools || (cap ? cap.tools.map((t) => t.id) : []), after: s.after || [], optional: Boolean(s.optional),
        ...(s.verify ? { verify: s.verify } : {}),
      };
    });
  } else {
    const order = resolution.order;
    const rank = (n) => PHASES.indexOf(catalog.get(n).phase);
    const sorted = [...order].sort((a, b) => rank(a) - rank(b) || order.indexOf(a) - order.indexOf(b));
    steps = sorted.map((name, i) => {
      const cap = catalog.get(name);
      const deps = cap.requires.map((d) => d.name).filter((d) => order.includes(d));
      const prev = sorted.slice(0, i).filter((n) => rank(n) < rank(name));
      return {
        id: name, goal: cap.summary, capability: name, phase: cap.phase, tools: cap.tools.map((t) => t.id),
        after: [...new Set([...deps, ...(prev.length ? [prev[prev.length - 1]] : [])])],
        ...(byName.has(name) ? { matched: byName.get(name).matched } : { reason: `required by ${resolution.added.filter((a) => a.name === name).map((a) => a.by).join(', ')}` }),
      };
    });
  }

  const capNames = [...new Set([...resolution.order, ...steps.map((s) => s.capability).filter(Boolean)])];
  const verification = [];
  const seen = new Set();
  const addCheck = (check, from) => {
    const key = JSON.stringify(check);
    if (seen.has(key)) return;
    seen.add(key);
    verification.push(typeof check === 'string' ? { type: 'manual', statement: check, from } : { type: 'tool', ...check, from });
  };
  for (const s of steps) for (const c of s.verify || []) addCheck(c, s.id);
  for (const name of capNames) for (const c of catalog.get(name)?.verify || []) addCheck(c, name);
  if (strategy === 'workflow') for (const d of workflowHit.cap.workflow.done_when || []) addCheck(d, workflowHit.cap.name);

  const permissions = [...new Set(capNames.flatMap((n) => (catalog.get(n) ? capabilityPermissions(catalog.get(n)) : [])))].sort();
  const blocked = allow ? permissions.filter((p) => !allow.has(p)) : [];
  const coverage = terms.length ? new Set(selected.flatMap((h) => h.matched)).size / terms.length : 0;
  const confidence = selected[0].confidence === 'high' && coverage >= 0.5 ? 'high' : selected[0].confidence === 'low' ? 'low' : 'medium';

  return {
    task, ok: resolution.ok, strategy, confidence, coverage: Math.round(coverage * 100) / 100,
    capabilities: capNames.map((n) => ({ name: n, summary: catalog.get(n)?.summary, selected: byName.has(n), score: byName.has(n) ? Math.round(byName.get(n).score * 100) / 100 : undefined })),
    ...(strategy === 'workflow' ? { workflow: workflowHit.cap.name } : {}),
    steps, verification, permissions,
    ...(blocked.length ? { blocked_permissions: blocked } : {}),
    ...(resolution.missing.length ? { missing: resolution.missing } : {}),
    alternatives: hits.filter((h) => !capNames.includes(h.cap.name)).slice(0, 4).map((h) => ({ name: h.cap.name, summary: h.cap.summary, score: Math.round(h.score * 100) / 100 })),
    next: `activate: ${capNames.join(', ')}`,
  };
}

// Distinctive identity match: at least one query term that is in the workflow's identity
// and is not a generic task verb shared by most requests.
const GENERIC = new Set(tokenize('check run make do help review build write create this my our the full complete end'));
function hitsIdentity(id, terms) { return terms.some((t) => id.has(t) && !GENERIC.has(t)); }
