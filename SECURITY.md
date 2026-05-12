# Security Policy

## Privacy by Design

`mcp-prose-memory` stores memory on your local filesystem. It does not send memory contents to a hosted service.

- **Local storage by default.** Memory is written to `~/.mcp-prose-memory/memory.json`.
- **Explicit override.** Set `MEMORY_PATH` to store memory somewhere else.
- **No telemetry.** The server does not collect usage analytics.
- **No network service.** The MCP server communicates over stdio with the client that starts it.

## Trust Boundaries

| Boundary | Trust Level | Notes |
|----------|-------------|-------|
| Memory JSON file | Trusted local data | Treat the file as private user data |
| MCP client input | Untrusted input | Tool arguments are validated at runtime |
| Filesystem path from `MEMORY_PATH` | User-controlled | Use a path you own and protect |
| npm package install | Package supply chain | Install from the published npm package or a trusted checkout |

## Data Lifecycle

1. The MCP client starts the server over stdio.
2. The server reads `MEMORY_PATH` or the default JSON file.
3. Tool calls add, remove, replace, or view facts.
4. Writes use a sibling temp file, `fsync`, and atomic rename on the same filesystem.
5. Invalid JSON or invalid section shape fails the operation instead of replacing the file.

## Vulnerability Reporting

Report vulnerabilities privately:

1. Do not open a public issue.
2. Use [GitHub's private vulnerability reporting](https://github.com/gabrimatic/mcp-prose-memory/security/advisories/new).
3. Include reproduction steps, demonstrated impact, and a suggested fix if you have one.

Expect acknowledgment within 48 hours.

## Out of Scope

These are not considered vulnerabilities:

- Issues requiring local filesystem access to a memory file the attacker already controls.
- Disclosure caused by configuring `MEMORY_PATH` to a shared or world-readable location.
- Prompt injection in stored facts, unless it triggers code execution or unauthorized filesystem access.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 3.x     | Yes       |
| 2.x     | Security fixes only |
| Older   | No        |
