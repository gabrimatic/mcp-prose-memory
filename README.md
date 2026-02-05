# mcp-prose-memory

An MCP (Model Context Protocol) server for persistent memory with JSON storage. Enables LLMs to maintain context across sessions using atomic fact operations.

## Features

- JSON-based memory storage for reliable parsing
- Atomic fact operations (add, remove, replace)
- Structured sections for organized context
- Duplicate detection (case-insensitive)
- Limits: 30 facts per section, 300 chars per fact
- Configurable storage location via environment variable

## Installation

```bash
npm install -g mcp-prose-memory
```

Or use directly with npx:

```bash
npx mcp-prose-memory
```

## Configuration

### Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

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

### Claude CLI

Add to your Claude CLI configuration (`~/.claude/mcp-servers.json`):

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

By default, memory is stored at `~/.claude/memory.json`. Override with the `MEMORY_PATH` environment variable:

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

## Document Structure

The memory document uses JSON format with arrays of facts:

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

## Tools

### memory

Unified tool for all memory operations. Uses a `command` parameter to specify the action.

**Commands:**

#### view
Show all memories or filter by section.

```json
{"command": "view"}
{"command": "view", "section": "work"}
```

#### add
Add a new fact to a section.

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

Get the full memory document for session initialization. Called automatically by hooks.

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
npm install
npm run build
```

## Developer

By [Soroush](https://gabrimatic.info)

## License

MIT
