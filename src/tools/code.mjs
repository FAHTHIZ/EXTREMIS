// Software-engineering tools: repository map, dependency inventory, stack traces,
// diff statistics, test reports and log summarization.

import path from 'node:path';
import { readTextInput, ToolInputError, round } from './util.mjs';
import { findSecrets } from './security.mjs';

const LANGUAGES = {
  js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript',
  py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', kts: 'Kotlin', swift: 'Swift', m: 'Objective-C',
  c: 'C', h: 'C', cc: 'C++', cpp: 'C++', hpp: 'C++', cs: 'C#', php: 'PHP', scala: 'Scala', dart: 'Dart', lua: 'Lua', r: 'R',
  sh: 'Shell', bash: 'Shell', zsh: 'Shell', ps1: 'PowerShell', sql: 'SQL', html: 'HTML', css: 'CSS', scss: 'SCSS', vue: 'Vue',
  svelte: 'Svelte', md: 'Markdown', mdx: 'Markdown', json: 'JSON', yaml: 'YAML', yml: 'YAML', toml: 'TOML', xml: 'XML',
  ex: 'Elixir', exs: 'Elixir', erl: 'Erlang', hs: 'Haskell', clj: 'Clojure', zig: 'Zig', nim: 'Nim', jl: 'Julia', tf: 'Terraform',
  proto: 'Protocol Buffers', graphql: 'GraphQL', ipynb: 'Jupyter Notebook',
};
const MANIFESTS = {
  'package.json': 'npm', 'pyproject.toml': 'python', 'requirements.txt': 'python', 'setup.py': 'python', 'Pipfile': 'python',
  'go.mod': 'go', 'Cargo.toml': 'rust', 'Gemfile': 'ruby', 'composer.json': 'php', 'pom.xml': 'maven', 'build.gradle': 'gradle',
  'build.gradle.kts': 'gradle', 'mix.exs': 'elixir', 'pubspec.yaml': 'dart', 'Package.swift': 'swift', 'deno.json': 'deno',
};
const SIGNALS = [
  [/^\.github\/workflows\/.+\.ya?ml$/, 'ci', 'GitHub Actions'], [/^\.gitlab-ci\.yml$/, 'ci', 'GitLab CI'], [/^\.circleci\//, 'ci', 'CircleCI'],
  [/^Jenkinsfile$/, 'ci', 'Jenkins'], [/(^|\/)Dockerfile(\..+)?$/, 'container', 'Dockerfile'], [/(^|\/)(docker-)?compose\.ya?ml$/, 'container', 'Docker Compose'],
  [/\.tf$/, 'infrastructure', 'Terraform'], [/(^|\/)(k8s|kubernetes|helm|charts)\//, 'infrastructure', 'Kubernetes/Helm'],
  [/^(LICENSE|LICENCE|COPYING)(\..+)?$/i, 'license', 'license file'], [/^README(\..+)?$/i, 'docs', 'README'], [/^(docs?|documentation)\//, 'docs', 'docs directory'],
  [/^CONTRIBUTING(\..+)?$/i, 'docs', 'contributing guide'], [/^SECURITY(\..+)?$/i, 'docs', 'security policy'], [/^AGENTS\.md$/, 'agents', 'AGENTS.md'],
  [/^CLAUDE\.md$/, 'agents', 'CLAUDE.md'], [/^\.(eslintrc|prettierrc)/, 'quality', 'lint/format config'], [/^(tsconfig|jsconfig)\.json$/, 'quality', 'TypeScript config'],
  [/^(\.pre-commit-config\.yaml|ruff\.toml|\.flake8|mypy\.ini|setup\.cfg)$/, 'quality', 'Python lint/type config'], [/(^|\/)openapi\.(ya?ml|json)$|(^|\/)swagger\.(ya?ml|json)$/, 'api', 'OpenAPI spec'],
  [/(^|\/)migrations?\//, 'database', 'migrations'], [/\.env\.example$/, 'config', 'env example'],
];

function langOf(file) {
  const base = path.posix.basename(file);
  if (base === 'Dockerfile') return 'Dockerfile';
  if (base === 'Makefile') return 'Makefile';
  return LANGUAGES[base.split('.').pop().toLowerCase()] || null;
}

function isTest(file) {
  return /(^|\/)(tests?|__tests__|spec|specs)\//.test(file) || /(\.|_)(test|spec)\.[a-z]+$/.test(file) || /(^|\/)test_[^/]+\.py$/.test(file);
}

const OUTLINE_PATTERNS = {
  JavaScript: [/^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/, /^\s*(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/, /^\s*class\s+([A-Za-z_$][\w$]*)/, /^\s*export\s+const\s+([A-Za-z_$][\w$]*)\s*=/],
  Python: [/^(?:async\s+)?def\s+([A-Za-z_]\w*)/, /^class\s+([A-Za-z_]\w*)/, /^\s{4}(?:async\s+)?def\s+([A-Za-z_]\w*)/],
  Go: [/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/, /^type\s+([A-Za-z_]\w*)\s+(?:struct|interface)/],
  Rust: [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/, /^\s*(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)/],
  Java: [/^\s*(?:public|protected|private)?\s*(?:static\s+)?(?:final\s+)?(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/, /^\s*(?:public|protected|private)\s+(?:static\s+)?[\w<>[\], ]+\s+([a-z]\w*)\s*\(/],
  Ruby: [/^\s*def\s+([\w.?!]+)/, /^\s*(?:class|module)\s+([A-Z]\w*)/],
};
OUTLINE_PATTERNS.TypeScript = [...OUTLINE_PATTERNS.JavaScript, /^\s*export\s+(?:interface|type)\s+([A-Za-z_$][\w$]*)/];
OUTLINE_PATTERNS.Kotlin = [/^\s*(?:fun|class|object|interface)\s+([A-Za-z_]\w*)/];
OUTLINE_PATTERNS['C#'] = OUTLINE_PATTERNS.Java;

export function outline(text, language) {
  const patterns = OUTLINE_PATTERNS[language];
  if (!patterns) return [];
  const symbols = [];
  text.split('\n').forEach((line, i) => {
    for (const re of patterns) { const m = re.exec(line); if (m) { symbols.push({ name: m[1], line: i + 1, kind: /class|struct|interface|enum|trait|type|record|module|object/.test(line.split(m[1])[0]) ? 'type' : 'function' }); break; } }
  });
  return symbols;
}

async function readJson(ctx, file) {
  try { return JSON.parse((await ctx.readFile(file)).toString('utf8')); } catch { return null; }
}

// ------------------------------------------------------------ dependencies

function tomlSection(text, header) {
  const lines = text.split('\n');
  const out = []; let inside = false;
  for (const line of lines) {
    const h = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (h) { inside = h[1].trim() === header; continue; }
    if (inside) out.push(line);
  }
  return out.join('\n');
}
function tomlArray(text, key) {
  const re = new RegExp(`^\\s*${key.replace(/[.-]/g, '\\$&')}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm');
  const m = re.exec(text);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"|'([^']+)'/g)].map((x) => x[1] || x[2]);
}
function tomlTable(text) {
  const deps = [];
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Za-z0-9_.-]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    let spec = m[2];
    const v = /version\s*=\s*"([^"]+)"/.exec(spec);
    if (spec.startsWith('{')) spec = v ? v[1] : /git\s*=/.test(spec) ? 'git' : /path\s*=/.test(spec) ? 'path' : spec;
    else spec = spec.replace(/^["']|["']$/g, '');
    deps.push({ name: m[1], spec });
  }
  return deps;
}
function pep508(req) {
  const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*(.*)$/.exec(req);
  if (!m) return null;
  return { name: m[1], spec: m[3].split(';')[0].trim() || '*' };
}

export function parseManifest(file, text) {
  const base = path.posix.basename(file);
  const deps = [];
  const add = (name, spec, type, ecosystem) => deps.push({ name, spec: String(spec ?? '*'), type, ecosystem, manifest: file });
  if (base === 'package.json') {
    const pkg = JSON.parse(text);
    for (const [k, type] of [['dependencies', 'prod'], ['devDependencies', 'dev'], ['peerDependencies', 'peer'], ['optionalDependencies', 'optional']]) {
      for (const [name, spec] of Object.entries(pkg[k] || {})) add(name, spec, type, 'npm');
    }
  } else if (base === 'requirements.txt' || /requirements.*\.txt$/.test(base)) {
    for (const raw of text.split('\n')) {
      const line = raw.split(' #')[0].trim();
      if (!line || line.startsWith('#') || line.startsWith('-')) continue;
      if (/^(git\+|https?:)/.test(line)) { add(line.split('#egg=')[1] || line, 'url', /dev/.test(base) ? 'dev' : 'prod', 'PyPI'); continue; }
      const r = pep508(line); if (r) add(r.name, r.spec, /dev|test/.test(base) ? 'dev' : 'prod', 'PyPI');
    }
  } else if (base === 'pyproject.toml') {
    for (const req of tomlArray(tomlSection(text, 'project'), 'dependencies')) { const r = pep508(req); if (r) add(r.name, r.spec, 'prod', 'PyPI'); }
    const optional = tomlSection(text, 'project.optional-dependencies');
    for (const m of optional.matchAll(/^\s*([\w-]+)\s*=\s*\[([\s\S]*?)\]/gm)) for (const q of m[2].matchAll(/"([^"]+)"/g)) { const r = pep508(q[1]); if (r) add(r.name, r.spec, `optional:${m[1]}`, 'PyPI'); }
    const groups = tomlSection(text, 'dependency-groups');
    for (const m of groups.matchAll(/^\s*([\w-]+)\s*=\s*\[([\s\S]*?)\]/gm)) for (const q of m[2].matchAll(/"([^"]+)"/g)) { const r = pep508(q[1]); if (r) add(r.name, r.spec, 'dev', 'PyPI'); }
    for (const d of tomlTable(tomlSection(text, 'tool.poetry.dependencies'))) if (d.name !== 'python') add(d.name, d.spec, 'prod', 'PyPI');
    for (const d of tomlTable(tomlSection(text, 'tool.poetry.group.dev.dependencies'))) add(d.name, d.spec, 'dev', 'PyPI');
  } else if (base === 'go.mod') {
    const block = /require\s*\(([\s\S]*?)\)/m.exec(text);
    const lines = block ? block[1].split('\n') : [];
    for (const m of text.matchAll(/^require\s+(\S+)\s+(\S+)/gm)) lines.push(`${m[1]} ${m[2]}`);
    for (const line of lines) { const m = /^\s*(\S+)\s+(v\S+)(\s*\/\/\s*indirect)?/.exec(line); if (m) add(m[1], m[2], m[3] ? 'indirect' : 'prod', 'Go'); }
  } else if (base === 'Cargo.toml') {
    for (const d of tomlTable(tomlSection(text, 'dependencies'))) add(d.name, d.spec, 'prod', 'crates.io');
    for (const d of tomlTable(tomlSection(text, 'dev-dependencies'))) add(d.name, d.spec, 'dev', 'crates.io');
  } else if (base === 'Gemfile') {
    for (const m of text.matchAll(/^\s*gem\s+["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?/gm)) add(m[1], m[2] || '*', 'prod', 'RubyGems');
  } else if (base === 'composer.json') {
    const pkg = JSON.parse(text);
    for (const [name, spec] of Object.entries(pkg.require || {})) if (name !== 'php' && !name.startsWith('ext-')) add(name, spec, 'prod', 'Packagist');
    for (const [name, spec] of Object.entries(pkg['require-dev'] || {})) add(name, spec, 'dev', 'Packagist');
  } else if (base === 'pom.xml') {
    for (const m of text.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
      const g = /<groupId>([^<]+)/.exec(m[1])?.[1], a = /<artifactId>([^<]+)/.exec(m[1])?.[1], v = /<version>([^<]+)/.exec(m[1])?.[1];
      const scope = /<scope>([^<]+)/.exec(m[1])?.[1];
      if (g && a) add(`${g}:${a}`, v || '*', scope === 'test' ? 'dev' : 'prod', 'Maven');
    }
  }
  return deps;
}

function pinnedVersion(dep) {
  const s = dep.spec.trim();
  if (dep.ecosystem === 'npm' || dep.ecosystem === 'Packagist') return /^v?\d+\.\d+\.\d+([-+][\w.]+)?$/.test(s) ? s.replace(/^v/, '') : null;
  if (dep.ecosystem === 'PyPI') { const m = /^==\s*([\w.]+)$/.exec(s); return m ? m[1] : null; }
  if (dep.ecosystem === 'Go') return s.replace(/^v/, '');
  if (dep.ecosystem === 'crates.io') { const m = /^=?\s*(\d+\.\d+\.\d+)$/.exec(s); return m ? m[1] : null; }
  if (dep.ecosystem === 'RubyGems' || dep.ecosystem === 'Maven') return /^\d+(\.\d+)*$/.test(s) ? s : null;
  return null;
}

function flagsFor(dep) {
  const s = dep.spec.trim();
  const flags = [];
  if (s === '*' || s === '' || s === 'latest' || s === 'x') flags.push('unpinned');
  else if (/^(git|github:|git\+|https?:|file:|link:|path$|url$)/.test(s) || s === 'git' || s === 'path') flags.push('non-registry-source');
  else if (/^>=?[^<]*$/.test(s) && !s.includes(',')) flags.push('no-upper-bound');
  return flags;
}

async function osvLookup(ctx, deps) {
  const queries = deps.map((d) => ({ package: { name: d.name.includes(':') && d.ecosystem === 'Maven' ? d.name : d.name, ecosystem: d.ecosystem }, version: d.version }));
  const findings = [];
  for (let i = 0; i < queries.length; i += 500) {
    const batch = queries.slice(i, i + 500);
    const res = await ctx.fetch('https://api.osv.dev/v1/querybatch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ queries: batch }), timeoutMs: 20000 });
    if (res.status !== 200) throw new ToolInputError(`OSV query failed with HTTP ${res.status}`);
    const data = JSON.parse(res.body.toString('utf8'));
    (data.results || []).forEach((r, j) => {
      if (r.vulns?.length) findings.push({ name: deps[i + j].name, version: deps[i + j].version, ecosystem: deps[i + j].ecosystem, vulnerabilities: r.vulns.map((v) => v.id) });
    });
  }
  return findings;
}

// ------------------------------------------------------------ stack traces

const VENDOR = /(node_modules|site-packages|dist-packages|\/usr\/lib\/|<frozen |node:internal|internal\/|\/jdk|java\.base|sun\.|jdk\.internal|\/rustc\/|\.cargo\/registry|\/go\/pkg\/mod|runtime\/|GOROOT|<anonymous>|webpack\/bootstrap)/;

export function parseStacktrace(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const frames = []; const causes = [];
  let language = 'unknown', exception = null, message = null;
  if (/Traceback \(most recent call last\)/.test(text)) {
    language = 'python';
    for (let i = 0; i < lines.length; i += 1) {
      const m = /^\s*File "([^"]+)", line (\d+)(?:, in (.+))?/.exec(lines[i]);
      if (m) frames.push({ file: m[1], line: +m[2], function: m[3] || null, code: lines[i + 1] && !/^\s*File "/.test(lines[i + 1]) ? lines[i + 1].trim() : undefined });
      const e = /^([A-Za-z_][\w.]*(?:Error|Exception|Exit|Interrupt|Warning|Fault)|[A-Za-z_][\w.]*\.[A-Z]\w*):\s?(.*)$/.exec(lines[i]);
      if (e && !/^\s/.test(lines[i])) { exception = e[1]; message = e[2]; causes.push({ exception: e[1], message: e[2] }); }
    }
    frames.reverse(); // innermost first
  } else if (/^\s+at .+\.(java|kt|scala)\:\d+\)|^\s+at [\w$.]+\(/m.test(text) && /Exception|Error/.test(text) && !/\(file:|\.m?[jt]sx?:\d+/.test(text)) {
    language = 'jvm';
    for (const line of lines) {
      const m = /^\s+at ([\w$.<>/]+)\(([^:)]+)(?::(\d+))?\)/.exec(line);
      if (m) { frames.push({ function: m[1], file: m[2], line: m[3] ? +m[3] : null }); continue; }
      const e = /^(?:Caused by: |Exception in thread "[^"]*" )?([\w$.]+(?:Exception|Error|Throwable))(?::\s?(.*))?$/.exec(line.trim());
      if (e) { causes.push({ exception: e[1], message: e[2] || '' }); if (!exception) { exception = e[1]; message = e[2] || ''; } }
    }
  } else if (/^\s+at .+:\d+:\d+\)?$/m.test(text)) {
    language = 'javascript';
    for (const line of lines) {
      const m = /^\s+at (?:(async )?(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
      if (m) { frames.push({ function: m[2] || null, file: m[3].replace(/^file:\/\//, ''), line: +m[4], column: +m[5] }); continue; }
      const e = /^(?:Uncaught )?([A-Z]\w*(?:Error|Exception)|Error)(?: \[[\w_]+\])?:\s?(.*)$/.exec(line.trim());
      if (e && !exception) { exception = e[1]; message = e[2]; causes.push({ exception: e[1], message: e[2] }); }
    }
  } else if (/^goroutine \d+ \[/m.test(text) || /^panic: /m.test(text) && /\.go:\d+/.test(text)) {
    language = 'go';
    const p = /^panic: (.*)$/m.exec(text); if (p) { exception = 'panic'; message = p[1]; }
    for (let i = 0; i < lines.length - 1; i += 1) {
      const f = /^([\w./*()-]+)\(.*\)$/.exec(lines[i].trim());
      const loc = /^\s+(.+\.go):(\d+)/.exec(lines[i + 1]);
      if (f && loc) frames.push({ function: f[1], file: loc[1], line: +loc[2] });
    }
  } else if (/thread '.+' panicked at/.test(text)) {
    language = 'rust';
    const p = /thread '.+' panicked at (?:'([^']*)', )?([^:\s]+):(\d+):(\d+):?\n?(.*)?/.exec(text);
    if (p) { exception = 'panic'; message = p[1] || (p[5] || '').trim(); frames.push({ file: p[2], line: +p[3], column: +p[4], function: null }); }
    for (let i = 0; i < lines.length - 1; i += 1) {
      const f = /^\s*\d+: (.+)$/.exec(lines[i]); const loc = /^\s+at (.+):(\d+):(\d+)$/.exec(lines[i + 1]);
      if (f && loc) frames.push({ function: f[1], file: loc[1], line: +loc[2], column: +loc[3] });
    }
  } else if (/^\s+at .+ in .+:line \d+/m.test(text)) {
    language = 'dotnet';
    for (const line of lines) {
      const m = /^\s+at (.+?) in (.+):line (\d+)/.exec(line);
      if (m) frames.push({ function: m[1], file: m[2], line: +m[3] });
      const e = /^(?:Unhandled exception\. )?([\w.]+Exception):\s?(.*)$/.exec(line.trim());
      if (e && !exception) { exception = e[1]; message = e[2]; }
    }
  }
  for (const f of frames) f.in_project = !VENDOR.test(f.file || '') && !VENDOR.test(f.function || '');
  const top = frames.find((f) => f.in_project) || frames[0] || null;
  return { language, exception, message, frames, project_frames: frames.filter((f) => f.in_project).length, top_project_frame: top, causes };
}

// ------------------------------------------------------------ diffs

const RISKY = [
  [/(^|\/)(migrations?|db\/migrate|alembic)\//, 'database migration'], [/(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|go\.sum|Gemfile\.lock|uv\.lock)$/, 'lockfile'],
  [/^\.github\/workflows\/|\.gitlab-ci\.yml$|Jenkinsfile$/, 'CI configuration'], [/(auth|login|session|password|crypto|token|permission|acl|oauth|jwt|secret)/i, 'security-sensitive path'],
  [/(^|\/)(Dockerfile|docker-compose\.ya?ml|.*\.tf|k8s\/|helm\/)/, 'infrastructure'], [/\.env(\.|$)/, 'environment file'],
];
const DEBUG_PATTERNS = [[/\bconsole\.(log|debug)\(/, 'console.log'], [/^\s*debugger;?\s*$/, 'debugger statement'], [/\bprint\(/, 'print()'], [/\b(it|describe|test)\.only\(/, '.only() focused test'], [/\b(binding\.pry|byebug|pdb\.set_trace|breakpoint\(\))/, 'debugger call'], [/\b(TODO|FIXME|XXX|HACK)\b/, 'TODO/FIXME marker']];

export function diffStats(text) {
  const files = []; let current = null; let hunk = null;
  for (const line of String(text).replace(/\r/g, '').split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
      current = { file: m ? m[2] : line.slice(11), old_file: m ? m[1] : null, status: 'modified', additions: 0, deletions: 0, hunks: 0, binary: false, added_lines: [] };
      if (m && m[1] !== m[2]) current.status = 'renamed';
      files.push(current); continue;
    }
    if (line.startsWith('--- ') && !current) { current = { file: null, status: 'modified', additions: 0, deletions: 0, hunks: 0, binary: false, added_lines: [] }; files.push(current); }
    if (!current) continue;
    if (line.startsWith('new file mode')) { current.status = 'added'; continue; }
    if (line.startsWith('deleted file mode')) { current.status = 'deleted'; continue; }
    if (line.startsWith('rename to ')) { current.status = 'renamed'; current.file = line.slice(10); continue; }
    if (line.startsWith('Binary files')) { current.binary = true; continue; }
    if (line.startsWith('+++ ')) { const f = line.slice(4).replace(/^b\//, ''); if (f !== '/dev/null') current.file = f; continue; }
    if (line.startsWith('--- ')) { const f = line.slice(4).replace(/^a\//, ''); if (!current.file && f !== '/dev/null') current.file = f; continue; }
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (h) { current.hunks += 1; hunk = { newLine: +h[2] }; continue; }
    if (!hunk) continue;
    if (line.startsWith('+')) { current.additions += 1; current.added_lines.push({ line: hunk.newLine, text: line.slice(1) }); hunk.newLine += 1; }
    else if (line.startsWith('-')) current.deletions += 1;
    else if (!line.startsWith('\\')) hunk.newLine += 1;
  }
  const findings = [];
  const testFiles = files.filter((f) => f.file && isTest(f.file));
  const sourceFiles = files.filter((f) => f.file && !isTest(f.file) && langOf(f.file) && !['Markdown', 'JSON', 'YAML', 'TOML'].includes(langOf(f.file)));
  for (const f of files) {
    for (const [re, label] of RISKY) if (f.file && re.test(f.file)) findings.push({ file: f.file, kind: 'risky-file', detail: label });
    if (f.deletions > 200 && f.deletions > f.additions * 3) findings.push({ file: f.file, kind: 'large-deletion', detail: `${f.deletions} lines removed` });
    for (const added of f.added_lines) {
      for (const [re, label] of DEBUG_PATTERNS) if (re.test(added.text) && !(label === 'print()' && !/\.py$/.test(f.file || ''))) findings.push({ file: f.file, line: added.line, kind: 'debug-artifact', detail: label });
      for (const s of findSecrets(added.text)) findings.push({ file: f.file, line: added.line, kind: 'possible-secret', detail: s.rule, preview: s.masked });
    }
  }
  if (sourceFiles.length && !testFiles.length) findings.push({ file: null, kind: 'no-tests-changed', detail: `${sourceFiles.length} source file(s) changed without test changes` });
  return {
    files_changed: files.length,
    additions: files.reduce((a, f) => a + f.additions, 0),
    deletions: files.reduce((a, f) => a + f.deletions, 0),
    files: files.map(({ added_lines, ...f }) => ({ ...f, language: f.file ? langOf(f.file) : null, test: f.file ? isTest(f.file) : false })),
    test_files_changed: testFiles.length,
    findings,
  };
}

// ------------------------------------------------------------ test reports

function xmlAttrs(s) { const out = {}; for (const m of s.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = m[2].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); return out; }
export function parseTestReport(text) {
  const src = String(text).trim();
  const failures = []; let total = 0, passed = 0, failed = 0, skipped = 0, errored = 0, time = 0, format;
  if (src.startsWith('<')) {
    format = 'junit';
    for (const m of src.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
      total += 1;
      const a = xmlAttrs(m[1]); const body = m[3] || '';
      time += Number(a.time || 0);
      const fail = /<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/.exec(body);
      if (fail) {
        const fa = xmlAttrs(fail[2]);
        if (fail[1] === 'error') errored += 1; else failed += 1;
        failures.push({ name: a.name, classname: a.classname || a.class, file: a.file, kind: fail[1], message: fa.message || '', type: fa.type, details: (fail[3] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim().slice(0, 2000) });
      } else if (/<skipped\b/.test(body)) skipped += 1; else passed += 1;
    }
  } else if (src.startsWith('{')) {
    format = 'jest-json';
    const data = JSON.parse(src);
    for (const file of data.testResults || []) for (const t of file.assertionResults || []) {
      total += 1; time += (t.duration || 0) / 1000;
      if (t.status === 'passed') passed += 1;
      else if (t.status === 'failed') { failed += 1; failures.push({ name: t.fullName || t.title, file: file.name, kind: 'failure', message: (t.failureMessages || []).join('\n').split('\n')[0], details: (t.failureMessages || []).join('\n').slice(0, 2000) }); }
      else skipped += 1;
    }
  } else if (/^(TAP version|1\.\.\d+|(not )?ok\b)/m.test(src)) {
    format = 'tap';
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      const m = /^\s*(not ok|ok)\b\s*(\d+)?\s*-?\s*(.*?)(\s+#\s*(SKIP|TODO)\b.*)?$/i.exec(line);
      if (!m || /^\s{4,}/.test(line) && !/^\s*(not )?ok/.test(line)) return;
      if (/^\s+/.test(line)) return; // nested subtests summarised by their parent
      total += 1;
      if (m[5]) skipped += 1;
      else if (m[1].toLowerCase() === 'ok') passed += 1;
      else {
        failed += 1;
        const yaml = []; for (let j = i + 1; j < lines.length && /^\s+/.test(lines[j]); j += 1) yaml.push(lines[j].trim());
        failures.push({ name: m[3], kind: 'failure', message: (yaml.find((l) => l.startsWith('error:') || l.startsWith('message:')) || '').replace(/^(error|message):\s*/, '').replace(/^['"]|['"]$/g, ''), details: yaml.join('\n').slice(0, 2000) });
      }
    });
  } else {
    format = 'text';
    const sum = (re) => [...src.matchAll(re)].reduce((a, m) => a + Number(m[1]), 0);
    passed = sum(/(\d+) (?:passed|passing)/g); failed = sum(/(\d+) (?:failed|failing)/g); skipped = sum(/(\d+) (?:skipped|pending)/g); errored = sum(/(\d+) errors?\b/g);
    total = passed + failed + skipped + errored;
    for (const m of src.matchAll(/^(?:FAILED|FAIL)\s+(\S+)(?:\s+-\s+(.*))?$/gm)) failures.push({ name: m[1], kind: 'failure', message: m[2] || '' });
    if (!total && !failures.length) throw new ToolInputError('unrecognized test report format (JUnit XML, TAP, Jest JSON or pytest/mocha summary text)');
  }
  return { format, total, passed, failed, errors: errored, skipped, duration_s: round(time, 3), success: failed + errored === 0 && total > 0, failures };
}

// ------------------------------------------------------------ logs

const MASKS = [
  [/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '<ts>'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '<ip>'], [/\b0x[0-9a-f]+\b/gi, '<hex>'], [/\b[0-9a-f]{16,}\b/gi, '<hex>'],
  [/https?:\/\/\S+/g, '<url>'], [/(?:\/[\w.-]+){2,}/g, '<path>'], [/"[^"]{0,200}"|'[^']{0,200}'/g, '<str>'],
  [/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '<email>'], [/-?\b\d+(?:\.\d+)?(?:ms|s|kb|mb|gb|%)?\b/gi, '<num>'],
];
const LEVEL_RE = /\b(TRACE|DEBUG|INFO|NOTICE|WARN(?:ING)?|ERROR|ERR|CRITICAL|CRIT|FATAL|PANIC|SEVERE)\b/i;
function normLevel(l) { const u = l.toUpperCase(); return u.startsWith('WARN') ? 'WARN' : u === 'ERR' ? 'ERROR' : u === 'CRIT' || u === 'CRITICAL' || u === 'PANIC' || u === 'SEVERE' ? 'FATAL' : u === 'NOTICE' ? 'INFO' : u; }

export function summarizeLogs(text, { maxTemplates = 25 } = {}) {
  const lines = String(text).replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const levels = {}; const templates = new Map(); const minutes = new Map();
  let first = null, last = null;
  lines.forEach((line, i) => {
    let entry = line; let level = null;
    if (line.trim().startsWith('{')) {
      try { const j = JSON.parse(line); level = j.level || j.severity || j.lvl; entry = `${j.msg || j.message || j.event || line}${j.error ? ` error=${typeof j.error === 'string' ? j.error : JSON.stringify(j.error)}` : ''}`; const ts = j.time || j.timestamp || j.ts; if (ts) { line = `${ts} ${line}`; } } catch { /* plain line */ }
    }
    const lm = LEVEL_RE.exec(level ? String(level) : line);
    const lvl = lm ? normLevel(lm[1]) : typeof level === 'number' ? (level >= 50 ? 'ERROR' : level >= 40 ? 'WARN' : 'INFO') : 'UNKNOWN';
    levels[lvl] = (levels[lvl] || 0) + 1;
    const ts = /\b(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(line);
    if (ts) { const k = `${ts[1]} ${ts[2]}`; minutes.set(k, (minutes.get(k) || 0) + 1); if (!first) first = k; last = k; }
    let template = entry.replace(LEVEL_RE, '').trim();
    for (const [re, rep] of MASKS) template = template.replace(re, rep);
    template = template.replace(/^[\s\-:|[\]<>ts]*(?=\S)/, (m) => m.replace(/<ts>/g, '')).replace(/\s+/g, ' ').replace(/^(<ts>\s*)+/, '').trim();
    const key = `${lvl}|${template}`;
    if (!templates.has(key)) templates.set(key, { level: lvl, template, count: 0, first_line: i + 1, example: line.slice(0, 300) });
    const t = templates.get(key); t.count += 1; t.last_line = i + 1;
  });
  const severity = { FATAL: 5, ERROR: 4, WARN: 3, INFO: 2, DEBUG: 1, TRACE: 0, UNKNOWN: 1 };
  const sorted = [...templates.values()].sort((a, b) => severity[b.level] - severity[a.level] || b.count - a.count);
  const perMinute = [...minutes.values()];
  const avg = perMinute.length ? perMinute.reduce((a, b) => a + b, 0) / perMinute.length : 0;
  const bursts = [...minutes.entries()].filter(([, c]) => perMinute.length > 3 && c > avg * 3 && c >= 10).map(([minute, count]) => ({ minute, count }));
  return {
    lines: lines.length, levels, time_range: first ? { first, last } : null, distinct_templates: templates.size,
    error_templates: sorted.filter((t) => ['ERROR', 'FATAL'].includes(t.level)).length,
    templates: sorted.slice(0, maxTemplates), bursts,
  };
}

// ------------------------------------------------------------ tool definitions

export default [
  {
    id: 'code.repo_map',
    title: 'Map a repository',
    description: 'Summarize a codebase: languages, manifests, build/test commands, CI, containers, docs, tests, largest files and optional symbol outlines.',
    permissions: ['read'],
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', default: '.' },
        max_files: { type: 'integer', minimum: 10, maximum: 50000, default: 20000 },
        outline: { type: 'array', items: { type: 'string' }, maxItems: 30, description: 'Files to outline (functions/classes with line numbers)' },
        depth: { type: 'integer', minimum: 1, maximum: 4, default: 2 },
      },
    },
    async run(input, ctx) {
      const { files, truncated } = await ctx.walk(input.path, { maxFiles: input.max_files });
      const base = input.path === '.' ? '' : `${input.path.replace(/\/$/, '')}/`;
      const languages = {}; const signals = {}; const manifests = []; const tree = {};
      let tests = 0, bytes = 0;
      for (const f of files) {
        bytes += f.size;
        const lang = langOf(f.path);
        if (lang) { languages[lang] = languages[lang] || { files: 0, bytes: 0 }; languages[lang].files += 1; languages[lang].bytes += f.size; }
        const name = path.posix.basename(f.path);
        if (MANIFESTS[name]) manifests.push({ path: f.path, ecosystem: MANIFESTS[name] });
        for (const [re, kind, label] of SIGNALS) if (re.test(f.path)) { signals[kind] = signals[kind] || new Set(); signals[kind].add(label); }
        if (isTest(f.path)) tests += 1;
        const parts = f.path.split('/');
        const key = parts.slice(0, Math.min(input.depth, parts.length - 1)).join('/') || '.';
        tree[key] = (tree[key] || 0) + 1;
      }
      const commands = {};
      for (const m of manifests) {
        if (m.ecosystem === 'npm') {
          const pkg = await readJson(ctx, base + m.path);
          if (pkg?.scripts) commands[m.path] = Object.fromEntries(Object.entries(pkg.scripts).filter(([k]) => /^(test|build|lint|start|dev|typecheck|check|format|e2e)/.test(k)));
          if (pkg) m.name = pkg.name;
        }
      }
      const makefile = files.find((f) => f.path === 'Makefile');
      if (makefile) {
        const text = (await ctx.readFile(base + 'Makefile')).toString('utf8');
        commands.Makefile = [...text.matchAll(/^([a-zA-Z][\w-]*):/gm)].map((x) => x[1]).slice(0, 30);
      }
      const outlines = {};
      for (const f of input.outline || []) {
        const lang = langOf(f);
        try { outlines[f] = outline((await ctx.readFile(f)).toString('utf8'), lang).slice(0, 200); } catch (e) { outlines[f] = { error: e.message }; }
      }
      const totalLangBytes = Object.values(languages).reduce((a, l) => a + l.bytes, 0) || 1;
      return {
        root: input.path, files: files.length, bytes, truncated,
        languages: Object.fromEntries(Object.entries(languages).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 15).map(([k, v]) => [k, { ...v, pct: round((v.bytes / totalLangBytes) * 100, 1) }])),
        manifests, commands, signals: Object.fromEntries(Object.entries(signals).map(([k, v]) => [k, [...v]])),
        test_files: tests,
        directories: Object.entries(tree).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([dir, count]) => ({ dir, files: count })),
        largest_files: [...files].sort((a, b) => b.size - a.size).slice(0, 10),
        ...(input.outline ? { outlines } : {}),
      };
    },
  },
  {
    id: 'code.dependency_inventory',
    title: 'Inventory dependencies',
    description: 'List dependencies from package.json, requirements, pyproject, go.mod, Cargo.toml, Gemfile, composer.json and pom.xml; flag unpinned or non-registry sources; optionally check OSV for known vulnerabilities.',
    permissions: ['read'],
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', default: '.' }, check_vulnerabilities: { type: 'boolean', default: false, description: 'Query api.osv.dev for pinned versions (needs network permission)' } },
    },
    async run(input, ctx) {
      const { files } = await ctx.walk(input.path, { maxFiles: 20000 });
      const base = input.path === '.' ? '' : `${input.path.replace(/\/$/, '')}/`;
      const deps = [];
      const errors = [];
      for (const f of files) {
        const name = path.posix.basename(f.path);
        if (!(MANIFESTS[name] || /^requirements.*\.txt$/.test(name)) || f.size > 2_000_000) continue;
        try { deps.push(...parseManifest(f.path, (await ctx.readFile(base + f.path)).toString('utf8'))); } catch (e) { errors.push({ manifest: f.path, error: e.message }); }
      }
      for (const d of deps) { d.flags = flagsFor(d); const v = pinnedVersion(d); if (v) d.version = v; }
      const byName = new Map();
      for (const d of deps) { const k = `${d.ecosystem}:${d.name}`; if (!byName.has(k)) byName.set(k, new Set()); byName.get(k).add(d.spec); }
      const inconsistent = [...byName.entries()].filter(([, specs]) => specs.size > 1).map(([k, specs]) => ({ dependency: k, specs: [...specs] }));
      let vulnerabilities;
      if (input.check_vulnerabilities) {
        const pinned = deps.filter((d) => d.version);
        vulnerabilities = pinned.length ? await osvLookup(ctx, pinned) : [];
      }
      const ecosystems = {};
      for (const d of deps) ecosystems[d.ecosystem] = (ecosystems[d.ecosystem] || 0) + 1;
      return {
        total: deps.length, ecosystems, dependencies: deps,
        flagged: deps.filter((d) => d.flags.length).map((d) => ({ name: d.name, spec: d.spec, manifest: d.manifest, flags: d.flags })),
        inconsistent_versions: inconsistent, ...(vulnerabilities ? { vulnerabilities } : {}), errors,
        note: input.check_vulnerabilities ? 'Only exact versions were checked; ranges resolve through lockfiles.' : 'Set check_vulnerabilities with network permission to query OSV.',
      };
    },
  },
  {
    id: 'code.parse_stacktrace',
    title: 'Parse a stack trace',
    description: 'Parse Python, JavaScript/Node, JVM, Go, Rust or .NET stack traces into exception, message, frames and the top in-project frame.',
    permissions: [],
    input_schema: { type: 'object', properties: { content: { type: 'string' }, path: { type: 'string' } } },
    async run(input, ctx) { return parseStacktrace((await readTextInput(ctx, input)).text); },
  },
  {
    id: 'code.diff_stats',
    title: 'Analyze a diff',
    description: 'Summarize a unified diff: files, additions, deletions, renames, risky paths (migrations, CI, auth, lockfiles), debug artifacts, possible secrets and missing test changes.',
    permissions: [],
    input_schema: { type: 'object', properties: { content: { type: 'string', description: 'git diff output' }, path: { type: 'string' } } },
    async run(input, ctx) { return diffStats((await readTextInput(ctx, input)).text); },
  },
  {
    id: 'test.parse_report',
    title: 'Parse a test report',
    description: 'Parse JUnit XML, TAP, Jest JSON or pytest/mocha summary output into totals and failing tests with messages.',
    permissions: [],
    input_schema: { type: 'object', properties: { content: { type: 'string' }, path: { type: 'string' } } },
    async run(input, ctx) { return parseTestReport((await readTextInput(ctx, input)).text); },
  },
  {
    id: 'logs.summarize',
    title: 'Summarize logs',
    description: 'Group log lines into message templates (masking ids, numbers, paths, timestamps), count levels, find error templates and traffic bursts.',
    permissions: [],
    input_schema: { type: 'object', properties: { content: { type: 'string' }, path: { type: 'string' }, max_templates: { type: 'integer', minimum: 1, maximum: 200, default: 25 } } },
    async run(input, ctx) { return summarizeLogs((await readTextInput(ctx, input)).text, { maxTemplates: input.max_templates }); },
  },
];
