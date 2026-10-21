const fs = require("node:fs");
const path = require("node:path");

function parseOptions(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--json") options.json = true;
    else if (["--vault", "--config", "--purpose", "--file", "--url", "--source", "--lines", "--sources-dir", "--wiki-dir", "--query", "--limit", "--note", "--authorship", "--author"].includes(key)) {
      if (!argv[i + 1]) throw new Error(`${key} requires a value`);
      options[key.slice(2)] = argv[++i];
    } else throw new Error(`Unknown option: ${key}`);
  }
  return options;
}

function resolveVault({ selector, configPath, allowMissing = false } = {}) {
  if (!selector || !selector.trim()) throw new Error("Select a vault explicitly with --vault");
  let target;
  if (path.isAbsolute(selector) || selector.startsWith(".") || selector.includes(path.sep)) {
    target = path.resolve(selector);
  } else {
    const configured = configPath || process.env.OCF_VAULT_CONFIG;
    if (!configured) throw new Error(`Vault name '${selector}' requires --config or OCF_VAULT_CONFIG`);
    const configFile = path.resolve(configured);
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    const entry = config.vaults?.[selector];
    const configuredPath = typeof entry === "string" ? entry : entry?.path;
    if (!configuredPath || typeof configuredPath !== "string") throw new Error(`Unknown vault name: ${selector}`);
    target = path.resolve(path.dirname(configFile), configuredPath);
  }
  if (!allowMissing) {
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) throw new Error(`Vault is not a directory: ${target}`);
    return fs.realpathSync(target);
  }
  return target;
}

if (require.main === module) {
  try {
    const args = parseOptions(process.argv.slice(2));
    const vault = resolveVault({ selector: args.vault, configPath: args.config });
    process.stdout.write(args.json ? `${JSON.stringify({ vault })}\n` : `${vault}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { parseOptions, resolveVault };
