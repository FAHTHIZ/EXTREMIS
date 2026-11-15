// Text analysis shared by indexing and querying: tokenization, stop words,
// a light suffix stemmer and a curated concept-synonym table. Index and query use
// exactly the same pipeline, so stemming errors cancel out.

const STOP = new Set(`a about above after again against all also am an and any are as at be because been
before being below between both but by can could did do does doing done down during each either else
etc even ever every few for from further get gets getting give go goes going got had has have having he
her here hers him his how however i if in into is it its itself just let lets like make makes may me
might mine more most much must my need needs no nor not now of off on once one only or other our ours out
over own per please quite rather really said same she should so some such than that the their theirs them
then there these they this those though through thus to too under until up upon us use used uses using
very via want wants was we well were what when where whether which while who whom whose why will with
within without would yet you your yours`.split(/\s+/));

/** Concept groups: a query term from a group adds the other members at reduced weight. */
export const SYNONYM_GROUPS = [
  ['bug', 'defect', 'crash', 'error', 'exception', 'failure', 'regression', 'broken', 'fault', 'stacktrace', 'traceback'],
  ['debug', 'diagnose', 'troubleshoot', 'investigate', 'fix'],
  ['test', 'tests', 'testing', 'spec', 'unittest', 'pytest', 'jest', 'coverage', 'flaky'],
  ['api', 'endpoint', 'rest', 'openapi', 'swagger', 'graphql', 'grpc', 'webhook'],
  ['database', 'db', 'sql', 'postgres', 'postgresql', 'mysql', 'sqlite', 'schema', 'migration', 'query', 'index'],
  ['documentation', 'docs', 'readme', 'guide', 'tutorial', 'manual', 'docstring'],
  ['frontend', 'ui', 'css', 'react', 'component', 'layout', 'html', 'interface'],
  ['mobile', 'ios', 'android', 'app', 'flutter', 'swift', 'kotlin'],
  ['deploy', 'deployment', 'release', 'ship', 'rollout', 'launch', 'publish'],
  ['ci', 'pipeline', 'workflow', 'github', 'actions', 'build'],
  ['performance', 'slow', 'latency', 'speed', 'fast', 'optimize', 'profiling', 'throughput', 'memory', 'cpu'],
  ['security', 'vulnerability', 'exploit', 'cve', 'injection', 'xss', 'csrf', 'ssrf', 'owasp', 'threat'],
  ['secret', 'credential', 'token', 'password', 'apikey', 'key', 'leak'],
  ['privacy', 'gdpr', 'pii', 'personal', 'ccpa', 'hipaa', 'consent', 'retention'],
  ['csv', 'spreadsheet', 'excel', 'xlsx', 'table', 'tabular', 'dataset', 'parquet', 'json'],
  ['chart', 'graph', 'plot', 'visualization', 'visualize', 'dashboard', 'histogram'],
  ['translate', 'translation', 'localization', 'localize', 'i18n', 'l10n', 'locale', 'language'],
  ['seo', 'ranking', 'search', 'metadata', 'sitemap', 'canonical', 'serp'],
  ['pdf', 'docx', 'word', 'document', 'pptx', 'slides', 'extract', 'ocr'],
  ['meeting', 'transcript', 'minutes', 'notes', 'call', 'standup'],
  ['finance', 'financial', 'budget', 'cost', 'revenue', 'npv', 'irr', 'cashflow', 'loan', 'interest', 'forecast'],
  ['statistics', 'statistical', 'significance', 'pvalue', 'hypothesis', 'ttest', 'confidence', 'regression', 'variance'],
  ['experiment', 'ab', 'abtest', 'variant', 'conversion', 'uplift', 'split'],
  ['log', 'logs', 'logging', 'incident', 'outage', 'alert', 'oncall', 'postmortem'],
  ['monitoring', 'observability', 'metrics', 'tracing', 'slo', 'sla', 'uptime', 'reliability'],
  ['docker', 'dockerfile', 'container', 'kubernetes', 'k8s', 'helm', 'image'],
  ['infrastructure', 'terraform', 'iac', 'cloud', 'aws', 'gcp', 'azure'],
  ['dependency', 'dependencies', 'package', 'library', 'upgrade', 'npm', 'pip', 'lockfile', 'sbom', 'license'],
  ['refactor', 'cleanup', 'restructure', 'simplify', 'rename', 'modernize'],
  ['review', 'audit', 'inspect', 'assess', 'evaluate', 'critique'],
  ['research', 'investigate', 'sources', 'literature', 'citation', 'evidence', 'cite'],
  ['write', 'writing', 'draft', 'copy', 'edit', 'prose', 'article', 'blog'],
  ['email', 'outreach', 'message', 'reply', 'newsletter'],
  ['accessibility', 'a11y', 'wcag', 'aria', 'contrast', 'screenreader'],
  ['product', 'prd', 'requirements', 'roadmap', 'feature', 'user', 'story'],
  ['project', 'plan', 'schedule', 'timeline', 'milestone', 'gantt', 'critical', 'estimate'],
  ['decision', 'tradeoff', 'option', 'compare', 'criteria', 'matrix', 'choose'],
  ['contract', 'legal', 'agreement', 'clause', 'terms', 'nda', 'compliance'],
  ['marketing', 'campaign', 'brand', 'positioning', 'messaging', 'audience', 'launch'],
  ['sales', 'prospect', 'lead', 'pipeline', 'deal', 'crm'],
  ['support', 'ticket', 'customer', 'helpdesk', 'faq'],
  ['hiring', 'interview', 'candidate', 'recruit', 'job', 'resume'],
  ['learning', 'teach', 'lesson', 'curriculum', 'quiz', 'study', 'explain'],
  ['git', 'commit', 'branch', 'merge', 'rebase', 'diff', 'changelog'],
  ['shell', 'bash', 'cli', 'terminal', 'command', 'script'],
  ['architecture', 'design', 'system', 'scalability', 'microservice', 'adr'],
  ['scrape', 'crawl', 'fetch', 'download', 'webpage', 'url', 'link', 'http'],
  ['image', 'photo', 'picture', 'svg', 'png', 'graphic'],
  ['prompt', 'llm', 'model', 'agent', 'eval', 'rag', 'embedding'],
  ['readability', 'plain', 'clarity', 'concise', 'tone', 'style'],
];

