"""LangChain adapter: expose the EXTREMIS gateway tools as LangChain tools.

Requires ``langchain-core`` (``pip install langchain-core``); the core client does not.
"""

from __future__ import annotations

import json
from typing import Any, List

from .client import ExtremisClient


def as_langchain_tools(client: ExtremisClient) -> List[Any]:
    """Return one ``StructuredTool`` per MCP tool the server lists."""
    try:
        from langchain_core.tools import StructuredTool
    except ImportError as exc:  # pragma: no cover - exercised only without the extra
        raise ImportError("as_langchain_tools needs langchain-core: pip install langchain-core") from exc

    tools = []
    for spec in client.list_tools():
        name = spec["name"]

        def _call(_name: str = name, **kwargs: Any) -> str:
            return json.dumps(client.call(_name, kwargs), ensure_ascii=False)

        tools.append(
            StructuredTool.from_function(
                func=_call,
                name=name,
                description=spec.get("description", name),
                args_schema=spec.get("inputSchema", {"type": "object", "properties": {}}),
            )
        )
    return tools
