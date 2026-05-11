# mcp-prose-memory

Persistent memory for MCP clients.

`mcp-prose-memory` gives an agent a small, durable place to keep facts across sessions. It stores memory as JSON, keeps facts grouped by section, and exposes one tool for careful add, remove, replace, and view operations.

It is built for memory that should survive restarts without becoming a loose text file that slowly drifts out of shape.

## Features

- JSON memory storage with a stable schema
- Atomic writes through temp-file replacement
- Atomic fact operations: add, remove, replace, view
- Sectioned context organization
- Case-insensitive duplicate detection
- Strict line-number validation for remove and replace
- Automatic normalization for older or partial JSON documents
- Limits: 30 facts per section, 300 characters per fact
- Configurable storage path via environment variable

## Installation

```bash
npm install -g mcp-prose-memory
```

Or run with npx:

```bash
npx mcp-prose-memory
```

## Configuration

Default storage is `~/.mcp-prose-memory/memory.json`. Override it with `MEMORY_PATH`.

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
  "version": 4,
  "updated": "2025-01-15T10:30:00.000Z",
  "sections": {
    "work": ["Fact 1", "Fact 2"],
    "personal": ["Lives in Berlin", "Prefers dark mode"],
    "top_of_mind": [],
    "history": ["Completed project X"],
    "instructions": ["Be concise"]
  }
}
```

If the file does not exist, the server starts with an empty document. If the file is invalid JSON, the server fails the operation instead of wiping memory.

## Tools

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

Returns the full memory document for session initialization. Called automatically by hooks.

```json
{}
```

## Sections

| Section | Purpose |
|---------|---------|
| `work` | Professional context, projects, colleagues, tools |
| `personal` | Location, preferences, interests, personal facts |
| `top_of_mind` | Current focus, active tasks |
| `history` | Past events, completed work |
| `instructions` | Standing rules, behavioral preferences |

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

## Developer

By [Soroush](https://gabrimatic.info)

## License

MIT
