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
  assert.ok(memory.inputSchema.properties.key);
  assert.ok(memory.inputSchema.properties.maxChars);
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

test("rejects extra tool arguments at runtime", async (t) => {
  const { client } = await withClient(t);

  const result = await client.callTool({
    name: "memory",
    arguments: {
      command: "view",
      unexpected: true,
    },
  });

  assert.match(textContent(result), /Error: Unknown argument: unexpected/);
});

test("rejects extra memory_context arguments at runtime", async (t) => {
  const { client } = await withClient(t);

  const result = await client.callTool({
    name: "memory_context",
    arguments: {
      unexpected: true,
    },
  });

  assert.match(
    textContent(result),
    /Error: Unknown argument for memory_context: unexpected/
  );
});

test("runs structured upsert and bounded memory_context over MCP stdio", async (t) => {
  const { client, memoryPath } = await withClient(t);

  const upsert = await client.callTool({
    name: "memory",
    arguments: {
      command: "upsert",
      section: "user_preferences",
      key: "answer_style",
      value: "Prefers concise answers",
      source: "user_explicit",
      confidence: "high",
    },
  });
  assert.match(textContent(upsert), /Added User Preferences line 1:\nanswer_style: Prefers concise answers/);

  const replace = await client.callTool({
    name: "memory",
    arguments: {
      command: "upsert",
      section: "user_preferences",
      key: "answer_style",
      value: "Prefers concise and direct answers",
    },
  });
  assert.match(textContent(replace), /Updated User Preferences line 1:\nanswer_style: Prefers concise and direct answers/);

  const context = await client.callTool({
    name: "memory_context",
    arguments: {
      sections: ["user_preferences"],
      format: "compact",
      maxChars: 80,
    },
  });
  assert.ok(textContent(context).length <= 80);
  assert.match(textContent(context), /User Preferences:/);

  const saved = JSON.parse(await readFile(memoryPath, "utf-8"));
  assert.equal(saved.sections.user_preferences.length, 1);
  assert.equal(saved.sections.user_preferences[0].key, "answer_style");
});
