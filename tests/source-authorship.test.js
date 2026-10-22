const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { initializeVault } = require("../scripts/init-vault");
const { importMarkdown } = require("../scripts/import-markdown");
const { sourceContext } = require("../scripts/source-context");
const { checkVault } = require("../scripts/check-vault");
const { checkNotes } = require("../scripts/check-notes");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocf-authorship-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const vault = path.join(root, "vault");
  const file = path.join(root, "article.md");
  initializeVault(vault);
  fs.writeFileSync(file, "# Article\n\nEvidence.\n");
  return { root, vault, file };
}

function manifest(vault) {
  return JSON.parse(fs.readFileSync(path.join(vault, ".ocf", "ingest-manifest.json"), "utf8"));
}

test("explicit self authorship and author survive import and evidence lookup", (t) => {
  const { vault, file } = fixture(t);
  const report = importMarkdown({ vault, file, authorship: "self", author: "Shoukai", url: "https://example.com/my-article" });
  const record = manifest(vault).sources[report.fingerprint];
  assert.equal(record.authorship, "self");
  assert.equal(record.author, "Shoukai");
  assert.equal(record.origins[0].url, "https://example.com/my-article");
  assert.equal(report.authorship, "self");
  assert.equal(sourceContext({ vault, source: report.snapshot }).authorship, "self");
  assert.equal(sourceContext({ vault, source: report.snapshot }).author, "Shoukai");
  assert.equal(fs.readFileSync(path.join(vault, report.snapshot), "utf8"), "# Article\n\nEvidence.\n");
});

test("unspecified authorship stays unknown even for a local file", (t) => {
  const { vault, file } = fixture(t);
  const report = importMarkdown({ vault, file, url: "https://example.com/collected" });
  assert.equal(report.authorship, "unknown");
  assert.equal(manifest(vault).sources[report.fingerprint].authorship, "unknown");
  assert.equal(sourceContext({ vault, source: report.snapshot }).authorship, "unknown");
});

test("new vault schema explains source authorship metadata", (t) => {
  const { vault } = fixture(t);
  const schema = fs.readFileSync(path.join(vault, "schema.md"), "utf8");
  assert.match(schema, /source_authorship/);
  assert.match(schema, /source_author/);
  assert.match(schema, /unknown/);
});

test("an old manifest record without authorship remains readable as unknown", (t) => {
  const { vault, file } = fixture(t);
  const report = importMarkdown({ vault, file });
  const data = manifest(vault);
  delete data.sources[report.fingerprint].authorship;
  delete data.sources[report.fingerprint].author;
  fs.writeFileSync(path.join(vault, ".ocf", "ingest-manifest.json"), JSON.stringify(data));
  assert.equal(sourceContext({ vault, source: report.snapshot }).authorship, "unknown");
  assert.deepEqual(checkVault(vault).issues, []);
});

test("an explicit attribution upgrades unknown on duplicate import without another snapshot", (t) => {
  const { vault, file } = fixture(t);
  const first = importMarkdown({ vault, file });
  const second = importMarkdown({ vault, file, authorship: "third_party", author: "Ada" });
  assert.equal(second.duplicate, true);
  assert.equal(second.authorship, "third_party");
  assert.equal(manifest(vault).sources[first.fingerprint].author, "Ada");
  assert.equal(fs.readdirSync(path.join(vault, "raw", "sources")).filter((name) => name.endsWith(".md")).length, 1);
});

test("updating attribution from the vault snapshot does not invent another origin", (t) => {
  const { vault, file } = fixture(t);
  const first = importMarkdown({ vault, file, url: "https://example.com/article" });
  const second = importMarkdown({ vault, file: path.join(vault, first.snapshot), authorship: "self" });
  assert.equal(second.duplicate, true);
  assert.equal(second.authorship, "self");
  assert.deepEqual(manifest(vault).sources[first.fingerprint].origins, [{ url: "https://example.com/article", filename: "article.md" }]);
});

test("a URL learned from a snapshot reimport is kept without claiming a new file", (t) => {
  const { vault, file } = fixture(t);
  const first = importMarkdown({ vault, file });
  importMarkdown({ vault, file: path.join(vault, first.snapshot), url: "https://example.com/article", authorship: "third_party" });
  assert.deepEqual(manifest(vault).sources[first.fingerprint].origins, [
    { url: null, filename: "article.md" },
    { url: "https://example.com/article", filename: null },
  ]);
});

test("conflicting attribution is rejected without changing existing provenance", (t) => {
  const { vault, file } = fixture(t);
  const first = importMarkdown({ vault, file, authorship: "self", author: "Shoukai" });
  assert.throws(() => importMarkdown({ vault, file, authorship: "third_party", author: "Ada" }), /conflict|authorship/i);
  const record = manifest(vault).sources[first.fingerprint];
  assert.equal(record.authorship, "self");
  assert.equal(record.author, "Shoukai");
  assert.equal(record.origins.length, 1);
});

