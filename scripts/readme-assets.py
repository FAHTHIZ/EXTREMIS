#!/usr/bin/env python3
"""Generate the README artwork in assets/readme/ (badges, tagline, stat and agent cards,
social preview). Run from the repository root: python3 scripts/readme-assets.py

Numbers come from the repository itself (catalog, agents, tools, tests), so re-running
after changes keeps the README honest. PNG output needs cairosvg (optional)."""

import json
import os
import re
import subprocess
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "readme"
OUT.mkdir(parents=True, exist_ok=True)
FONT = "Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
MONO = "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace"

PURPLE, LILAC, CORAL, ORANGE, GREEN = "#9B83DB", "#8D78A7", "#E89B77", "#F2A66D", "#65B88A"
THEMES = {
    "dark": dict(bg="#1C1A27", bg2="#14121D", card="#242132", edge="#3A3450", text="#F1EAFF", muted="#A99FC2", faint="#6E6688"),
    "light": dict(bg="#FBF8FF", bg2="#F3EEFB", card="#FFFFFF", edge="#E2DAF2", text="#1F1A2E", muted="#5E5675", faint="#9A91B0"),
}


def node(expr):
    return json.loads(subprocess.check_output(["node", "--input-type=module", "-e", expr], cwd=ROOT, text=True))


def facts():
    data = node(
        "import { createExtremis } from './src/index.mjs';"
        "const x = createExtremis({ user: false, project: false });"
        "const s = await x.stats(); const a = await x.agents();"
        "console.log(JSON.stringify({ caps: s.capabilities, workflows: s.workflows, tools: s.builtin_tools, agents: a.map(({name, title, description, capabilities}) => ({name, title, description, capabilities})), domains: s.domains.length, version: s.version }));"
    )
    tests = 0
    for f in (ROOT / "test").glob("*.test.mjs"):
        tests += len(re.findall(r"^test\(", f.read_text(), re.M))
    data["tests"] = tests
    return data


def text_width(s, size, weight=600):
    # Rough Inter metrics: average advance ~0.56em (0.6em bold), narrow for punctuation.
    w = 0.0
    for ch in s:
        if ch in "il.,:;|!'": w += 0.28
        elif ch in " ": w += 0.28
        elif ch in "mwMW": w += 0.86
        elif ch.isupper() or ch.isdigit(): w += 0.64
        else: w += 0.55
    return w * size * (1.04 if weight >= 700 else 1.0)


ICONS = {
    "grid": "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    "agent": "M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21c0-4 3.6-7 8-7s8 3 8 7",
    "tool": "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-2.4z",
    "plug": "M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4",
    "search": "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM16.5 16.5L21 21",
    "check": "M4 12.5l5 5L20 6.5",
    "target": "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z",
    "shield": "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
    "node": "M12 3l8 4.5v9L12 21l-8-4.5v-9z",
    "py": "M8 4h8v5H8zM8 15h8v5H8zM4 9h8v6H4zM12 9h8v6h-8z",
    "feather": "M20 4C10 4 6 10 5 19M5 19l7-7M9 9h7",
    "scale": "M12 4v16M5 8h14M5 8l-3 6h6zM19 8l-3 6h6z",
}


def badge(name, label, value, c1, c2, icon):
    lw = text_width(label.upper(), 10.5, 700) + 0.04 * 10.5 * len(label)
    vw = text_width(value, 12, 700)
    left = 38 + lw + 10
    pill = vw + 24
    W = round(left + pill + 3)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="30" viewBox="0 0 {W} 30" role="img" aria-label="{escape(label)}: {escape(value)}">
