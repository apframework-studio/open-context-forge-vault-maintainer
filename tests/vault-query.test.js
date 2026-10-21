const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { initializeVault } = require("../scripts/init-vault");
const { adoptVault } = require("../scripts/adopt-vault");

function fixture(t, adopted = false) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "ocf-query-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const vault = path.join(parent, "vault");
  if (adopted) {
    fs.mkdirSync(vault);
    adoptVault(vault, { sourcesDir: "Clippings", wikiDir: "." });
  } else initializeVault(vault);
  return { parent, vault };
}

test("candidate search ranks title matches above body mentions and obeys limit", (t) => {
  const { vault } = fixture(t);
  fs.writeFileSync(path.join(vault, "wiki", "Agents.md"), "# Agent memory\n\nPersistent context.\n");
  fs.writeFileSync(path.join(vault, "wiki", "Overview.md"), "# Overview\n\nAgent memory has tradeoffs.\n");
  fs.writeFileSync(path.join(vault, "wiki", "Other.md"), "# Other\n\nUnrelated.\n");
  const { queryVault } = require("../scripts/vault-query");
  const report = queryVault({ vault, query: "Agent memory", limit: 1 });
  assert.deepEqual(report.results.map((result) => result.file), ["wiki/Agents.md"]);
  assert.ok(report.results[0].signals.includes("title"));
  assert.equal(report.searched_root, "wiki");
});

test("root-level adopted vault search excludes imported sources and internal directories", (t) => {
  const { vault } = fixture(t, true);
  fs.writeFileSync(path.join(vault, "Memory.md"), "# Agent memory\n");
  fs.writeFileSync(path.join(vault, "Clippings", "Article.md"), "# Agent memory source\n");
  fs.mkdirSync(path.join(vault, ".obsidian"));
  fs.writeFileSync(path.join(vault, ".obsidian", "Private.md"), "# Agent memory private\n");
  fs.writeFileSync(path.join(vault, ".ocf", "Internal.md"), "# Agent memory internal\n");
  const { queryVault } = require("../scripts/vault-query");
  assert.deepEqual(queryVault({ vault, query: "Agent memory" }).results.map((result) => result.file), ["Memory.md"]);
});

test("Chinese phrase and useful overlapping terms find related notes", (t) => {
  const { vault } = fixture(t);
  fs.writeFileSync(path.join(vault, "wiki", "知识图谱.md"), "# 知识图谱\n\n把概念连接起来。\n");
  const { queryVault } = require("../scripts/vault-query");
  assert.equal(queryVault({ vault, query: "知识图谱构建" }).results[0].file, "wiki/知识图谱.md");
});

test("search never follows symlinked wiki files or directories", (t) => {
  const { parent, vault } = fixture(t);
  const outside = path.join(parent, "outside.md");
  fs.writeFileSync(outside, "# Secret agent memory\n");
  fs.symlinkSync(outside, path.join(vault, "wiki", "link.md"));
  fs.symlinkSync(parent, path.join(vault, "wiki", "loop"));
  const { queryVault } = require("../scripts/vault-query");
  assert.deepEqual(queryVault({ vault, query: "Secret agent memory" }).results, []);
});

test("candidate search omits standard index and log navigation files", (t) => {
  const { vault } = fixture(t);
  fs.writeFileSync(path.join(vault, "wiki", "index.md"), "# Agent memory index\n");
  fs.writeFileSync(path.join(vault, "wiki", "log.md"), "# Agent memory log\n");
  fs.writeFileSync(path.join(vault, "wiki", "Memory.md"), "# Agent memory\n");
  const { queryVault } = require("../scripts/vault-query");
  assert.deepEqual(queryVault({ vault, query: "Agent memory" }).results.map((result) => result.file), ["wiki/Memory.md"]);
});
