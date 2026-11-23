// AI-engineering and delivery-pipeline tools: GitHub Actions and Terraform
// linting, prompt linting and offline LLM evaluation scoring. Heuristic,
// deterministic and dependency-free.

import { readTextInput, ToolInputError } from './util.mjs';
import { findSecrets } from './security.mjs';
import { estimateTokens } from '../text.mjs';

const add = (list) => (line, rule, severity, message) => list.push({ line, rule, severity, message });
const SEVERITY_ORDER = ['low', 'medium', 'high', 'critical'];
const sortFindings = (f) => f.sort((a, b) => SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity) || (a.line ?? 0) - (b.line ?? 0));
const countBy = (f) => Object.fromEntries(SEVERITY_ORDER.map((s) => [s, f.filter((x) => x.severity === s).length]));

// ------------------------------------------------------------ GitHub Actions

const UNTRUSTED = /\$\{\{\s*github\.(event\.(issue\.(title|body)|pull_request\.(title|body|head\.ref|head\.label)|comment\.body|review\.body|review_comment\.body|discussion\.(title|body)|pages\.[^}]*page_name|commits\.[^}]*\.(message|author\.(name|email))|head_commit\.(message|author\.(name|email)))|head_ref)\s*\}\}/;

export function lintWorkflow(text) {
  const findings = [];
  const f = add(findings);
  const lines = text.split('\n');
  const triggers = new Set();
  let topPermissions = false;
  let inRun = false; let runIndent = 0;
  let checkoutHead = null;
  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.replace(/\s+#.*$/, '');
    const indent = raw.search(/\S/);
    if (!line.trim()) return;
    if (/^permissions\s*:/.test(line)) { topPermissions = true; if (/write-all/.test(line)) f(n, 'permissions-write-all', 'high', 'workflow grants write-all; grant only the scopes each job needs'); }
    else if (/^\s+permissions\s*:\s*write-all/.test(line)) f(n, 'permissions-write-all', 'high', 'job grants write-all; grant only the scopes it needs');
    for (const t of ['pull_request_target', 'workflow_run', 'issue_comment', 'pull_request', 'push', 'schedule', 'workflow_dispatch']) if (new RegExp(`(^|[\\s\\[,{-])${t}\\s*[:,\\]}]|^\\s*-\\s*${t}\\s*$|^on:\\s*${t}\\s*$`).test(line)) triggers.add(t);
    const uses = /^\s*(-\s*)?uses\s*:\s*["']?([^"'\s]+)/.exec(line);
    if (uses) {
      const ref = uses[2];
      if (!ref.startsWith('./') && !ref.startsWith('docker://')) {
        const at = ref.split('@')[1];
        if (!at) f(n, 'action-unversioned', 'high', `${ref} has no version; pin a full commit SHA`);
        else if (!/^[0-9a-f]{40}$/.test(at)) f(n, 'action-not-sha-pinned', /^(actions|github)\//.test(ref) ? 'low' : 'medium', `${ref} is pinned to a mutable tag; pin the full commit SHA (keep the tag in a comment)`);
      }
      if (/actions\/checkout/.test(ref)) checkoutHead = n;
    }
    if (/ref\s*:\s*\$\{\{\s*github\.event\.pull_request\.head\.(sha|ref)/.test(line) && checkoutHead) checkoutHead = -n;
    if (/persist-credentials\s*:\s*false/.test(line)) checkoutHead = checkoutHead && checkoutHead < 0 ? checkoutHead : null;
    if (/^\s*(-\s*)?run\s*:/.test(line)) { inRun = true; runIndent = indent; }
    else if (inRun && indent <= runIndent && !/^\s*$/.test(line)) inRun = /^\s*(-\s*)?run\s*:/.test(line);
    if ((inRun || /^\s*(-\s*)?run\s*:/.test(line)) && UNTRUSTED.test(line)) f(n, 'script-injection', 'critical', 'untrusted event text is interpolated into a shell command; pass it through env: and quote it');
    if (/^\s*script\s*:/.test(line) && UNTRUSTED.test(line)) f(n, 'script-injection', 'critical', 'untrusted event text is interpolated into github-script code');
    if (/echo[^\n]*\$\{\{\s*secrets\./.test(line)) f(n, 'secret-echo', 'high', 'a secret is echoed into the log');
    if (/(curl|wget)[^|\n]*\|\s*(sudo\s+)?(ba)?sh/.test(line)) f(n, 'curl-pipe-shell', 'medium', 'piping a download into a shell; download, verify a checksum, then run');
    if (/runs-on\s*:\s*\[?\s*self-hosted/.test(line)) f(n, 'self-hosted-runner', 'medium', 'self-hosted runner: never run it for pull requests from forks');
    if (/ACTIONS_ALLOW_UNSECURE_COMMANDS\s*:\s*["']?true/i.test(line)) f(n, 'unsecure-commands', 'high', 'ACTIONS_ALLOW_UNSECURE_COMMANDS re-enables set-env injection');
    if (/continue-on-error\s*:\s*true/.test(line)) f(n, 'continue-on-error', 'low', 'continue-on-error hides failures; scope it to the step that may fail');
  });
  if (!topPermissions) f(null, 'missing-permissions', 'medium', 'no top-level permissions block; the token gets the repository default (often write)');
  if (triggers.has('pull_request_target') && checkoutHead && checkoutHead < 0) f(-checkoutHead, 'pwn-request', 'critical', 'pull_request_target checks out the pull request head: untrusted code runs with secrets and a write token');
  else if (triggers.has('pull_request_target')) f(null, 'pull-request-target', 'medium', 'pull_request_target runs with secrets; never build or run code from the pull request');
  if (!/timeout-minutes/.test(text)) f(null, 'no-timeout', 'low', 'no timeout-minutes; a hung job runs for 6 hours');
  for (const s of findSecrets(text)) f(s.line, `secret:${s.rule}`, 'high', `possible hard-coded secret ${s.masked}`);
  sortFindings(findings);
  return { triggers: [...triggers].sort(), counts: countBy(findings), findings };
}

// ------------------------------------------------------------------ Terraform

export function lintTerraform(text) {
  const findings = [];
  const f = add(findings);
  const lines = text.split('\n');
  let block = null; let depth = 0; let hasRequiredProviders = false; let versionedProviders = 0; let providerEntries = 0; let inRequired = false;
  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.replace(/(#|\/\/).*$/, '');
    const head = /^\s*(resource|data|module|provider|variable|output|terraform)\s+("[^"]+"\s*)*\{/.exec(line);
    if (head && depth === 0) block = line.trim();
    if (/required_providers\s*\{/.test(line)) { hasRequiredProviders = true; inRequired = true; }
    if (inRequired && /^\s*[\w-]+\s*=\s*\{/.test(line)) providerEntries += 1;
    if (inRequired && /^\s*version\s*=/.test(line)) versionedProviders += 1;
    depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    if (inRequired && depth <= 1) inRequired = false;
    if (depth <= 0) { depth = 0; }

    if (/cidr_blocks\s*=\s*\[[^\]]*"0\.0\.0\.0\/0"/.test(line) || /cidr_ipv4\s*=\s*"0\.0\.0\.0\/0"/.test(line) || /ipv6_cidr_blocks\s*=\s*\[[^\]]*"::\/0"/.test(line)) {
      const egress = /egress/.test(block || '') || /egress/.test(lines.slice(Math.max(0, i - 6), i).join('\n'));
      if (!egress) f(n, 'open-ingress', 'high', 'ingress open to the whole internet; restrict the CIDR or put it behind a load balancer');
    }
    if (/source_address_prefix\s*=\s*"(\*|0\.0\.0\.0\/0|Internet)"/.test(line)) f(n, 'open-ingress', 'high', 'network rule allows any source address');
    if (/acl\s*=\s*"(public-read|public-read-write|authenticated-read)"/.test(line)) f(n, 'public-bucket-acl', 'critical', 'bucket ACL makes objects public');
    if (/(block_public_acls|block_public_policy|ignore_public_acls|restrict_public_buckets)\s*=\s*false/.test(line)) f(n, 'public-access-block-disabled', 'high', 'S3 public access block is disabled');
    if (/publicly_accessible\s*=\s*true/.test(line)) f(n, 'public-database', 'high', 'database is publicly accessible');
    if (/(storage_encrypted|encrypted|enable_encryption|encryption_enabled)\s*=\s*false/.test(line)) f(n, 'encryption-disabled', 'high', 'encryption at rest is disabled');
    if (/(password|secret|token|access_key|secret_key|api_key|private_key)\s*=\s*"[^"$][^"]{3,}"/i.test(line) && !/var\.|data\.|random_|\$\{/.test(line)) f(n, 'hardcoded-secret', 'critical', 'a credential is hard-coded; use a variable marked sensitive or a secrets manager');
    if (/deletion_protection\s*=\s*false/.test(line)) f(n, 'no-deletion-protection', 'low', 'deletion protection is off');
    if (/skip_final_snapshot\s*=\s*true/.test(line)) f(n, 'skip-final-snapshot', 'low', 'no final snapshot on delete');
    if (/^\s*source\s*=\s*"git::[^"?]+"/.test(line) || /^\s*source\s*=\s*"github\.com\/[^"?]+"/.test(line)) f(n, 'module-unpinned', 'medium', 'git module source has no ?ref=; pin a tag or commit');
    if (/"(Action|Resource)"\s*:\s*"\*"/.test(line) || /(actions|resources)\s*=\s*\[\s*"\*"\s*\]/.test(line)) f(n, 'iam-wildcard', 'high', 'IAM policy uses a wildcard action or resource');
    if (/http_tokens\s*=\s*"optional"/.test(line)) f(n, 'imdsv1', 'medium', 'instance metadata allows IMDSv1; require tokens');
    if (/versioning\s*\{/.test(line) && /enabled\s*=\s*false/.test(lines.slice(i, i + 3).join('\n'))) f(n, 'versioning-disabled', 'low', 'bucket versioning is disabled');
  });
  if (/^\s*provider\s+"/m.test(text) && !hasRequiredProviders) f(null, 'providers-unpinned', 'medium', 'no required_providers block; pin provider sources and versions');
  else if (providerEntries && versionedProviders < providerEntries) f(null, 'providers-unpinned', 'medium', `${providerEntries - versionedProviders} required provider(s) have no version constraint`);
  if (/^\s*terraform\s*\{/m.test(text) && !/backend\s+"/.test(text) && !/cloud\s*\{/.test(text)) f(null, 'local-state', 'low', 'no remote backend; state stays on one machine');
  for (const s of findSecrets(text)) if (!findings.some((x) => x.line === s.line)) f(s.line, `secret:${s.rule}`, 'high', `possible hard-coded secret ${s.masked}`);
  sortFindings(findings);
  return { resources: (text.match(/^\s*resource\s+"/gm) || []).length, modules: (text.match(/^\s*module\s+"/gm) || []).length, counts: countBy(findings), findings };
}

// --------------------------------------------------------------------- prompts

export function lintPrompt(text, { inputVariables = [] } = {}) {
  const findings = [];
  const f = add(findings);
  const lower = text.toLowerCase();
  const tokens = estimateTokens(text);
  const vars = [...new Set([...(text.matchAll(/\{\{\s*([\w.-]+)\s*\}\}|\{([a-zA-Z_][\w]*)\}|\$\{([a-zA-Z_][\w]*)\}/g))].map((m) => m[1] || m[2] || m[3]))];
  const has = (re) => re.test(text);
  if (tokens < 25) f(null, 'too-short', 'medium', 'very short prompt; state the task, context, constraints and output format');
  if (tokens > 6000) f(null, 'very-long', 'low', `~${tokens} tokens; move reference material out of the instruction block or retrieve it on demand`);
  if (!has(/\b(you are|your (role|job|task)|act as|as an? [a-z]+ (assistant|agent|expert))/i) && !has(/^#+\s*(role|task|goal|objective)/im)) f(null, 'no-role-or-task', 'low', 'no explicit role or task statement');
  if (!has(/\b(output|respond|return|reply|answer|format|json|markdown|table|bullet|schema|fields?)\b/i)) f(null, 'no-output-format', 'medium', 'no output format; say exactly what to return');
  if (has(/\bjson\b/i) && !has(/\{[\s\S]*"[\w]+"\s*:/) && !has(/schema/i)) f(null, 'json-without-schema', 'medium', 'asks for JSON without a schema or example object');
  if (!has(/\b(example|e\.g\.|for instance|<example>|input:|output:)/i) && tokens > 150) f(null, 'no-examples', 'low', 'no examples; one input/output pair usually removes ambiguity');
  if (!has(/\b(if (you|the) (are|is|can ?not|don'?t|do not)|unsure|unknown|not sure|insufficient|cannot determine|say so|ask)\b/i)) f(null, 'no-uncertainty-path', 'medium', 'no instruction for missing information or uncertainty; models fill gaps by guessing');
  const shouting = (text.match(/\b[A-Z]{4,}\b/g) || []).filter((w) => !/^(JSON|HTML|YAML|HTTP|HTTPS|TODO|NOTE|UUID|ISO|UTF|CSV|SQL|REST|API|URL|XML|PDF)$/.test(w)).length;
  if (shouting >= 5) f(null, 'shouting', 'low', `${shouting} all-caps words; heavy emphasis makes models over-apply rules. Explain why instead`);
  const vague = (lower.match(/\b(etc\.?|and so on|some|various|appropriate|as needed|good|nice|properly|stuff|things)\b/g) || []).length;
  if (vague >= 4) f(null, 'vague-language', 'low', `${vague} vague words (etc., appropriate, properly…); replace with concrete criteria`);
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  conflict: for (const [pos, neg] of [[/\balways\b/i, /\bnever\b/i], [/\bmust\b(?!\s+not)/i, /\bmust not\b/i]]) {
    for (const [i, a] of sentences.entries()) {
      if (!pos.test(a) || neg.test(a)) continue;
      const words = (a.toLowerCase().match(/\b[a-z]{5,}\b/g) || []).filter((w) => !/^(always|should|would|could|their|there|which|about)$/.test(w));
      for (const [j, b] of sentences.entries()) {
        if (j === i || !neg.test(b)) continue;
        const shared = words.find((w) => new RegExp(`\\b${w}\\b`, 'i').test(b));
        if (shared) { f(null, 'possible-conflict', 'medium', `"${a.trim().slice(0, 50)}" may conflict with "${b.trim().slice(0, 50)}" (both mention "${shared}")`); break conflict; }
      }
    }
  }
  const placeholders = text.match(/\[(insert|your|todo|tbd|placeholder)[^\]]*\]|<(insert|your|todo)[^>]*>|\bTODO\b|\bTBD\b|lorem ipsum/gi) || [];
  if (placeholders.length) f(null, 'unfilled-placeholder', 'high', `unfilled placeholder: ${placeholders.slice(0, 3).join(', ')}`);
  const untrusted = [...new Set([...vars, ...inputVariables])].filter((v) => /input|user|query|question|message|document|content|text|email|page|html|context|retrieved|search/i.test(v));
  for (const v of untrusted) {
    const pattern = new RegExp(`(<[\\w-]+>|"""|\`\`\`|-{3,}|#{2,}[^\\n]*)\\s*(\\{\\{\\s*${v}\\s*\\}\\}|\\{${v}\\}|\\$\\{${v}\\})`, 'i');
    if (!pattern.test(text)) f(null, 'undelimited-input', 'medium', `variable "${v}" is inserted without delimiters; wrap untrusted text in tags and say it is data, not instructions`);
  }
  if (untrusted.length && !has(/\b(ignore|do not follow|treat (it|them|this) as data|not instructions|untrusted)\b/i)) f(null, 'no-injection-guard', 'medium', 'untrusted input is included but the prompt never says to treat it as data');
  for (const s of findSecrets(text)) f(s.line, `secret:${s.rule}`, 'critical', `prompt contains a secret ${s.masked}`);
  sortFindings(findings);
  const penalty = findings.reduce((n, x) => n + ({ low: 4, medium: 10, high: 20, critical: 35 })[x.severity], 0);
  return { tokens, variables: vars, score: Math.max(0, 100 - penalty), counts: countBy(findings), findings };
}

// ------------------------------------------------------------------ eval score

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\b(a|an|the)\b/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
function tokenF1(pred, gold) {
  const p = norm(pred).split(' ').filter(Boolean); const g = norm(gold).split(' ').filter(Boolean);
  if (!p.length && !g.length) return 1;
  if (!p.length || !g.length) return 0;
  const counts = new Map(); for (const t of g) counts.set(t, (counts.get(t) || 0) + 1);
  let common = 0; for (const t of p) if (counts.get(t) > 0) { common += 1; counts.set(t, counts.get(t) - 1); }
  if (!common) return 0;
  const precision = common / p.length; const recall = common / g.length;
  return 2 * precision * recall / (precision + recall);
}
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; }; }
function bootstrap(values, iterations = 1000, seed = 7) {
  if (values.length < 2) return null;
  const r = rng(seed); const means = [];
  for (let i = 0; i < iterations; i += 1) { let sum = 0; for (let j = 0; j < values.length; j += 1) sum += values[Math.floor(r() * values.length)]; means.push(sum / values.length); }
  means.sort((a, b) => a - b);
  return [means[Math.floor(iterations * 0.025)], means[Math.floor(iterations * 0.975)]].map((x) => Math.round(x * 1e4) / 1e4);
}
const round = (x) => Math.round(x * 1e4) / 1e4;

export function scoreEval(items, { mode = 'auto', contains = false } = {}) {
  if (!Array.isArray(items) || !items.length) throw new ToolInputError('provide a non-empty "items" array of { expected, predicted }');
  const rows = items.map((it, i) => {
    if (!it || !('expected' in it) || !('predicted' in it)) throw new ToolInputError(`item ${i} needs "expected" and "predicted"`);
    const expected = [].concat(it.expected).map(String); const predicted = String(it.predicted ?? '');
    const exact = expected.some((e) => e.trim() === predicted.trim()) ? 1 : 0;
    const normalized = expected.some((e) => norm(e) === norm(predicted)) ? 1 : 0;
    const f1 = Math.max(...expected.map((e) => tokenF1(predicted, e)));
    const contained = expected.some((e) => norm(predicted).includes(norm(e))) ? 1 : 0;
    return { id: it.id ?? i, expected, predicted, exact, normalized, f1, contained, group: it.group };
  });
  const labels = new Set(rows.flatMap((r) => r.expected.map(norm)));
  const classification = mode === 'classification' || (mode === 'auto' && labels.size < rows.length && labels.size <= 50 && rows.every((r) => r.expected.length === 1 && norm(r.expected[0]).split(' ').length <= 3));
  const mean = (k) => round(rows.reduce((n, r) => n + r[k], 0) / rows.length);
  const primaryKey = classification ? 'normalized' : contains ? 'contained' : 'f1';
  const out = {
    n: rows.length, mode: classification ? 'classification' : 'generation',
    exact_match: mean('exact'), normalized_match: mean('normalized'), token_f1: mean('f1'), contains_expected: mean('contained'),
    primary: { metric: primaryKey === 'normalized' ? 'accuracy' : primaryKey === 'contained' ? 'contains_expected' : 'token_f1', value: mean(primaryKey), ci95: bootstrap(rows.map((r) => r[primaryKey])) },
  };
  if (classification) {
    const all = [...new Set([...rows.map((r) => norm(r.expected[0])), ...rows.map((r) => norm(r.predicted))])].sort();
    const matrix = Object.fromEntries(all.map((a) => [a, Object.fromEntries(all.map((b) => [b, 0]))]));
    for (const r of rows) matrix[norm(r.expected[0])][norm(r.predicted)] += 1;
    const per = {};
    for (const l of all) {
      const tp = matrix[l][l]; const fp = all.reduce((n, a) => n + (a !== l ? matrix[a][l] : 0), 0); const fn = all.reduce((n, b) => n + (b !== l ? matrix[l][b] : 0), 0);
      const p = tp + fp ? tp / (tp + fp) : 0; const rc = tp + fn ? tp / (tp + fn) : 0;
      per[l] = { support: tp + fn, precision: round(p), recall: round(rc), f1: round(p + rc ? 2 * p * rc / (p + rc) : 0) };
    }
    const supported = Object.values(per).filter((x) => x.support);
    out.macro_f1 = round(supported.reduce((n, x) => n + x.f1, 0) / (supported.length || 1));
    out.per_label = per; out.confusion = matrix;
  }
  const groups = [...new Set(rows.map((r) => r.group).filter((g) => g !== undefined))];
  if (groups.length) out.by_group = Object.fromEntries(groups.map((g) => { const rs = rows.filter((r) => r.group === g); return [g, { n: rs.length, value: round(rs.reduce((n, r) => n + r[primaryKey], 0) / rs.length) }]; }));
  out.failures = rows.filter((r) => !r[primaryKey] || (primaryKey === 'f1' && r.f1 < 0.5)).slice(0, 20).map((r) => ({ id: r.id, expected: r.expected.length === 1 ? r.expected[0] : r.expected, predicted: r.predicted.slice(0, 300), f1: round(r.f1) }));
  if (rows.length < 30) out.warning = `only ${rows.length} items; the confidence interval is wide, so treat differences under ~10 points as noise`;
  return out;
}

async function readItems(ctx, input) {
  if (Array.isArray(input.items)) return input.items;
  const { text } = await readTextInput(ctx, input);
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) return JSON.parse(trimmed);
  return trimmed.split('\n').filter((l) => l.trim()).map((l, i) => { try { return JSON.parse(l); } catch { throw new ToolInputError(`line ${i + 1} is not valid JSON`); } });
}

export default [
  {
    id: 'ci.workflow_lint',
    title: 'Lint a GitHub Actions workflow',
    description: 'Check a GitHub Actions workflow for script injection from untrusted event text, pull_request_target "pwn requests", missing or write-all permissions, actions not pinned to a commit SHA, echoed or hard-coded secrets, curl-pipe-shell, self-hosted runners and missing timeouts.',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Workflow file, e.g. .github/workflows/ci.yml' }, content: { type: 'string' } } },
    async run(input, ctx) { return lintWorkflow((await readTextInput(ctx, input)).text); },
  },
  {
    id: 'iac.terraform_lint',
    title: 'Lint Terraform configuration',
    description: 'Check Terraform (HCL) for internet-open ingress, public buckets and databases, disabled encryption or public-access blocks, hard-coded credentials, IAM wildcards, IMDSv1, unpinned providers and modules, and local state.',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { path: { type: 'string', description: 'A .tf file' }, content: { type: 'string' } } },
    async run(input, ctx) { return lintTerraform((await readTextInput(ctx, input)).text); },
  },
  {
    id: 'prompt.lint',
    title: 'Lint an LLM prompt',
    description: 'Score a system or task prompt 0-100 and list issues: missing task, output format or uncertainty path, JSON without a schema, conflicting rules, unfilled placeholders, untrusted variables without delimiters or an injection guard, shouting, vague wording and embedded secrets.',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string', description: 'Prompt text; {var}, {{var}} and ${var} are treated as template variables' }, input_variables: { type: 'array', items: { type: 'string' }, description: 'Variables that carry untrusted text' } } },
    async run(input, ctx) { return lintPrompt((await readTextInput(ctx, input)).text, { inputVariables: input.input_variables || [] }); },
  },
  {
    id: 'eval.score',
    title: 'Score LLM outputs against references',
    description: 'Offline evaluation of model outputs: exact and normalized match, SQuAD-style token F1, contains-expected, accuracy with per-label precision/recall, macro F1 and a confusion matrix for classification, per-group breakdown, bootstrap 95% confidence interval and the worst failures.',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', required: ['expected', 'predicted'], properties: { id: {}, expected: { description: 'Reference answer or list of acceptable answers' }, predicted: { type: 'string' }, group: { type: 'string' } } } }, path: { type: 'string', description: 'JSON array or JSONL file of items' }, content: { type: 'string' }, mode: { type: 'string', enum: ['auto', 'classification', 'generation'], default: 'auto' }, contains: { type: 'boolean', default: false, description: 'Score generation by whether the output contains the reference' } } },
    async run(input, ctx) { return scoreEval(await readItems(ctx, input), { mode: input.mode, contains: input.contains }); },
  },
];
