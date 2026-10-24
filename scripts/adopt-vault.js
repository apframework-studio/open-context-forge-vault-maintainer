const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { parseOptions, resolveVault } = require("./vault-target");
const { withinVault } = require("./vault-profile");

function rejectSymlink(pathname, label) {
  if (fs.existsSync(pathname) && fs.lstatSync(pathname).isSymbolicLink()) {
    throw new Error(`${label} path must not be a symbolic link: ${pathname}`);
  }
}

function adoptVault(vaultPath, { sourcesDir, wikiDir } = {}) {
  if (!sourcesDir || !wikiDir) throw new Error("Adoption requires --sources-dir and --wiki-dir");
  if (fs.lstatSync(vaultPath).isSymbolicLink()) throw new Error("Vault path must not be a symbolic link");
  const vault = fs.realpathSync(vaultPath);
  const metadataDir = withinVault(vault, ".ocf");
  if (fs.existsSync(metadataDir)) throw new Error("Vault already has .ocf metadata; inspect it before adoption");
  const sources = withinVault(vault, sourcesDir);
  const wiki = withinVault(vault, wikiDir);
  rejectSymlink(sources, "Source");
  rejectSymlink(wiki, "Wiki");
  if (!fs.statSync(wiki).isDirectory()) throw new Error(`Wiki path is not a directory: ${wikiDir}`);
  if (fs.existsSync(sources) && !fs.statSync(sources).isDirectory()) throw new Error(`Source path is not a directory: ${sourcesDir}`);
  if (fs.existsSync(sources) && fs.realpathSync(sources) === fs.realpathSync(wiki)) throw new Error("Source and wiki directories must differ");
  fs.mkdirSync(sources, { recursive: true });
  fs.mkdirSync(metadataDir);
  const profile = {
    format_version: 1,
    mode: "adopted",
    vault_id: crypto.randomUUID(),
    paths: {
      sources: path.relative(vault, sources).split(path.sep).join("/"),
      wiki: path.relative(vault, wiki).split(path.sep).join("/") || ".",
    },
  };
  fs.writeFileSync(path.join(metadataDir, "vault.json"), `${JSON.stringify(profile, null, 2)}\n`, { flag: "wx" });
  fs.writeFileSync(path.join(metadataDir, "ingest-manifest.json"), `${JSON.stringify({ format_version: 1, sources: {} }, null, 2)}\n`, { flag: "wx" });
  return { vault, vault_id: profile.vault_id, paths: profile.paths };
}

if (require.main === module) {
  try {
    const args = parseOptions(process.argv.slice(2));
    const vault = resolveVault({ selector: args.vault, configPath: args.config });
    const report = adoptVault(vault, { sourcesDir: args["sources-dir"], wikiDir: args["wiki-dir"] });
    process.stdout.write(args.json ? `${JSON.stringify(report)}\n` : `Adopted ${report.vault}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { adoptVault };
