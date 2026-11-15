// Security and privacy tools: secret scanning, risky code patterns, PII detection
// and Dockerfile linting. Findings never echo full secrets; values are masked.

import path from 'node:path';
import { readTextInput, mask, lineOf, shannonEntropy } from './util.mjs';

export const SECRET_RULES = [
  ['aws-access-key-id', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, 'high'],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g, 'high'],
  ['github-fine-grained-token', /\bgithub_pat_[A-Za-z0-9_]{60,255}\b/g, 'high'],
  ['gitlab-token', /\bglpat-[A-Za-z0-9_-]{20,}\b/g, 'high'],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, 'high'],
  ['slack-webhook', /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g, 'high'],
  ['stripe-secret-key', /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}\b/g, 'high'],
  ['openai-api-key', /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}\b|\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}\b/g, 'high'],
  ['anthropic-api-key', /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{80,}\b/g, 'high'],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/g, 'high'],
  ['npm-token', /\bnpm_[A-Za-z0-9]{36}\b/g, 'high'],
  ['pypi-token', /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}\b/g, 'high'],
  ['sendgrid-key', /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g, 'high'],
  ['twilio-key', /\bSK[0-9a-fA-F]{32}\b/g, 'medium'],
  ['private-key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g, 'high'],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, 'medium'],
  ['database-url-with-password', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]{3,}@[^\s/]+/g, 'high'],
  ['generic-assigned-secret', /(?<![\w-])(?:api[_-]?key|secret|token|passw(?:or)?d|pwd|auth|credential|access[_-]?key)[\w-]{0,20}\s*[:=]\s*["']?([A-Za-z0-9_\-+/=.]{12,})["']?/gi, 'medium'],
];
const PLACEHOLDER = /^(x+|\*+|\.+|<[^>]*>|\$\{?[A-Z_]+\}?|changeme|change_me|example|placeholder|your[_-].*|dummy|test|sample|redacted|null|none|todo|fake.*|xxx.*|\{\{.*\}\})$/i;

/** Find secrets in text. Returns [{ rule, severity, index, line, masked }]. */
export function findSecrets(text) {
  const findings = [];
  for (const [rule, re, severity] of SECRET_RULES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const value = rule === 'generic-assigned-secret' ? m[1] : m[0];
      if (rule === 'generic-assigned-secret') {
        if (PLACEHOLDER.test(value) || shannonEntropy(value) < 3.2 || /^(true|false|\d+)$/i.test(value) || /process\.env|os\.environ|getenv/.test(text.slice(Math.max(0, m.index - 5), m.index + m[0].length + 20))) continue;
      }
      if (findings.some((f) => f.index === m.index)) continue;
      findings.push({ rule, severity, index: m.index, line: lineOf(text, m.index), masked: mask(value) });
    }
  }
  return findings;
}

