// Web tools: fetch readable text, HTTP requests, link checking, accessibility
// and SEO audits of HTML, and WCAG colour-contrast checks.
// Network tools require the `network` permission and go through ctx.fetch,
// which blocks private/loopback addresses and caps response size.

import { parseHtml, htmlToText, decodeEntities, readTextInput, round, ToolInputError } from './util.mjs';

const MAX_LINKS = 200;

function isHtml(headers, body) {
  return /html/i.test(headers['content-type'] || '') || /^\s*<(!doctype html|html)/i.test(body.slice(0, 200));
}

function metaOf(elements) {
  const out = {};
  for (const el of elements) if (el.tag === 'meta') {
    const key = (el.attrs.name || el.attrs.property || el.attrs['http-equiv'] || '').toLowerCase();
    if (key) out[key] = el.attrs.content ?? '';
    if (el.attrs.charset) out.charset = el.attrs.charset;
  }
  return out;
}

/** Main-content heuristic: prefer <main>/<article>, then the densest block. */
function mainText(html) {
  const pick = /<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(html);
  const cleaned = String(html).replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ');
  const text = htmlToText(pick ? pick[2] : cleaned);
  return text.length > 200 || !pick ? text : htmlToText(cleaned);
}

function toMarkdownish(html) {
  return mainText(String(html)
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `\n${'#'.repeat(Number(n))} ${t.replace(/<[^>]+>/g, '').trim()}\n`)
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, t) => { const label = t.replace(/<[^>]+>/g, '').trim(); return label && !href.startsWith('javascript:') ? `[${label}](${href})` : label; }));
}