/** Light suffix stemmer (deliberately conservative; minimum stem length 3). */
export function stem(word) {
  let w = word;
  if (w.length <= 3 || /\d/.test(w)) return w;
  const rules = [
    [/ies$/, 'y'], [/sses$/, 'ss'], [/([^s])s$/, '$1'],
  ];
  for (const [re, rep] of rules) { if (re.test(w)) { w = w.replace(re, rep); break; } }
  const suffixes = ['ization', 'isation', 'ational', 'fulness', 'iveness', 'ations', 'ation', 'ments', 'ment',
    'ness', 'ingly', 'edly', 'able', 'ible', 'ing', 'ers', 'er', 'ed', 'ly', 'ity', 'ive', 'ize', 'ise', 'al'];
  for (const suffix of suffixes) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) {
      w = w.slice(0, -suffix.length);
      if (/(.)\1$/.test(w) && !/(ll|ss|zz)$/.test(w)) w = w.slice(0, -1);
      break;
    }
  }
  if (w.endsWith('e') && w.length > 4) w = w.slice(0, -1);
  return w;
}

// Compound terms that would otherwise split into meaningless single letters.
const COMPOUNDS = [
  [/\ba\s*\/\s*b\b/g, ' abtest '], [/\bp[- ]values?\b/g, ' pvalue '], [/\bt[- ]tests?\b/g, ' ttest '],
  [/\bchi[- ]squared?\b/g, ' chisquare '], [/\be[- ]mail/g, 'email'], [/\b10[- ]k\b/g, ' 10k '], [/\b10[- ]q\b/g, ' 10q '],
  [/\bci\s*\/\s*cd\b/g, ' ci cd '], [/\bnode\.js\b/g, ' nodejs '], [/\.net\b/g, ' dotnet '], [/\bu\.s\.\b/g, ' us '],
  [/\bpost[- ]mortem/g, 'postmortem'], [/\bon[- ]call\b/g, 'oncall'], [/\bset[- ]up\b/g, 'setup'],
];

/** Tokenize free text into normalized stems. */
export function tokenize(text, { keepStop = false } = {}) {
  const out = [];
  let normalized = String(text ?? '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
  for (const [re, rep] of COMPOUNDS) normalized = normalized.replace(re, rep);
  for (const raw of normalized.split(/[^a-z0-9+#]+/)) {
    const word = raw.replace(/^[+#]+|[+#]+$/g, (m) => (raw === 'c++' || raw === 'c#' || raw === 'f#' ? m : ''));
    if (!word || word.length < 2 && !/\d/.test(word)) continue;
    if (!keepStop && STOP.has(word)) continue;
    out.push(stem(word));
  }
  return out;
}

const SYNONYMS = new Map();
for (const group of SYNONYM_GROUPS) {
  const stems = [...new Set(group.map(stem))];
  for (const term of stems) {
    if (!SYNONYMS.has(term)) SYNONYMS.set(term, new Set());
    for (const other of stems) if (other !== term) SYNONYMS.get(term).add(other);
  }
}

/** Expand query stems into weighted terms: original terms weight 1, synonyms lower. */
export function expandQuery(stems, synonymWeight = 0.3) {
  const weights = new Map();
  for (const term of stems) weights.set(term, Math.max(weights.get(term) || 0, 1));
  for (const term of stems) {
    const related = SYNONYMS.get(term);
    if (!related) continue;
    for (const other of related) if (!weights.has(other)) weights.set(other, synonymWeight);
  }
  return weights;
}

/** Rough token estimate (~4 characters per token) used for context budgets. */
export function estimateTokens(text) {
  return Math.ceil(String(text ?? '').length / 4);
}

/** First sentence of a description, capped, for compact cards. */
export function firstSentence(text, max = 160) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  const match = /^(.+?[.!?])(\s|$)/.exec(clean);
  const sentence = match ? match[1] : clean;
  return sentence.length > max ? sentence.slice(0, max - 1).trimEnd() + '…' : sentence;
}
