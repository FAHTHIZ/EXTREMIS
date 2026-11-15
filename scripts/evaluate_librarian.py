#!/usr/bin/env python3
"""Evaluate the deterministic Librarian router against skill activation fixtures."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from librarian import load_catalog, rank_documents  # noqa: E402


def evaluate(root: Path = ROOT, top_k: int = 5) -> dict[str, Any]:
    if top_k < 1:
        raise ValueError("top_k must be at least 1")
    catalog = load_catalog(root)
    by_name = {item["name"]: item for item in catalog}
    positive_ranks: list[int | None] = []
    negative_ranks: list[int | None] = []
    per_skill: dict[str, dict[str, int]] = {}
    case_diagnostics: list[dict[str, Any]] = []
    fixture_count = 0

    skills_dir = root / "skills"
    for eval_path in sorted(skills_dir.glob("*/evals/evals.json")):
        payload = json.loads(eval_path.read_text(encoding="utf-8"))
        target = payload.get("skill")
        if target not in by_name:
            continue
        for case in payload.get("cases", []):
            prompt = str(case.get("prompt", "")).strip()
            if not prompt:
                continue
            fixture_count += 1
            results = rank_documents(prompt, catalog, top_k=top_k)
            names = [item["name"] for item in results]
            rank = names.index(target) + 1 if target in names else None
            active = bool(case.get("should_activate"))
            row = per_skill.setdefault(target, {
                "positive": 0, "positive_hit_at_1": 0,
                "positive_hit_at_k": 0, "negative": 0,
                "negative_false_at_1": 0, "negative_false_at_k": 0,
            })
            if active:
                positive_ranks.append(rank)
                row["positive"] += 1
                if rank == 1:
                    row["positive_hit_at_1"] += 1
                if rank is not None:
                    row["positive_hit_at_k"] += 1
            else:
                negative_ranks.append(rank)
                row["negative"] += 1
                if rank == 1:
                    row["negative_false_at_1"] += 1
                if rank is not None:
                    row["negative_false_at_k"] += 1
            case_diagnostics.append({
                "skill": target,
                "case_id": str(case.get("id", "")),
                "should_activate": active,
                "target_rank": rank,
                "top_result": names[0] if names else None,
                "top_score": results[0]["score"] if results else 0.0,
            })

    def pct(numerator: int, denominator: int) -> float | None:
        return round(100.0 * numerator / denominator, 2) if denominator else None

    positive_total = len(positive_ranks)
    negative_total = len(negative_ranks)
    positive_at_1 = sum(rank == 1 for rank in positive_ranks)
    positive_at_k = sum(rank is not None for rank in positive_ranks)
    negative_at_1 = sum(rank == 1 for rank in negative_ranks)
    negative_at_k = sum(rank is not None for rank in negative_ranks)
    reciprocal = [1.0 / rank for rank in positive_ranks if rank is not None]

    return {
        "method": "deterministic weighted lexical BM25; no model/API calls",
        "top_k": top_k,
        "skills_evaluated": len(per_skill),
        "fixtures_evaluated": fixture_count,
        "positive_cases": positive_total,
        "positive_hit_at_1_percent": pct(positive_at_1, positive_total),
        f"positive_hit_at_{top_k}_percent": pct(positive_at_k, positive_total),
        "positive_mean_reciprocal_rank": round(sum(reciprocal) / positive_total, 4) if positive_total else None,
        "negative_cases": negative_total,
        "negative_false_activation_at_1_percent": pct(negative_at_1, negative_total),
        f"negative_false_activation_at_{top_k}_percent": pct(negative_at_k, negative_total),
        "per_skill": per_skill,
        "case_diagnostics": case_diagnostics,
        "interpretation": (
            "Measures lexical retrieval against author-written activation fixtures only. "
            "It does not measure model adherence, task success, or independent skill quality."
        ),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Evaluate EXTREMIS Librarian retrieval against activation fixtures.")
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--details", action="store_true", help="show per-skill scores and routing misses")
    args = parser.parse_args(argv)
    try:
        report = evaluate(top_k=args.top_k)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Evaluation error: {exc}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print("EXTREMIS Librarian routing evaluation")
        print(f"Method: {report['method']}")
        print(f"Skills: {report['skills_evaluated']} | Fixtures: {report['fixtures_evaluated']}")
        print(f"Positive Hit@1: {report['positive_hit_at_1_percent']}%")
        print(f"Positive Hit@{args.top_k}: {report[f'positive_hit_at_{args.top_k}_percent']}%")
        print(f"Positive MRR: {report['positive_mean_reciprocal_rank']}")
        print(f"Negative false activation @1: {report['negative_false_activation_at_1_percent']}%")
        print(f"Negative false activation @{args.top_k}: {report[f'negative_false_activation_at_{args.top_k}_percent']}%")
        if args.details:
            print("\nPer-skill routing (positive Hit@1 / positive Hit@K / negative false @1):")
            rows = []
            for name, row in report["per_skill"].items():
                positive = row["positive"]
                negative = row["negative"]
                p1 = 100.0 * row["positive_hit_at_1"] / positive if positive else 0.0
                pk = 100.0 * row["positive_hit_at_k"] / positive if positive else 0.0
                n1 = 100.0 * row["negative_false_at_1"] / negative if negative else 0.0
                rows.append((p1, name, pk, n1, positive, negative))
            for p1, name, pk, n1, positive, negative in sorted(rows):
                print(f"- {name}: {p1:.1f}% / {pk:.1f}% / {n1:.1f}% (positive={positive}, negative={negative})")
            misses = [x for x in report["case_diagnostics"] if x["should_activate"] and x["target_rank"] != 1]
            false = [x for x in report["case_diagnostics"] if not x["should_activate"] and x["target_rank"] == 1]
            print("\nTop positive routing misses:")
            for item in misses[:15]:
                print(f"- {item['skill']}/{item['case_id']}: rank={item['target_rank']}, top={item['top_result']}, score={item['top_score']}")
            print("\nNegative cases where target ranked first:")
            for item in false[:15]:
                print(f"- {item['skill']}/{item['case_id']}: top={item['top_result']}, score={item['top_score']}")
        print(report["interpretation"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
