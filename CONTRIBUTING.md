# Contributing

Contribute focused fixes: MCP protocol behavior, JSON storage safety, package metadata, tests, and documentation.

## Development Setup

```bash
git clone https://github.com/gabrimatic/mcp-prose-memory.git
cd mcp-prose-memory
npm ci
npm test
```

Runtime: **Node >= 18**.

## Architecture

`mcp-prose-memory` is a small TypeScript MCP server. It runs over stdio, stores memory in one JSON file, and exposes two tools:

| Tool | Purpose |
|------|---------|
| `memory` | Add, remove, replace, and view sectioned facts |
| `memory_context` | Return the full formatted memory document for session startup |

The important files:

```text
src/index.ts    MCP server, tool schemas, and runtime argument validation
src/store.ts    JSON loading, normalization, validation, atomic writes
templates/      Example memory document
examples/       MCP client config examples
tests/          Store tests and real MCP stdio smoke tests
```

## Storage Rules

- Default path: `~/.mcp-prose-memory/memory.json`.
- Override path: set `MEMORY_PATH`.
- Memory is JSON with fixed section keys.
- Writes use a sibling temp file, `fsync`, and `rename`.
- Invalid JSON fails the operation instead of wiping memory.

## Testing

```bash
npm test
npm run check
```

`npm test` builds TypeScript and runs store-level plus real MCP stdio tests. `npm run check` also runs a production dependency audit and verifies package contents with `npm pack --dry-run`.

## PR Checklist

- Keep one feature or fix per PR.
- Add or update tests for behavior changes.
- Update `README.md` and `CHANGELOG.md` when visible behavior changes.
- Include migration notes for storage format, default path, or tool schema changes.
- Run `npm run check` before opening the PR.

## Reporting Issues

Use the [bug report template](https://github.com/gabrimatic/mcp-prose-memory/issues/new?template=bug_report.yml). Include:

- Package version (`npm view mcp-prose-memory version` or local `package.json`)
- Node version (`node --version`)
- MCP client name and version
- `MEMORY_PATH` behavior, if you set it
- Steps to reproduce, expected behavior, and actual behavior

## Vulnerability Reporting

See [SECURITY.md](SECURITY.md). Do not open public issues for security vulnerabilities. Use GitHub's private vulnerability reporting.
