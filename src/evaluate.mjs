// Routing evaluation. Each capability's evals/evals.json lists prompts that should or
// should not activate it. Positive prompts measure Hit@1, Hit@5 and MRR; negative
// prompts measure false activation (the owning capability ranks in the top k).
// A separate held-out file (evals/routing-holdout.json) is never used for tuning.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { search } from './search.mjs';

export async function loadCases(catalog) {
  const cases = [];
  for (const cap of catalog.list()) {
    const file = path.join(cap.dir, 'evals', 'evals.json');
    if (!existsSync(file)) continue;
    const data = JSON.parse(await readFile(file, 'utf8'));
    for (const c of data.cases || []) {
      cases.push({ id: `${cap.name}/${c.id}`, prompt: c.prompt, owner: cap.name, positive: c.should_activate !== false, expected: c.expected || (c.should_activate !== false ? [cap.name] : []) });
    }
  }
  return cases;
}

export function evaluateCases(index, cases, options = {}) {
  const k = options.k ?? 5;
  let pos = 0, hit1 = 0, hitk = 0, rr = 0, neg = 0, fa1 = 0, fak = 0;
  const misses = [];
  for (const c of cases) {
    const hits = search(index, c.prompt, { limit: k, filters: options.filters });
    const names = hits.map((h) => h.cap.name);
    if (c.positive) {
      pos += 1;
      const rank = names.findIndex((n) => c.expected.includes(n));
      if (rank === 0) hit1 += 1;
      if (rank >= 0) { hitk += 1; rr += 1 / (rank + 1); }
      if (rank !== 0) misses.push({ id: c.id, prompt: c.prompt, expected: c.expected, got: names.slice(0, 3), rank: rank + 1 || null });
    } else {
      neg += 1;
      if (names[0] === c.owner) fa1 += 1;
      if (names.includes(c.owner)) fak += 1;
    }
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 10000) / 100 : 0);
  return {
    positives: pos, negatives: neg,
    hit_at_1: pct(hit1, pos), [`hit_at_${k}`]: pct(hitk, pos), mrr: pos ? Math.round((rr / pos) * 10000) / 10000 : 0,
    false_activation_at_1: pct(fa1, neg), [`false_activation_at_${k}`]: pct(fak, neg),
    misses,
  };
}

export async function loadHoldout(file) {
  if (!existsSync(file)) return [];
  const data = JSON.parse(await readFile(file, 'utf8'));
  return (data.cases || []).map((c, i) => ({ id: c.id || `holdout-${i + 1}`, prompt: c.prompt, owner: null, positive: true, expected: [].concat(c.expected) }));
}
