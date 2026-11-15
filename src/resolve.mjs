// Dependency resolution for capabilities: requires-closure with version ranges,
// cycle detection, conflict detection, deterministic topological order (dependencies
// first) and the union of permissions the activated set needs.

import { satisfies } from './semver.mjs';
import { getBuiltinTool } from './tools/index.mjs';

export class ResolutionError extends Error {
  constructor(message, details = {}) { super(message); this.details = details; }
}

/**
 * Resolve the activation set for one or more capability names.
 * @param {import('./catalog.mjs').Catalog} catalog
 * @param {string[]} names
 * @param {{ includeSuggests?: boolean }} options
 * @returns {{ order: string[], requested: string[], added: {name, by, reason?}[], missing: {name, range, by}[],
 *   versionMismatches: {name, range, found, by}[], conflicts: {a, b}[], cycles: string[][], permissions: string[], ok: boolean }}
 */
export function resolve(catalog, names, options = {}) {
  const requested = [...new Set(names)];
  const missing = [];
  const versionMismatches = [];
  const added = [];
  const cycles = [];
  const order = [];
  const state = new Map(); // name -> 'visiting' | 'done'
  const stack = [];

  function visit(name, by, range = '*', reason) {
    const cap = catalog.get(name);
    if (!cap) { missing.push({ name, range, by }); return; }
    if (range && range !== '*' && !satisfies(cap.version, range)) versionMismatches.push({ name, range, found: cap.version, by });
    const status = state.get(name);
    if (status === 'done') return;
    if (status === 'visiting') {
      cycles.push([...stack.slice(stack.indexOf(name)), name]);
      return;
    }
    if (by && !requested.includes(name)) added.push({ name, by, reason });
    state.set(name, 'visiting');
    stack.push(name);
    const deps = [...cap.requires, ...(options.includeSuggests ? cap.suggests : [])];
    for (const dep of [...deps].sort((a, b) => a.name.localeCompare(b.name))) visit(dep.name, name, dep.range, dep.reason);
    if (cap.workflow) {
      for (const step of cap.workflow.steps) if (step.capability && !step.optional) visit(step.capability, name, '*', `workflow step ${step.id}`);
    }
    stack.pop();
    state.set(name, 'done');
    order.push(name);
  }

  for (const name of requested) visit(name, null);

  const conflicts = [];
  const active = new Set(order);
  for (const name of order) {
    for (const other of catalog.get(name).conflicts) {
      if (active.has(other) && !conflicts.some((c) => (c.a === other && c.b === name))) conflicts.push({ a: name, b: other });
    }
  }
  const permissions = [...new Set(order.flatMap((name) => {
    const cap = catalog.get(name);
    return [...cap.permissions, ...cap.tools.flatMap((t) => (t.builtin ? getBuiltinTool(t.id)?.permissions || [] : ['exec', ...(t.permissions || [])]))];
  }))].sort();
  return {
    order,
    requested,
    added,
    missing,
    versionMismatches,
    conflicts,
    cycles,
    permissions,
    ok: !missing.length && !versionMismatches.length && !conflicts.length && !cycles.length,
  };
}

/** Throwing variant for callers that need a valid set. */
export function resolveStrict(catalog, names, options) {
  const result = resolve(catalog, names, options);
  if (!result.ok) {
    const parts = [];
    if (result.missing.length) parts.push(`missing: ${result.missing.map((m) => `${m.name}${m.range !== '*' ? '@' + m.range : ''} (required by ${m.by || 'request'})`).join(', ')}`);
    if (result.versionMismatches.length) parts.push(`version: ${result.versionMismatches.map((m) => `${m.name} ${m.found} does not satisfy ${m.range}`).join(', ')}`);
    if (result.conflicts.length) parts.push(`conflicts: ${result.conflicts.map((c) => `${c.a} x ${c.b}`).join(', ')}`);
    if (result.cycles.length) parts.push(`cycles: ${result.cycles.map((c) => c.join(' -> ')).join('; ')}`);
    throw new ResolutionError(`cannot resolve ${names.join(', ')}: ${parts.join('; ')}`, result);
  }
  return result;
}
