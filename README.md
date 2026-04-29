# mcp-prose-memory

An MCP (Model Context Protocol) server for persistent memory with JSON storage. Lets an LLM keep context across sessions through atomic fact operations.

## Features

- JSON memory storage for reliable parsing
- Atomic fact operations: add, remove, replace
- Sectioned context organization
- Case-insensitive duplicate detection
- Limits: 30 facts per section, 300 chars per fact
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

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

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

Add to `~/.claude/mcp-servers.json`:

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

Default storage is `~/.claude/memory.json`. Override with the `MEMORY_PATH` environment variable:

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

JSON format with arrays of facts per section:

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
npm install
npm run build
```

## Developer

By [Soroush](https://gabrimatic.info)

## License

MIT
