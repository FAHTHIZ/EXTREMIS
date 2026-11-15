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

if __name__ == "__main__":
    unittest.main()
