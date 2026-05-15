# ADR-009: Target clients and test order

Status: accepted

## Context

The project must support local stdio and hosted public remote MCP. Local clients are available immediately for testing in Claude Desktop, Claude Code, and Pi. Hosted public compatibility should eventually cover MCP Inspector, Claude Custom Connectors, and ChatGPT remote connectors.

## Decision

Local stdio target:

1. Claude Desktop first.
2. Claude Code and Pi as required local compatibility tests.
3. MCP Inspector as protocol/debug tool.

Hosted public target:

1. MCP Inspector first for protocol/auth debugging.
2. Claude Custom Connector.
3. ChatGPT remote connector.

## Consequences

- Local stdio MVP must include config examples for Claude Desktop and Claude Code/Pi.
- Hosted public MVP should not be called complete until all three hosted targets are tested or explicitly marked unsupported with reason.
- CI can cover protocol behavior, but manual/interactive connector tests remain necessary.
