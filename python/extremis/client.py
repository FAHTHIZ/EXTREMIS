"""Stdlib MCP client for the EXTREMIS gateway.

Starts ``extremis mcp`` as a subprocess and talks newline-delimited JSON-RPC 2.0
over stdio. No third-party dependencies.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Union

PROTOCOL_VERSION = "2025-06-18"
REMOTE_COMMAND = ["npx", "-y", "github:FAHTHIZ/EXTREMIS", "mcp"]


class ExtremisError(RuntimeError):
    """A JSON-RPC error or a tool result with ``isError: true``."""

    def __init__(self, message: str, *, code: Optional[int] = None, data: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.data = data


def _default_command() -> List[str]:
    """Local checkout if this package sits inside the repository, else npx from GitHub."""
    env = os.environ.get("EXTREMIS_COMMAND")
    if env:
        return env.split()
    local = Path(__file__).resolve().parents[2] / "bin" / "extremis.mjs"
    node = shutil.which("node")
    if local.is_file() and node:
        return [node, str(local), "mcp"]
    return list(REMOTE_COMMAND)


class ExtremisClient:
    """Client for the six EXTREMIS gateway tools.

    >>> with ExtremisClient(allow=["read"]) as x:
    ...     plan = x.plan("review this pull request")
    """

    def __init__(
        self,
        command: Optional[Sequence[str]] = None,
        *,
        cwd: Optional[Union[str, os.PathLike]] = None,
        allow: Optional[Iterable[str]] = None,
        expose_tools: Optional[str] = None,
        timeout: float = 60.0,
        env: Optional[Dict[str, str]] = None,
    ) -> None:
        argv = list(command) if command else _default_command()
        if cwd is not None:
            argv += ["--cwd", str(cwd)]
        if allow is not None:
            argv += ["--allow", ",".join(allow) or "none"]
        if expose_tools:
            argv.append(f"--expose-tools={expose_tools}")
        self.argv = argv
        self.timeout = timeout
        self._env = {**os.environ, **(env or {})}
        self._proc: Optional[subprocess.Popen] = None
        self._next_id = 0
        self._lock = threading.Lock()
        self.server_info: Dict[str, Any] = {}
        self.instructions: str = ""

    # -- lifecycle -----------------------------------------------------------------
    def start(self) -> "ExtremisClient":
        if self._proc is not None:
            return self
        self._proc = subprocess.Popen(
            self.argv,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=self._env,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )
        result = self._request(
            "initialize",
            {"protocolVersion": PROTOCOL_VERSION, "capabilities": {}, "clientInfo": {"name": "extremis-python", "version": "0.3.0"}},
        )
        self.server_info = result.get("serverInfo", {})
        self.instructions = result.get("instructions", "")
        self._notify("notifications/initialized")
        return self

    def close(self) -> None:
        proc, self._proc = self._proc, None
        if proc is None:
            return
        try:
            if proc.stdin:
                proc.stdin.close()
            proc.wait(timeout=5)
        except Exception:  # pragma: no cover - best effort shutdown
            proc.kill()
        finally:
            for stream in (proc.stdout, proc.stderr):
                if stream:
                    stream.close()

    def __enter__(self) -> "ExtremisClient":
        return self.start()

    def __exit__(self, *exc: object) -> None:
        self.close()

    # -- JSON-RPC ------------------------------------------------------------------
    def _send(self, message: Dict[str, Any]) -> None:
        if self._proc is None or self._proc.stdin is None:
            raise ExtremisError("client is not started")
        self._proc.stdin.write(json.dumps(message) + "\n")
        self._proc.stdin.flush()

    def _notify(self, method: str, params: Optional[Dict[str, Any]] = None) -> None:
        self._send({"jsonrpc": "2.0", "method": method, **({"params": params} if params else {})})

    def _read_line(self) -> str:
        assert self._proc is not None and self._proc.stdout is not None
        box: List[str] = []
        reader = threading.Thread(target=lambda: box.append(self._proc.stdout.readline()), daemon=True)  # type: ignore[union-attr]
        reader.start()
        reader.join(self.timeout)
        if reader.is_alive():
            raise ExtremisError(f"no response from extremis within {self.timeout}s")
        line = box[0] if box else ""
        if not line:
            err = self._proc.stderr.read() if self._proc.stderr else ""
            raise ExtremisError(f"extremis exited: {err.strip() or 'no output'}")
        return line

    def _request(self, method: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        with self._lock:
            self._next_id += 1
            rid = self._next_id
            self._send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}})
            while True:
                msg = json.loads(self._read_line())
                if msg.get("id") != rid:
                    continue  # notifications such as list_changed
                if "error" in msg:
                    e = msg["error"]
                    raise ExtremisError(e.get("message", "error"), code=e.get("code"), data=e.get("data"))
                return msg.get("result", {})

    # -- MCP surface ---------------------------------------------------------------
    def list_tools(self) -> List[Dict[str, Any]]:
        self.start()
        return self._request("tools/list").get("tools", [])

    def list_resources(self) -> List[Dict[str, Any]]:
        self.start()
        return self._request("resources/list").get("resources", [])

    def read_resource(self, uri: str) -> str:
        self.start()
        contents = self._request("resources/read", {"uri": uri}).get("contents", [])
        return "".join(c.get("text", "") for c in contents)

    def call(self, name: str, arguments: Optional[Dict[str, Any]] = None) -> Any:
        """Call a tool and return its structured result; raise on ``isError``."""
        self.start()
        result = self._request("tools/call", {"name": name, "arguments": arguments or {}})
        value = result.get("structuredContent")
        if value is None:
            text = "".join(c.get("text", "") for c in result.get("content", []) if c.get("type") == "text")
            try:
                value = json.loads(text)
            except ValueError:
                value = text
        if result.get("isError"):
            message = value.get("error", {}).get("message") if isinstance(value, dict) and isinstance(value.get("error"), dict) else str(value)
            raise ExtremisError(message or f"{name} failed", data=value)
        return value

    # -- gateway tools ---------------------------------------------------------------
    def search(self, query: str, *, limit: int = 5, domain: Optional[str] = None, kind: Optional[str] = None) -> Any:
        args: Dict[str, Any] = {"query": query, "limit": limit}
        if domain:
            args["domain"] = domain
        if kind:
            args["kind"] = kind
        return self.call("extremis_search", args)

    def find(
        self,
        query: str,
        *,
        limit: int = 8,
        sources: Optional[Sequence[str]] = None,
        indexes: Optional[Sequence[str]] = None,
        owner: Optional[str] = None,
        official_only: bool = False,
        deep: bool = True,
    ) -> Dict[str, Any]:
        """Search public skill directories (skills.sh, GitHub, Agent Skills indexes) for a task."""
        args: Dict[str, Any] = {"query": query, "limit": limit, "official_only": official_only, "deep": deep}
        if sources:
            args["sources"] = list(sources)
        if indexes:
            args["indexes"] = list(indexes)
        if owner:
            args["owner"] = owner
        return self.call("extremis_find", args)

    def plan(self, task: str, *, max_capabilities: int = 4) -> Dict[str, Any]:
        return self.call("extremis_plan", {"task": task, "max_capabilities": max_capabilities})

    def activate(self, names: Union[str, Sequence[str]], *, include_suggests: bool = False, max_body_tokens: Optional[int] = None) -> Any:
        args: Dict[str, Any] = {"names": [names] if isinstance(names, str) else list(names), "include_suggests": include_suggests}
        if max_body_tokens:
            args["max_body_tokens"] = max_body_tokens
        return self.call("extremis_activate", args)

    def read(self, capability: str, path: str = "SKILL.md") -> Any:
        return self.call("extremis_read", {"capability": capability, "path": path})

    def run(self, tool: str, input: Optional[Dict[str, Any]] = None, **kwargs: Any) -> Any:
        """Run a built-in tool. ``run("data.profile", path="a.csv")`` or ``run("data.profile", {"path": "a.csv"})``."""
        return self.call("extremis_run", {"tool": tool, "input": {**(input or {}), **kwargs}})

    def verify(self, *, capability: Optional[str] = None, checks: Optional[List[Any]] = None, params: Optional[Dict[str, Any]] = None) -> Any:
        args: Dict[str, Any] = {}
        if capability:
            args["capability"] = capability
        if checks is not None:
            args["checks"] = checks
        if params:
            args["params"] = params
        return self.call("extremis_verify", args)
