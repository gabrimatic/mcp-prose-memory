#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { MemoryStore } from "./store.js";

const store = new MemoryStore();

const server = new Server(
  { name: "mcp-prose-memory", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

// Tool definitions - unified memory tool with commands
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "memory",
      description: `Manage persistent memory across sessions.

Commands:
- view: Show all memories (optionally filter by section)
- add: Add a new fact to a section
- remove: Remove a fact by section and line number
- replace: Update a fact by section and line number

Sections: work, personal, top_of_mind, history, instructions

Examples:
- {"command": "view"}
- {"command": "view", "section": "work"}
- {"command": "add", "section": "personal", "fact": "Lives in Berlin"}
- {"command": "remove", "section": "work", "line": 3}
- {"command": "replace", "section": "top_of_mind", "line": 1, "fact": "Working on new project"}`,
      inputSchema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            enum: ["view", "add", "remove", "replace"],
            description: "Operation to perform",
          },
          section: {
            type: "string",
            enum: ["work", "personal", "top_of_mind", "history", "instructions"],
            description: "Target section (required for add/remove/replace, optional for view)",
          },
          fact: {
            type: "string",
            maxLength: 300,
            description: "For add/replace: the fact to store (max 300 chars)",
          },
          line: {
            type: "number",
            minimum: 1,
            description: "For remove/replace: line number within section (1-indexed)",
          },
        },
        required: ["command"],
      },
    },
    {
      name: "memory_context",
      description:
        "Load full memory for session start. Called automatically by hooks.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

// Tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "memory_context") {
      const formatted = await store.getFormatted();
      return { content: [{ type: "text", text: formatted }] };
    }

    if (name === "memory") {
      const { command, section, fact, line } = args as {
        command: "view" | "add" | "remove" | "replace";
        section?: string;
        fact?: string;
        line?: number;
      };

      switch (command) {
        case "view": {
          const formatted = await store.getFormatted(section);
          return { content: [{ type: "text", text: formatted }] };
        }

        case "add": {
          if (!section) throw new Error("Section required for add");
          if (!fact) throw new Error("Fact required for add");

          const trimmed = fact.trim();
          if (!trimmed) throw new Error("Fact cannot be empty or whitespace-only");

          const result = await store.addFact(section, trimmed);
          return {
            content: [
              {
                type: "text",
                text: `✅ Added to ${sectionLabel(section)}:\n${result.line}. ${result.fact}`,
              },
            ],
          };
        }

        case "remove": {
          if (!section) throw new Error("Section required for remove");
          if (line === undefined) throw new Error("Line number required for remove");

          const removed = await store.removeFact(section, line);
          return {
            content: [
              {
                type: "text",
                text: `✅ Removed from ${sectionLabel(section)}:\n${removed}`,
              },
            ],
          };
        }

        case "replace": {
          if (!section) throw new Error("Section required for replace");
          if (line === undefined) throw new Error("Line number required for replace");
          if (!fact) throw new Error("Fact required for replace");

          const trimmedFact = fact.trim();
          if (!trimmedFact) throw new Error("Fact cannot be empty or whitespace-only");

          const result = await store.replaceFact(section, line, trimmedFact);
          return {
            content: [
              {
                type: "text",
                text: `✅ Updated ${sectionLabel(section)} line ${line}:\n${result.old} → ${result.new}`,
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown command: ${command}`);
      }
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    // Return error as normal response - prevents sibling call cascade cancellation
    return {
      content: [
        { type: "text", text: `❌ Error: ${(error as Error).message}` },
      ],
    };
  }
});

function sectionLabel(key: string): string {
  const labels: Record<string, string> = {
    work: "Work Context",
    personal: "Personal Context",
    top_of_mind: "Top of Mind",
    history: "Brief History",
    instructions: "Other Instructions",
  };
  return labels[key] || key;
}

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Memory MCP v2.0.0 running");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
