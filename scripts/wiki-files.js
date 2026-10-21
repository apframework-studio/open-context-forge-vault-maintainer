const fs = require("node:fs");
const path = require("node:path");
const { withinVault } = require("./vault-profile");

function listWikiMarkdown(vault, profile) {
  const root = fs.realpathSync(vault);
  const wikiRoot = withinVault(root, profile.paths.wiki);
  const sourceRoot = withinVault(root, profile.paths.sources);
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const candidate = path.join(directory, entry.name);
      if (candidate === sourceRoot || candidate.startsWith(`${sourceRoot}${path.sep}`)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(candidate);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(path.relative(root, candidate).split(path.sep).join("/"));
      }
    }
  }
  visit(wikiRoot);
  return files.sort();
}

function listVaultAttachments(vault) {
  const root = fs.realpathSync(vault);
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(candidate);
      else if (entry.isFile() && !entry.name.toLowerCase().endsWith(".md")) {
        files.push(path.relative(root, candidate).split(path.sep).join("/"));
      }
    }
  }
  visit(root);
  return files;
}

module.exports = { listWikiMarkdown, listVaultAttachments };
