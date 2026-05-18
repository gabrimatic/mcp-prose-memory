# mcp-prose-memory

[![CI](https://github.com/gabrimatic/mcp-prose-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/gabrimatic/mcp-prose-memory/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-prose-memory)](https://www.npmjs.com/package/mcp-prose-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Persistent memory for MCP clients.

`mcp-prose-memory` gives an agent a small, durable place to keep facts across sessions. It stores memory as JSON, keeps facts grouped by section, and exposes one tool for careful add, remove, replace, and view operations.

It is built for memory that should survive restarts without becoming a loose text file that slowly drifts out of shape.

[Docs](https://gabrimatic.github.io/mcp-prose-memory/) · Changelog · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## Features

- JSON memory storage with a stable schema
- Compact structured facts with optional `key`, `value`, `source`, and `confidence`
- Atomic writes through temp-file replacement
- Atomic fact operations: add, remove, replace, view
- Sectioned context organization for general clients and local assistant memory
- Case-insensitive duplicate detection
- Strict line-number validation for remove and replace
- Automatic normalization for older or partial JSON documents
- Compact `memory_context` output with section and character-budget filters
- Limits: 30 facts per section, 300 characters per fact, 80 characters per structured key
- Configurable storage path via environment variable

## Installation

Full setup guide: [Docs](https://gabrimatic.github.io/mcp-prose-memory/quickstart/).

Runtime: **Node >= 18**.

```bash
npm install -g mcp-prose-memory
```

Or run with npx:

```bash
npx mcp-prose-memory
```

## Configuration

Configuration reference: [Docs](https://gabrimatic.github.io/mcp-prose-memory/reference/configuration/).

Default storage is `~/.mcp-prose-memory/memory.json`. Override it with `MEMORY_PATH`.

If you used an older release with a client-specific default memory location, either move that JSON file to the new default path or set `MEMORY_PATH` to the existing file.

### Desktop Client

Add a server entry like this to your MCP client config:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["mcp-prose-memory"]
    }
  }
}
```

### CLI Client

Add a server entry like this to your CLI MCP config:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["mcp-prose-memory"]
    }
  }
}
```

### Custom Memory Location

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["mcp-prose-memory"],
      "env": {
        "MEMORY_PATH": "/path/to/your/memory.json"
      }
    }
  }
}
```

## Memory File

The memory file is JSON with arrays of facts per section:

```json
{
  "version": 5,
  "updated": "2025-01-15T10:30:00.000Z",
  "sections": {
    "work": ["Fact 1", "Fact 2"],
    "personal": ["Lives in Berlin", "Prefers dark mode"],
    "top_of_mind": [],
    "history": ["Completed project X"],
    "instructions": ["Be concise"],
    "user_preferences": [
      {
        "key": "answer_style",
        "value": "Prefers concise answers",
        "confidence": "high",
        "source": "user_explicit",
        "createdAt": "2025-01-15T10:30:00.000Z",
        "updatedAt": "2025-01-15T10:30:00.000Z"
      }
    ]
  }
}
```

If the file does not exist, the server starts with an empty document. If the file is invalid JSON, the server fails the operation instead of wiping memory.

## Tools

Tools reference: [Docs](https://gabrimatic.github.io/mcp-prose-memory/reference/tools/).

### memory

Single tool for all memory operations. The `command` parameter selects the action.

**Commands:**

#### view

Show all memories or filter by section.

```json
{"command": "view"}
{"command": "view", "section": "work"}
```

#### add

Add a fact to a section.

```json
{"command": "add", "section": "personal", "fact": "Lives in Berlin"}
```

Structured compact facts are also supported:

```json
{"command": "add", "section": "user_preferences", "key": "answer_style", "value": "Prefers concise answers"}
```

#### upsert

Add a structured fact or replace the existing fact with the same key.

```json
{"command": "upsert", "section": "user_preferences", "key": "answer_style", "value": "Prefers concise and direct answers"}
```

#### remove

Remove a fact by line number.

```json
{"command": "remove", "section": "work", "line": 3}
```

#### replace

Update a fact by line number.

```json
{"command": "replace", "section": "top_of_mind", "line": 1, "fact": "Working on new project"}
```

### memory_context

Returns memory for session initialization. Clients can request compact bounded context.

```json
{}
```

```json
{"format": "compact", "sections": ["user_profile", "user_preferences"], "maxChars": 1500}
```

## Sections

| Section | Purpose |
|---------|---------|
| `work` | Professional context, projects, colleagues, tools |
| `personal` | Location, preferences, interests, personal facts |
| `top_of_mind` | Current focus, active tasks |
| `history` | Past events, completed work |
| `instructions` | Standing rules, behavioral preferences |
| `user_profile` | Stable user profile facts |
| `user_preferences` | Durable preferences |
| `eyra_project` | Eyra-specific product and architecture facts |
| `devices_environment` | Durable local environment facts |
| `workflows` | Repeated workflow preferences |
| `writing_style` | Writing and tone preferences |
| `long_term_tasks` | Durable task context |
| `do_not_forget` | Explicitly requested durable reminders |

## Development

```bash
git clone https://github.com/gabrimatic/mcp-prose-memory.git
cd mcp-prose-memory
npm ci
npm test
npm run check
```

`npm test` builds the TypeScript source and runs store-level plus real MCP stdio smoke tests. `npm run check` also runs a production dependency audit and verifies the npm package contents with `npm pack --dry-run`.

`prepublishOnly` runs the same check before publishing.

## Project Support

- Changes: [CHANGELOG.md](CHANGELOG.md)
- Contributions: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security reports: [SECURITY.md](SECURITY.md)
- Issues: [GitHub Issues](https://github.com/gabrimatic/mcp-prose-memory/issues)

## Developer

By [Soroush](https://gabrimatic.info)

## License

MIT
