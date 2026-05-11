import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));

function textContent(result) {
  return result.content.map((item) => item.text ?? "").join("\n");
}

async function withClient(t) {
  const dir = await mkdtemp(join(tmpdir(), "mcp-prose-memory-server-"));
  const memoryPath = join(dir, "memory.json");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: {
      ...process.env,
      MEMORY_PATH: memoryPath,
    },
    stderr: "pipe",
  });
  const client = new Client(
    { name: "mcp-prose-memory-test", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  await client.connect(transport);

  t.after(async () => {
    await transport.close();
    await rm(dir, { recursive: true, force: true });
  });

  return { client, memoryPath };
}

test("advertises strict MCP input schemas", async (t) => {
  const { client } = await withClient(t);

  const { tools } = await client.listTools();
  const memory = tools.find((tool) => tool.name === "memory");

  assert.ok(memory, "memory tool should be listed");
  assert.equal(memory.inputSchema.properties.line.type, "integer");
  assert.equal(memory.inputSchema.additionalProperties, false);
});

test("runs a real MCP add, view, invalid remove, and context flow", async (t) => {
  const { client, memoryPath } = await withClient(t);

  const add = await client.callTool({
    name: "memory",
    arguments: {
      command: "add",
      section: "work",
      fact: "  MCP smoke test fact  ",
    },
  });
  assert.match(textContent(add), /Added to Work Context:\n1\. MCP smoke test fact/);

  const invalidRemove = await client.callTool({
    name: "memory",
    arguments: {
      command: "remove",
      section: "work",
      line: 1.5,
    },
  });
  assert.match(textContent(invalidRemove), /Error: Line number must be a whole number/);

  const view = await client.callTool({
    name: "memory",
    arguments: {
      command: "view",
      section: "work",
    },
  });
  assert.equal(textContent(view), "**Work Context**\n\n1. MCP smoke test fact");

  const context = await client.callTool({
    name: "memory_context",
    arguments: {},
  });
  assert.equal(textContent(context), "**Work Context**\n\n1. MCP smoke test fact");

  const saved = JSON.parse(await readFile(memoryPath, "utf-8"));
  assert.equal(saved.sections.work[0], "MCP smoke test fact");
});
