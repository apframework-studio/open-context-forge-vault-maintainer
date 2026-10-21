const fs = require("node:fs");
const path = require("node:path");

function withinVault(vault, candidate) {
  const root = fs.realpathSync(vault);
  const lexical = path.resolve(root, candidate);
  if (lexical !== root && !lexical.startsWith(`${root}${path.sep}`)) throw new Error(`Path is outside the selected vault: ${candidate}`);
  let existing = lexical;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const realExisting = fs.realpathSync(existing);
  if (realExisting !== root && !realExisting.startsWith(`${root}${path.sep}`)) throw new Error(`Path is outside the selected vault: ${candidate}`);
  return lexical;
}

function loadProfile(vault) {
  const file = withinVault(vault, ".ocf/vault.json");
  const profile = JSON.parse(fs.readFileSync(file, "utf8"));
  if (profile.format_version !== 1 || !profile.vault_id || !profile.paths?.sources || !profile.paths?.wiki) {
    throw new Error(`Unsupported vault profile: ${file}`);
  }
  const sources = withinVault(vault, profile.paths.sources);
  const wiki = withinVault(vault, profile.paths.wiki);
  if (!fs.statSync(sources).isDirectory() || !fs.statSync(wiki).isDirectory()) throw new Error("Vault source or wiki path is not a directory");
  return profile;
}

module.exports = { withinVault, loadProfile };