const CODE_RULES = [
  { id: 'eval', langs: ['js', 'py', 'rb', 'php'], re: /\beval\s*\(/, severity: 'high', cwe: 'CWE-95', message: 'dynamic code evaluation' },
  { id: 'new-function', langs: ['js'], re: /\bnew Function\s*\(/, severity: 'high', cwe: 'CWE-95', message: 'dynamic code evaluation via Function constructor' },
  { id: 'child-process-shell', langs: ['js'], re: /\b(exec|execSync)\s*\(\s*(`[^`]*\$\{|[^)'"`]*\+)/, severity: 'high', cwe: 'CWE-78', message: 'shell command built from variables' },
  { id: 'shell-true', langs: ['py'], re: /subprocess\.\w+\([^)]*shell\s*=\s*True/, severity: 'high', cwe: 'CWE-78', message: 'subprocess with shell=True' },
  { id: 'os-system', langs: ['py'], re: /\bos\.(system|popen)\s*\(/, severity: 'medium', cwe: 'CWE-78', message: 'os.system/os.popen runs a shell' },
  { id: 'sql-concat', langs: ['js', 'py', 'rb', 'php', 'java', 'go', 'cs'], re: /(execute|query|raw|prepare)\s*\(\s*(f["']|["'`][^"'`]*\b(SELECT|INSERT|UPDATE|DELETE)\b[^"'`]*["'`]\s*(\+|%|\.format)|`[^`]*\b(SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{)/i, severity: 'high', cwe: 'CWE-89', message: 'SQL built by string interpolation' },
  { id: 'pickle-load', langs: ['py'], re: /\b(pickle|cPickle|dill)\.loads?\s*\(/, severity: 'high', cwe: 'CWE-502', message: 'deserialization of untrusted data' },
  { id: 'yaml-unsafe-load', langs: ['py'], re: /\byaml\.load\s*\((?![^)]*Loader\s*=\s*yaml\.SafeLoader)/, severity: 'medium', cwe: 'CWE-502', message: 'yaml.load without SafeLoader' },
  { id: 'inner-html', langs: ['js'], re: /\.(innerHTML|outerHTML)\s*=(?!=)|dangerouslySetInnerHTML|document\.write\s*\(/, severity: 'medium', cwe: 'CWE-79', message: 'HTML injection sink' },
  { id: 'tls-verify-disabled', langs: ['js', 'py', 'go'], re: /rejectUnauthorized\s*:\s*false|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/, severity: 'high', cwe: 'CWE-295', message: 'TLS certificate verification disabled' },
  { id: 'weak-hash', langs: ['js', 'py', 'java', 'go', 'php', 'rb', 'cs'], re: /\b(md5|sha1)\b\s*\(|createHash\(\s*['"](md5|sha1)['"]|MessageDigest\.getInstance\(\s*"(MD5|SHA-?1)"/i, severity: 'low', cwe: 'CWE-328', message: 'weak hash (fine for checksums, not for passwords or signatures)' },
  { id: 'weak-random-token', langs: ['js', 'py'], re: /(token|secret|password|nonce|salt)\w*\s*=.*\b(Math\.random|random\.random|random\.randint)\b/i, severity: 'medium', cwe: 'CWE-338', message: 'non-cryptographic randomness for a secret' },
  { id: 'cors-wildcard-credentials', langs: ['js', 'py'], re: /Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]\*['"]|origin\s*:\s*['"]\*['"]|allow_origins\s*=\s*\[\s*['"]\*['"]/, severity: 'low', cwe: 'CWE-942', message: 'CORS allows any origin' },
  { id: 'debug-enabled', langs: ['py'], re: /\bDEBUG\s*=\s*True\b|app\.run\([^)]*debug\s*=\s*True/, severity: 'medium', cwe: 'CWE-489', message: 'debug mode enabled' },
  { id: 'path-traversal', langs: ['js', 'py'], re: /(readFile|readFileSync|createReadStream|open|send_file|sendFile)\s*\([^)]*(req\.(params|query|body)|request\.(args|form|GET|POST))/, severity: 'high', cwe: 'CWE-22', message: 'file path from request input' },
  { id: 'ssrf', langs: ['js', 'py'], re: /(fetch|axios\.\w+|requests\.(get|post)|urlopen|http\.get)\s*\(\s*(req\.(params|query|body)|request\.(args|form|GET|POST))/, severity: 'high', cwe: 'CWE-918', message: 'outbound request to a URL from request input' },
  { id: 'hardcoded-jwt-secret', langs: ['js', 'py'], re: /jwt\.(sign|encode)\([^)]*,\s*['"][^'"]{4,}['"]/, severity: 'high', cwe: 'CWE-798', message: 'hard-coded JWT signing secret' },
  { id: 'unsafe-regex-input', langs: ['js'], re: /new RegExp\(\s*(req\.|request\.|params\.|query\.)/, severity: 'medium', cwe: 'CWE-1333', message: 'regular expression built from request input (ReDoS)' },
  { id: 'chmod-777', langs: ['sh', 'py', 'js', 'docker'], re: /chmod\s+(-R\s+)?0?777|chmod\(\s*[^,]+,\s*0o?777/, severity: 'medium', cwe: 'CWE-732', message: 'world-writable permissions' },
  { id: 'curl-pipe-shell', langs: ['sh', 'docker', 'md'], re: /(curl|wget)\s[^|\n]*\|\s*(sudo\s+)?(ba|z)?sh\b/, severity: 'medium', cwe: 'CWE-494', message: 'piping a download into a shell' },
];
const EXT_LANG = { js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'js', tsx: 'js', py: 'py', rb: 'rb', php: 'php', java: 'java', kt: 'java', go: 'go', cs: 'cs', sh: 'sh', bash: 'sh', md: 'md' };

export function codeFindings(text, file) {
  const base = path.posix.basename(file || '');
  const lang = base === 'Dockerfile' || base.startsWith('Dockerfile.') ? 'docker' : EXT_LANG[base.split('.').pop()] || null;
  if (!lang) return [];
  const out = [];
  text.split('\n').forEach((line, i) => {
    if (line.length > 2000) return;
    const trimmed = line.trim();
    if (/^(\/\/|#|\*|--)/.test(trimmed) && lang !== 'md') return;
    for (const rule of CODE_RULES) if (rule.langs.includes(lang) && rule.re.test(line)) out.push({ rule: rule.id, severity: rule.severity, cwe: rule.cwe, message: rule.message, file, line: i + 1, code: trimmed.slice(0, 200) });
  });
  return out;
}

// ------------------------------------------------------------ PII

function luhn(digits) {
  let sum = 0; let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) { let n = +digits[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; }
  return sum % 10 === 0;
}
function ibanValid(iban) {
  const s = iban.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const moved = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0; for (const ch of moved) rem = (rem * 10 + +ch) % 97;
  return rem === 1;
}
const PII_RULES = [
  ['email', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, null, 'contact'],
  ['phone', /(?<![\w.+])(?:\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}|\(\d{3}\)\s?\d{3}[\s.-]\d{4}|\d{3}[.-]\d{3}[.-]\d{4})(?![\w.])/g, (v) => { const n = v.replace(/\D/g, '').length; return n >= 9 && n <= 15; }, 'contact'],
  ['credit-card', /\b(?:\d[ -]?){13,19}\b/g, (v) => { const d = v.replace(/\D/g, ''); return d.length >= 13 && d.length <= 19 && luhn(d) && /^(4|5[1-5]|2[2-7]|3[47]|6)/.test(d); }, 'financial'],
  ['iban', /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g, ibanValid, 'financial'],
  ['us-ssn', /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g, null, 'government-id'],
  ['ipv4-address', /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, (v) => !/^(0\.|127\.|255\.)/.test(v), 'network'],
  ['date-of-birth', /\b(?:dob|date of birth|birth ?date|born)\b[^\n]{0,20}?\b(\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4})/gi, null, 'personal'],
  ['passport-number', /\bpassport(?: number| no\.?|#)?\s*[:#]?\s*([A-Z0-9]{6,9})\b/gi, null, 'government-id'],
];

export function findPii(text, { types } = {}) {
  const findings = [];
  const taken = [];
  const order = ['credit-card', 'iban', 'us-ssn', 'email', 'date-of-birth', 'passport-number', 'ipv4-address', 'phone'];
  for (const [type, re, check, category] of [...PII_RULES].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))) {
    if (types && !types.includes(type)) continue;
    re.lastIndex = 0; let m;
    while ((m = re.exec(text))) {
      const value = (m[1] || m[0]).trim();
      if (check && !check(value)) continue;
      const start = m.index, end = m.index + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      taken.push([start, end]);
      findings.push({ type, category, line: lineOf(text, m.index), masked: mask(value) });
    }
  }
  return findings;
}

// ------------------------------------------------------------ Dockerfile

export function lintDockerfile(text) {
  const findings = [];
  const lines = text.replace(/\\\n/g, ' ').split('\n');
  let user = null; let stages = 0; let hasHealthcheck = false;
  const add = (line, rule, severity, message) => findings.push({ line, rule, severity, message });
  lines.forEach((raw, i) => {
    const line = raw.trim(); const n = i + 1;
    if (!line || line.startsWith('#')) return;
    const [instr, ...restParts] = line.split(/\s+/); const rest = restParts.join(' ');
    const I = instr.toUpperCase();
    if (I === 'FROM') {
      stages += 1; user = null;
      const image = restParts[0] || '';
      if (/^[^@:]+$/.test(image) && image !== 'scratch' && !/^\$/.test(image)) add(n, 'pin-base-image', 'medium', `base image "${image}" has no tag; pin a version or digest`);
      else if (/:latest$/.test(image)) add(n, 'no-latest-tag', 'medium', 'avoid the "latest" tag; pin a version or digest');
    }
    if (I === 'USER') user = rest;
    if (I === 'HEALTHCHECK') hasHealthcheck = true;
    if (I === 'ADD' && !/^(--\S+\s+)*https?:/.test(rest) && !/\.(tar|tgz|tar\.gz|tar\.xz)\b/.test(rest)) add(n, 'prefer-copy', 'low', 'use COPY instead of ADD for local files');
    if (I === 'ADD' && /^(--\S+\s+)*https?:/.test(rest)) add(n, 'add-remote-url', 'medium', 'ADD from a URL skips checksum verification; download with checksum in RUN');
    if (I === 'RUN') {
      if (/apt-get install/.test(rest) && !/--no-install-recommends/.test(rest)) add(n, 'apt-no-recommends', 'low', 'apt-get install without --no-install-recommends');
      if (/apt-get install/.test(rest) && !/rm -rf \/var\/lib\/apt\/lists/.test(rest)) add(n, 'apt-clean-lists', 'low', 'remove /var/lib/apt/lists in the same layer');
      if (/apt-get upgrade|apt-get dist-upgrade/.test(rest)) add(n, 'apt-upgrade', 'low', 'avoid apt-get upgrade in images; update the base image instead');
      if (/apk add/.test(rest) && !/--no-cache/.test(rest)) add(n, 'apk-no-cache', 'low', 'apk add without --no-cache');
      if (/pip install/.test(rest) && !/--no-cache-dir/.test(rest)) add(n, 'pip-no-cache', 'low', 'pip install without --no-cache-dir');
      if (/(curl|wget)[^|]*\|\s*(ba)?sh/.test(rest)) add(n, 'curl-pipe-shell', 'medium', 'piping a download into a shell');
      if (/\bsudo\b/.test(rest)) add(n, 'no-sudo', 'medium', 'sudo inside RUN; the build already runs as root');
      if (/chmod\s+(-R\s+)?777/.test(rest)) add(n, 'chmod-777', 'medium', 'world-writable permissions');
      if (/^cd\s/.test(rest)) add(n, 'use-workdir', 'low', 'use WORKDIR instead of RUN cd');
    }
    if ((I === 'ENV' || I === 'ARG') && /(PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY)\w*[= ]\S+/i.test(rest)) add(n, 'secret-in-env', 'high', `${I} appears to set a secret; use build secrets or runtime configuration`);
    if (I === 'EXPOSE' && /\b22\b/.test(rest)) add(n, 'expose-ssh', 'medium', 'exposing SSH (22) from a container');
    if (I === 'CMD' || I === 'ENTRYPOINT') if (!rest.startsWith('[')) add(n, 'exec-form', 'low', `${I} in shell form; prefer exec form ["cmd", "arg"] for signal handling`);
  });
  if (stages && (!user || /^(root|0)(:|$)/.test(user))) add(null, 'run-as-non-root', 'high', 'final stage runs as root; add a USER instruction');
  if (stages && !hasHealthcheck) add(null, 'healthcheck', 'low', 'no HEALTHCHECK instruction');
  for (const s of findSecrets(text)) add(s.line, `secret:${s.rule}`, 'high', `possible secret ${s.masked}`);
  return { stages, findings };
}

const TEXT_EXT = /\.(js|mjs|cjs|jsx|ts|tsx|py|rb|go|rs|java|kt|cs|php|sh|bash|zsh|ps1|env|ini|cfg|conf|toml|ya?ml|json|xml|properties|tf|tfvars|md|txt|html|sql|swift|scala|gradle|dockerfile|pem|key)$/i;

async function scanFiles(ctx, input, perFile) {
  const out = []; let scanned = 0;
  if (typeof input.content === 'string') { out.push(...perFile(input.content, input.filename || 'inline')); return { scanned: 1, findings: out }; }
  const target = input.path || '.';
  let files;
  try { const real = await ctx.resolvePath(target); const { stat } = await import('node:fs/promises'); files = (await stat(real)).isDirectory() ? null : [{ path: target, size: 0 }]; } catch (e) { throw e; }
  let base = '';
  if (!files) { files = (await ctx.walk(target, { maxFiles: input.max_files || 20000 })).files; base = target === '.' ? '' : `${target.replace(/\/$/, '')}/`; }
  for (const f of files) {
    const name = path.posix.basename(f.path);
    if (!TEXT_EXT.test(name) && !/^(Dockerfile|\.env.*|Makefile|Jenkinsfile)$/.test(name)) continue;
    if (f.size > 2_000_000 || /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.js)$/.test(name)) continue;
    const full = base + f.path;
    const text = (await ctx.readFile(full)).toString('utf8');
    if (text.includes('\u0000')) continue;
    scanned += 1;
    out.push(...perFile(text, full));
  }
  return { scanned, findings: out };
}

export default [
  {
    id: 'security.secret_scan',
    title: 'Scan for secrets',
    description: 'Find hard-coded credentials (cloud keys, tokens, private keys, connection strings, high-entropy assignments) in files or text; values are masked.',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { path: { type: 'string', default: '.' }, content: { type: 'string' }, filename: { type: 'string' }, max_files: { type: 'integer', minimum: 1, maximum: 100000 } } },
    async run(input, ctx) {
      const r = await scanFiles(ctx, input, (text, file) => findSecrets(text).map(({ index, ...f }) => ({ file, ...f })));
      return { files_scanned: r.scanned, count: r.findings.length, findings: r.findings };
    },
  },
  {
    id: 'security.code_patterns',
    title: 'Scan for risky code patterns',
    description: 'Flag common vulnerability patterns (injection, unsafe deserialization, disabled TLS, XSS sinks, SSRF, path traversal) with CWE ids for JS/TS, Python, Go, Java, PHP, Ruby and shell.',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { path: { type: 'string', default: '.' }, content: { type: 'string' }, filename: { type: 'string', description: 'Name used to pick the language for inline content' }, max_files: { type: 'integer', minimum: 1, maximum: 100000 } } },
    async run(input, ctx) {
      const r = await scanFiles(ctx, input, (text, file) => codeFindings(text, input.content !== undefined ? (input.filename || 'inline.js') : file));
      const bySeverity = {}; for (const f of r.findings) bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
      return { files_scanned: r.scanned, by_severity: bySeverity, findings: r.findings, note: 'Pattern matches are leads to confirm, not proof of exploitability.' };
    },
  },
  {
    id: 'privacy.pii_scan',
    title: 'Scan for personal data',
    description: 'Detect personal data (emails, phone numbers, Luhn-valid card numbers, IBANs, SSNs, IPs, birth dates, passport numbers) in text or files; values are masked.',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, types: { type: 'array', items: { type: 'string' } }, max_files: { type: 'integer', minimum: 1, maximum: 100000 } } },
    async run(input, ctx) {
      const r = await scanFiles(ctx, input, (text, file) => findPii(text, input).map((f) => ({ file, ...f })));
      const byType = {}; for (const f of r.findings) byType[f.type] = (byType[f.type] || 0) + 1;
      return { files_scanned: r.scanned, by_type: byType, findings: r.findings.slice(0, 500), total: r.findings.length };
    },
  },
  {
    id: 'container.dockerfile_lint',
    title: 'Lint a Dockerfile',
    description: 'Check a Dockerfile for unpinned base images, root user, secrets in ENV/ARG, cache hygiene, ADD misuse, shell-form CMD and missing HEALTHCHECK.',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { path: { type: 'string', default: 'Dockerfile' }, content: { type: 'string' } } },
    async run(input, ctx) { return lintDockerfile((await readTextInput(ctx, input)).text); },
  },
];
