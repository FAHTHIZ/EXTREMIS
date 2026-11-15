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
            fields[match.group(1)] = match.group(2).strip().strip("\"'")
    return fields, "\n".join(lines[end + 1:]).strip()

def validate_eval_payload(payload, skill_name: str):
    """Return structural errors for one skill's evaluation fixture file."""
    errors = []
    if not isinstance(payload, dict):
        return ["evaluation root must be an object"]
    if payload.get("skill") != skill_name:
        errors.append(f"evaluation skill must be '{skill_name}'")
    cases = payload.get("cases")
    if not isinstance(cases, list) or len(cases) < 5:
        errors.append("at least five evaluation cases are required")
        return errors
    seen = set()
    for number, case in enumerate(cases, start=1):
        label = f"case {number}"
        if not isinstance(case, dict):
            errors.append(f"{label} must be an object")
            continue
        case_id = case.get("id")
        if not isinstance(case_id, str) or not case_id.strip():
            errors.append(f"{label} needs a non-empty id")
        elif case_id in seen:
            errors.append(f"duplicate evaluation id '{case_id}'")
        else:
            seen.add(case_id)
        if not isinstance(case.get("prompt"), str) or not case["prompt"].strip():
            errors.append(f"{label} needs a non-empty prompt")
        if not isinstance(case.get("should_activate"), bool):
            errors.append(f"{label} needs boolean should_activate")
        must = case.get("must")
        if not isinstance(must, list) or any(not isinstance(item, str) or not item.strip() for item in must):
            errors.append(f"{label} must contain a list of non-empty strings")
    return errors


def validate_domain_registry(payload, indexed, discovered_names):
    """Ensure every catalog skill belongs to exactly one matching domain."""
    errors = []
    if not isinstance(payload, dict):
        return ["domain registry root must be an object"]
    domains = payload.get("domains")
    if not isinstance(domains, list) or not domains:
        return ["domain registry must contain a non-empty domains list"]
    seen_domains, memberships = set(), {}
    for number, domain in enumerate(domains, start=1):
        if not isinstance(domain, dict):
            errors.append(f"domain {number} must be an object")
            continue
        name = domain.get("name")
        if not isinstance(name, str) or not name.strip():
            errors.append(f"domain {number} needs a non-empty name")
            continue
        if name in seen_domains:
            errors.append(f"duplicate domain '{name}'")
        seen_domains.add(name)
        skills = domain.get("skills")
        if not isinstance(skills, list):
            errors.append(f"domain '{name}' skills must be a list")
            continue
        local = set()
        for skill in skills:
            if not isinstance(skill, str) or not skill.strip():
                errors.append(f"domain '{name}' contains an invalid skill name")
                continue
            if skill in local:
                errors.append(f"domain '{name}' repeats skill '{skill}'")
            local.add(skill)
            memberships[skill] = memberships.get(skill, 0) + 1
            if skill not in indexed:
                errors.append(f"domain '{name}' references unindexed skill '{skill}'")
            elif indexed[skill].get("category") != name:
                errors.append(f"skill '{skill}' category '{indexed[skill].get('category')}' does not match domain '{name}'")
    for skill in discovered_names:
        count = memberships.get(skill, 0)
        if count == 0:
            errors.append(f"domain registry: skill '{skill}' has no domain")
        elif count > 1:
            errors.append(f"domain registry: skill '{skill}' belongs to {count} domains")
    for skill in memberships:
        if skill not in discovered_names:
            errors.append(f"domain registry: '{skill}' has no corresponding SKILL.md")
    return errors

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
                payload = json.loads(eval_file.read_text(encoding="utf-8"))
                errors.extend(f"{eval_file}: {item}" for item in validate_eval_payload(payload, name))
            except (OSError, UnicodeError, json.JSONDecodeError) as exc:
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
            elif indexed[name].get("evaluation_cases", 0) < 5:
                errors.append(f"{path}: registry must declare at least five evaluation cases")
        for name in indexed:
            if name not in discovered:
                errors.append(f"registry: '{name}' has no corresponding SKILL.md")
        try:
            domain_registry = json.loads((ROOT / "registry" / "domains.json").read_text(encoding="utf-8"))
            errors.extend(f"registry/domains.json: {item}" for item in validate_domain_registry(domain_registry, indexed, set(discovered)))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            errors.append(f"{ROOT / 'registry' / 'domains.json'}: cannot read valid domain registry: {exc}")
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