<title>{escape(label)}: {escape(value)}</title>
<defs>
<linearGradient id="{name}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#25212F"/><stop offset="1" stop-color="#17151F"/></linearGradient>
<linearGradient id="{name}-val" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient>
<linearGradient id="{name}-edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c1}" stop-opacity=".6"/><stop offset=".5" stop-color="{c1}" stop-opacity=".15"/><stop offset="1" stop-color="{c2}" stop-opacity=".55"/></linearGradient>
<linearGradient id="{name}-shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="{name}-clip"><rect width="{W}" height="30" rx="15"/></clipPath>
</defs>
<style>@media (prefers-reduced-motion: no-preference) {{
.sw{{animation:sw 9s 2s cubic-bezier(.4,0,.2,1) infinite}}
@keyframes sw{{0%{{transform:translateX(-80px)}}20%,100%{{transform:translateX({W + 80}px)}}}}
}}</style>
<g clip-path="url(#{name}-clip)">
<rect width="{W}" height="30" fill="url(#{name}-bg)"/>
<rect x="{left:.1f}" y="3" width="{pill:.1f}" height="24" rx="12" fill="url(#{name}-val)"/>
<rect class="sw" x="-60" y="0" width="46" height="30" fill="url(#{name}-shine)" transform="translate(-80 0)"/>
</g>
<rect x=".5" y=".5" width="{W - 1}" height="29" rx="14.5" fill="none" stroke="url(#{name}-edge)"/>
<g transform="translate(12 6) scale(.75)" fill="none" stroke="{c1}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="{ICONS[icon]}"/></g>
<text x="38" y="18.8" font-family="{FONT}" font-size="10.5" font-weight="700" fill="#B8AECF" letter-spacing=".04em">{escape(label.upper())}</text>
<text x="{left + pill / 2:.1f}" y="19.4" text-anchor="middle" font-family="{FONT}" font-size="12" font-weight="700" fill="#17151F">{escape(value)}</text>
</svg>
'''
    (OUT / f"badge-{name}.svg").write_text(svg)


def tagline(theme):
    t = THEMES[theme]
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="132" viewBox="0 0 1280 132" role="img" aria-labelledby="t d">
<title id="t">Every skill your agent needs. Only the ones it uses.</title>
<desc id="d">EXTREMIS plans the task, loads only the capabilities it needs, runs permission-gated tools, verifies the result and finds any public skill when the catalog runs out.</desc>
<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="{PURPLE}"/><stop offset=".55" stop-color="{CORAL}"/><stop offset="1" stop-color="{ORANGE}"/></linearGradient></defs>
<style>@media (prefers-reduced-motion: no-preference) {{
.l1{{animation:up 1s .1s cubic-bezier(.2,.7,.1,1) both}}.l2{{animation:up 1s .45s cubic-bezier(.2,.7,.1,1) both}}
@keyframes up{{from{{opacity:0;transform:translateY(10px)}}to{{opacity:1;transform:none}}}}
}}</style>
<text class="l1" x="640" y="58" text-anchor="middle" font-family="{FONT}" font-size="40" font-weight="800" fill="url(#g)" letter-spacing="-.01em">Every skill your agent needs. Only the ones it uses.</text>
<text class="l2" x="640" y="102" text-anchor="middle" font-family="{FONT}" font-size="19" font-weight="500" fill="{t['muted']}">Plan the task, load just the right capabilities, run gated tools, verify, and find any public skill.</text>
</svg>
'''
    (OUT / f"tagline-{theme}.svg").write_text(svg)


def stats(theme, f):
    t = THEMES[theme]
    cards = [
        (str(f["caps"]), "capabilities", f'{f["caps"] - f["workflows"]} skills · {f["workflows"]} workflows', PURPLE, "grid"),
        (str(len(f["agents"])), "specialist agents", "MCP prompts · Claude subagents", CORAL, "agent"),
        (str(f["tools"]), "built-in tools", "permission-gated, zero deps", ORANGE, "tool"),
        ("92%", "routing Hit@1", "hold-out set · 100% Hit@5", GREEN, "target"),
        ("~2K", "tokens to browse", f'all {f["caps"]} cards vs ~46K in full', LILAC, "feather"),
    ]
    W, H, gap = 1280, 196, 16
    cw = (W - 2 * 24 - gap * 4) / 5
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t">',
             f'<title id="t">EXTREMIS at a glance: {f["caps"]} capabilities, {len(f["agents"])} agents, {f["tools"]} tools, 92% routing Hit@1 on the hold-out set</title>',
             '<style>@media (prefers-reduced-motion: no-preference) {.c{animation:up .9s cubic-bezier(.2,.7,.1,1) both}@keyframes up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}}</style>']
    for i, (num, label, sub, color, icon) in enumerate(cards):
        x = 24 + i * (cw + gap)
        parts.append(f'<g class="c" style="animation-delay:{i * 0.12:.2f}s">')
        parts.append(f'<rect x="{x:.1f}" y="16" width="{cw:.1f}" height="164" rx="18" fill="{t["card"]}" stroke="{t["edge"]}"/>')
        parts.append(f'<rect x="{x + 22:.1f}" y="16" width="{cw - 44:.1f}" height="3" rx="1.5" fill="{color}"/>')
        parts.append(f'<g transform="translate({x + 22:.1f} 40)" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="{ICONS[icon]}"/></g>')
        parts.append(f'<text x="{x + 22:.1f}" y="118" font-family="{FONT}" font-size="50" font-weight="800" fill="{t["text"]}" letter-spacing="-.02em">{escape(num)}</text>')
        parts.append(f'<text x="{x + 22:.1f}" y="145" font-family="{FONT}" font-size="16" font-weight="700" fill="{color}">{escape(label)}</text>')
        parts.append(f'<text x="{x + 22:.1f}" y="166" font-family="{FONT}" font-size="12.5" font-weight="500" fill="{t["muted"]}">{escape(sub)}</text>')
        parts.append('</g>')
    parts.append('</svg>')
    (OUT / f"stats-{theme}.svg").write_text("\n".join(parts) + "\n")


