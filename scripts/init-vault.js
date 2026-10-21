const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { parseOptions, resolveVault } = require("./vault-target");

const DEFAULT_PURPOSE = "保存可追溯、可复用的文章知识。具体收录主题由使用者决定。";

function initializeVault(vaultPath, { purpose = DEFAULT_PURPOSE } = {}) {
  const vault = path.resolve(vaultPath);
  if (fs.existsSync(vault)) {
    const stat = fs.lstatSync(vault);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Vault target must be a directory, not a link: ${vault}`);
    if (fs.readdirSync(vault).length > 0) throw new Error(`Vault directory must be empty before initialization: ${vault}`);
  } else {
    fs.mkdirSync(vault, { recursive: true });
  }
  fs.mkdirSync(path.join(vault, "raw", "sources"), { recursive: true });
  fs.mkdirSync(path.join(vault, "wiki"));
  fs.mkdirSync(path.join(vault, ".ocf"));

  const profile = {
    format_version: 1,
    mode: "standard",
    vault_id: crypto.randomUUID(),
    paths: { sources: "raw/sources", wiki: "wiki", index: "wiki/index.md", log: "wiki/log.md" },
  };
  const files = {
    "purpose.md": `# Knowledge Vault Purpose\n\n${purpose.trim()}\n`,
    "schema.md": [
      "# Knowledge Vault Schema",
      "",
      "Raw source snapshots live in `raw/sources/` and remain unchanged after import.",
      "Compiled Markdown notes live in `wiki/`; source summaries may be placed in `wiki/sources/`.",
      "Compiled notes use YAML frontmatter with `type`, `source_snapshot` (vault-relative path), and `source_fingerprint` (SHA-256).",
      "Use `type: source` for a source summary; use a descriptive type such as `concept`, `claim`, or `framework` for reusable knowledge.",
      "In the body, cite supporting source lines as `raw/sources/example.md#L12-L18` and explain limits or uncertainty near each claim.",
      "Separate an author's statement from your own inference and any independently checked fact.",
      "Use `[[wikilinks]]` for related notes when the target exists.",
      "The Skill maintains `wiki/index.md` and appends changes to `wiki/log.md`.",
      "",
    ].join("\n"),
    "raw/sources/.gitkeep": "",
    "wiki/index.md": "# Knowledge Index\n\nNo compiled notes yet.\n",
    "wiki/log.md": "# Knowledge Log\n",
    ".ocf/vault.json": `${JSON.stringify(profile, null, 2)}\n`,
    ".ocf/ingest-manifest.json": `${JSON.stringify({ format_version: 1, sources: {} }, null, 2)}\n`,
  };
  for (const [relative, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(vault, relative), content, { encoding: "utf8", flag: "wx" });
  }
  return { vault, vault_id: profile.vault_id, created: Object.keys(files) };
}

if (require.main === module) {
  try {
    const args = parseOptions(process.argv.slice(2));
    const vault = resolveVault({ selector: args.vault, configPath: args.config, allowMissing: true });
    const report = initializeVault(vault, { purpose: args.purpose });
    process.stdout.write(args.json ? `${JSON.stringify(report)}\n` : `Initialized ${report.vault}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { initializeVault };
