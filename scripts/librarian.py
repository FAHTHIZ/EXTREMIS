#!/usr/bin/env python3
"""Lightweight, dependency-free skill discovery and composition for EXTREMIS."""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "registry" / "skills-index.json"
TOKEN_RE = re.compile(r"[a-z0-9]+", re.IGNORECASE)
STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "for",
    "from", "get", "help", "how", "i", "in", "into", "is", "it", "me",
    "my", "of", "on", "or", "our", "please", "should", "the", "their",
    "them", "there", "this", "to", "up", "use", "want", "we", "what",
    "when", "with", "you", "your",
}
FIELD_WEIGHTS = {
    "name": 5.0,
    "summary": 3.2,
    "keywords": 3.5,
    "description": 2.4,
    "category": 1.3,
    "body": 1.0,
    "prerequisites": 0.6,
    "not_for": -10.0,
}
BM25_K1 = 1.5
BM25_B = 0.72
NEAR_DUPLICATE_THRESHOLD = 0.84


def tokenize(value: str) -> list[str]:
    """Normalize words without requiring a language model or external package."""
    return [
        token.lower()
        for token in TOKEN_RE.findall(value or "")
        if token.lower() not in STOPWORDS and len(token) > 1
    ]


def parse_skill_file(raw: str) -> tuple[dict[str, str], str]:
    """Read only the portable name/description frontmatter fields."""
    lines = raw.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, raw.strip()
    try:
        end = lines.index("---", 1)
    except ValueError:
        return {}, raw.strip()
    fields: dict[str, str] = {}
    for line in lines[1:end]:
        match = re.match(r"^(name|description):\s*(.*)$", line)
        if match:
            fields[match.group(1)] = match.group(2).strip().strip("\"'")
    return fields, "\n".join(lines[end + 1:]).strip()


def _safe_skill_path(root: Path, relative: str) -> Path:
    """Reject registry paths that escape the repository root."""
    resolved_root = root.resolve()
    candidate = (resolved_root / relative / "SKILL.md").resolve()
    try:
        candidate.relative_to(resolved_root)
    except ValueError as exc:
        raise ValueError(f"skill path escapes repository root: {relative}") from exc
    return candidate


