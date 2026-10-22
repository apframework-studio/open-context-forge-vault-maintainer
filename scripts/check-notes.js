const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { parseOptions, resolveVault } = require("./vault-target");
const { loadProfile, withinVault } = require("./vault-profile");
const { listWikiMarkdown, listVaultAttachments } = require("./wiki-files");

const ATTACHMENT_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".bmp", ".pdf"]);

function frontmatter(content) {
  const block = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!block) return {};
  const fields = {};
  for (const line of block[1].split(/\r?\n/)) {
    const pair = line.match(/^([\w-]+):\s*(.*?)\s*$/);
    if (pair) {
      const value = pair[2];
      if (value.startsWith('"') && value.endsWith('"')) {
        try { fields[pair[1]] = JSON.parse(value); }
        catch { fields[pair[1]] = value.slice(1, -1); }
      } else if (value.startsWith("'") && value.endsWith("'")) {
        fields[pair[1]] = value.slice(1, -1).replace(/''/g, "'");
      } else fields[pair[1]] = value;
    }
  }
  return fields;
}

function visibleMarkdown(content) {
  let fence = null;
  return content.split(/\r?\n/).map((line) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (fence === marker[1][0]) fence = null;
      return "";
    }
    return fence ? "" : line;
  }).join("\n");
}

function lineCount(file) {
  const lines = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines.length;
}

