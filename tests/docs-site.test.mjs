import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

const pagesUrl = "https://gabrimatic.github.io/mcp-prose-memory/";
const requiredDocs = [
  "doc/docs.json",
  "doc/index.mdx",
  "doc/quickstart.mdx",
  "doc/product/how-it-works.mdx",
  "doc/product/memory-model.mdx",
  "doc/reference/configuration.mdx",
  "doc/reference/tools.mdx",
  "doc/reference/development.mdx",
  "doc/scripts/prepare-github-pages.mjs",
  ".github/workflows/docs-pages.yml"
];

test("Mintlify docs source is present under doc", async () => {
  for (const file of requiredDocs) {
    await assert.doesNotReject(stat(file), `${file} should exist`);
  }

  await assert.rejects(stat("docs"), /ENOENT/, "legacy docs directory should not exist");
});

test("README points public docs readers to GitHub Pages", async () => {
  const readme = await readFile("README.md", "utf8");

  assert.match(readme, new RegExp(pagesUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(readme, /\]\((?:\.\/)?docs?\//, "README should not link to local doc/docs paths");
  assert.doesNotMatch(readme, /raw\.githubusercontent\.com\/gabrimatic\/mcp-prose-memory\/.*install\.sh/);
});

test("CI ignores docs-only changes while docs workflow owns docs checks", async () => {
  const ci = await readFile(".github/workflows/ci.yml", "utf8");
  const docsWorkflow = await readFile(".github/workflows/docs-pages.yml", "utf8");

  for (const ignored of ["doc/**", "README.md", ".github/workflows/docs-pages.yml", "tests/docs-site.test.mjs"]) {
    assert.match(ci, new RegExp(ignored.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const expected of ["mint validate", "mint broken-links", "mint export", "actions/deploy-pages"]) {
    assert.match(docsWorkflow, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(docsWorkflow, /actions\/upload-pages-artifact@[0-9a-f]{40}/);
  assert.match(docsWorkflow, /actions\/deploy-pages@[0-9a-f]{40}/);
  assert.match(docsWorkflow, /if: github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'/);
});
