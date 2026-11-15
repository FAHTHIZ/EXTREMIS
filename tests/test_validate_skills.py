import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "validate_skills.py"
SPEC = importlib.util.spec_from_file_location("validate_skills", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

class FrontmatterTests(unittest.TestCase):
    def test_parses_required_fields(self):
        fields, body = MODULE.parse_frontmatter("---\nname: demo-skill\ndescription: Do a demo.\n---\n\n# Demo")
        self.assertEqual(fields["name"], "demo-skill")
        self.assertEqual(fields["description"], "Do a demo.")
        self.assertIn("# Demo", body)

    def test_rejects_missing_delimiter(self):
        with self.assertRaises(ValueError):
            MODULE.parse_frontmatter("name: broken\n# no frontmatter")

    def test_rejects_missing_closing_delimiter(self):
        with self.assertRaises(ValueError):
            MODULE.parse_frontmatter("---\nname: broken")

    def test_repository_catalog_is_valid(self):
        self.assertEqual(MODULE.main(), 0)

class EvaluationTests(unittest.TestCase):
    def valid_payload(self):
        return {"skill":"demo-skill","version":"0.1.0","cases":[
            {"id":f"case-{i}","prompt":f"Prompt {i}","should_activate":i != 3,"must":[]} for i in range(5)
        ]}

    def test_accepts_valid_evaluations(self):
        self.assertEqual(MODULE.validate_eval_payload(self.valid_payload(), "demo-skill"), [])

    def test_rejects_duplicate_ids(self):
        payload=self.valid_payload()
        payload["cases"][1]["id"]=payload["cases"][0]["id"]
        self.assertTrue(any("duplicate" in item for item in MODULE.validate_eval_payload(payload,"demo-skill")))

    def test_rejects_missing_activation_flag(self):
        payload=self.valid_payload()
        del payload["cases"][0]["should_activate"]
        self.assertTrue(any("should_activate" in item for item in MODULE.validate_eval_payload(payload,"demo-skill")))

    def test_rejects_wrong_skill_name(self):
        payload=self.valid_payload()
        self.assertTrue(any("evaluation skill" in item for item in MODULE.validate_eval_payload(payload,"other-skill")))

if __name__ == "__main__":
    unittest.main()