export function contrastRatio(fg, bg) {
  const lum = (c) => {
    const [r, g, b] = parseColor(c).map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const NAMED = { black: '000000', white: 'ffffff', red: 'ff0000', green: '008000', blue: '0000ff', gray: '808080', grey: '808080', silver: 'c0c0c0', yellow: 'ffff00', orange: 'ffa500', purple: '800080', navy: '000080', teal: '008080', maroon: '800000' };
export function parseColor(value) {
  let v = String(value).trim().toLowerCase();
  if (NAMED[v]) v = `#${NAMED[v]}`;
  let m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    let h = m[1]; if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(v);
  if (m) return m.slice(1, 4).map(Number);
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(v);
  if (m) {
    const h = Number(m[1]) / 360, s = Number(m[2]) / 100, l = Number(m[3]) / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((x) => Math.round(x * 255));
  }
  throw new ToolInputError(`unrecognised colour "${value}"`);
}

function contrastVerdict(ratio) {
  return { ratio: round(ratio, 2), aa_normal: ratio >= 4.5, aa_large: ratio >= 3, aaa_normal: ratio >= 7, aaa_large: ratio >= 4.5, ui_components: ratio >= 3 };
}

export function a11yAudit(html) {
  const { elements } = parseHtml(html);
  const issues = [];
  const add = (rule, wcag, severity, el, message) => issues.push({ rule, wcag, severity, line: el?.line ?? null, message });
  const html0 = elements.find((e) => e.tag === 'html');
  if (html0 && !html0.attrs.lang) add('html-lang', '3.1.1', 'serious', html0, '<html> is missing a lang attribute');
  const title = elements.find((e) => e.tag === 'title');
  if (!title || !title.text) add('document-title', '2.4.2', 'serious', title, 'page has no <title>');
  const ids = new Map();
  for (const el of elements) if (el.attrs.id) ids.set(el.attrs.id, (ids.get(el.attrs.id) || 0) + 1);
  for (const [id, n] of ids) if (n > 1) add('duplicate-id', '4.1.1', 'moderate', elements.find((e) => e.attrs.id === id), `id "${id}" is used ${n} times`);
  const labelled = new Set(elements.filter((e) => e.tag === 'label' && e.attrs.for).map((e) => e.attrs.for));
  const hasName = (el) => el.text || el.attrs['aria-label'] || el.attrs['aria-labelledby'] || el.attrs.title;
  let lastHeading = 0; let h1 = 0;
  for (const el of elements) {
    const t = el.tag;
    if (t === 'img' && el.attrs.alt === undefined && el.attrs.role !== 'presentation' && el.attrs['aria-hidden'] !== 'true') add('image-alt', '1.1.1', 'critical', el, `<img src="${el.attrs.src || ''}"> has no alt attribute`);
    if (t === 'img' && el.attrs.alt && /\.(png|jpe?g|gif|svg|webp)$|^(image|photo|picture|img)\b/i.test(el.attrs.alt.trim())) add('image-alt-quality', '1.1.1', 'minor', el, `alt text "${el.attrs.alt}" is not descriptive`);
    if (t === 'input' && el.attrs.type === 'image' && !el.attrs.alt) add('input-image-alt', '1.1.1', 'critical', el, 'image button has no alt text');
    if (['input', 'select', 'textarea'].includes(t) && !['hidden', 'submit', 'button', 'reset', 'image'].includes((el.attrs.type || '').toLowerCase())) {
      const wrapped = (() => { for (let p = el.parent; p; p = p.parent) if (p.tag === 'label') return true; return false; })();
      if (!wrapped && !(el.attrs.id && labelled.has(el.attrs.id)) && !el.attrs['aria-label'] && !el.attrs['aria-labelledby'] && !el.attrs.title) add('form-label', '1.3.1', 'critical', el, `<${t}${el.attrs.name ? ` name="${el.attrs.name}"` : ''}> has no label`);
    }
    if (t === 'a' && el.attrs.href !== undefined && !hasName(el) && !elements.some((c) => c.parent === el && c.tag === 'img' && c.attrs.alt)) add('link-name', '2.4.4', 'serious', el, `link to ${el.attrs.href} has no accessible name`);
    if (t === 'a' && /^(click here|here|read more|more|link)$/i.test(el.text)) add('link-purpose', '2.4.4', 'minor', el, `ambiguous link text "${el.text}"`);
    if (t === 'button' && !hasName(el) && !elements.some((c) => c.parent === el && c.tag === 'img' && c.attrs.alt)) add('button-name', '4.1.2', 'critical', el, 'button has no accessible name');
    if (/^h[1-6]$/.test(t)) {
      const level = Number(t[1]); if (level === 1) h1 += 1;
      if (lastHeading && level > lastHeading + 1) add('heading-order', '1.3.1', 'moderate', el, `heading level jumps from h${lastHeading} to h${level}`);
      if (!el.text) add('empty-heading', '1.3.1', 'moderate', el, `empty <${t}>`);
      lastHeading = level;
    }
    if (el.attrs.tabindex && Number(el.attrs.tabindex) > 0) add('tabindex', '2.4.3', 'moderate', el, `positive tabindex=${el.attrs.tabindex} breaks focus order`);
    if (t === 'meta' && el.attrs.name === 'viewport' && /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/i.test(el.attrs.content || '')) add('meta-viewport', '1.4.4', 'serious', el, 'viewport disables zoom');
    if (t === 'meta' && /refresh/i.test(el.attrs['http-equiv'] || '') && /url=/i.test(el.attrs.content || '')) add('meta-refresh', '2.2.1', 'serious', el, 'timed meta refresh redirect');
    if ((t === 'video' || t === 'audio') && el.attrs.autoplay !== undefined && el.attrs.muted === undefined) add('autoplay-audio', '1.4.2', 'serious', el, `<${t}> autoplays with sound`);
    if (t === 'video' && !elements.some((c) => c.parent === el && c.tag === 'track' && /captions|subtitles/.test(c.attrs.kind || ''))) add('video-captions', '1.2.2', 'serious', el, '<video> has no captions track');
    if (t === 'iframe' && !el.attrs.title) add('frame-title', '4.1.2', 'serious', el, '<iframe> has no title');
    if (t === 'table' && !elements.some((c) => c.tag === 'th' && (() => { for (let p = c.parent; p; p = p.parent) if (p === el) return true; return false; })()) && el.attrs.role !== 'presentation') add('table-headers', '1.3.1', 'moderate', el, 'data table has no <th> header cells');
    if (el.attrs.role && !ROLES.has(el.attrs.role.split(/\s+/)[0])) add('aria-role', '4.1.2', 'serious', el, `invalid ARIA role "${el.attrs.role}"`);
    if (el.attrs['aria-hidden'] === 'true' && ['a', 'button', 'input', 'select', 'textarea'].includes(t) && el.attrs.tabindex !== '-1') add('aria-hidden-focus', '4.1.2', 'serious', el, `focusable <${t}> is aria-hidden`);
    if ((t === 'div' || t === 'span') && el.attrs.onclick !== undefined && !el.attrs.role && el.attrs.tabindex === undefined) add('click-events-keyboard', '2.1.1', 'serious', el, `clickable <${t}> is not keyboard accessible`);
    const style = el.attrs.style || '';
    const fg = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style)?.[1]; const bg = /background(?:-color)?\s*:\s*([^;]+)/i.exec(style)?.[1];
    if (fg && bg) { try { const r = contrastRatio(fg, bg); if (r < 4.5) add('color-contrast', '1.4.3', 'serious', el, `inline colours ${fg.trim()} on ${bg.trim()} have contrast ${round(r, 2)}:1 (< 4.5:1)`); } catch { /* unparseable colour */ } }
  }
  if (h1 === 0 && elements.some((e) => /^h[2-6]$/.test(e.tag))) add('page-has-heading-one', '1.3.1', 'moderate', null, 'page has headings but no <h1>');
  if (!elements.some((e) => e.tag === 'main' || e.attrs.role === 'main')) add('landmark-main', '1.3.1', 'moderate', null, 'page has no <main> landmark');
  const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  issues.sort((a, b) => order[a.severity] - order[b.severity] || (a.line ?? 0) - (b.line ?? 0));
  const counts = issues.reduce((o, i) => ({ ...o, [i.severity]: (o[i.severity] || 0) + 1 }), {});
  return { issues, counts, passed: !issues.some((i) => i.severity === 'critical' || i.severity === 'serious'), note: 'Static checks only; dynamic states, CSS-computed contrast and screen-reader behaviour need manual or browser testing.' };
}

const ROLES = new Set('alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox complementary contentinfo definition deletion dialog directory document emphasis feed figure form generic grid gridcell group heading img insertion link list listbox listitem log main marquee math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option paragraph presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status strong subscript superscript switch tab table tablist tabpanel term textbox time timer toolbar tooltip tree treegrid treeitem'.split(' '));

export function seoAudit(html, { url } = {}) {
  const { elements, text } = parseHtml(html);
  const meta = metaOf(elements);
  const issues = [];
  const add = (rule, severity, message) => issues.push({ rule, severity, message });
  const title = elements.find((e) => e.tag === 'title')?.text || '';
  if (!title) add('title', 'high', 'missing <title>'); else if (title.length < 15 || title.length > 65) add('title-length', 'medium', `title is ${title.length} characters (aim for 15-65)`);
  const desc = meta.description || '';
  if (!desc) add('meta-description', 'high', 'missing meta description'); else if (desc.length < 50 || desc.length > 160) add('meta-description-length', 'low', `meta description is ${desc.length} characters (aim for 50-160)`);
  const h1s = elements.filter((e) => e.tag === 'h1');
  if (!h1s.length) add('h1', 'medium', 'no <h1>'); else if (h1s.length > 1) add('h1-multiple', 'low', `${h1s.length} <h1> elements`);
  const canonical = elements.find((e) => e.tag === 'link' && /\bcanonical\b/i.test(e.attrs.rel || ''))?.attrs.href;
  if (!canonical) add('canonical', 'medium', 'no canonical link');
  if (/noindex/i.test(meta.robots || '')) add('noindex', 'high', `robots meta is "${meta.robots}"`);
  if (!meta.viewport) add('viewport', 'high', 'no viewport meta (mobile friendliness)');
  if (!elements.find((e) => e.tag === 'html')?.attrs.lang) add('lang', 'low', '<html> has no lang');
  for (const k of ['og:title', 'og:description', 'og:image']) if (!meta[k]) add('open-graph', 'low', `missing ${k}`);
  if (!meta['twitter:card']) add('twitter-card', 'low', 'missing twitter:card');
  const imgs = elements.filter((e) => e.tag === 'img');
  const noAlt = imgs.filter((e) => e.attrs.alt === undefined).length; if (noAlt) add('img-alt', 'medium', `${noAlt} images without alt`);
  const lazy = imgs.filter((e) => !e.attrs.width || !e.attrs.height).length; if (lazy) add('img-dimensions', 'low', `${lazy} images without width/height (layout shift)`);
  const links = elements.filter((e) => e.tag === 'a' && e.attrs.href);
  const host = url ? new URL(url).host : null;
  const internal = links.filter((l) => { try { return !/^https?:/i.test(l.attrs.href) || (host && new URL(l.attrs.href, url).host === host); } catch { return false; } }).length;
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 300) add('thin-content', 'low', `only ${words} words of text`);
  const jsonLd = elements.filter((e) => e.tag === 'script' && /ld\+json/i.test(e.attrs.type || ''));
  const structured = [];
  for (const s of jsonLd) { try { const d = JSON.parse(s.raw); structured.push(...[].concat(d['@graph'] || d).map((x) => x['@type']).flat().filter(Boolean)); } catch { add('structured-data', 'medium', 'invalid JSON-LD block'); } }
  const sev = { high: 0, medium: 1, low: 2 }; issues.sort((a, b) => sev[a.severity] - sev[b.severity]);
  return {
    title, title_length: title.length, meta_description: desc, canonical: canonical || null, robots: meta.robots || null, h1: h1s.map((h) => h.text),
    headings: elements.filter((e) => /^h[1-3]$/.test(e.tag)).slice(0, 40).map((e) => ({ level: Number(e.tag[1]), text: e.text })),
    words, images: imgs.length, links: { total: links.length, internal, external: links.length - internal, nofollow: links.filter((l) => /nofollow/i.test(l.attrs.rel || '')).length },
    structured_data_types: [...new Set(structured)], open_graph: Object.fromEntries(Object.entries(meta).filter(([k]) => k.startsWith('og:'))), issues,
    score: Math.max(0, 100 - issues.reduce((a, i) => a + ({ high: 15, medium: 7, low: 3 }[i.severity]), 0)),
  };
}

