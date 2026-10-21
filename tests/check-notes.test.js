const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { initializeVault } = require("../scripts/init-vault");
const { adoptVault } = require("../scripts/adopt-vault");

function fixture(t, adopted = false) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "ocf-notes-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const vault = path.join(parent, "vault");
  if (adopted) {
    fs.mkdirSync(vault);
    adoptVault(vault, { sourcesDir: "Clippings", wikiDir: "." });
  } else initializeVault(vault);
  return vault;
}

function source(vault, relative, content = "# Title\nClaim\n") {
  const target = path.join(vault, relative);
  fs.writeFileSync(target, content);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function noteBody(snapshot, fingerprint, tail = "") {
  return `---\ntype: claim\nsource_snapshot: "${snapshot}"\nsource_fingerprint: "${fingerprint}"\n---\n# Claim\n\nEvidence: \`${snapshot}#L1-L2\`.\n${tail}`;
}

test("valid standard note accepts source provenance, evidence, local links and wikilinks", (t) => {
  const vault = fixture(t);
  const snapshot = "raw/sources/article.md";
  const fingerprint = source(vault, snapshot);
  fs.writeFileSync(path.join(vault, "wiki", "Related.md"), noteBody(snapshot, fingerprint));
  fs.writeFileSync(path.join(vault, "wiki", "Claim.md"), noteBody(snapshot, fingerprint, "See [[Related]] and [index](index.md).\n"));
  const { checkNotes } = require("../scripts/check-notes");
  const report = checkNotes({ vault, note: "wiki/Claim.md" });
  assert.deepEqual(report.issues, []);
  assert.deepEqual(report.checked_notes, ["wiki/Claim.md"]);
});

test("standard note reports missing provenance and evidence", (t) => {
  const vault = fixture(t);
  fs.writeFileSync(path.join(vault, "wiki", "Empty.md"), "# Empty\n");
  const { checkNotes } = require("../scripts/check-notes");
  const codes = checkNotes({ vault, note: "wiki/Empty.md" }).issues.map((issue) => issue.code);
  assert.ok(codes.includes("source_snapshot_missing"));
  assert.ok(codes.includes("source_fingerprint_missing"));
  assert.ok(codes.includes("evidence_missing"));
});

test("checker reports broken Markdown image and wikilink", (t) => {
  const vault = fixture(t, true);
  fs.writeFileSync(path.join(vault, "Note.md"), "# Note\n\n![chart](images/chart.png) [[Missing]]\n");
  const { checkNotes } = require("../scripts/check-notes");
  const codes = checkNotes({ vault }).issues.map((issue) => issue.code);
  assert.ok(codes.includes("local_link_missing"));
  assert.ok(codes.includes("wikilink_missing"));
});

test("checker reports ambiguous basename wikilinks", (t) => {
  const vault = fixture(t, true);
  fs.mkdirSync(path.join(vault, "A"));
  fs.mkdirSync(path.join(vault, "B"));
  fs.writeFileSync(path.join(vault, "A", "Shared.md"), "# One\n");
  fs.writeFileSync(path.join(vault, "B", "Shared.md"), "# Two\n");
  fs.writeFileSync(path.join(vault, "Note.md"), "# Note\n\n[[Shared]]\n");
  const { checkNotes } = require("../scripts/check-notes");
  assert.ok(checkNotes({ vault, note: "Note.md" }).issues.some((issue) => issue.code === "wikilink_ambiguous"));
});

test("checker rejects out-of-range evidence and changed snapshot bytes", (t) => {
  const vault = fixture(t);
  const snapshot = "raw/sources/article.md";
  const fingerprint = source(vault, snapshot);
  fs.writeFileSync(path.join(vault, "wiki", "Claim.md"), noteBody(snapshot, fingerprint).replace("#L1-L2", "#L2-L9"));
  fs.writeFileSync(path.join(vault, snapshot), "# Changed\n");
  const { checkNotes } = require("../scripts/check-notes");
  const codes = checkNotes({ vault, note: "wiki/Claim.md" }).issues.map((issue) => issue.code);
  assert.ok(codes.includes("evidence_range_invalid"));
  assert.ok(codes.includes("source_fingerprint_mismatch"));
});

test("adopted notes need no standard frontmatter but supplied evidence must resolve", (t) => {
  const vault = fixture(t, true);
  source(vault, "Clippings/Article.md", "# Source\nOne\n");
  fs.writeFileSync(path.join(vault, "Note.md"), "# Note\n\n`Clippings/Article.md#L1-L2`\n");
  const { checkNotes } = require("../scripts/check-notes");
  assert.deepEqual(checkNotes({ vault, note: "Note.md" }).issues, []);
  fs.writeFileSync(path.join(vault, "Note.md"), "# Note\n\n`Clippings/Article.md#L9-L10`\n");
  assert.ok(checkNotes({ vault, note: "Note.md" }).issues.some((issue) => issue.code === "evidence_range_invalid"));
});

test("selected note must be inside the configured wiki and cannot escape through symlinks", (t) => {
  const vault = fixture(t);
  const outside = path.join(path.dirname(vault), "outside.md");
  fs.writeFileSync(outside, "# Outside\n");
  fs.symlinkSync(outside, path.join(vault, "wiki", "escape.md"));
  const { checkNotes } = require("../scripts/check-notes");
  assert.throws(() => checkNotes({ vault, note: "raw/sources/other.md" }), /wiki/i);
  assert.throws(() => checkNotes({ vault, note: "wiki/escape.md" }), /outside|wiki|link/i);
});

test("link examples inside inline code and fenced code are not checked as real links", (t) => {
  const vault = fixture(t, true);
  fs.writeFileSync(path.join(vault, "Note.md"), "# Note\n\nUse `[[Example]]` or `[link](missing.md)` in docs.\n\n```md\n[[AlsoMissing]]\n```\n");
  const { checkNotes } = require("../scripts/check-notes");
  assert.deepEqual(checkNotes({ vault, note: "Note.md" }).issues, []);
});

test("Obsidian embedded images resolve against vault attachments", (t) => {
  const vault = fixture(t, true);
  fs.mkdirSync(path.join(vault, "attachments"));
  fs.writeFileSync(path.join(vault, "attachments", "chart.png"), "image bytes");
  fs.writeFileSync(path.join(vault, "Note.md"), "# Note\n\n![[chart.png|300]] ![[missing.png]]\n");
  const { checkNotes } = require("../scripts/check-notes");
  const issues = checkNotes({ vault, note: "Note.md" }).issues;
  assert.deepEqual(issues.map((issue) => issue.code), ["attachment_missing"]);
  assert.match(issues[0].detail, /missing\.png/);
});
