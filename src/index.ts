#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { MemoryStore, SECTIONS } from "./store.js";

const store = new MemoryStore();
const SERVER_VERSION = "3.1.0";

const server = new Server(
  { name: "mcp-prose-memory", version: SERVER_VERSION },
  { capabilities: { tools: {} } }
);

const COMMANDS = ["view", "add", "upsert", "remove", "replace"] as const;
const MEMORY_ARGUMENTS = new Set([
  "command",
  "section",
  "sections",
  "fact",
  "key",
  "value",
  "source",
  "confidence",
  "line",
  "format",
  "maxChars",
]);

type MemoryCommand = (typeof COMMANDS)[number];

interface MemoryArgs {
  command?: unknown;
  section?: unknown;
  sections?: unknown;
  fact?: unknown;
  key?: unknown;
  value?: unknown;
  source?: unknown;
  confidence?: unknown;
  line?: unknown;
  format?: unknown;
  maxChars?: unknown;
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
- upsert: Add or replace a structured fact by key
- remove: Remove a fact by section and line number
- replace: Update a fact by section and line number

Sections: work, personal, top_of_mind, history, instructions, user_profile, user_preferences, eyra_project, devices_environment, workflows, writing_style, long_term_tasks, do_not_forget

Examples:
- {"command": "view"}
- {"command": "view", "section": "work"}
- {"command": "add", "section": "personal", "fact": "Lives in Berlin"}
- {"command": "upsert", "section": "user_preferences", "key": "answer_style", "value": "Prefers concise answers"}
- {"command": "remove", "section": "work", "line": 3}
- {"command": "replace", "section": "top_of_mind", "line": 1, "fact": "Working on new project"}`,
      inputSchema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            enum: ["view", "add", "upsert", "remove", "replace"],
            description: "Operation to perform",
          },
          section: {
            type: "string",
            enum: Object.keys(SECTIONS),
            description: "Target section (required for add/remove/replace, optional for view)",
          },
          sections: {
            type: "array",
            items: { type: "string", enum: Object.keys(SECTIONS) },
            description: "Optional section allowlist for compact view/context output",
          },
          fact: {
            type: "string",
            maxLength: 300,
            description: "For add/replace: the fact to store (max 300 chars)",
          },
          key: {
            type: "string",
            maxLength: 80,
            description: "Stable compact key for structured facts",
          },
          value: {
            type: "string",
            maxLength: 300,
            description: "Compact value for structured facts",
          },
          source: {
            type: "string",
            maxLength: 80,
            description: "Short source label for structured facts",
          },
          confidence: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Confidence label for structured facts",
          },
          line: {
            type: "integer",
            minimum: 1,
            description: "For remove/replace: line number within section (1-indexed)",
          },
          format: {
            type: "string",
            enum: ["formatted", "compact", "json"],
            description: "Output format for view",
          },
          maxChars: {
            type: "integer",
            minimum: 1,
            description: "Maximum characters for view output",
          },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
    {
      name: "memory_context",
      description:
        "Load memory for session start. Supports compact bounded context for clients with small prompt budgets.",
      inputSchema: {
        type: "object",
        properties: {
          maxChars: { type: "integer", minimum: 1 },
          sections: { type: "array", items: { type: "string", enum: Object.keys(SECTIONS) } },
          format: { type: "string", enum: ["formatted", "compact", "json"] },
        },
        additionalProperties: false,
      },
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
      const input = normalizeContextArgs(args);
      const formatted = await store.getContext({
        maxChars: optionalNumber(input.maxChars, "maxChars"),
        sections: optionalStringArray(input.sections, "sections"),
        format: optionalFormat(input.format),
      });
      return { content: [{ type: "text", text: formatted }] };
    }

    if (name === "memory") {
      const input = normalizeArgs(args);
      const command = requireCommand(input.command);

      switch (command) {
        case "view": {
          const section = optionalString(input.section, "Section");
          const formatted = await store.getContext({
            sectionFilter: section,
            sections: optionalStringArray(input.sections, "sections"),
            maxChars: optionalNumber(input.maxChars, "maxChars"),
            format: optionalFormat(input.format),
          });
          return { content: [{ type: "text", text: formatted }] };
        }

        case "add": {
          const section = requireString(input.section, "Section");
          const fact = memoryFactInput(input);

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

        case "upsert": {
          const section = requireString(input.section, "Section");
          const fact = memoryFactInput(input);

          const result = await store.upsertFact(section, fact);
          const verb = result.action === "added" ? "Added" : result.action === "replaced" ? "Updated" : "Kept";
          return {
            content: [
              {
                type: "text",
                text: `✅ ${verb} ${sectionLabel(section)} line ${result.line}:\n${result.fact}`,
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
          const fact = memoryFactInput(input);

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

function normalizeContextArgs(args: unknown): MemoryArgs {
  if (args === undefined || args === null) return {};

  if (typeof args !== "object" || Array.isArray(args)) {
    throw new Error("memory_context arguments must be an object.");
  }

  for (const key of Object.keys(args)) {
    if (!["maxChars", "sections", "format"].includes(key)) {
      throw new Error(`Unknown argument for memory_context: ${key}.`);
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

function optionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value;
}

function optionalFormat(value: unknown): "formatted" | "compact" | "json" | undefined {
  if (value === undefined) return undefined;
  if (value !== "formatted" && value !== "compact" && value !== "json") {
    throw new Error("Format must be one of: formatted, compact, json.");
  }
  return value;
}

function optionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  return requireNumber(value, label);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  return value;
}

function memoryFactInput(input: MemoryArgs): string | {
  key: string;
  value: string;
  fact?: string;
  confidence?: "low" | "medium" | "high";
  source?: string;
} {
  if (input.key !== undefined || input.value !== undefined) {
    const confidence = optionalConfidence(input.confidence);
    return {
      key: requireString(input.key, "Key"),
      value: requireString(input.value, "Value"),
      source: optionalString(input.source, "Source"),
      confidence,
    };
  }
  return requireString(input.fact, "Fact");
}

function optionalConfidence(value: unknown): "low" | "medium" | "high" | undefined {
  if (value === undefined) return undefined;
  if (value !== "low" && value !== "medium" && value !== "high") {
    throw new Error("Confidence must be one of: low, medium, high.");
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
