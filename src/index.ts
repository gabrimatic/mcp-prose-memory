#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { MemoryStore, SECTIONS } from "./store.js";

const store = new MemoryStore();
const SERVER_VERSION = "3.0.0";

const server = new Server(
  { name: "mcp-prose-memory", version: SERVER_VERSION },
  { capabilities: { tools: {} } }
);

const COMMANDS = ["view", "add", "remove", "replace"] as const;
const MEMORY_ARGUMENTS = new Set(["command", "section", "fact", "line"]);

type MemoryCommand = (typeof COMMANDS)[number];

interface MemoryArgs {
  command?: unknown;
  section?: unknown;
  fact?: unknown;
  line?: unknown;
}

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
            type: "integer",
            minimum: 1,
            description: "For remove/replace: line number within section (1-indexed)",
          },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
    {
      name: "memory_context",
      description:
        "Load full memory for session start. Called automatically by hooks.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: {
        readOnlyHint: true,
      },
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
      const input = normalizeArgs(args);
      const command = requireCommand(input.command);

      switch (command) {
        case "view": {
          const section = optionalString(input.section, "Section");
          const formatted = await store.getFormatted(section);
          return { content: [{ type: "text", text: formatted }] };
        }

        case "add": {
          const section = requireString(input.section, "Section");
          const fact = requireString(input.fact, "Fact");

          const result = await store.addFact(section, fact);
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
          const section = requireString(input.section, "Section");
          const line = requireNumber(input.line, "Line number");

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
          const section = requireString(input.section, "Section");
          const line = requireNumber(input.line, "Line number");
          const fact = requireString(input.fact, "Fact");

          const result = await store.replaceFact(section, line, fact);
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
  return SECTIONS[key as keyof typeof SECTIONS] || key;
}

function normalizeArgs(args: unknown): MemoryArgs {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("Tool arguments must be an object.");
  }

  for (const key of Object.keys(args)) {
    if (!MEMORY_ARGUMENTS.has(key)) {
      throw new Error(`Unknown argument: ${key}.`);
    }
  }

  return args as MemoryArgs;
}

function requireCommand(value: unknown): MemoryCommand {
  if (typeof value !== "string" || !COMMANDS.includes(value as MemoryCommand)) {
    throw new Error(`Command must be one of: ${COMMANDS.join(", ")}.`);
  }

  return value as MemoryCommand;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return requireString(value, label);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${label} must be a number.`);
  }

  return value;
}

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Memory MCP v${SERVER_VERSION} running`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
