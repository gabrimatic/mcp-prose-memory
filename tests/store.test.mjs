import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.MEMORY_PATH = join(tmpdir(), "mcp-prose-memory-env-sentinel.json");

const { MemoryStore } = await import("../dist/store.js");

async function tempMemoryPath() {
  const dir = await mkdtemp(join(tmpdir(), "mcp-prose-memory-"));
  return {
    dir,
    memoryPath: join(dir, "memory.json"),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

test("stores trimmed facts at the configured JSON path", async (t) => {
  const { memoryPath, cleanup } = await tempMemoryPath();
  t.after(cleanup);

  const store = new MemoryStore({ memoryPath });

  const result = await store.addFact("work", "  Shipped the memory server  ");

  assert.deepEqual(result, {
    line: 1,
    fact: "Shipped the memory server",
  });

  const saved = JSON.parse(await readFile(memoryPath, "utf-8"));
  assert.equal(saved.sections.work[0], "Shipped the memory server");
});

test("uses a client-neutral default path when MEMORY_PATH is unset", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "mcp-prose-memory-home-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const env = { ...process.env, HOME: dir };
  delete env.MEMORY_PATH;

  const script = `
    const { MemoryStore } = await import(${JSON.stringify(new URL("../dist/store.js", import.meta.url).href)});
    const store = new MemoryStore();
    await store.addFact("work", "Default path fact");
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    env,
    encoding: "utf-8",
  });

  assert.equal(result.status, 0, result.stderr);

  const saved = JSON.parse(
    await readFile(join(dir, ".mcp-prose-memory", "memory.json"), "utf-8")
  );
  assert.equal(saved.sections.work[0], "Default path fact");
});

test("normalizes older or partial JSON memory documents without keeping unknown sections", async (t) => {
  const { memoryPath, cleanup } = await tempMemoryPath();
  t.after(cleanup);

  await writeFile(
    memoryPath,
    JSON.stringify({
      version: 1,
      updated: "2024-01-01T00:00:00.000Z",
      sections: {
        work: ["Existing work fact"],
        unknown: ["Should not be retained"],
      },
    }),
    "utf-8"
  );

  const store = new MemoryStore({ memoryPath });

  assert.equal(await store.getFormatted(), "**Work Context**\n\n1. Existing work fact");

  await store.addFact("personal", "Lives in Berlin");

  const saved = JSON.parse(await readFile(memoryPath, "utf-8"));
  assert.equal(saved.version, 5);
  assert.ok(Object.keys(saved.sections).includes("user_preferences"));
  assert.equal(saved.sections.personal[0], "Lives in Berlin");
  assert.equal(saved.sections.unknown, undefined);
});

test("stores structured compact facts with metadata", async (t) => {
  const { memoryPath, cleanup } = await tempMemoryPath();
  t.after(cleanup);

  const store = new MemoryStore({ memoryPath });
  const result = await store.addFact("user_preferences", {
    key: "answer_style",
    value: "Prefers concise answers",
    source: "user_explicit",
    confidence: "high",
  });

  assert.deepEqual(result, {
    line: 1,
    fact: "answer_style: Prefers concise answers",
  });

  const saved = JSON.parse(await readFile(memoryPath, "utf-8"));
  assert.equal(saved.sections.user_preferences[0].key, "answer_style");
  assert.equal(saved.sections.user_preferences[0].value, "Prefers concise answers");
  assert.equal(
    await store.getFormatted("user_preferences"),
    "**User Preferences**\n\n1. answer_style: Prefers concise answers"
  );
});

test("upserts structured facts by key", async (t) => {
  const { memoryPath, cleanup } = await tempMemoryPath();
  t.after(cleanup);

  const store = new MemoryStore({ memoryPath });

  assert.equal(
    (await store.upsertFact("user_preferences", { key: "answer_style", value: "Concise" })).action,
    "added"
  );
  const replaced = await store.upsertFact("user_preferences", { key: "answer_style", value: "Concise and direct" });

  assert.equal(replaced.action, "replaced");
  assert.equal(replaced.line, 1);
  assert.equal(
    await store.getFormatted("user_preferences"),
    "**User Preferences**\n\n1. answer_style: Concise and direct"
  );
});

test("returns compact bounded memory context", async (t) => {
  const { memoryPath, cleanup } = await tempMemoryPath();
  t.after(cleanup);

  const store = new MemoryStore({ memoryPath });
  await store.addFact("user_profile", { key: "preferred_name", value: "Soroush" });
  await store.addFact("user_preferences", { key: "answer_style", value: "Concise and practical" });

  const context = await store.getContext({
    sections: ["user_profile", "user_preferences"],
    format: "compact",
    maxChars: 90,
  });

  assert.match(context, /User Profile:/);
  assert.ok(context.length <= 90);
  assert.match(context, /context clipped/);
});

test("rejects fractional line numbers without mutating memory", async (t) => {
  const { memoryPath, cleanup } = await tempMemoryPath();
  t.after(cleanup);

  const store = new MemoryStore({ memoryPath });
  await store.addFact("work", "First fact");
  await store.addFact("work", "Second fact");

  await assert.rejects(
    () => store.removeFact("work", 1.5),
    /Line number must be a whole number/
  );

  assert.equal(
    await store.getFormatted("work"),
    "**Work Context**\n\n1. First fact\n2. Second fact"
  );
});

test("rejects inherited object property names as sections", async (t) => {
  const { memoryPath, cleanup } = await tempMemoryPath();
  t.after(cleanup);

  const store = new MemoryStore({ memoryPath });

  await assert.rejects(
    () => store.addFact("toString", "Should not be accepted"),
    /Invalid section "toString"/
  );
});

test("rejects duplicate facts when replacing", async (t) => {
  const { memoryPath, cleanup } = await tempMemoryPath();
  t.after(cleanup);

  const store = new MemoryStore({ memoryPath });
  await store.addFact("work", "Alpha");
  await store.addFact("work", "Beta");

  await assert.rejects(
    () => store.replaceFact("work", 2, " alpha "),
    /Duplicate fact already exists/
  );

  assert.equal(await store.getFormatted("work"), "**Work Context**\n\n1. Alpha\n2. Beta");
});

test("formats top_of_mind as Current Focus", async (t) => {
  const { memoryPath, cleanup } = await tempMemoryPath();
  t.after(cleanup);

  const store = new MemoryStore({ memoryPath });
  await store.addFact("top_of_mind", "Finish the release checklist");

  assert.equal(
    await store.getFormatted("top_of_mind"),
    "**Current Focus**\n\n1. Finish the release checklist"
  );
});

test("writes no temporary files after a successful save", async (t) => {
  const { dir, memoryPath, cleanup } = await tempMemoryPath();
  t.after(cleanup);

  const store = new MemoryStore({ memoryPath });
  await store.addFact("instructions", "Keep answers concise");

  await assert.rejects(
    () => access(join(dir, "memory.json.tmp")),
    /ENOENT/
  );
});
