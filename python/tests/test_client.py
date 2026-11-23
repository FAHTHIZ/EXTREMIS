import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from extremis import ExtremisClient, ExtremisError  # noqa: E402

REPO = Path(__file__).resolve().parents[2]


class ClientTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        Path(cls.tmp.name, "sales.csv").write_text("region,amount\nnorth,10\nsouth,20\nnorth,5\n", encoding="utf-8")
        cls.x = ExtremisClient(cwd=cls.tmp.name, allow=["read"], timeout=30).start()

    @classmethod
    def tearDownClass(cls):
        cls.x.close()
        cls.tmp.cleanup()

    def test_initialize_and_tools(self):
        self.assertEqual(self.x.server_info.get("name"), "extremis")
        names = [t["name"] for t in self.x.list_tools()]
        self.assertEqual(names, ["extremis_search", "extremis_find", "extremis_plan", "extremis_activate", "extremis_read", "extremis_run", "extremis_verify"])

    def test_search_and_plan(self):
        results = self.x.search("profile a csv file", limit=3)["results"]
        self.assertTrue(any("data.profile" in r.get("tools", []) for r in results))
        plan = self.x.plan("is this build ready to release?")
        self.assertTrue(plan["ok"])
        self.assertEqual(plan["strategy"], "workflow")
        self.assertIn("release-readiness", [c["name"] for c in plan["capabilities"] if c.get("selected")])
        self.assertTrue(plan["steps"])

    def test_activate_and_read(self):
        a = self.x.activate("spreadsheet-analysis")
        self.assertTrue(a["ok"])
        self.assertGreater(a["context_tokens"], 0)
        body = self.x.read("spreadsheet-analysis")
        self.assertIn("spreadsheet", json.dumps(body).lower())

    def test_run_tool_with_kwargs(self):
        out = self.x.run("data.profile", path="sales.csv")
        self.assertIn("amount", json.dumps(out))

    def test_errors_raise(self):
        with self.assertRaises(ExtremisError):
            self.x.run("no.such_tool")

    def test_permission_is_enforced(self):
        with self.assertRaises(ExtremisError) as ctx:
            self.x.run("web.fetch_text", url="http://127.0.0.1:9/")
        self.assertIn("network", str(ctx.exception).lower() + json.dumps(ctx.exception.data).lower())


class CommandSelectionTest(unittest.TestCase):
    def test_env_override(self):
        os.environ["EXTREMIS_COMMAND"] = "node /x/bin/extremis.mjs mcp"
        try:
            self.assertEqual(ExtremisClient(allow=["read"]).argv[:3], ["node", "/x/bin/extremis.mjs", "mcp"])
        finally:
            del os.environ["EXTREMIS_COMMAND"]

    def test_checkout_default(self):
        argv = ExtremisClient().argv
        self.assertEqual(Path(argv[1]), REPO / "bin" / "extremis.mjs")

    def test_bad_command_reports_exit(self):
        c = ExtremisClient(["node", "-e", "process.exit(3)"], timeout=10)
        with self.assertRaises(ExtremisError):
            c.start()
        c.close()


try:
    import langchain_core  # noqa: F401
except ImportError:  # pragma: no cover
    langchain_core = None


@unittest.skipIf(langchain_core is None, "langchain-core not installed")
class LangChainTest(unittest.TestCase):
    def test_tools_invoke(self):
        from extremis.langchain import as_langchain_tools

        with ExtremisClient(cwd=str(REPO), allow=["read"]) as x:
            tools = {t.name: t for t in as_langchain_tools(x)}
            self.assertEqual(len(tools), 7)
            plan = json.loads(tools["extremis_plan"].invoke({"task": "is this build ready to release?"}))
            self.assertEqual(plan["strategy"], "workflow")


if __name__ == "__main__":
    unittest.main()