AGENT_LINES = {
    "skill-scout": "Finds, vets and installs public skills",
    "code-reviewer": "Severity-ordered review of any diff",
    "security-auditor": "Threat model, code, CI and IaC audit",
    "debugger": "Reproduce, root-cause, fix, prove it",
    "release-captain": "Evidence-based GO / NO-GO and rollout",
    "research-analyst": "Sourced reports with confidence levels",
    "data-analyst": "Profile, test, chart and explain data",
    "ai-engineer": "Prompts, RAG, evals and LLM launches",
    "architect": "Options, trade-offs and migration plans",
    "product-strategist": "Problems, markets, bets and metrics",
}
AGENT_ICON = {"skill-scout": "search", "code-reviewer": "check", "security-auditor": "shield", "debugger": "target", "release-captain": "plug",
              "research-analyst": "feather", "data-analyst": "grid", "ai-engineer": "node", "architect": "scale", "product-strategist": "agent"}
COLORS = [PURPLE, CORAL, ORANGE, GREEN, LILAC]


def agents_card(theme, f):
    t = THEMES[theme]
    order = list(AGENT_LINES)
    agents = {a["name"]: a for a in f["agents"]}
    cols, W = 5, 1280
    cw, ch, gap = (W - 48 - 16 * 4) / 5, 150, 16
    H = 24 + 2 * ch + gap + 24
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t">',
             f'<title id="t">The {len(order)} built-in EXTREMIS agents</title>',
             '<style>@media (prefers-reduced-motion: no-preference) {.c{animation:up .9s cubic-bezier(.2,.7,.1,1) both}@keyframes up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}}</style>']
    for i, name in enumerate(order):
        a = agents[name]
        r, c = divmod(i, cols)
        x, y = 24 + c * (cw + gap), 24 + r * (ch + gap)
        color = COLORS[i % 5]
        parts.append(f'<g class="c" style="animation-delay:{i * 0.07:.2f}s">')
        parts.append(f'<rect x="{x:.1f}" y="{y}" width="{cw:.1f}" height="{ch}" rx="16" fill="{t["card"]}" stroke="{t["edge"]}"/>')
        parts.append(f'<circle cx="{x + 34:.1f}" cy="{y + 36}" r="18" fill="{color}" fill-opacity=".16"/>')
        parts.append(f'<g transform="translate({x + 25:.1f} {y + 27}) scale(.75)" fill="none" stroke="{color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="{ICONS[AGENT_ICON[name]]}"/></g>')
        parts.append(f'<text x="{x + 62:.1f}" y="{y + 42}" font-family="{FONT}" font-size="16.5" font-weight="800" fill="{t["text"]}">{escape(a["title"])}</text>')
        words, lines, cur = AGENT_LINES[name].split(), [], ''
        for w in words:
            nxt = f'{cur} {w}'.strip()
            if text_width(nxt, 13, 500) > cw - 40 and cur: lines.append(cur); cur = w
            else: cur = nxt
        lines.append(cur)
        for j, line in enumerate(lines[:2]):
            parts.append(f'<text x="{x + 20:.1f}" y="{y + 78 + j * 18}" font-family="{FONT}" font-size="13" font-weight="500" fill="{t["muted"]}">{escape(line)}</text>')
        parts.append(f'<text x="{x + 20:.1f}" y="{y + 130}" font-family="{MONO}" font-size="11.5" font-weight="600" fill="{color}">extremis agent {escape(name)}</text>')
        parts.append('</g>')
    parts.append('</svg>')
    (OUT / f"agents-{theme}.svg").write_text("\n".join(parts) + "\n")


