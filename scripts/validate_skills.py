#!/usr/bin/env python3
"""Dependency-free structural validator for EXTREMIS Agent Skills."""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / "skills"
INDEX = ROOT / "registry" / "skills-index.json"
NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
FIELD_RE = re.compile(r"^(name|description|license|compatibility):\s*(.*)$")

def parse_frontmatter(text: str):
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError("missing opening YAML frontmatter delimiter")
    try:
        end = lines.index("---", 1)
    except ValueError:
        raise ValueError("missing closing YAML frontmatter delimiter")
    fields = {}
    for line in lines[1:end]:
        match = FIELD_RE.match(line)
        if match:
            fields[match.group(1)] = match.group(2).strip().strip('"\'')
    return fields, "\n".join(lines[end + 1:]).strip()

def main():
    errors = []
    discovered = {}
    for skill_file in sorted(SKILLS.glob("*/SKILL.md")):
        folder = skill_file.parent.name
        try:
            raw = skill_file.read_text(encoding="utf-8")
            fields, body = parse_frontmatter(raw)
            name, description = fields.get("name", ""), fields.get("description", "")
            if not NAME_RE.fullmatch(name):
                errors.append(f"{skill_file}: invalid or missing name")
            if name != folder:
                errors.append(f"{skill_file}: name '{name}' does not match directory '{folder}'")
            if not description or len(description) > 1024:
                errors.append(f"{skill_file}: description must contain 1..1024 characters")
            if not body:
                errors.append(f"{skill_file}: instruction body is empty")
            if len(raw.splitlines()) > 500:
                errors.append(f"{skill_file}: exceeds recommended 500-line limit")
            eval_file = skill_file.parent / "evals" / "evals.json"
            try:
                cases = json.loads(eval_file.read_text(encoding="utf-8")).get("cases", [])
                if len(cases) < 5:
                    errors.append(f"{eval_file}: at least five evaluation cases are required")
                for case in cases:
                    if not {"id", "prompt", "should_activate", "must"}.issubset(case):
                        errors.append(f"{eval_file}: every case needs id, prompt, should_activate, and must")
            except (OSError, UnicodeError, json.JSONDecodeError, AttributeError) as exc:
                errors.append(f"{eval_file}: cannot read valid evaluations: {exc}")
            if name in discovered:
                errors.append(f"{skill_file}: duplicate skill name '{name}'")
            discovered[name] = skill_file
        except (OSError, UnicodeError, ValueError) as exc:
            errors.append(f"{skill_file}: {exc}")

    if not discovered:
        errors.append("no skills found under skills/*/SKILL.md")

    try:
        registry = json.loads(INDEX.read_text(encoding="utf-8"))
        entries = registry.get("skills", [])
        indexed = {item.get("name"): item for item in entries}
        if len(indexed) != len(entries):
            errors.append("registry: duplicate skill names")
        for name, path in discovered.items():
            if name not in indexed:
                errors.append(f"{path}: missing registry entry for '{name}'")
            elif indexed[name].get("path") != path.parent.relative_to(ROOT).as_posix():
                errors.append(f"{path}: registry path mismatch")
        for name in indexed:
            if name not in discovered:
                errors.append(f"registry: '{name}' has no corresponding SKILL.md")
    except (OSError, json.JSONDecodeError, AttributeError) as exc:
        errors.append(f"{INDEX}: cannot read valid registry: {exc}")

    if errors:
        print("EXTREMIS skill validation FAILED")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"EXTREMIS skill validation passed: {len(discovered)} skills")
    return 0

if __name__ == "__main__":
    sys.exit(main())
