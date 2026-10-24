const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

function tempDir(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocf-vault-init-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("explicit vault path resolves without a config file", (t) => {
  const root = tempDir(t);
  const { resolveVault } = require("../scripts/vault-target");
  assert.equal(resolveVault({ selector: root }), fs.realpathSync(root));
});

test("named vault path is relative to its config file", (t) => {
  const root = tempDir(t);
  const vault = path.join(root, "vaults", "research");
  fs.mkdirSync(vault, { recursive: true });
  const config = path.join(root, "vaults.json");
  fs.writeFileSync(config, JSON.stringify({ vaults: { research: "./vaults/research", other: "./vaults/other" } }));
  const { resolveVault } = require("../scripts/vault-target");
  assert.equal(resolveVault({ selector: "research", configPath: config }), fs.realpathSync(vault));
});

test("vault target must be explicit even when config has one entry", (t) => {
  const root = tempDir(t);
  const config = path.join(root, "vaults.json");
  fs.writeFileSync(config, JSON.stringify({ vaults: { only: root } }));
  const { resolveVault } = require("../scripts/vault-target");
  assert.throws(() => resolveVault({ configPath: config }), /explicit|select|specify/i);
});

test("initialization creates a portable blank vault", (t) => {
  const root = tempDir(t);
  const target = path.join(root, "knowledge");
  const { initializeVault } = require("../scripts/init-vault");
  const report = initializeVault(target, { purpose: "研究可靠的 AI Agent 架构" });
  const required = [
    "purpose.md", "schema.md", "raw/sources", "wiki/index.md", "wiki/log.md",
    ".ocf/vault.json", ".ocf/ingest-manifest.json",
  ];
  for (const relative of required) assert.ok(fs.existsSync(path.join(target, relative)), relative);
  const profile = JSON.parse(fs.readFileSync(path.join(target, ".ocf/vault.json"), "utf8"));
  assert.match(profile.vault_id, /^[0-9a-f-]{36}$/);
  assert.equal(profile.paths.sources, "raw/sources");
  assert.equal(profile.paths.wiki, "wiki");
  assert.equal(report.vault, target);
  assert.match(fs.readFileSync(path.join(target, "purpose.md"), "utf8"), /研究可靠的 AI Agent 架构/);
  const schema = fs.readFileSync(path.join(target, "schema.md"), "utf8");
  assert.match(schema, /source_snapshot/);
  assert.match(schema, /source_fingerprint/);
  assert.match(schema, /L12-L18/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(target, ".ocf/ingest-manifest.json"), "utf8")).sources, {});
});

test("initialization creates a named vault when its parent directory is new", (t) => {
  const root = tempDir(t);
  const config = path.join(root, "vaults.json");
  fs.writeFileSync(config, JSON.stringify({ vaults: { research: "./vaults/research" } }));
  const { spawnSync } = require("node:child_process");
  const target = path.join(root, "vaults/research");
  const result = spawnSync(process.execPath, [path.join(__dirname, "../scripts/init-vault.js"), "--vault", "research", "--config", config, "--json"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).vault, target);
  assert.ok(fs.existsSync(path.join(target, "wiki/index.md")));
});

test("reinitialization preserves existing files", (t) => {
  const root = tempDir(t);
  const target = path.join(root, "knowledge");
  const { initializeVault } = require("../scripts/init-vault");
  initializeVault(target, { purpose: "Original purpose" });
  assert.throws(() => initializeVault(target, { purpose: "Replacement purpose" }), /empty|initialized/i);
  assert.match(fs.readFileSync(path.join(target, "purpose.md"), "utf8"), /Original purpose/);
});

test("initialization refuses an existing nonempty directory", (t) => {
  const root = tempDir(t);
  const target = path.join(root, "notes");
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, "personal.md"), "private note\n");
  const { initializeVault } = require("../scripts/init-vault");
  assert.throws(() => initializeVault(target), /empty/i);
  assert.equal(fs.readFileSync(path.join(target, "personal.md"), "utf8"), "private note\n");
  assert.equal(fs.existsSync(path.join(target, ".ocf")), false);
});

