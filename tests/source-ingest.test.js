const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { initializeVault } = require("../scripts/init-vault");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocf-source-ingest-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const vault = path.join(root, "vault");
  initializeVault(vault, { purpose: "Test articles" });
  return { root, vault };
}

function manifest(vault) {
  return JSON.parse(fs.readFileSync(path.join(vault, ".ocf/ingest-manifest.json"), "utf8"));
}

test("imports Markdown as an immutable source snapshot", (t) => {
  const { root, vault } = fixture(t);
  const file = path.join(root, "article.md");
  const body = "# A useful article\n\n## Evidence\n\nA supported point.\n";
  fs.writeFileSync(file, body);
  const { importMarkdown } = require("../scripts/import-markdown");
  const report = importMarkdown({ vault, file, url: "https://example.com/article#section" });
  assert.equal(report.duplicate, false);
  assert.match(report.fingerprint, /^[a-f0-9]{64}$/);
  assert.ok(report.snapshot.startsWith("raw/sources/"));
  assert.equal(fs.readFileSync(path.join(vault, report.snapshot), "utf8"), body);
  assert.equal(manifest(vault).sources[report.fingerprint].origins[0].url, "https://example.com/article");
});

test("identical content imports once even when requested twice", (t) => {
  const { root, vault } = fixture(t);
  const file = path.join(root, "same.md");
  fs.writeFileSync(file, "# Same\n\nText.\n");
  const { importMarkdown } = require("../scripts/import-markdown");
  const first = importMarkdown({ vault, file });
  const second = importMarkdown({ vault, file });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.snapshot, first.snapshot);
  assert.equal(Object.keys(manifest(vault).sources).length, 1);
  assert.equal(fs.readdirSync(path.join(vault, "raw/sources")).filter((name) => name.endsWith(".md")).length, 1);
});

test("duplicate import refuses a changed recorded snapshot", (t) => {
  const { root, vault } = fixture(t);
  const file = path.join(root, "stable.md");
  fs.writeFileSync(file, "# Stable\n");
  const { importMarkdown } = require("../scripts/import-markdown");
  const first = importMarkdown({ vault, file });
  fs.writeFileSync(path.join(vault, first.snapshot), "# Tampered\n");
  assert.throws(() => importMarkdown({ vault, file }), /hash|changed|mismatch/i);
});

test("an in-progress import prevents a second writer from changing the manifest", (t) => {
  const { root, vault } = fixture(t);
  const file = path.join(root, "waiting.md");
  fs.writeFileSync(file, "# Waiting\n");
  const lock = path.join(vault, ".ocf/ingest.lock");
  fs.writeFileSync(lock, "held", { flag: "wx" });
  const { importMarkdown } = require("../scripts/import-markdown");
  assert.throws(() => importMarkdown({ vault, file }), /in progress|locked|busy/i);
  assert.deepEqual(manifest(vault).sources, {});
  assert.deepEqual(fs.readdirSync(path.join(vault, "raw/sources")).filter((name) => name.endsWith(".md")), []);
  fs.unlinkSync(lock);
  assert.equal(importMarkdown({ vault, file }).duplicate, false);
});

test("an unrecorded intact snapshot can be recovered", (t) => {
  const { root, vault } = fixture(t);
  const file = path.join(root, "orphan.md");
  const body = "# Recover me\n";
  fs.writeFileSync(file, body);
  const crypto = require("node:crypto");
  const fingerprint = crypto.createHash("sha256").update(body).digest("hex");
  const snapshot = path.join(vault, "raw/sources", `orphan-${fingerprint}.md`);
  fs.writeFileSync(snapshot, body, { flag: "wx" });
  const { importMarkdown } = require("../scripts/import-markdown");
  const report = importMarkdown({ vault, file });
  assert.equal(report.fingerprint, fingerprint);
  assert.equal(report.snapshot, `raw/sources/orphan-${fingerprint}.md`);
  assert.equal(report.recovered, true);
  assert.equal(manifest(vault).sources[fingerprint].snapshot, report.snapshot);
});

test("changed content at one URL retains both source versions", (t) => {
  const { root, vault } = fixture(t);
  const file = path.join(root, "changing.md");
  const { importMarkdown } = require("../scripts/import-markdown");
  fs.writeFileSync(file, "# Version one\n");
  const first = importMarkdown({ vault, file, url: "https://example.com/post" });
  fs.writeFileSync(file, "# Version two\n");
  const second = importMarkdown({ vault, file, url: "https://example.com/post" });
  assert.notEqual(first.snapshot, second.snapshot);
  assert.equal(fs.readFileSync(path.join(vault, first.snapshot), "utf8"), "# Version one\n");
  assert.equal(fs.readFileSync(path.join(vault, second.snapshot), "utf8"), "# Version two\n");
  assert.equal(Object.keys(manifest(vault).sources).length, 2);
});

test("source context reports heading sections and exact evidence lines", (t) => {
  const { root, vault } = fixture(t);
  const file = path.join(root, "structured.md");
  fs.writeFileSync(file, "# Title\n\nIntro.\n\n## Claim\n\nEvidence here.\n");
  const { importMarkdown } = require("../scripts/import-markdown");
  const { sourceContext } = require("../scripts/source-context");
  const imported = importMarkdown({ vault, file });
  const outline = sourceContext({ vault, source: imported.snapshot });
  assert.deepEqual(outline.sections.map((section) => section.heading), ["Title", "Claim"]);
  const evidence = sourceContext({ vault, source: imported.snapshot, lines: "5:7" });
  assert.equal(evidence.slices[0].start_line, 5);
  assert.equal(evidence.slices[0].text, "## Claim\n\nEvidence here.");
  assert.equal(evidence.fingerprint, imported.fingerprint);
});

test("source context rejects paths outside the selected vault", (t) => {
  const { root, vault } = fixture(t);
  const outside = path.join(root, "outside.md");
  fs.writeFileSync(outside, "# Outside\n");
  const { sourceContext } = require("../scripts/source-context");
  assert.throws(() => sourceContext({ vault, source: outside }), /outside|within/i);
});

test("vault check catches missing and altered source snapshots", (t) => {
  const { root, vault } = fixture(t);
  const file = path.join(root, "source.md");
  fs.writeFileSync(file, "# Stable\n");
  const { importMarkdown } = require("../scripts/import-markdown");
  const { checkVault } = require("../scripts/check-vault");
  const first = importMarkdown({ vault, file });
  assert.deepEqual(checkVault(vault).issues, []);
  fs.writeFileSync(path.join(vault, first.snapshot), "# Changed\n");
  assert.ok(checkVault(vault).issues.some((issue) => issue.code === "source_hash_mismatch"));
  fs.rmSync(path.join(vault, first.snapshot));
  assert.ok(checkVault(vault).issues.some((issue) => issue.code === "source_missing"));
});
