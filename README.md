# mcp-prose-memory

An MCP (Model Context Protocol) server for prose-based persistent memory with markdown storage. Enables LLMs to maintain context across sessions using a structured markdown file.

## Features

- Prose-based memory storage in markdown format
- Structured sections for organized context
- YAML frontmatter for metadata
- Simple tools for reading and updating memory
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

By default, memory is stored at `~/.mcp/memory.md`. Override with the `MEMORY_PATH` environment variable:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["mcp-prose-memory"],
      "env": {
        "MEMORY_PATH": "/path/to/your/memory.md"
      }
    }
  }
}
```

## Document Structure

The memory document uses YAML frontmatter and markdown sections:

```markdown
---
version: 2
updated: 2025-01-15T10:30:00.000Z
---

## Work Context

Professional context, projects, colleagues, tools.

## Personal Context

Location, preferences, interests, personal facts.

## Current Focus

Current focuses, active tasks.

## Brief History

Past events, completed work.

## Other Instructions

Standing rules, behavioral preferences.
```

## Tools

### memory_get

Get the full memory document or a specific section.

**Parameters:**
- `section` (optional): One of `work`, `personal`, `top_of_mind`, `history`, `instructions`

**Example:**
```json
{ "section": "work" }
```

### memory_update_section

Replace the content of a specific section.

**Parameters:**
- `section` (required): Section to update
- `content` (required): New content (prose/markdown)

**Example:**
```json
{
  "section": "personal",
  "content": "Based in Berlin, Germany. Prefers concise communication."
}
```

### memory_remember

Get the current document with guidance for integrating new information. Use this when asked to "remember" something.

**Parameters:**
- `info` (required): The information to remember

**Example:**
```json
{ "info": "User prefers dark mode" }
```

### memory_context

Get the full memory document for session initialization. Equivalent to `memory_get` without parameters.

### memory_quick_add

Quickly append a fact to a section as a bullet point. More efficient than `memory_remember` + `memory_update_section` for simple facts.

**Parameters:**
- `section` (required): Section to append to
- `fact` (required): The fact to add

**Example:**
```json
{
  "section": "personal",
  "fact": "Prefers tea over coffee"
}
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
