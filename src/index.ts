#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  loadDocument,
  getSection,
  updateSection,
  getFullContext,
  appendToSection,
  type SectionType,
} from "./store.js";

const server = new Server(
  { name: "mcp-prose-memory", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const SECTIONS = ["work", "personal", "top_of_mind", "history", "instructions"] as const;

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "memory_get",
      description: "Get full memory document or a specific section. Use without params for full doc.",
      inputSchema: {
        type: "object",
        properties: {
          section: {
            type: "string",
            enum: SECTIONS,
            description: "Optional: specific section to retrieve (work|personal|top_of_mind|history|instructions)",
          },
        },
      },
    },
    {
      name: "memory_update_section",
      description: "Replace the content of a specific section. Content should be prose/markdown.",
      inputSchema: {
        type: "object",
        properties: {
          section: {
            type: "string",
            enum: SECTIONS,
            description: "Section to update: work|personal|top_of_mind|history|instructions",
          },
          content: {
            type: "string",
            description: "New content for the section (prose/markdown)",
          },
        },
        required: ["section", "content"],
      },
    },
    {
      name: "memory_remember",
      description: "Get current document with hint to integrate new info. Use when asked to 'remember' something.",
      inputSchema: {
        type: "object",
        properties: {
          info: {
            type: "string",
            description: "The information to remember (for context)",
          },
        },
        required: ["info"],
      },
    },
    {
      name: "memory_context",
      description: "Get full memory document for session start. Returns the complete markdown file.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "memory_quick_add",
      description: "Quickly append a fact to a section. Use for simple 'remember X' requests. More efficient than memory_remember + memory_update_section.",
      inputSchema: {
        type: "object",
        properties: {
          section: {
            type: "string",
            enum: SECTIONS,
            description: "Section: work|personal|top_of_mind|history|instructions"
          },
          fact: {
            type: "string",
            description: "The fact to add (will be appended as a bullet point)"
          }
        },
        required: ["section", "fact"]
      }
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "memory_get": {
        if (args?.section) {
          const sectionType = args.section as SectionType;
          if (!SECTIONS.includes(sectionType)) {
            throw new Error(`Invalid section: ${sectionType}`);
          }
          const content = await getSection(sectionType);
          return {
            content: [
              {
                type: "text",
                text: content || `(${sectionType} section is empty)`,
              },
            ],
          };
        }
        const fullDoc = await getFullContext();
        return {
          content: [
            {
              type: "text",
              text: fullDoc || "(No memory document exists yet)",
            },
          ],
        };
      }

      case "memory_update_section": {
        const sectionType = args?.section as SectionType;
        const content = args?.content as string;

        if (!sectionType || !SECTIONS.includes(sectionType)) {
          throw new Error(`Invalid section: ${sectionType}`);
        }
        if (!content) {
          throw new Error("Content is required");
        }

        const doc = await updateSection(sectionType, content);
        return {
          content: [
            {
              type: "text",
              text: `Updated ${sectionType} section. Document last updated: ${doc.metadata.updated}`,
            },
          ],
        };
      }

      case "memory_remember": {
        const info = args?.info as string;
        if (!info) {
          throw new Error("Info is required");
        }

        const fullDoc = await getFullContext();
        const hint = `
To integrate this information into memory:

1. Choose the appropriate section:
   - work: professional context, projects, colleagues, tools
   - personal: location, preferences, interests, personal facts
   - top_of_mind: current focuses, active tasks
   - history: past events, completed work
   - instructions: standing rules, behavioral preferences

2. Keep content concise and well-organized
3. Use memory_update_section to save changes

INFO TO REMEMBER: ${info}

CURRENT DOCUMENT:
${fullDoc || "(empty)"}`;

        return { content: [{ type: "text", text: hint }] };
      }

      case "memory_context": {
        const fullDoc = await getFullContext();
        return {
          content: [
            {
              type: "text",
              text: fullDoc || "(No memory document exists yet)",
            },
          ],
        };
      }

      case "memory_quick_add": {
        const sectionType = args?.section as SectionType;
        const fact = args?.fact as string;
        if (!sectionType || !SECTIONS.includes(sectionType)) {
          throw new Error(`Invalid section: ${sectionType}`);
        }
        if (!fact) {
          throw new Error("Fact is required");
        }
        await appendToSection(sectionType, fact);
        return {
          content: [{ type: "text", text: `Added to ${sectionType}.` }]
        };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    }
  } catch (e: unknown) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${e instanceof Error ? e.message : e}`,
        },
      ],
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);
