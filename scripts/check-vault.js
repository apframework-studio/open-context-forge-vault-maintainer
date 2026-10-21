const crypto = require("node:crypto");
const fs = require("node:fs");
const { parseOptions, resolveVault } = require("./vault-target");
const { loadProfile, withinVault } = require("./vault-profile");

function checkVault(vault) {
  const root = fs.realpathSync(vault);
  const issues = [];
  let profile;
  try { profile = loadProfile(root); }
  catch (error) { return { vault: root, issues: [{ code: "profile_invalid", detail: error.message }] }; }
  const required = profile.mode === "adopted"
    ? { index: profile.paths.index, log: profile.paths.log }
    : { purpose: "purpose.md", schema: "schema.md", index: profile.paths.index, log: profile.paths.log };
  for (const [name, relative] of Object.entries(required)) {
    if (!relative) continue;
    try {
      if (!fs.statSync(withinVault(root, relative)).isFile()) issues.push({ code: "required_file_missing", path: relative, name });
    } catch { issues.push({ code: "required_file_missing", path: relative, name }); }
  }
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(withinVault(root, ".ocf/ingest-manifest.json"), "utf8")); }
  catch (error) { return { vault: root, issues: [...issues, { code: "manifest_invalid", detail: error.message }] }; }
  if (manifest.format_version !== 1 || !manifest.sources || typeof manifest.sources !== "object") {
    return { vault: root, issues: [...issues, { code: "manifest_invalid", detail: "Unsupported format" }] };
  }
  for (const [fingerprint, record] of Object.entries(manifest.sources)) {
    let file;
    try { file = withinVault(root, record.snapshot); }
    catch (error) { issues.push({ code: "source_path_invalid", path: record.snapshot, detail: error.message }); continue; }
    if (!fs.existsSync(file)) { issues.push({ code: "source_missing", path: record.snapshot }); continue; }
    const actual = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    if (actual !== fingerprint) issues.push({ code: "source_hash_mismatch", path: record.snapshot });
  }
  return { vault: root, issues };
}

if (require.main === module) {
  try {
    const args = parseOptions(process.argv.slice(2));
    const vault = resolveVault({ selector: args.vault, configPath: args.config });
    const report = checkVault(vault);
    process.stdout.write(`${JSON.stringify(report, null, args.json ? 0 : 2)}\n`);
    if (report.issues.length) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { checkVault };