def load_catalog(root: Path = ROOT) -> list[dict[str, Any]]:
    """Load registry metadata plus complete skill bodies for full-text routing."""
    index_path = root / "registry" / "skills-index.json"
    payload = json.loads(index_path.read_text(encoding="utf-8"))
    entries = payload.get("skills")
    if not isinstance(entries, list):
        raise ValueError("registry/skills-index.json must contain a skills list")

    documents: list[dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name", "")).strip()
        relative = str(entry.get("path", "")).strip()
        if not name or not relative:
            continue
        skill_path = _safe_skill_path(root, relative)
        if not skill_path.is_file():
            continue
        fields, body = parse_skill_file(skill_path.read_text(encoding="utf-8"))
        prerequisites = entry.get("requires", [])
        if not isinstance(prerequisites, list):
            prerequisites = []
        documents.append({
            "name": name,
            "path": relative,
            "skill_file": skill_path.relative_to(root.resolve()).as_posix(),
            "category": str(entry.get("category", "")),
            "summary": str(entry.get("summary", "")),
            "keywords": " ".join(str(item) for item in entry.get("keywords", []) if isinstance(item, str)),
            "description": fields.get("description", ""),
            "body": body,
            "prerequisites": " ".join(str(item) for item in prerequisites),
            "risk": str(entry.get("risk", "unspecified")),
            "maturity": str(entry.get("maturity", "unspecified")),
            "version": str(entry.get("version", "unspecified")),
            "hosts": entry.get("hosts", []),
            "requires": prerequisites,
            "not_for": " ".join(str(item) for item in entry.get("not_for", []) if isinstance(item, str)),
        })
    return documents


def _field_tokens(document: dict[str, Any]) -> dict[str, list[str]]:
    return {
        field: tokenize(str(document.get(field, "")))
        for field in FIELD_WEIGHTS
    }


def rank_documents(
    query: str,
    documents: list[dict[str, Any]],
    top_k: int = 10,
) -> list[dict[str, Any]]:
    """Rank skills with weighted BM25 over metadata and full SKILL.md text.

    This is a transparent lexical baseline, not a probability or model benchmark.
    The skill body is indexed because metadata-only routing can miss procedural fit.
    """
    query_terms = list(dict.fromkeys(tokenize(query)))
    if not query_terms or not documents or top_k < 1:
        return []

    tokenized = [_field_tokens(doc) for doc in documents]
    doc_count = len(documents)
    avg_lengths: dict[str, float] = {}
    document_frequencies: dict[str, Counter[str]] = {}

    for field in FIELD_WEIGHTS:
        lengths = [len(item[field]) for item in tokenized]
        avg_lengths[field] = sum(lengths) / max(1, doc_count)
        frequencies: Counter[str] = Counter()
        for field_map in tokenized:
            frequencies.update(set(field_map[field]))
        document_frequencies[field] = frequencies

    ranked: list[dict[str, Any]] = []
    for document, field_map in zip(documents, tokenized):
        score = 0.0
        field_matches: dict[str, list[str]] = {}
        all_present: set[str] = set()
        excluded_terms: set[str] = set()

        for field, weight in FIELD_WEIGHTS.items():
            terms = field_map[field]
            counts = Counter(terms)
            length = len(terms)
            average = avg_lengths[field] or 1.0
            matched = [term for term in query_terms if counts[term] > 0]
            if matched:
                field_matches[field] = matched
                if weight < 0:
                    excluded_terms.update(matched)
                else:
                    all_present.update(matched)

            for term in query_terms:
                frequency = counts[term]
                if frequency == 0:
                    continue
                df = document_frequencies[field][term]
                inverse_frequency = math.log(
                    1.0 + (doc_count - df + 0.5) / (df + 0.5)
                )
                denominator = frequency + BM25_K1 * (
                    1.0 - BM25_B + BM25_B * length / average
                )
                score += weight * inverse_frequency * (
                    frequency * (BM25_K1 + 1.0) / denominator
                )

        # Small exact-name and short-phrase boosts; never treated as confidence.
        normalized_query = " ".join(query_terms)
        name_text = " ".join(tokenize(str(document.get("name", ""))))
        summary_text = " ".join(tokenize(str(document.get("summary", ""))))
        if normalized_query and normalized_query == name_text:
            score += 5.0
        elif len(query_terms) <= 4 and normalized_query:
            if normalized_query in summary_text:
                score += 2.0
            elif normalized_query in name_text:
                score += 3.0

        if score <= 0:
            continue
        result = dict(document)
        result.update({
            "score": round(score, 4),
            "matched_terms": [term for term in query_terms if term in all_present],
            "excluded_terms": [term for term in query_terms if term in excluded_terms],
            "field_matches": field_matches,
        })
        ranked.append(result)

    ranked.sort(key=lambda item: (-item["score"], item["name"]))
    return ranked[:top_k]


def search_catalog(
    query: str,
    root: Path = ROOT,
    top_k: int = 10,
    domain: str | None = None,
) -> list[dict[str, Any]]:
    documents = load_catalog(root)
    if domain:
        documents = [item for item in documents if item["category"] == domain]
    return rank_documents(query, documents, top_k=top_k)


def _content_similarity(left: dict[str, Any], right: dict[str, Any]) -> float:
    """Jaccard similarity used only to avoid near-identical composition picks."""
    a = set(tokenize(left.get("name", "") + " " + left.get("summary", "") + " " + left.get("body", "")))
    b = set(tokenize(right.get("name", "") + " " + right.get("summary", "") + " " + right.get("body", "")))
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def compose_catalog(
    query: str,
    root: Path = ROOT,
    max_skills: int = 4,
    domain: str | None = None,
) -> dict[str, Any]:
    """Suggest a compact, non-duplicative set of skills for a task."""
    if max_skills < 1 or max_skills > 12:
        raise ValueError("max_skills must be between 1 and 12")
    candidates = search_catalog(
        query, root=root, top_k=min(60, max(20, max_skills * 6)), domain=domain
    )
    selected: list[dict[str, Any]] = []
    alternatives: list[dict[str, Any]] = []
    for candidate in candidates:
        if len(selected) >= max_skills:
            alternatives.append(candidate)
            continue
        similarity = max(
            (_content_similarity(candidate, item) for item in selected),
            default=0.0,
        )
        if similarity >= NEAR_DUPLICATE_THRESHOLD:
            alternatives.append(candidate)
            continue
        selected.append(candidate)

    return {
        "query": query,
        "selection_method": "weighted BM25 over skill name, summary, description, category, prerequisites, and full skill body",
        "selected": selected,
        "alternatives": alternatives[:5],
        "notice": (
            "Suggestions only. The Librarian does not execute skills, grant tools, "
            "change permissions, or authorize side effects. The host agent must check "
            "prerequisites and user approval before acting."
        ),
    }


def _print_json(payload: Any) -> None:
    print(json.dumps(payload, indent=2, ensure_ascii=False))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="EXTREMIS Librarian — discover and compose portable agent skills."
    )
    commands = parser.add_subparsers(dest="command", required=True)

    find_parser = commands.add_parser("find", help="rank skills for a task")
    find_parser.add_argument("query")
    find_parser.add_argument("--top-k", type=int, default=10)
    find_parser.add_argument("--domain")
    find_parser.add_argument("--json", action="store_true")

    compose_parser = commands.add_parser("compose", help="suggest a compact skill set")
    compose_parser.add_argument("query")
    compose_parser.add_argument("--max-skills", type=int, default=4)
    compose_parser.add_argument("--domain")
    compose_parser.add_argument("--json", action="store_true")

    list_parser = commands.add_parser("list", help="list catalogued skills")
    list_parser.add_argument("--domain")
    list_parser.add_argument("--json", action="store_true")

    inspect_parser = commands.add_parser("inspect", help="show one skill's metadata")
    inspect_parser.add_argument("name")
    inspect_parser.add_argument("--json", action="store_true")

    args = parser.parse_args(argv)
    try:
        if args.command == "find":
            results = search_catalog(args.query, top_k=args.top_k, domain=args.domain)
            if args.json:
                _print_json(results)
            elif not results:
                print("No matching skills found. Try a broader task description.")
            else:
                for number, item in enumerate(results, start=1):
                    print(f"{number}. {item['name']} [{item['category']}]  score={item['score']}")
                    print(f"   {item['summary']}")
                    if item["matched_terms"]:
                        print(f"   matched: {', '.join(item['matched_terms'])}")
            return 0

        if args.command == "compose":
            result = compose_catalog(args.query, max_skills=args.max_skills, domain=args.domain)
            if args.json:
                _print_json(result)
            else:
                if not result["selected"]:
                    print("No relevant skills found.")
                for number, item in enumerate(result["selected"], start=1):
                    print(f"{number}. Load {item['skill_file']} [{item['category']}]")
                    print(f"   {item['summary']}")
                    print(f"   matched: {', '.join(item['matched_terms']) or 'metadata/body relevance'}")
                    if item["requires"]:
                        print(f"   prerequisites: {'; '.join(item['requires'])}")
                if result["alternatives"]:
                    print("\nAlternatives:")
                    print(", ".join(item["name"] for item in result["alternatives"]))
                print(f"\n{result['notice']}")
            return 0

        catalog = load_catalog()
        if args.command == "list":
            items = [x for x in catalog if not args.domain or x["category"] == args.domain]
            if args.json:
                _print_json(items)
            else:
                for item in sorted(items, key=lambda x: (x["category"], x["name"])):
                    print(f"{item['name']:<28} {item['category']:<24} {item['summary']}")
            return 0

        matches = [item for item in catalog if item["name"] == args.name]
        if not matches:
            print(f"Unknown skill: {args.name}", file=sys.stderr)
            return 2
        item = matches[0]
        if args.json:
            _print_json(item)
        else:
            print(f"{item['name']} — {item['summary']}")
            print(f"Category: {item['category']} | Risk: {item['risk']} | Maturity: {item['maturity']} | Version: {item['version']}")
            print(f"File: {item['skill_file']}")
            print("Prerequisites:")
            for requirement in item["requires"]:
                print(f"- {requirement}")
            print(f"Description: {item['description']}")
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Librarian error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
