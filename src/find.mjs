// Federated skill finder. Searches the local catalog plus public skill
// directories (skills.sh, GitHub, Agent Skills well-known indexes), reads the
// SKILL.md of the strongest candidates, re-ranks them against the task and
// security-scans them before anything is recommended for installation.
//
// Network access is limited to fixed public hosts plus index URLs the caller
// passes explicitly (checked with assertPublicUrl). EXTREMIS_OFFLINE=1 or
// { offline: true } restricts the search to the local catalog.

import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tokenize, expandQuery, firstSentence } from './text.mjs';
import { parseSkillDocument } from './frontmatter.mjs';
import { scanFiles, scanText, verdictOf } from './scan.mjs';
import { assertPublicUrl } from './runner.mjs';
import { extremisHome } from './catalog.mjs';

export const FIND_SOURCES = ['local', 'skills.sh', 'github', 'index'];
export const DEFAULT_SKILLS_API = 'https://skills.sh';
const GITHUB_API = 'https://api.github.com';
const RAW_GITHUB = 'https://raw.githubusercontent.com';
const USER_AGENT = 'extremis-find (+https://github.com/FAHTHIZ/EXTREMIS)';

/** Publishers whose skills are maintained by the vendor of the product they cover. */
export const OFFICIAL_PUBLISHERS = new Set([
  'anthropics', 'openai', 'vercel', 'vercel-labs', 'github', 'microsoft', 'google', 'google-gemini',
  'googleworkspace', 'cloudflare', 'huggingface', 'supabase', 'stripe', 'expo', 'remotion-dev', 'aws',
  'awslabs', 'hashicorp', 'mongodb', 'neondatabase', 'prisma', 'sentry', 'getsentry', 'shopify',
  'figma', 'notion', 'netlify', 'firebase', 'langchain-ai', 'mastra-ai', 'better-auth', 'resend',
  'planetscale', 'tinybird', 'posthog', 'datadog', 'grafana', 'elastic', 'docker', 'pulumi',
  'microsoftdocs', 'fahthiz',
]);

// Words that describe the request rather than the skill; they dilute remote queries.
const FILLER = new Set(tokenize('i me my we our you want need would like please help could can should how to way some thing things something using use make get do does doing able also just really best good a an the for with from into onto about that this these those which find skill skills agent agents'));

// Task verbs shared by most requests: matched with low weight, not counted for coverage.
const GENERIC = new Set(tokenize('write writing create build make run check review improve add update fix manage generate work end full complete new app project code file files data'));

export class FindError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/**
 * Turn a natural-language task into remote search queries: the task itself
 * (when short), keyword pairs and single keywords. Directory search engines
 * match short queries far better than whole sentences.
 */
export function buildQueries(query, { max = 6 } = {}) {
  const words = String(query || '').toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) || [];
  const keywords = [];
  for (const w of words) {
    const clean = w.replace(/[.-]+$/g, '');
    const stems = tokenize(clean);
    if (!stems.length || stems.every((s) => FILLER.has(s))) continue;
    if (!keywords.includes(clean)) keywords.push(clean);
  }
  const queries = [];
  const add = (q) => { const v = q.trim(); if (v && !queries.includes(v)) queries.push(v); };
  if (keywords.length && keywords.length <= 3) add(keywords.join(' '));
  for (let i = 0; i + 1 < keywords.length && queries.length < max - 2; i += 1) add(`${keywords[i]} ${keywords[i + 1]}`);
  // Prefer longer, more specific single words.
  for (const k of [...keywords].sort((a, b) => b.length - a.length)) { if (queries.length >= max) break; add(k); }
  if (!queries.length && query) add(String(query).slice(0, 80));
  return { keywords, queries: queries.slice(0, max) };
}

// ---------------------------------------------------------------- HTTP + cache