test("adopts an existing Obsidian vault without rewriting its notes", (t) => {
  const root = tempDir(t);
  const vault = path.join(root, "existing");
  fs.mkdirSync(path.join(vault, "Notes"), { recursive: true });
  const note = path.join(vault, "Notes", "personal.md");
  fs.writeFileSync(note, "---\ncustom: true\n---\n# Personal\n");
  const { adoptVault } = require("../scripts/adopt-vault");
  const { checkVault } = require("../scripts/check-vault");
  adoptVault(vault, { sourcesDir: "Clippings", wikiDir: "Notes" });
  assert.equal(fs.readFileSync(note, "utf8"), "---\ncustom: true\n---\n# Personal\n");
  assert.ok(fs.statSync(path.join(vault, "Clippings")).isDirectory());
  const profile = JSON.parse(fs.readFileSync(path.join(vault, ".ocf/vault.json"), "utf8"));
  assert.equal(profile.paths.sources, "Clippings");
  assert.equal(profile.paths.wiki, "Notes");
  assert.deepEqual(checkVault(vault).issues, []);
});

test("adoption rejects external symlinks for source and wiki directories", (t) => {
  const root = tempDir(t);
  const vault = path.join(root, "existing");
  const outside = path.join(root, "outside");
  fs.mkdirSync(path.join(vault, "Notes"), { recursive: true });
  fs.mkdirSync(outside);
  const { adoptVault } = require("../scripts/adopt-vault");
  fs.symlinkSync(outside, path.join(vault, "ExternalSources"), "dir");
  assert.throws(() => adoptVault(vault, { sourcesDir: "ExternalSources", wikiDir: "Notes" }), /symbolic link|symlink|outside/i);
  fs.unlinkSync(path.join(vault, "ExternalSources"));
  fs.symlinkSync(outside, path.join(vault, "ExternalWiki"), "dir");
  assert.throws(() => adoptVault(vault, { sourcesDir: "Sources", wikiDir: "ExternalWiki" }), /symbolic link|symlink|outside/i);
  assert.equal(fs.existsSync(path.join(vault, ".ocf")), false);
});

test("adoption rejects source and wiki paths resolving to the same directory", (t) => {
  const root = tempDir(t);
  const vault = path.join(root, "existing");
  fs.mkdirSync(path.join(vault, "Notes"), { recursive: true });
  fs.symlinkSync(path.join(vault, "Notes"), path.join(vault, "SourcesAlias"), "dir");
  const { adoptVault } = require("../scripts/adopt-vault");
  assert.throws(() => adoptVault(vault, { sourcesDir: "SourcesAlias", wikiDir: "Notes" }), /must differ|symbolic link|symlink/i);
  assert.equal(fs.existsSync(path.join(vault, ".ocf")), false);
});

test("adoption rejects paths outside vault before creating metadata", (t) => {
  const root = tempDir(t);
  const vault = path.join(root, "existing");
  fs.mkdirSync(path.join(vault, "Notes"), { recursive: true });
  const { adoptVault } = require("../scripts/adopt-vault");
  assert.throws(() => adoptVault(vault, { sourcesDir: "../outside", wikiDir: "Notes" }), /outside|relative/i);
  assert.equal(fs.existsSync(path.join(vault, ".ocf")), false);
});

test("adoption can create a nested source directory inside an existing vault", (t) => {
  const root = tempDir(t);
  const vault = path.join(root, "existing");
  fs.mkdirSync(path.join(vault, "Knowledge"), { recursive: true });
  const { adoptVault } = require("../scripts/adopt-vault");
  adoptVault(vault, { sourcesDir: "Archive/Raw/Articles", wikiDir: "Knowledge" });
  assert.ok(fs.statSync(path.join(vault, "Archive/Raw/Articles")).isDirectory());
});

test("adoption supports a flat vault with notes at its root", (t) => {
  const root = tempDir(t);
  const vault = path.join(root, "flat");
  fs.mkdirSync(vault);
  fs.writeFileSync(path.join(vault, "note.md"), "# Note\n");
  const { adoptVault } = require("../scripts/adopt-vault");
  const { checkVault } = require("../scripts/check-vault");
  adoptVault(vault, { sourcesDir: "sources", wikiDir: "." });
  const profile = JSON.parse(fs.readFileSync(path.join(vault, ".ocf/vault.json"), "utf8"));
  assert.equal(profile.paths.wiki, ".");
  assert.deepEqual(checkVault(vault).issues, []);
  assert.equal(fs.readFileSync(path.join(vault, "note.md"), "utf8"), "# Note\n");
});