function extractLinks(html, base) {
  const { elements } = parseHtml(html);
  const out = new Map();
  for (const el of elements) {
    const href = el.tag === 'a' || el.tag === 'link' ? el.attrs.href : el.tag === 'img' || el.tag === 'script' || el.tag === 'source' || el.tag === 'iframe' ? el.attrs.src : null;
    if (!href || /^(mailto:|tel:|javascript:|data:|#)/i.test(href)) continue;
    try { const u = new URL(href, base); u.hash = ''; if (/^https?:$/.test(u.protocol) && !out.has(u.toString())) out.set(u.toString(), { url: u.toString(), tag: el.tag, line: el.line, text: el.text?.slice(0, 80) }); } catch { out.set(href, { url: href, tag: el.tag, line: el.line, invalid: true }); }
  }
  return [...out.values()];
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

const SECURITY_HEADERS = ['strict-transport-security', 'content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy'];

export default [
  {
    id: 'web.fetch_text', title: 'Fetch web page text',
    description: 'Fetch a public URL and return readable main-content text (or Markdown-like text with links), title, meta description, headings and outgoing links. Private and loopback addresses are blocked.',
    permissions: ['network'],
    input_schema: { type: 'object', required: ['url'], properties: { url: { type: 'string', format: 'uri' }, format: { enum: ['text', 'markdown', 'raw'], default: 'text' }, max_chars: { type: 'integer', minimum: 200, maximum: 500000, default: 40000 }, include_links: { type: 'boolean', default: false } } },
    async run(input, ctx) {
      const res = await ctx.fetch(input.url, { maxBytes: 8 * 1024 * 1024, headers: { accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5' } });
      const body = res.body.toString('utf8');
      const base = { url: res.url, status: res.status, content_type: res.headers['content-type'] || null, redirects: res.redirects };
      if (!isHtml(res.headers, body) || input.format === 'raw') { const t = body.slice(0, input.max_chars); return { ...base, text: t, truncated: body.length > t.length || res.truncated }; }
      const { elements } = parseHtml(body); const meta = metaOf(elements);
      const text = input.format === 'markdown' ? toMarkdownish(body) : mainText(body);
      return {
        ...base, title: decodeEntities(elements.find((e) => e.tag === 'title')?.text || '') || null, description: meta.description || meta['og:description'] || null,
        headings: elements.filter((e) => /^h[1-3]$/.test(e.tag)).slice(0, 30).map((e) => ({ level: Number(e.tag[1]), text: e.text })),
        text: text.slice(0, input.max_chars), truncated: text.length > input.max_chars || res.truncated, characters: text.length,
        ...(input.include_links ? { links: extractLinks(body, res.url).slice(0, MAX_LINKS) } : {}),
      };
    },
  },
  {
    id: 'http.request', title: 'HTTP request',
    description: 'Send an HTTP request to a public URL and return status, headers, timing and the (JSON-parsed when possible) body. Useful for API smoke tests and response contract checks.',
    permissions: ['network'],
    input_schema: {
      type: 'object', required: ['url'],
      properties: {
        url: { type: 'string', format: 'uri' }, method: { enum: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], default: 'GET' },
        headers: { type: 'object', additionalProperties: { type: 'string' } }, json: { description: 'JSON body (sets content-type)' }, body: { type: 'string' },
        timeout_ms: { type: 'integer', minimum: 100, maximum: 60000, default: 15000 }, follow_redirects: { type: 'boolean', default: true },
        expect_status: { type: 'array', items: { type: 'integer' } }, max_body_chars: { type: 'integer', minimum: 0, maximum: 1000000, default: 20000 },
      },
    },
    async run(input, ctx) {
      const headers = { ...(input.headers || {}) }; let body = input.body;
      if (input.json !== undefined) { body = JSON.stringify(input.json); headers['content-type'] ||= 'application/json'; }
      const t0 = performance.now();
      const res = await ctx.fetch(input.url, { method: input.method, headers, body, timeoutMs: input.timeout_ms, followRedirects: input.follow_redirects, maxBytes: 4 * 1024 * 1024 });
      const ms = round(performance.now() - t0, 1);
      const text = res.body.toString('utf8'); let json;
      if (/json/i.test(res.headers['content-type'] || '')) { try { json = JSON.parse(text); } catch { /* not JSON */ } }
      const missingSecurity = res.url.startsWith('https:') ? SECURITY_HEADERS.filter((h) => !(h in res.headers)) : [];
      return {
        url: res.url, status: res.status, ok: input.expect_status ? input.expect_status.includes(res.status) : res.status < 400, elapsed_ms: ms, headers: res.headers, redirects: res.redirects,
        ...(json !== undefined ? { json } : { body: text.slice(0, input.max_body_chars), body_truncated: text.length > input.max_body_chars || res.truncated }),
        bytes: res.body.length, missing_security_headers: missingSecurity,
      };
    },
  },
  {
    id: 'web.check_links', title: 'Check links',
    description: 'Find broken links: fetch a page (or read local HTML/Markdown) and check every http(s) link and asset with bounded concurrency, reporting status codes, redirects and failures.',
    permissions: ['network'],
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', format: 'uri' }, path: { type: 'string' }, content: { type: 'string' }, base_url: { type: 'string' }, urls: { type: 'array', items: { type: 'string' }, maxItems: 500 },
        max_links: { type: 'integer', minimum: 1, maximum: 500, default: 100 }, concurrency: { type: 'integer', minimum: 1, maximum: 16, default: 6 }, same_host_only: { type: 'boolean', default: false },
      },
    },
    async run(input, ctx) {
      let links;
      if (input.urls) links = input.urls.map((u) => ({ url: u }));
      else if (input.url) { const res = await ctx.fetch(input.url, { maxBytes: 8 * 1024 * 1024 }); links = extractLinks(res.body.toString('utf8'), res.url); }
      else {
        const { text, source } = await readTextInput(ctx, input);
        const base = input.base_url || 'https://invalid.local/';
        links = /<a\s|<img\s|<link\s/i.test(text) ? extractLinks(text, base) : [...text.matchAll(/\]\((https?:\/\/[^)\s]+)\)|(?<![("<])(https?:\/\/[^\s)>\]"']+)/g)].map((m) => ({ url: m[1] || m[2], line: text.slice(0, m.index).split('\n').length, file: source }));
        links = links.filter((l) => !String(l.url).startsWith('https://invalid.local'));
      }
      if (input.same_host_only && input.url) { const h = new URL(input.url).host; links = links.filter((l) => { try { return new URL(l.url).host === h; } catch { return false; } }); }
      const seen = new Set(); links = links.filter((l) => !seen.has(l.url) && seen.add(l.url));
      const skipped = Math.max(0, links.length - input.max_links); links = links.slice(0, input.max_links);
      const results = await mapLimit(links, input.concurrency, async (l) => {
        if (l.invalid) return { ...l, ok: false, error: 'invalid URL' };
        try {
          let r = await ctx.fetch(l.url, { method: 'HEAD', timeoutMs: 10000, maxBytes: 1024 });
          if ([403, 405, 501].includes(r.status) || r.status >= 500) r = await ctx.fetch(l.url, { method: 'GET', timeoutMs: 12000, maxBytes: 64 * 1024 });
          return { ...l, status: r.status, ok: r.status < 400, ...(r.redirects.length ? { final_url: r.url, redirects: r.redirects.length } : {}) };
        } catch (err) { return { ...l, ok: false, error: err.code === 'blocked_address' ? 'private address (not checked)' : err.name === 'TimeoutError' ? 'timeout' : err.message }; }
      });
      const broken = results.filter((r) => !r.ok);
      return { checked: results.length, skipped, broken_count: broken.length, broken, redirected: results.filter((r) => r.ok && r.redirects).map((r) => ({ url: r.url, final_url: r.final_url })), ok: !broken.length };
    },
  },
  {
    id: 'a11y.html_audit', title: 'Accessibility audit (HTML)',
    description: 'Static WCAG 2.2 checks on HTML: alt text, form labels, link/button names, heading order, lang, title, landmarks, ARIA roles, tabindex, zoom, captions, iframes, tables and inline colour contrast.',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } },
    async run(input, ctx) { const { text, source } = await readTextInput(ctx, input); return { file: source, ...a11yAudit(text) }; },
  },
  {
    id: 'a11y.contrast', title: 'Colour contrast',
    description: 'WCAG contrast ratio between foreground and background colours (hex, rgb, hsl or named) with AA/AAA pass/fail for normal text, large text and UI components.',
    permissions: [],
    input_schema: { type: 'object', properties: { foreground: { type: 'string' }, background: { type: 'string' }, pairs: { type: 'array', items: { type: 'object', required: ['foreground', 'background'], properties: { foreground: { type: 'string' }, background: { type: 'string' }, label: { type: 'string' } } } } } },
    async run(input) {
      const pairs = input.pairs || (input.foreground && input.background ? [{ foreground: input.foreground, background: input.background }] : []);
      if (!pairs.length) throw new ToolInputError('provide foreground and background, or pairs');
      const results = pairs.map((p) => ({ ...p, ...contrastVerdict(contrastRatio(p.foreground, p.background)) }));
      return results.length === 1 && !input.pairs ? results[0] : { results, all_aa: results.every((r) => r.aa_normal) };
    },
  },
  {
    id: 'seo.html_audit', title: 'SEO audit (HTML)',
    description: 'On-page SEO audit of HTML from a file, inline content or public URL: title, meta description, headings, canonical, robots, viewport, Open Graph, structured data, images, links and word count.',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, url: { type: 'string', format: 'uri', description: 'Fetch the page (needs network permission)' } } },
    async run(input, ctx) {
      if (input.url && !input.path && !input.content) { const res = await ctx.fetch(input.url, { maxBytes: 8 * 1024 * 1024 }); return { url: res.url, status: res.status, x_robots_tag: res.headers['x-robots-tag'] || null, ...seoAudit(res.body.toString('utf8'), { url: res.url }) }; }
      const { text, source } = await readTextInput(ctx, input); return { file: source, ...seoAudit(text, { url: input.url }) };
    },
  },
];