function makeHttp({ fetchImpl, env, cache, ttlMs, timeoutMs, token }) {
  const fetcher = fetchImpl || globalThis.fetch;
  if (typeof fetcher !== 'function') throw new FindError('no_fetch', 'global fetch is unavailable (Node.js 18.17+ required)');
  const dir = cache === false ? null : (typeof cache === 'string' ? cache : path.join(extremisHome(env), 'cache', 'find'));
  const memo = new Map();
  let requests = 0;

  async function get(url, { json = true, auth = false } = {}) {
    const key = createHash('sha256').update(`${auth ? 'a' : ''}${url}`).digest('hex').slice(0, 32);
    if (memo.has(key)) return memo.get(key);
    const file = dir ? path.join(dir, `${key}.json`) : null;
    if (file) {
      try {
        const hit = JSON.parse(await readFile(file, 'utf8'));
        if (Date.now() - hit.at < ttlMs) { memo.set(key, hit.body); return hit.body; }
      } catch { /* miss */ }
    }
    const headers = { 'user-agent': USER_AGENT, accept: json ? 'application/json' : 'text/plain, */*' };
    if (auth && token) headers.authorization = `Bearer ${token}`;
    if (url.startsWith(GITHUB_API)) headers['x-github-api-version'] = '2022-11-28';
    requests += 1;
    const res = await fetcher(url, { headers, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
    if (!res.ok) throw new FindError(`http_${res.status}`, `${new URL(url).host} returned HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > 4 * 1024 * 1024) throw new FindError('too_large', `${new URL(url).host} response is too large`);
    const body = json ? JSON.parse(text) : text;
    memo.set(key, body);
    if (file) {
      try { await mkdir(dir, { recursive: true }); await writeFile(file, JSON.stringify({ at: Date.now(), body })); } catch { /* cache is best effort */ }
    }
    return body;
  }
  return { get, get requests() { return requests; } };
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

// ------------------------------------------------------------------ providers

function installCommand(source, skill) {
  const target = /^[\w.-]+\/[\w.-]+$/.test(source) ? source : source.includes('://') ? source : `https://${source}`;
  return `extremis install ${target}${skill ? ` --skill ${skill}` : ''}`;
}

function candidate(fields) {
  const source = fields.source;
  const owner = String(source).split('/')[0].toLowerCase();
  return {
    id: fields.id || (fields.skill ? `${source}/${fields.skill}` : source),
    name: fields.name || fields.skill || source.split('/').pop(),
    skill: fields.skill || null,
    source,
    type: fields.type || 'skill',
    description: fields.description || '',
    installs: fields.installs ?? null,
    stars: fields.stars ?? null,
    url: fields.url || (/^[\w.-]+\/[\w.-]+$/.test(source) ? `https://github.com/${source}` : `https://${source}`),
    official: OFFICIAL_PUBLISHERS.has(owner) || OFFICIAL_PUBLISHERS.has(owner.split('.').slice(-2, -1)[0] || ''),
    providers: [fields.provider],
    retrieval: fields.retrieval || 0,
    skill_md_url: fields.skillMdUrl || null,
    install: fields.install || installCommand(source, fields.skill),
  };
}

async function fromSkillsSh(http, plan, { api, owner, perQuery }) {
  const out = [];
  await pool(plan.queries, 3, async (q, qi) => {
    const url = new URL('/api/search', api);
    url.searchParams.set('q', q);
    url.searchParams.set('limit', String(perQuery));
    if (owner) url.searchParams.set('owner', owner);
    const body = await http.get(url.href);
    const weight = q.split(' ').length / Math.max(1, Math.min(3, plan.keywords.length)) * (qi === 0 ? 1 : 0.85);
    for (const [rank, s] of (body.skills || []).entries()) {
      if (!s?.source || !(s.skillId || s.name)) continue;
      out.push(candidate({
        provider: 'skills.sh', source: s.source, skill: s.skillId || s.name, name: s.name || s.skillId,
        installs: Number(s.installs) || 0, retrieval: Math.min(1, weight) / (1 + rank * 0.25),
        url: `https://skills.sh/${s.source}/${s.skillId || s.name}`,
      }));
    }
  });
  return out;
}

async function fromGitHub(http, plan, { token, owner }) {
  const out = [];
  const terms = plan.keywords.slice(0, 4).join(' ');
  if (!terms) return out;
  const scope = owner ? ` user:${owner}` : '';
  const repoQ = encodeURIComponent(`${terms} topic:agent-skills${scope}`);
  const tasks = [http.get(`${GITHUB_API}/search/repositories?q=${repoQ}&sort=stars&order=desc&per_page=10`).then((body) => {
    for (const [rank, r] of (body.items || []).entries()) {
      out.push(candidate({
        provider: 'github', type: 'repository', source: r.full_name, description: r.description || '',
        stars: r.stargazers_count || 0, retrieval: 0.6 / (1 + rank * 0.3), url: r.html_url,
      }));
    }
  })];
  if (token) {
    // Code search requires authentication; it finds SKILL.md files that no directory lists.
    const codeQ = encodeURIComponent(`${terms} filename:SKILL.md${scope}`);
    tasks.push(http.get(`${GITHUB_API}/search/code?q=${codeQ}&per_page=30`, { auth: true }).then((body) => {
      for (const [rank, item] of (body.items || []).entries()) {
        const repo = item.repository?.full_name;
        if (!repo || !/(^|\/)SKILL\.md$/i.test(item.path)) continue;
        const folder = path.posix.dirname(item.path);
        const skill = folder === '.' ? repo.split('/')[1] : path.posix.basename(folder);
        out.push(candidate({
          provider: 'github', source: repo, skill, name: skill, stars: item.repository.stargazers_count ?? null,
          retrieval: 0.8 / (1 + rank * 0.2), url: item.html_url,
          skillMdUrl: `${RAW_GITHUB}/${repo}/HEAD/${item.path.split('/').map(encodeURIComponent).join('/')}`,
        }));
      }
    }));
  }
  const settled = await Promise.allSettled(tasks);
  const failed = settled.filter((s) => s.status === 'rejected');
  if (failed.length === settled.length) throw failed[0].reason;
  return out;
}

async function fromIndexes(http, plan, { indexes, env }) {
  const out = [];
  await pool(indexes, 4, async (raw) => {
    const url = /\.json($|\?)/.test(raw) ? raw : `${raw.replace(/\/+$/, '')}/.well-known/agent-skills/index.json`;
    await assertPublicUrl(url, env);
    const body = await http.get(url);
    const origin = new URL(url).origin;
    for (const s of body.skills || []) {
      if (!s?.name) continue;
      out.push(candidate({
        provider: 'index', source: origin.replace(/^https?:\/\//, ''), skill: s.name, name: s.name,
        description: s.description || '', url: s.url ? new URL(s.url, url).href : origin,
        install: installCommand(origin, s.name),
      }));
    }
  });
  return out;
}

// ------------------------------------------------------------ deep inspection

async function inspect(http, c, { api }) {
  // 1. skills.sh snapshot (all files), 2. raw SKILL.md from GitHub.
  if (c.skill && c.providers.includes('skills.sh')) {
    try {
      const [owner, repo] = c.source.split('/');
      const body = await http.get(new URL(`/api/download/${encodeURIComponent(owner)}/${encodeURIComponent(repo || '')}/${encodeURIComponent(c.skill)}`, api).href);
      const files = (body.files || []).filter((f) => f && typeof f.path === 'string' && typeof f.contents === 'string');
      const doc = files.find((f) => /^skill\.md$/i.test(f.path));
      if (doc) {
        const scan = scanFiles(files.map((f) => ({ path: /^skill\.md$/i.test(f.path) ? 'SKILL.md' : f.path, data: Buffer.from(f.contents) })));
        return { text: doc.contents, files: files.length, scan };
      }
    } catch { /* fall through */ }
  }
  const urls = c.skill_md_url ? [c.skill_md_url] : [];
  if (!urls.length && c.skill && /^[\w.-]+\/[\w.-]+$/.test(c.source)) {
    for (const p of [`skills/${c.skill}/SKILL.md`, `${c.skill}/SKILL.md`, '.claude/skills/' + c.skill + '/SKILL.md', 'SKILL.md']) urls.push(`${RAW_GITHUB}/${c.source}/HEAD/${p}`);
  }
  for (const u of urls) {
    try {
      const text = await http.get(u, { json: false });
      const findings = scanText(text, { file: 'SKILL.md' });
      return { text, files: 1, scan: { verdict: verdictOf(findings), findings, partial: true } };
    } catch { /* try next */ }
  }
  return null;
}

// -------------------------------------------------------------------- ranking

function fieldTokens(c) {
  return {
    name: tokenize(`${c.name} ${c.skill || ''}`.replace(/[-_]/g, ' ')),
    description: tokenize(c.description),
    body: tokenize(String(c.body || '').slice(0, 6000)),
  };
}
const FIELDS = { name: 3, description: 2, body: 0.6 };

function rank(cands, query) {
  const all = [...new Set(tokenize(query))].filter((s) => !FILLER.has(s));
  const specific = all.filter((s) => !GENERIC.has(s));
  const stems = specific.length ? specific : all;
  const terms = expandQuery(stems.length ? stems : tokenize(query));
  for (const g of all) if (GENERIC.has(g) && specific.length) terms.set(g, 0.35);
  const docs = cands.map(fieldTokens);
  const N = docs.length || 1;
  const df = new Map();
  for (const d of docs) for (const t of new Set([...d.name, ...d.description, ...d.body])) df.set(t, (df.get(t) || 0) + 1);
  const avg = Object.fromEntries(Object.keys(FIELDS).map((f) => [f, docs.reduce((n, d) => n + d[f].length, 0) / N || 1]));
  const raw = docs.map((d) => {
    let score = 0;
    const matched = new Set();
    for (const [t, w] of terms) {
      let tf = 0;
      for (const [f, fw] of Object.entries(FIELDS)) {
        const count = d[f].filter((x) => x === t).length;
        if (count) tf += fw * count / (1 - 0.75 + 0.75 * d[f].length / avg[f]);
      }
      if (!tf) continue;
      if (w >= 1) matched.add(t);
      const idf = Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
      score += w * idf * (tf * 2.2) / (tf + 1.2);
    }
    return { score, matched: [...matched] };
  });
  const max = Math.max(1e-9, ...raw.map((r) => r.score));
  return cands.map((c, i) => {
    const relevance = raw[i].score / max;
    const coverage = stems.length ? raw[i].matched.length / stems.length : 0;
    const popularity = c.installs != null ? Math.min(1, Math.log10(1 + c.installs) / 6) : c.stars != null ? Math.min(1, Math.log10(1 + c.stars) / 5) : 0;
    let score = 0.42 * relevance + 0.2 * coverage + 0.15 * Math.min(1, c.retrieval) + 0.13 * popularity * coverage + 0.06 * (c.official ? 1 : 0) + 0.02 * Math.min(2, c.providers.length - 1);
    if (c.type === 'repository') score *= 0.85;
    if (c.verdict === 'dangerous') score *= 0.3;
    else if (c.verdict === 'caution') score *= 0.85;
    if (!raw[i].matched.length) score *= 0.5;
    const confidence = coverage >= 0.6 && relevance >= 0.5 && c.inspected ? 'high' : coverage >= 0.34 ? 'medium' : 'low';
    return { ...c, score: Math.round(score * 1000) / 1000, relevance: Math.round(relevance * 100) / 100, coverage: Math.round(coverage * 100) / 100, matched: raw[i].matched, confidence };
  }).sort((a, b) => b.score - a.score || (b.installs || 0) - (a.installs || 0));
}

function merge(list) {
  const byId = new Map();
  for (const c of list) {
    const key = c.id.toLowerCase();
    const prev = byId.get(key);
    if (!prev) { byId.set(key, { ...c }); continue; }
    prev.providers = [...new Set([...prev.providers, ...c.providers])];
    prev.retrieval = Math.max(prev.retrieval, c.retrieval) + 0.1 * Math.min(prev.retrieval, c.retrieval);
    prev.installs = Math.max(prev.installs ?? 0, c.installs ?? 0) || prev.installs || c.installs;
    prev.stars = prev.stars ?? c.stars;
    prev.description ||= c.description;
    prev.skill_md_url ||= c.skill_md_url;
  }
  return [...byId.values()];
}

// ----------------------------------------------------------------------- main

/**
 * Find skills for a task across the local catalog and public directories.
 *
 * @param {string} query natural-language task or keywords
 * @param {object} [options]
 * @param {number} [options.limit=10] results to return
 * @param {string[]} [options.sources] subset of FIND_SOURCES
 * @param {string[]} [options.indexes] Agent Skills well-known index URLs to include
 * @param {string} [options.owner] restrict remote results to one GitHub owner
 * @param {boolean} [options.deep=true] read and scan SKILL.md of top candidates
 * @param {number} [options.inspect=12] how many candidates to read in deep mode
 * @param {number} [options.minInstalls] drop directory results below this install count
 * @param {boolean} [options.officialOnly] keep only official publishers
 * @param {boolean} [options.offline] local catalog only
 * @param {Function} [options.fetchImpl] fetch replacement (tests)
 * @param {Function} [options.localSearch] async (query, limit) => local search results
 */
export async function find(query, options = {}) {
  const env = options.env || process.env;
  const started = Date.now();
  const q = String(query || '').trim();
  if (!q) throw new FindError('empty_query', 'find needs a query');
  const limit = Math.max(1, Math.min(50, Number(options.limit) || 10));
  const offline = options.offline ?? env.EXTREMIS_OFFLINE === '1';
  const indexes = [].concat(options.indexes || [], env.EXTREMIS_FIND_INDEXES ? env.EXTREMIS_FIND_INDEXES.split(',') : []).map((s) => s.trim()).filter(Boolean);
  let sources = options.sources?.length ? [].concat(options.sources).flatMap((s) => String(s).split(',')).map((s) => s.trim()) : ['local', 'skills.sh', 'github', ...(indexes.length ? ['index'] : [])];
  const unknown = sources.filter((s) => !FIND_SOURCES.includes(s));
  if (unknown.length) throw new FindError('bad_source', `unknown source ${unknown.join(', ')} (expected ${FIND_SOURCES.join(', ')})`);
  if (offline) sources = sources.filter((s) => s === 'local');

  const api = options.skillsApi || env.EXTREMIS_SKILLS_API || DEFAULT_SKILLS_API;
  if (api !== DEFAULT_SKILLS_API && sources.includes('skills.sh')) await assertPublicUrl(api, env);
  const token = options.githubToken ?? env.GITHUB_TOKEN ?? env.GH_TOKEN ?? null;
  const http = makeHttp({ fetchImpl: options.fetchImpl, env, cache: options.cache, ttlMs: Number(options.cacheTtlMs ?? 6 * 3600e3), timeoutMs: Number(options.timeoutMs ?? 10000), token });
  const plan = buildQueries(q);

  const report = {};
  const warnings = [];
  const run = async (name, fn) => {
    const t = Date.now();
    try { const items = await fn(); report[name] = { ok: true, results: items.length, ms: Date.now() - t }; return items; } catch (err) {
      report[name] = { ok: false, error: err.message, ms: Date.now() - t };
      warnings.push(`${name}: ${err.message}`);
      return [];
    }
  };

  const [local, ...remote] = await Promise.all([
    sources.includes('local') && options.localSearch ? run('local', async () => (await options.localSearch(q, Math.min(limit, 5))) || []) : [],
    sources.includes('skills.sh') ? run('skills.sh', () => fromSkillsSh(http, plan, { api, owner: options.owner, perQuery: Math.min(50, Math.max(20, limit * 2)) })) : [],
    sources.includes('github') ? run('github', () => fromGitHub(http, plan, { token, owner: options.owner })) : [],
    sources.includes('index') && indexes.length ? run('index', () => fromIndexes(http, plan, { indexes, env })) : [],
  ]);
  if (sources.includes('github') && !token && report.github?.ok) warnings.push('github: set GITHUB_TOKEN to also search SKILL.md files with code search');

  let cands = merge(remote.flat());
  if (options.owner) cands = cands.filter((c) => c.source.toLowerCase().startsWith(`${String(options.owner).toLowerCase()}/`));
  if (options.minInstalls) cands = cands.filter((c) => c.installs == null || c.installs >= Number(options.minInstalls));
  if (options.officialOnly) cands = cands.filter((c) => c.official);
  const considered = cands.length;

  // First pass on names and directory signals, then read the strongest candidates.
  cands = rank(cands, q);
  const deep = options.deep !== false && !offline;
  if (deep && cands.length) {
    const count = Math.max(limit, Number(options.inspect ?? 12));
    const top = cands.slice(0, count);
    await pool(top, 6, async (c) => {
      if (c.type === 'repository') return;
      const got = await inspect(http, c, { api });
      if (!got) return;
      c.inspected = true;
      c.files = got.files;
      c.verdict = got.scan.verdict;
      c.findings = got.scan.findings.filter((f) => f.severity !== 'info').slice(0, 5).map((f) => ({ severity: f.severity, rule: f.rule, file: f.file, line: f.line, message: f.message }));
      try {
        const doc = parseSkillDocument(got.text);
        c.description = String(doc.data.description || c.description || '');
        if (doc.data.name) c.title = String(doc.data.name);
        if (doc.data.license) c.license = String(doc.data.license);
        c.body = doc.body;
      } catch { c.body = got.text; }
    });
    cands = rank([...top, ...cands.slice(count)], q);
  }

  const results = cands.slice(0, limit).map(({ body, retrieval, skill_md_url: _u, ...c }) => ({
    ...c,
    summary: firstSentence(c.description, 200) || null,
    verdict: c.verdict || 'unscanned',
  }));

  return {
    query: q,
    keywords: plan.keywords,
    queries: plan.queries,
    local: local.map((c) => ({ name: c.name, summary: c.summary, score: c.score, confidence: c.confidence, installed: true, next: `extremis activate ${c.name}` })),
    results,
    considered,
    sources: report,
    warnings,
    offline,
    deep,
    requests: http.requests,
    ms: Date.now() - started,
  };
}
