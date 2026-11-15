// Discovery engine: field-weighted BM25 (BM25F) over capability metadata, authored
// intents and the full instruction body, with conservative synonym expansion, a
// coordination factor and a `not_for` penalty. Plain lexical retrieval is the
// default because it is fast, deterministic, dependency-free and competitive at
// catalogue scale (see docs/architecture-assessment.md). Hosts can pass a reranker.

import { tokenize, expandQuery } from './text.mjs';

export const FIELD_WEIGHTS = {
  name: 4.0,
  keywords: 3.0,
  summary: 2.5,
  intents: 2.2,
  description: 2.0,
  tools: 1.2,
  domain: 1.0,
  body: 0.8,
};
const FIELD_B = { name: 0.3, keywords: 0.5, summary: 0.5, intents: 0.6, description: 0.6, tools: 0.5, domain: 0.2, body: 0.75 };
const K1 = 1.2;

function fieldsOf(cap, toolText) {
  return {
    name: cap.name.replace(/-/g, ' '),
    keywords: cap.keywords.join(' . '),
    summary: cap.summary,
    intents: cap.intents.join(' . '),
    description: cap.description,
    tools: toolText,
    domain: (cap.domain || '').replace(/-/g, ' '),
    body: cap.body,
  };
}

function counts(tokens) {
  const map = new Map();
  for (const t of tokens) map.set(t, (map.get(t) || 0) + 1);
  return map;
}

/**
 * Build an in-memory index for a catalog.
 * @param {import('./catalog.mjs').Catalog} catalog
 * @param {{ describeTool?: (id: string) => string }} options
 */
export function buildIndex(catalog, options = {}) {
  const describeTool = options.describeTool || ((id) => id.replace(/[._]/g, ' '));
  const docs = [];
  const df = new Map();
  const totals = Object.fromEntries(Object.keys(FIELD_WEIGHTS).map((f) => [f, 0]));
  for (const cap of catalog.list()) {
    const toolText = cap.tools.map((t) => (t.builtin ? describeTool(t.id) : `${t.name} ${t.description}`)).join(' . ');
    const fields = fieldsOf(cap, toolText);
    const tf = {}; const len = {};
    const seen = new Set();
    for (const [field, text] of Object.entries(fields)) {
      const tokens = tokenize(text);
      tf[field] = counts(tokens);
      len[field] = tokens.length;
      totals[field] += tokens.length;
      for (const t of tf[field].keys()) seen.add(t);
    }
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
    const notFor = cap.not_for.map((phrase) => [...new Set(tokenize(phrase))]).filter((p) => p.length);
    // Negative evidence: terms the author used only to say what the capability is NOT for.
    const positive = new Set(['name', 'keywords', 'summary', 'intents', 'description'].flatMap((f) => [...tf[f].keys()]));
    const negative = new Set(notFor.flat().filter((t) => !positive.has(t)));
    docs.push({ cap, tf, len, notFor, negative });
  }
  const n = docs.length || 1;
  const avg = Object.fromEntries(Object.entries(totals).map(([f, total]) => [f, total / n || 1]));
  return { docs, df, avg, n };
}

function idf(index, term) {
  const d = index.df.get(term) || 0;
  return Math.log(1 + (index.n - d + 0.5) / (d + 0.5));
}

function scoreDoc(index, doc, queryWeights) {
  let score = 0;
  const matched = [];
  for (const [term, qWeight] of queryWeights) {
    let pseudo = 0;
    for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
      const tf = doc.tf[field].get(term);
      if (!tf) continue;
      const b = FIELD_B[field];
      pseudo += (weight * tf) / (1 - b + (b * doc.len[field]) / index.avg[field]);
    }
    if (pseudo === 0) continue;
    if (qWeight >= 1) matched.push(term);
    score += qWeight * idf(index, term) * (pseudo / (K1 + pseudo));
  }
  return { score, matched };
}

function notForPenalty(doc, queryTerms) {
  let negativeHits = 0;
  for (const t of queryTerms) if (doc.negative.has(t)) negativeHits += 1;
  let worst = 0;
  for (const phrase of doc.notFor) {
    const hit = phrase.filter((t) => queryTerms.has(t)).length;
    const coverage = hit / phrase.length;
    if (phrase.length === 1 ? hit === 1 : coverage >= 0.5) worst = Math.max(worst, coverage);
  }
  const phrase = worst ? 1 - 0.75 * worst : 1;
  return Math.max(0.15, phrase * 0.6 ** negativeHits);
}

const RISK_ORDER = { low: 0, medium: 1, high: 2 };

function passesFilters(cap, filters) {
  if (!filters) return true;
  if (filters.domain && ![].concat(filters.domain).includes(cap.domain)) return false;
  if (filters.kind && cap.kind !== filters.kind) return false;
  if (filters.source && ![].concat(filters.source).includes(cap.source.type)) return false;
  if (filters.max_risk && RISK_ORDER[cap.risk] > RISK_ORDER[filters.max_risk]) return false;
  if (filters.has_tools && cap.tools.length === 0) return false;
  if (filters.permissions) {
    const allowed = new Set([].concat(filters.permissions));
    if (!cap.permissions.every((p) => allowed.has(p))) return false;
  }
  return true;
}

/**
 * Search the index. Returns ranked hits: { cap, score, matched, coverage }.
 * options: limit, filters, synonymWeight, rerank(query, hits) => hits
 */
export function search(index, query, options = {}) {
  const limit = Math.max(1, Math.min(options.limit ?? 5, 50));
  const stems = [...new Set(tokenize(query))];
  if (!stems.length) return [];
  const queryWeights = expandQuery(stems, options.synonymWeight ?? 0.3);
  const queryTerms = new Set(stems);
  const hits = [];
  for (const doc of index.docs) {
    if (!passesFilters(doc.cap, options.filters)) continue;
    const { score, matched } = scoreDoc(index, doc, queryWeights);
    if (score <= 0) continue;
    const coverage = matched.length / stems.length;
    const adjusted = score * (0.6 + 0.4 * coverage) * notForPenalty(doc, queryTerms);
    hits.push({ cap: doc.cap, score: adjusted, matched, coverage });
  }
  hits.sort((a, b) => b.score - a.score || a.cap.name.localeCompare(b.cap.name));
  let ranked = hits.slice(0, Math.max(limit, options.rerank ? 20 : limit));
  if (options.rerank) ranked = options.rerank(query, ranked) || ranked;
  const top = ranked[0]?.score || 1;
  return ranked.slice(0, limit).map((hit) => ({ ...hit, relative: hit.score / top, confidence: confidenceOf(hit, top) }));
}

function confidenceOf(hit, top) {
  const relative = hit.score / top;
  if (hit.coverage >= 0.5 && relative >= 0.8 && hit.score >= 4) return 'high';
  if (hit.coverage >= 0.3 && relative >= 0.5 && hit.score >= 2) return 'medium';
  return 'low';
}