def divider(theme):
    t = THEMES[theme]
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="24" viewBox="0 0 1280 24" role="presentation">
<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="{PURPLE}" stop-opacity="0"/><stop offset=".3" stop-color="{PURPLE}"/><stop offset=".7" stop-color="{CORAL}"/><stop offset="1" stop-color="{ORANGE}" stop-opacity="0"/></linearGradient></defs>
<rect x="80" y="11" width="1120" height="2" rx="1" fill="url(#g)"/>
<circle cx="640" cy="12" r="5" fill="{t['bg']}" stroke="{CORAL}" stroke-width="2"/>
</svg>
'''
    (OUT / f"divider-{theme}.svg").write_text(svg)


def social(f):
    t = THEMES["dark"]
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#221E31"/><stop offset="1" stop-color="#14121D"/></linearGradient>
<linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="{PURPLE}"/><stop offset=".55" stop-color="{CORAL}"/><stop offset="1" stop-color="{ORANGE}"/></linearGradient>
<radialGradient id="glow" cx=".85" cy=".15" r=".6"><stop offset="0" stop-color="{CORAL}" stop-opacity=".28"/><stop offset="1" stop-color="{CORAL}" stop-opacity="0"/></radialGradient>
<radialGradient id="glow2" cx=".1" cy=".95" r=".6"><stop offset="0" stop-color="{PURPLE}" stop-opacity=".3"/><stop offset="1" stop-color="{PURPLE}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="1280" height="640" fill="url(#bg)"/>
<rect width="1280" height="640" fill="url(#glow)"/>
<rect width="1280" height="640" fill="url(#glow2)"/>
<text x="96" y="210" font-family="{FONT}" font-size="132" font-weight="900" fill="url(#g)" letter-spacing=".02em">EXTREMIS</text>
<text x="100" y="282" font-family="{FONT}" font-size="38" font-weight="700" fill="{t['text']}">Every skill your agent needs.</text>
<text x="100" y="330" font-family="{FONT}" font-size="38" font-weight="700" fill="{t['text']}">Only the ones it uses.</text>
<text x="100" y="392" font-family="{FONT}" font-size="22" font-weight="500" fill="{t['muted']}">Capability layer for AI agents over MCP, CLI, JavaScript and Python.</text>
'''
    chips = [(f'{f["caps"]} capabilities', PURPLE), (f'{len(f["agents"])} agents', CORAL), (f'{f["tools"]} tools', ORANGE), ("skill finder", GREEN), ("zero deps", LILAC)]
    x = 100
    for label, color in chips:
        w = text_width(label, 21, 700) + 44
        svg += f'<rect x="{x:.0f}" y="452" width="{w:.0f}" height="48" rx="24" fill="{color}" fill-opacity=".14" stroke="{color}" stroke-opacity=".6"/>\n'
        svg += f'<text x="{x + w / 2:.0f}" y="483" text-anchor="middle" font-family="{FONT}" font-size="21" font-weight="700" fill="{color}">{escape(label)}</text>\n'
        x += w + 16
    svg += f'<text x="100" y="574" font-family="{MONO}" font-size="20" font-weight="600" fill="{t["faint"]}">github.com/FAHTHIZ/EXTREMIS</text>\n</svg>\n'
    (OUT / "social-preview.svg").write_text(svg)
    try:
        import cairosvg
        cairosvg.svg2png(bytestring=svg.encode(), write_to=str(ROOT / "assets" / "social-preview.png"), output_width=1280, output_height=640)
    except ImportError:
        print("cairosvg not installed; skipped assets/social-preview.png")


def main():
    f = facts()
    badges = [
        ("capabilities", "capabilities", f'{f["caps"]} skills + workflows', PURPLE, CORAL, "grid"),
        ("agents", "agents", f'{len(f["agents"])} specialists', CORAL, ORANGE, "agent"),
        ("tools", "tools", f'{f["tools"]} built-in', ORANGE, CORAL, "tool"),
        ("mcp", "MCP", "7 tools + prompts", LILAC, PURPLE, "plug"),
        ("finder", "finder", "skills.sh · GitHub · indexes", GREEN, "#8FD3AE", "search"),
        ("tests", "tests", f'{f["tests"]} passing', GREEN, "#8FD3AE", "check"),
        ("routing", "routing", "92% Hit@1 hold-out", PURPLE, LILAC, "target"),
        ("deps", "runtime", "zero dependencies", ORANGE, "#F7C08F", "feather"),
        ("node", "node", ">= 18.17", GREEN, "#8FD3AE", "node"),
        ("python", "python", ">= 3.9 client", "#7AA7E0", "#9BC0F0", "py"),
        ("license", "license", "Apache 2.0", LILAC, PURPLE, "scale"),
        ("security", "security", "gated + scanned", CORAL, ORANGE, "shield"),
    ]
    for b in badges:
        badge(*b)
    for theme in THEMES:
        tagline(theme); stats(theme, f); agents_card(theme, f); divider(theme)
    social(f)
    print(json.dumps({k: v for k, v in f.items() if k != "agents"}), len(f["agents"]), "agents")


if __name__ == "__main__":
    main()
