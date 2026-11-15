// Static security scanner for capability folders and skill files.
//
// Skills are instructions an agent will follow, so the threat model covers both
// classic supply-chain problems (secrets, binaries, links, oversized content) and
// prompt-level attacks (hidden Unicode, instruction overrides, covert
// exfiltration, destructive commands). The scanner is deliberately conservative:
//
//   critical -> verdict "dangerous": installation is refused and cannot be overridden
//   high/medium -> verdict "caution": installation needs explicit acceptance
//   low/info -> verdict "safe"
//
// It is a static heuristic, not a sandbox: a clean report lowers risk, it does not
// prove a capability is benign. See docs/security.md.

import { readdir, readFile, lstat, readlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { findSecrets } from './tools/security.mjs';

export const SCAN_LIMITS = { maxFiles: 2000, maxTotal: 25 * 1024 * 1024, maxFile: 5 * 1024 * 1024, maxSkillMd: 256 * 1024 };
const SEVERITY_ORDER = ['info', 'low', 'medium', 'high', 'critical'];
const TEXT_EXT = /\.(md|markdown|txt|json|ya?ml|toml|ini|cfg|js|mjs|cjs|ts|tsx|jsx|py|rb|sh|bash|zsh|fish|ps1|bat|cmd|go|rs|java|kt|php|pl|lua|sql|html?|css|xml|csv|tsv|env|r|swift|c|h|cpp|hpp|cs)$/i;
const SCRIPT_EXT = /\.(sh|bash|zsh|fish|ps1|bat|cmd|py|js|mjs|cjs|ts|rb|pl|php|lua)$/i;
const BINARY_OK = /\.(png|jpe?g|gif|webp|svg|ico|pdf|docx|xlsx|pptx|odt|ods|odp|woff2?|ttf|otf|wasm)$/i;

// Unicode that renders invisibly or reorders text: classic "Trojan Source" and
// ASCII-smuggling vectors. Tag characters can hide whole instructions.
const UNICODE_RULES = [
  { id: 'bidi-control', re: /[\u202A-\u202E\u2066-\u2069]/g, severity: 'critical', message: 'bidirectional control character can disguise text (Trojan Source)' },
  { id: 'unicode-tag-chars', re: /[\u{E0000}-\u{E007F}]/gu, severity: 'critical', message: 'Unicode tag characters can smuggle hidden instructions' },
  { id: 'zero-width', re: /[\u200B-\u200D\u2060\u180E]/g, severity: 'high', message: 'zero-width character hides content' },
  { id: 'variation-selector-run', re: /[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]{4,}/gu, severity: 'high', message: 'run of variation selectors can encode hidden data' },
];

// Prompt-level attacks. Patterns target imperative phrasing aimed at the agent,
// not discussion of the topic (security skills legitimately describe attacks).
const INSTRUCTION_RULES = [
  { id: 'instruction-override', re: /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier|preceding|system|developer)\s+(instructions?|prompts?|messages?|rules|guidelines|directions)/i, severity: 'critical', message: 'attempts to override the agent\'s instructions' },
  { id: 'concealment', re: /\b(do\s+not|don'?t|never)\s+(tell|inform|let|notify|alert|show)\s+(the\s+)?(user|human|operator)s?\s+(about\s+(this|it|these|that)|that\s+you|what\s+you|you\s+(are|have|did|were)|know)\b|\b(hide|conceal|keep)\s+(this|it|these\s+\w+|the\s+\w+|your\s+\w+)\s+(hidden\s+|secret\s+)?from\s+the\s+(user|human|operator)/i, severity: 'critical', message: 'instructs the agent to hide actions from the user' },
  { id: 'hide-from-user', re: /\bwithout\s+(the\s+)?(user|human|operator)('s)?\s+(knowing|noticing|knowledge|awareness|seeing)\b|\b(silently|secretly|covertly)\s+(send|upload|post|exfiltrate|transmit|forward|copy)\b/i, severity: 'critical', message: 'instructs covert action without user knowledge' },
  { id: 'role-hijack', re: /\b(you\s+are\s+now|from\s+now\s+on\s+you\s+are|act\s+as\s+if\s+you\s+have\s+no)\s+(?!going\b)[^.\n]{0,40}(unrestricted|jailbroken|DAN|no\s+(rules|restrictions|limits|guidelines))/i, severity: 'critical', message: 'attempts to replace the agent\'s identity or remove its rules' },
  { id: 'approval-bypass', re: /\b(auto[- ]?approve|bypass|skip|disable)\s+(all\s+)?(the\s+)?(permission|approval|confirmation|sandbox|safety)\s*(prompts?|checks?|dialogs?|mode)?\b/i, severity: 'high', message: 'asks the agent to bypass approvals or the sandbox' },
  { id: 'dangerous-flag', re: /--dangerously-skip-permissions|--yolo\b|--no-sandbox\b|--dangerously-bypass-approvals-and-sandbox/i, severity: 'high', message: 'uses a flag that disables agent safety controls' },
];

// Commands. These apply to scripts and to fenced code / inline code in Markdown.
const COMMAND_RULES = [
  { id: 'pipe-to-shell', re: /\b(curl|wget|iwr|Invoke-WebRequest|fetch)\b[^\n|]*\|\s*(sudo\s+)?(ba|z|fi|da)?sh\b|\b(curl|wget)\b[^\n]*\|\s*(sudo\s+)?(python3?|node|perl|ruby|iex|Invoke-Expression)\b/i, severity: 'high', message: 'downloads and executes remote code' },
  { id: 'decode-and-execute', re: /\b(base64\s+(-d|--decode)|xxd\s+-r|certutil\s+-decode|FromBase64String)\b[^\n]*\|\s*(sudo\s+)?(ba|z)?sh\b|\beval\s*\(?\s*["'`]?\$\(\s*(echo|printf)[^)]*\|\s*base64/i, severity: 'critical', message: 'decodes and executes hidden code' },
  { id: 'destructive-rm', re: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*\s+(--no-preserve-root\s+)?(\/(\s|$|\*)|~\/?(\s|$|\*)|\$HOME\/?(\s|$|\*)|\/\*)/, severity: 'critical', message: 'recursive delete of the root or home directory' },
  { id: 'disk-wipe', re: /\b(mkfs(\.\w+)?\s+\/dev\/|dd\s+[^\n]*of=\/dev\/(sd|nvme|hd|disk)|shred\s+[^\n]*\/dev\/)|:\(\)\s*\{\s*:\|:&\s*\};:/, severity: 'critical', message: 'wipes a disk or forks without bound' },
  { id: 'chmod-world', re: /\bchmod\s+(-R\s+)?(0?777|a\+rwx)\s+\/(\s|$)/, severity: 'high', message: 'makes the filesystem root world-writable' },
  { id: 'credential-exfil', re: /(\.ssh\/id_[a-z0-9]+|\.aws\/credentials|\.netrc|\.docker\/config\.json|\.kube\/config|\.npmrc|\.pypirc|(^|[\s/])\.env\b)[^\n]*\|\s*[^\n]*\b(curl|wget|nc|ncat|socat|scp|rsync)\b|\b(curl|wget)\b[^\n]*(-d|--data(-binary)?|-F|--upload-file|-T)\s+@?[^\s]*(\.ssh\/|\.aws\/|\.netrc|\.env\b|\.kube\/|\.npmrc)/i, severity: 'critical', message: 'sends credential files over the network' },
  { id: 'credential-read', re: /(~|\$HOME|%USERPROFILE%|\/home\/[^/\s]+|\/root)\/(\.ssh\/(id_[a-z0-9]+|authorized_keys)|\.aws\/credentials|\.netrc|\.docker\/config\.json|\.kube\/config|\.config\/gh\/hosts\.yml|\.npmrc|\.pypirc|\.gnupg)|\bLogin Data\b|\bCookies\.binarycookies\b|security\s+find-(generic|internet)-password|\bkeyring\s+get\b/i, severity: 'high', message: 'reads credential stores' },
  { id: 'env-dump-network', re: /\b(env|printenv|set)\b\s*\|[^\n]*\b(curl|wget|nc|ncat)\b|\b(curl|wget)\b[^\n]*(\$\{?(AWS_SECRET|GITHUB_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|[A-Z_]*(TOKEN|SECRET|PASSWORD|API_KEY))\}?|\$\(\s*(env|printenv|cat\s+[^)]*(\.env|credentials|id_rsa)))/i, severity: 'critical', message: 'sends environment secrets or credential files over the network' },
  { id: 'reverse-shell', re: /\b(bash|sh)\s+-i\s+>&\s*\/dev\/tcp\/|\bnc(at)?\s+[^\n]*-e\s+\/bin\/(ba)?sh|\bsocat\b[^\n]*exec:[^\n]*sh/i, severity: 'critical', message: 'opens a reverse shell' },
  { id: 'persistence', re: /\b(crontab\s+-[lr]?\s*[^\n]*\||>>?\s*~\/\.(bashrc|zshrc|profile|bash_profile)|\/etc\/cron\.|launchctl\s+load|systemctl\s+enable)/i, severity: 'medium', message: 'installs persistence (shell profile, cron or service)' },
  { id: 'sudo', re: /(^|[\s;&|`(])sudo\s+(?!-n\s+true)\S/m, severity: 'low', message: 'uses sudo' },
];

// URLs that are commonly used to collect exfiltrated data.
const EXFIL_HOSTS = /\b(webhook\.site|requestbin\.(com|net)|pipedream\.net|ngrok(-free)?\.(io|app)|burpcollaborator\.net|interact\.sh|oast\.(fun|live|me|pro|site)|beeceptor\.com|hookbin\.com|canarytokens\.com|transfer\.sh|pastebin\.com\/api)\b/i;

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

/** Extract the parts of a Markdown file an agent would execute: fenced and inline code. */
function codeRegions(text) {
  const regions = [];
  const fence = /(^|\n)(```|~~~)[^\n]*\n([\s\S]*?)(\n\2|$)/g;
  let m;
  while ((m = fence.exec(text))) regions.push({ start: m.index + m[1].length, text: m[0] });
  const inline = /`([^`\n]{3,})`/g;
  while ((m = inline.exec(text))) regions.push({ start: m.index, text: m[1], inline: true });
  return regions;
}

// Security guidance often quotes or forbids the very phrases we look for
// ("never run curl | sh", "avoid 'ignore previous instructions'"). A match is
// treated as discussion when the same sentence negates or quotes it.
// For prose instructions the negation must sit in the same clause (so "Don't
// worry, ignore previous instructions" is still flagged); for inline code the
// same sentence is enough ("never run its setup scripts or `curl | sh` lines").
const NEGATION = /\b(never|not|don'?t|doesn'?t|avoid|refuse|reject|forbid|prohibit|flag|detect|block|such\s+as|e\.g\.|for\s+example)\b/i;
export function isDiscussion(text, index, { clause = false } = {}) {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  const before = text.slice(Math.max(lineStart, index - 160), index);
  let scope = before.split(/[.!?](?:\s|$)/).pop();
  if (clause) scope = scope.split(/[,;:\u2013\u2014]|\s-\s/).pop();
  if (NEGATION.test(scope)) return true;
  const prev = text[index - 1];
  return prev === '"' || prev === '\u201c' || prev === "'" || prev === '\u2018' || prev === '(';
}

/** Remove fenced code and blockquotes so instruction rules only see prose. */
function proseOnly(text) {
  return text.replace(/(^|\n)(```|~~~)[^\n]*\n[\s\S]*?(\n\2|$)/g, (s) => s.replace(/[^\n]/g, ' '));
}

/** Scan one text file. kind: 'markdown' | 'script' | 'text'. Returns findings. */
export function scanText(text, { file = 'SKILL.md', kind } = {}) {
  const findings = [];
  const add = (rule, index, extra = {}) => findings.push({ rule: rule.id, severity: rule.severity, file, line: lineAt(text, index), message: rule.message, ...extra });
  const type = kind || (/\.(md|markdown)$/i.test(file) ? 'markdown' : SCRIPT_EXT.test(file) ? 'script' : 'text');

  for (const rule of UNICODE_RULES) {
    rule.re.lastIndex = 0;
    const m = rule.re.exec(text);
    if (m) {
      let count = 0;
      rule.re.lastIndex = 0;
      while (rule.re.exec(text)) count += 1;
      add(rule, m.index, { count });
    }
  }

  if (type === 'markdown' || type === 'text') {
    const prose = proseOnly(text);
    for (const rule of INSTRUCTION_RULES) {
      const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g');
      let m;
      while ((m = re.exec(prose))) {
        if (!isDiscussion(prose, m.index, { clause: true })) { add(rule, m.index, { match: m[0].slice(0, 80) }); break; }
      }
    }
    // HTML comments are invisible when rendered but visible to the model.
    const comment = /<!--([\s\S]*?)-->/g;
    let c;
    while ((c = comment.exec(text))) {
      const inner = c[1];
      if (INSTRUCTION_RULES.some((r) => r.re.test(inner)) || /\b(curl|wget|fetch|send|upload|post)\b[^\n]*https?:\/\//i.test(inner)) {
        findings.push({ rule: 'hidden-comment-instruction', severity: 'critical', file, line: lineAt(text, c.index), message: 'instructions hidden in an HTML comment' });
      }
    }
  }

  const regions = type === 'markdown' ? codeRegions(text) : [{ start: 0, text }];
  for (const rule of COMMAND_RULES) {
    for (const region of regions) {
      const m = rule.re.exec(region.text);
      if (!m) continue;
      // Inline code inside a sentence that forbids it is guidance, not a command.
      if (region.inline && isDiscussion(text, region.start)) continue;
      add(rule, region.start + m.index, { match: m[0].trim().slice(0, 80) });
      break;
    }
  }

  const exfil = EXFIL_HOSTS.exec(text);
  if (exfil) findings.push({ rule: 'exfiltration-endpoint', severity: 'high', file, line: lineAt(text, exfil.index), message: `references a data-collection endpoint (${exfil[0]})` });

  for (const secret of findSecrets(text)) {
    if (secret.rule === 'generic-assigned-secret' && type === 'markdown') continue; // prose examples
    findings.push({ rule: `secret:${secret.rule}`, severity: secret.severity === 'high' ? 'high' : 'medium', file, line: secret.line, message: `possible committed secret (${secret.masked})` });
  }
  return findings;
}

export function verdictOf(findings) {
  let worst = -1;
  for (const f of findings) worst = Math.max(worst, SEVERITY_ORDER.indexOf(f.severity));
  if (worst >= SEVERITY_ORDER.indexOf('critical')) return 'dangerous';
  if (worst >= SEVERITY_ORDER.indexOf('medium')) return 'caution';
  return 'safe';
}

function summarize(findings, extra) {
  const counts = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, 0]));
  for (const f of findings) counts[f.severity] += 1;
  const order = (f) => -SEVERITY_ORDER.indexOf(f.severity);
  findings.sort((a, b) => order(a) - order(b) || a.file.localeCompare(b.file) || a.line - b.line);
  return { verdict: verdictOf(findings), counts, findings, ...extra };
}

/** Scan an in-memory file list [{path, data}] (used for archives before writing to disk). */
export function scanFiles(files, limits = SCAN_LIMITS) {
  const findings = [];
  let bytes = 0;
  if (files.length > limits.maxFiles) findings.push({ rule: 'too-many-files', severity: 'medium', file: '.', line: 0, message: `${files.length} files (limit ${limits.maxFiles})` });
  if (!files.some((f) => f.path === 'SKILL.md')) findings.push({ rule: 'missing-skill-md', severity: 'critical', file: '.', line: 0, message: 'no SKILL.md at the capability root' });
  for (const { path: rel, data } of files.slice(0, limits.maxFiles)) {
    bytes += data.length;
    findings.push(...scanBuffer(rel, data, limits));
  }
  if (bytes > limits.maxTotal) findings.push({ rule: 'too-large', severity: 'medium', file: '.', line: 0, message: `${bytes} bytes total (limit ${limits.maxTotal})` });
  return summarize(findings, { files: files.length, bytes });
}

function scanBuffer(rel, data, limits) {
  const findings = [];
  const base = path.posix.basename(rel);
  if (rel === 'SKILL.md' && data.length > limits.maxSkillMd) findings.push({ rule: 'skill-md-too-large', severity: 'medium', file: rel, line: 0, message: `SKILL.md is ${data.length} bytes; keep it small and move detail to references/` });
  if (data.length > limits.maxFile) { findings.push({ rule: 'file-too-large', severity: 'medium', file: rel, line: 0, message: `${data.length} bytes (limit ${limits.maxFile})` }); return findings; }
  const isBinary = data.subarray(0, 8192).includes(0);
  if (isBinary) {
    const magic = data.subarray(0, 4).toString('latin1');
    if (magic === '\x7fELF' || magic.startsWith('MZ') || ['\xcf\xfa\xed\xfe', '\xfe\xed\xfa\xcf', '\xca\xfe\xba\xbe'].includes(magic)) {
      findings.push({ rule: 'native-executable', severity: 'high', file: rel, line: 0, message: 'bundled native executable cannot be reviewed' });
    } else if (!BINARY_OK.test(base)) {
      findings.push({ rule: 'opaque-binary', severity: 'low', file: rel, line: 0, message: 'binary file of unknown type' });
    }
    return findings;
  }
  if (!TEXT_EXT.test(base) && !/^(SKILL|README|LICENSE|NOTICE|Makefile|Dockerfile)/i.test(base) && base.includes('.')) {
    // Unknown text formats are still scanned.
  }
  if (/^\.env(\..+)?$/.test(base) && base !== '.env.example') findings.push({ rule: 'dotenv-file', severity: 'medium', file: rel, line: 0, message: 'bundled .env file may contain secrets' });
  findings.push(...scanText(data.toString('utf8'), { file: rel }));
  return findings;
}

/** Scan a capability directory on disk. */
export async function scanDirectory(dir, limits = SCAN_LIMITS) {
  const root = await realpath(dir);
  const findings = [];
  const files = [];
  let bytes = 0;
  let count = 0;
  async function walk(abs, rel) {
    const entries = await readdir(abs, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '__pycache__') continue;
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const full = path.join(abs, entry.name);
      const info = await lstat(full);
      if (info.isSymbolicLink()) {
        const target = await readlink(full);
        let resolved = null;
        try { resolved = await realpath(full); } catch { /* dangling */ }
        const inside = resolved && (resolved === root || resolved.startsWith(root + path.sep));
        findings.push(inside
          ? { rule: 'symlink', severity: 'low', file: relPath, line: 0, message: `symbolic link to ${target} (copied as a regular file on install)` }
          : { rule: 'symlink-escape', severity: 'critical', file: relPath, line: 0, message: `symbolic link resolves outside the capability (${target})` });
        continue;
      }
      if (info.isDirectory()) { await walk(full, relPath); continue; }
      if (!info.isFile()) { findings.push({ rule: 'special-file', severity: 'high', file: relPath, line: 0, message: 'device, socket or FIFO in capability' }); continue; }
      count += 1;
      bytes += info.size;
      if (count > limits.maxFiles) continue;
      if (info.size > limits.maxFile) { findings.push({ rule: 'file-too-large', severity: 'medium', file: relPath, line: 0, message: `${info.size} bytes (limit ${limits.maxFile})` }); continue; }
      if (info.mode & 0o111 && !SCRIPT_EXT.test(entry.name) && !/^[^.]+$/.test(entry.name)) {
        findings.push({ rule: 'unexpected-executable-bit', severity: 'low', file: relPath, line: 0, message: 'executable bit on a non-script file' });
      }
      files.push(relPath);
      findings.push(...scanBuffer(relPath, await readFile(full), limits));
    }
  }
  await walk(root, '');
  if (!files.includes('SKILL.md')) findings.push({ rule: 'missing-skill-md', severity: 'critical', file: '.', line: 0, message: 'no SKILL.md at the capability root' });
  if (count > limits.maxFiles) findings.push({ rule: 'too-many-files', severity: 'medium', file: '.', line: 0, message: `${count} files (limit ${limits.maxFiles})` });
  if (bytes > limits.maxTotal) findings.push({ rule: 'too-large', severity: 'medium', file: '.', line: 0, message: `${bytes} bytes total (limit ${limits.maxTotal})` });
  return summarize(findings, { files: count, bytes });
}