function checkNotes({ vault, note } = {}) {
  if (!vault) throw new Error("Note check requires a vault");
  const root = fs.realpathSync(vault);
  const profile = loadProfile(root);
  const wikiRoot = withinVault(root, profile.paths.wiki);
  const sourceRoot = withinVault(root, profile.paths.sources);
  const wikiFiles = listWikiMarkdown(root, profile);
  let attachmentFiles;
  let selected = wikiFiles;
  if (note) {
    const target = withinVault(root, note);
    if ((target !== wikiRoot && !target.startsWith(`${wikiRoot}${path.sep}`)) || !wikiFiles.includes(path.relative(root, target).split(path.sep).join("/"))) {
      throw new Error(`Selected note is not a Markdown file in the configured wiki: ${note}`);
    }
    selected = [path.relative(root, target).split(path.sep).join("/")];
  }
  const issues = [];
  const add = (code, file, detail) => issues.push({ code, path: file, detail });
  let manifest;
  for (const file of selected) {
    const absolute = withinVault(root, file);
    const content = fs.readFileSync(absolute, "utf8");
    const fields = frontmatter(content);
    const scan = visibleMarkdown(content);
    const linkScan = scan.replace(/`+[^`\n]*`+/g, "");
    const metadataExempt = [profile.paths.index, profile.paths.log].includes(file);
    if (profile.mode === "standard" && !metadataExempt) {
      if (!fields.type) add("type_missing", file, "Compiled note requires type");
      if (!fields.source_snapshot) add("source_snapshot_missing", file, "Compiled note requires source_snapshot");
      if (!fields.source_fingerprint) add("source_fingerprint_missing", file, "Compiled note requires source_fingerprint");
    }

    if (fields.source_snapshot) {
      try {
        const target = withinVault(root, fields.source_snapshot);
        if (target !== sourceRoot && !target.startsWith(`${sourceRoot}${path.sep}`)) throw new Error("Snapshot is outside configured sources directory");
        if (!fs.statSync(target).isFile()) throw new Error("Snapshot is not a file");
        if (fields.source_fingerprint) {
          const actual = crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex");
          if (actual !== fields.source_fingerprint) add("source_fingerprint_mismatch", file, fields.source_snapshot);
        }
      } catch (error) { add("source_snapshot_invalid", file, `${fields.source_snapshot}: ${error.message}`); }
    }

    if (profile.mode === "standard" && fields.source_snapshot && fields.source_fingerprint && (fields.source_authorship !== undefined || fields.source_author !== undefined)) {
      try {
        manifest ||= JSON.parse(fs.readFileSync(withinVault(root, ".ocf/ingest-manifest.json"), "utf8"));
        const record = manifest.sources?.[fields.source_fingerprint];
        if (record?.snapshot !== fields.source_snapshot) {
          add("source_manifest_missing", file, fields.source_snapshot);
        } else {
          const expectedAuthorship = record.authorship || "unknown";
          if (fields.source_authorship !== undefined && fields.source_authorship !== expectedAuthorship) {
            add("source_authorship_mismatch", file, `Note: ${fields.source_authorship}; manifest: ${expectedAuthorship}`);
          }
          const expectedAuthor = record.author || "";
          if (fields.source_authorship !== undefined && expectedAuthor && fields.source_author === undefined) {
            add("source_author_missing", file, `Manifest author: ${expectedAuthor}`);
          }
          if (fields.source_author !== undefined && fields.source_author !== expectedAuthor) {
            add("source_author_mismatch", file, `Note: ${fields.source_author}; manifest: ${expectedAuthor}`);
          }
        }
      } catch (error) { add("source_manifest_invalid", file, error.message); }
    }

    let evidenceCount = 0;
    const evidencePattern = /([^\s`"'()[\]<>]+\.md)#L(\d+)-L(\d+)/g;
    for (const match of scan.matchAll(evidencePattern)) {
      evidenceCount += 1;
      const [, citedPath, first, last] = match;
      try {
        const target = withinVault(root, citedPath);
        if (target !== sourceRoot && !target.startsWith(`${sourceRoot}${path.sep}`)) throw new Error("Evidence is outside configured sources directory");
        if (!fs.statSync(target).isFile()) throw new Error("Evidence source is not a file");
        const start = Number(first);
        const end = Number(last);
        if (start < 1 || end < start || end > lineCount(target)) add("evidence_range_invalid", file, match[0]);
      } catch (error) { add("evidence_source_invalid", file, `${match[0]}: ${error.message}`); }
    }
    if (profile.mode === "standard" && !metadataExempt && !evidenceCount) add("evidence_missing", file, "Compiled note requires a source line citation");

    for (const match of linkScan.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const link = match[1].split("|")[0].split("#")[0].trim().replace(/\.md$/i, "");
      if (!link) continue;
      const targetName = link.toLocaleLowerCase();
      if (ATTACHMENT_EXTENSIONS.has(path.posix.extname(targetName))) {
        attachmentFiles ||= listVaultAttachments(root);
        const candidates = attachmentFiles.filter((candidate) => {
          const name = candidate.toLocaleLowerCase();
          return link.includes("/") ? (name === targetName || name.endsWith(`/${targetName}`)) : path.posix.basename(name) === targetName;
        });
        if (!candidates.length) add("attachment_missing", file, match[0]);
        else if (candidates.length > 1) add("attachment_ambiguous", file, `${match[0]}: ${candidates.join(", ")}`);
        continue;
      }
      const candidates = wikiFiles.filter((candidate) => {
        const stem = candidate.replace(/\.md$/i, "").toLocaleLowerCase();
        return link.includes("/") ? (stem === targetName || stem.endsWith(`/${targetName}`)) : path.posix.basename(stem) === targetName;
      });
      if (!candidates.length) add("wikilink_missing", file, match[0]);
      else if (candidates.length > 1) add("wikilink_ambiguous", file, `${match[0]}: ${candidates.join(", ")}`);
    }

    for (const match of linkScan.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^)]+)\)/g)) {
      let link = match[1].trim().replace(/^<|>$/g, "").split(/\s+["']/)[0];
      if (!link || link.startsWith("#") || /^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith("//")) continue;
      link = link.split("#")[0].split("?")[0];
      try {
        const target = withinVault(root, path.resolve(path.dirname(absolute), decodeURIComponent(link)));
        if (!fs.existsSync(target)) add("local_link_missing", file, match[0]);
      } catch (error) { add("local_link_invalid", file, `${match[0]}: ${error.message}`); }
    }
  }
  return { vault: root, checked_notes: selected, issues };
}

if (require.main === module) {
  try {
    const args = parseOptions(process.argv.slice(2));
    const vault = resolveVault({ selector: args.vault, configPath: args.config });
    const report = checkNotes({ vault, note: args.note });
    process.stdout.write(`${JSON.stringify(report, null, args.json ? 0 : 2)}\n`);
    if (report.issues.length) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { checkNotes };
