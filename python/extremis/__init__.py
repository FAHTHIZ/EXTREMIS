"""Python client for EXTREMIS: plan, activate, run and verify agent capabilities over MCP."""

from .client import ExtremisClient, ExtremisError, PROTOCOL_VERSION

__all__ = ["ExtremisClient", "ExtremisError", "PROTOCOL_VERSION"]
__version__ = "0.3.0"
