# Changelog

This changelog tracks notable `mcp-prose-memory` changes.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [3.0.0] - 2026-05-12

### Added

- Added `memory_context`, a read-only session-start tool that returns the full formatted memory document for hooks and clients that need initial context.
- Added production release checks: build, real MCP stdio smoke tests, production dependency audit, and `npm pack --dry-run`.
- Added Node 18, 20, and 22 coverage in GitHub Actions.

### Changed

- Moved the default storage path to the client-neutral `~/.mcp-prose-memory/memory.json`.
- Published the package from built `dist` output with templates and public package metadata.

### Fixed

- Tightened runtime validation so unknown `memory` and `memory_context` arguments return clear errors instead of being ignored.
- Kept invalid tool calls from cascading into sibling call cancellation by returning tool-level error text.

## [2.0.0] - 2026-02-05

### Changed

- Switched storage to structured JSON with sectioned facts.
- Replaced loose text edits with atomic add, remove, replace, and view operations.
- Added atomic file writes through sibling temp files and rename.

## [1.0.1] - 2026-02-01

### Changed

- Renamed the `top_of_mind` display label to `Current Focus`.

## [1.0.0] - 2026-02-01

### Added

- Initial MCP server release for persistent memory.
- Added sectioned memory for work, personal, current focus, history, and instructions.
- Added MCP client configuration examples and a reusable memory template.
