# extremis-client (Python)

A dependency-free Python client for the EXTREMIS MCP gateway. It starts `extremis mcp` (Node.js 18.17+) as a subprocess and calls its six tools.

```bash
pip install "git+https://github.com/FAHTHIZ/EXTREMIS.git#subdirectory=python"
# optional LangChain adapter
pip install "extremis-client[langchain] @ git+https://github.com/FAHTHIZ/EXTREMIS.git#subdirectory=python"
```

```python
from extremis import ExtremisClient

with ExtremisClient(cwd=".", allow=["read"]) as x:
    plan = x.plan("is this build ready to release?")
    print(plan["strategy"], [step["id"] for step in plan["steps"]])
    chosen = [c["name"] for c in plan["capabilities"] if c.get("selected")]
    context = x.activate(chosen)              # instructions + tool schemas, context_tokens
    profile = x.run("data.profile", path="sales.csv")
    print(x.verify(capability="data-report", params={"path": "sales.csv"}))
```

The server command is chosen in this order: the `command` argument, the `EXTREMIS_COMMAND` environment variable, the repository's `bin/extremis.mjs` when the package runs from a checkout, then `npx -y github:FAHTHIZ/EXTREMIS mcp`.

LangChain:

```python
from extremis import ExtremisClient
from extremis.langchain import as_langchain_tools

client = ExtremisClient(allow=["read"]).start()
tools = as_langchain_tools(client)  # extremis_search, extremis_plan, ... as StructuredTool
```

Tool permissions are enforced by the server: pass only the permissions the task needs (`read`, `write`, `network`, `exec`).
