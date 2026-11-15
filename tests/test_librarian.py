import importlib.util
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "librarian.py"
SPEC = importlib.util.spec_from_file_location("librarian", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class TokenizationTests(unittest.TestCase):
    def test_removes_common_words_and_normalizes_case(self):
        self.assertEqual(MODULE.tokenize("Build the MOBILE app"), ["build", "mobile", "app"])

    def test_empty_query_returns_no_results(self):
        self.assertEqual(MODULE.rank_documents("the and of", []), [])


class RankingTests(unittest.TestCase):
    def setUp(self):
        self.documents = [
            {
                "name": "product-analytics",
                "category": "data",
                "summary": "Define product metrics, event instrumentation, funnels, cohorts, and experiments.",
                "description": "Use when defining product metrics or event taxonomies and analyzing funnels or retention.",
                "body": "Define event schemas, instrumentation, activation funnels, retention cohorts, experiment guardrails.",
                "keywords": "event tracking funnel analysis product metrics",
            },
            {
                "name": "frontend-engineering",
                "category": "software-engineering",
                "summary": "Build accessible frontend interfaces and responsive components.",
                "description": "Use when implementing browser interfaces, layouts, and client state.",
                "body": "Inspect components, routing, CSS, browser states, keyboard interaction, and visual behavior.",
            },
            {
                "name": "mobile-engineering",
                "category": "software-engineering",
                "summary": "Build native and cross-platform mobile applications.",
                "description": "Use when implementing mobile app navigation, lifecycle, and offline behavior.",
                "body": "Review iOS Android permissions, backgrounding, offline synchronization, and adaptive screens.",
            },
        ]

    def test_full_skill_body_contributes_to_ranking(self):
        results = MODULE.rank_documents(
            "event schema instrumentation activation retention cohorts",
            self.documents,
            top_k=3,
        )
        self.assertEqual(results[0]["name"], "product-analytics")
        self.assertIn("body", results[0]["field_matches"])

    def test_curated_keywords_improve_task_language_matching(self):
        results = MODULE.rank_documents(
            "analyze activation funnels and product event tracking",
            self.documents,
            top_k=3,
        )
        self.assertEqual(results[0]["name"], "product-analytics")
        self.assertIn("keywords", results[0]["field_matches"])

    def test_exact_skill_name_is_ranked_first(self):
        results = MODULE.rank_documents("mobile engineering", self.documents, top_k=3)
        self.assertEqual(results[0]["name"], "mobile-engineering")

    def test_domain_filter_is_applied_by_catalog_search(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "registry").mkdir()
            (root / "skills" / "mobile-engineering").mkdir(parents=True)
            (root / "skills" / "frontend-engineering").mkdir(parents=True)
            entries = []
            for name, category, description, body in [
                ("mobile-engineering", "software-engineering", "Build mobile apps.", "offline mobile navigation"),
                ("frontend-engineering", "software-engineering", "Build browser interfaces.", "responsive CSS components"),
            ]:
                relative = f"skills/{name}"
                (root / relative / "SKILL.md").write_text(
                    f"---\nname: {name}\ndescription: {description}\n---\n\n{body}",
                    encoding="utf-8",
                )
                entries.append({
                    "name": name, "path": relative, "category": category,
                    "summary": description, "requires": [], "risk": "low",
                    "maturity": "draft", "version": "0.1.0",
                })
            (root / "registry" / "skills-index.json").write_text(
                __import__("json").dumps({"skills": entries}), encoding="utf-8"
            )
            results = MODULE.search_catalog("mobile app", root=root, top_k=5, domain="software-engineering")
            self.assertEqual([item["name"] for item in results], ["mobile-engineering"])

    def test_not_for_boundary_reduces_score(self):
        included = dict(self.documents[2])
        excluded = dict(self.documents[2], not_for="conceptual explanations of responsive web design versus native apps without implementation")
        query = "Explain responsive web design versus native mobile apps"
        included_score = MODULE.rank_documents(query, [included], top_k=1)[0]["score"]
        excluded_results = MODULE.rank_documents(query, [excluded], top_k=1)
        self.assertTrue(not excluded_results or excluded_results[0]["score"] < included_score)

    def test_composition_limits_skill_count(self):
        result = MODULE.compose_catalog("build an app interface and mobile navigation", root=Path(__file__).resolve().parents[1], max_skills=2)
        self.assertLessEqual(len(result["selected"]), 2)
        self.assertIn("notice", result)


if __name__ == "__main__":
    unittest.main()