test("invalid authorship is rejected before a snapshot is written", (t) => {
  const { vault, file } = fixture(t);
  assert.throws(() => importMarkdown({ vault, file, authorship: "mine" }), /authorship/i);
  assert.deepEqual(manifest(vault).sources, {});
  assert.deepEqual(fs.readdirSync(path.join(vault, "raw", "sources")).filter((name) => name.endsWith(".md")), []);
});

test("CLI accepts authorship and author and exposes them in source context", (t) => {
  const { vault, file } = fixture(t);
  const imported = spawnSync(process.execPath, [path.join(__dirname, "../scripts/import-markdown.js"), "--vault", vault, "--file", file, "--authorship", "self", "--author", "Shoukai", "--json"], { encoding: "utf8" });
  assert.equal(imported.status, 0, imported.stderr);
  const report = JSON.parse(imported.stdout);
  const context = spawnSync(process.execPath, [path.join(__dirname, "../scripts/source-context.js"), "--vault", vault, "--source", report.snapshot, "--json"], { encoding: "utf8" });
  assert.equal(context.status, 0, context.stderr);
  assert.equal(JSON.parse(context.stdout).authorship, "self");
  assert.equal(JSON.parse(context.stdout).author, "Shoukai");
});

test("vault check reports unsupported authorship values", (t) => {
  const { vault, file } = fixture(t);
  const report = importMarkdown({ vault, file });
  const data = manifest(vault);
  data.sources[report.fingerprint].authorship = "mine";
  fs.writeFileSync(path.join(vault, ".ocf", "ingest-manifest.json"), JSON.stringify(data));
  assert.ok(checkVault(vault).issues.some((issue) => issue.code === "source_authorship_invalid"));
});

test("vault check reports invalid source author metadata", (t) => {
  const { vault, file } = fixture(t);
  const report = importMarkdown({ vault, file });
  const data = manifest(vault);
  data.sources[report.fingerprint].author = { name: "Ada" };
  fs.writeFileSync(path.join(vault, ".ocf", "ingest-manifest.json"), JSON.stringify(data));
  assert.ok(checkVault(vault).issues.some((issue) => issue.code === "source_author_invalid"));
});

test("note check detects attribution that became stale after a source update", (t) => {
  const { vault, file } = fixture(t);
  const first = importMarkdown({ vault, file });
  const note = path.join(vault, "wiki", "article-note.md");
  fs.writeFileSync(note, `---\ntype: source\nsource_snapshot: "${first.snapshot}"\nsource_fingerprint: "${first.fingerprint}"\nsource_authorship: unknown\n---\n# Article note\n\nEvidence: \`${first.snapshot}#L1-L2\`.\n`);
  assert.deepEqual(checkNotes({ vault }).issues, []);
  importMarkdown({ vault, file, authorship: "self", author: "Shoukai" });
  assert.ok(checkNotes({ vault }).issues.some((issue) => issue.code === "source_authorship_mismatch"));
  fs.writeFileSync(note, fs.readFileSync(note, "utf8").replace("source_authorship: unknown", "source_authorship: self"));
  assert.ok(checkNotes({ vault }).issues.some((issue) => issue.code === "source_author_missing"));
  fs.writeFileSync(note, fs.readFileSync(note, "utf8").replace("source_authorship: self", "source_authorship: self\nsource_author: Shoukai"));
  assert.deepEqual(checkNotes({ vault }).issues, []);
});

test("note attribution check reports a missing manifest source", (t) => {
  const { vault, file } = fixture(t);
  const report = importMarkdown({ vault, file, authorship: "self" });
  const note = path.join(vault, "wiki", "article-note.md");
  fs.writeFileSync(note, `---\ntype: source\nsource_snapshot: "${report.snapshot}"\nsource_fingerprint: "${report.fingerprint}"\nsource_authorship: self\n---\n# Article note\n\nEvidence: \`${report.snapshot}#L1-L2\`.\n`);
  const data = manifest(vault);
  delete data.sources[report.fingerprint];
  fs.writeFileSync(path.join(vault, ".ocf", "ingest-manifest.json"), JSON.stringify(data));
  assert.ok(checkNotes({ vault }).issues.some((issue) => issue.code === "source_manifest_missing"));
});

test("quoted YAML author names compare to manifest without false mismatches", (t) => {
  const { vault, file } = fixture(t);
  const report = importMarkdown({ vault, file, authorship: "third_party", author: 'Ada "A" Lovelace' });
  const note = path.join(vault, "wiki", "article-note.md");
  fs.writeFileSync(note, `---\ntype: source\nsource_snapshot: "${report.snapshot}"\nsource_fingerprint: "${report.fingerprint}"\nsource_authorship: third_party\nsource_author: "Ada \\"A\\" Lovelace"\n---\n# Article note\n\nEvidence: \`${report.snapshot}#L1-L2\`.\n`);
  assert.deepEqual(checkNotes({ vault }).issues, []);
});
