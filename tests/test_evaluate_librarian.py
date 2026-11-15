import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "evaluate_librarian.py"
SPEC = importlib.util.spec_from_file_location("evaluate_librarian", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class LibrarianEvaluationTests(unittest.TestCase):
    def test_evaluator_reports_fixture_counts_and_scope(self):
        report = MODULE.evaluate(top_k=5)
        self.assertGreater(report["skills_evaluated"], 0)
        self.assertGreater(report["fixtures_evaluated"], 0)
        self.assertIn("does not measure model adherence", report["interpretation"])

    def test_rejects_invalid_top_k(self):
        with self.assertRaises(ValueError):
            MODULE.evaluate(top_k=0)


if __name__ == "__main__":
    unittest.main()
