// Capability quality lint, beyond schema validation: checks that make a
// capability discoverable, composable and verifiable.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadCapability } from './catalog.mjs';
import { getBuiltinTool } from './tools/index.mjs';
import { estimateTokens } from './text.mjs';

const MAX_BODY_TOKENS = 5000;

/**
 * @param {string[]} dirs capability folders
 * @param {{ catalog?: import('./catalog.mjs').Catalog }} options catalog for dependency checks
 * @returns {Promise<Map<string, {level, message}[]>>}
 */
export async function lintCapabilities(dirs, options = {}) {
  const caps = [];
  for (const dir of dirs) { try { caps.push(await loadCapability(dir)); } catch { /* reported by loader */ } }
  const names = new Set([...caps.map((c) => c.name), ...(options.catalog ? options.catalog.list().map((c) => c.name) : [])]);
  const out = new Map();
  for (const cap of caps) {
    const problems = [];
    const add = (level, message) => problems.push({ level, message });
    if (!cap.hasManifest) add('info', 'no capability.json: discovery uses SKILL.md metadata only');
    if (cap.description.length < 40) add('warning', 'description is very short; say what it does and when to use it');
    if (!/\b(use|when|for)\b/i.test(cap.description)) add('info', 'description does not say when to use the capability');
    const tokens = estimateTokens(cap.body);
    if (tokens > MAX_BODY_TOKENS) add('warning', `SKILL.md body is ~${tokens} tokens (keep under ${MAX_BODY_TOKENS}; move detail to references/)`);
    if (cap.hasManifest) {
      if (!cap.intents.length) add('warning', 'no intents: add 3-12 example requests to improve discovery');
      if (!cap.keywords.length) add('info', 'no keywords');
      if (!cap.verify.length && cap.kind !== 'workflow') add('info', 'no verify checks');
    }
    for (const t of cap.tools) {
      if (t.builtin && !getBuiltinTool(t.id)) add('error', `unknown built-in tool ${t.id}`);
      if (!t.builtin) {
        const script = t.command?.find((p) => /\$\{SKILL_DIR\}|\{baseDir\}/.test(p));
        if (script) { const rel = script.replace(/\$\{SKILL_DIR\}\/?|\{baseDir\}\/?/g, ''); if (rel && !existsSync(path.join(cap.dir, rel))) add('error', `tool ${t.name}: script ${rel} not found`); }
      }
      if (!t.builtin && !cap.permissions.includes('exec')) add('warning', `script tool ${t.name} implies exec permission; declare it in permissions`);
    }
    const toolPerms = new Set(cap.tools.flatMap((t) => (t.builtin ? getBuiltinTool(t.id)?.permissions || [] : t.permissions || [])));
    for (const p of toolPerms) if (!cap.permissions.includes(p)) add('warning', `tools need "${p}" but permissions do not declare it`);
    for (const dep of [...cap.requires, ...cap.suggests]) if (!names.has(dep.name)) add(cap.requires.includes(dep) ? 'error' : 'warning', `${cap.requires.includes(dep) ? 'requires' : 'suggests'} unknown capability ${dep.name}`);
    for (const check of cap.verify) if (typeof check === 'object' && !getBuiltinTool(check.tool) && !check.tool.startsWith(`${cap.name}.`)) add('error', `verify uses unknown tool ${check.tool}`);
    if (cap.workflow) {
      const ids = new Set(cap.workflow.steps.map((s) => s.id));
      for (const s of cap.workflow.steps) {
        if (s.capability && !names.has(s.capability)) add('error', `workflow step ${s.id} uses unknown capability ${s.capability}`);
        for (const a of s.after || []) if (!ids.has(a)) add('error', `workflow step ${s.id} is after unknown step ${a}`);
        for (const t of s.tools || []) if (!getBuiltinTool(t) && !t.includes('.')) add('error', `workflow step ${s.id} uses unknown tool ${t}`);
      }
    }
    for (const m of cap.body.matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)) {
      const rel = m[1].split('#')[0];
      if (rel && !existsSync(path.join(cap.dir, rel))) add('warning', `SKILL.md links to missing file ${rel}`);
    }
    const evals = path.join(cap.dir, 'evals', 'evals.json');
    if (!existsSync(evals)) add('info', 'no evals/evals.json routing cases');
    else {
      try {
        const data = JSON.parse(await readFile(evals, 'utf8'));
        const pos = (data.cases || []).filter((c) => c.should_activate !== false).length;
        const neg = (data.cases || []).filter((c) => c.should_activate === false).length;
        if (pos < 3) add('info', `only ${pos} positive routing cases`);
        if (!neg) add('info', 'no negative routing cases');
        const intents = new Set(cap.intents.map((i) => i.toLowerCase().trim()));
        for (const c of data.cases || []) if (intents.has(String(c.prompt).toLowerCase().trim())) add('warning', `eval prompt duplicates an intent ("${c.prompt.slice(0, 40)}…"); evals should be unseen`);
      } catch (err) { add('error', `evals/evals.json: ${err.message}`); }
    }
    out.set(cap.dir, problems);
  }
  return out;
}
