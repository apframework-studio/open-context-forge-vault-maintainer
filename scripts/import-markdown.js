const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { parseOptions, resolveVault } = require("./vault-target");
const { loadProfile, withinVault } = require("./vault-profile");

function normalizeUrl(value) {
  if (!value) return null;
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Source URL must be HTTP(S) without credentials");
  url.hash = "";
  return url.toString();
}

function atomicJson(file, value) {
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function importMarkdown({ vault, file, url } = {}) {
  if (!vault || !file) throw new Error("Import requires a vault and Markdown file");
  const root = fs.realpathSync(vault);
  const profile = loadProfile(root);
  const input = fs.realpathSync(file);
  if (!fs.statSync(input).isFile()) throw new Error(`Source is not a file: ${file}`);
  const bytes = fs.readFileSync(input);
  const body = bytes.toString("utf8");
  if (!body.trim() || body.includes("\0")) throw new Error("Source must contain nonempty UTF-8 Markdown text");
  const fingerprint = crypto.createHash("sha256").update(bytes).digest("hex");
  const originUrl = normalizeUrl(url);
  const manifestFile = withinVault(root, ".ocf/ingest-manifest.json");
  const lockFile = withinVault(root, ".ocf/ingest.lock");
  let lock;
  try {
    lock = fs.openSync(lockFile, "wx");
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`Another import is in progress for this vault; inspect ${lockFile} if no import is running`);
    throw error;
  }
  try {
    fs.writeFileSync(lock, `${JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() })}\n`);
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    if (manifest.format_version !== 1 || typeof manifest.sources !== "object" || manifest.sources === null) throw new Error("Unsupported ingest manifest");

    const prior = manifest.sources[fingerprint];
    const origin = { url: originUrl, filename: path.basename(input) };
    if (prior) {
      const existing = withinVault(root, prior.snapshot);
      if (!fs.existsSync(existing)) throw new Error(`Recorded source snapshot is missing: ${prior.snapshot}`);
      const existingHash = crypto.createHash("sha256").update(fs.readFileSync(existing)).digest("hex");
      if (existingHash !== fingerprint) throw new Error(`Recorded source snapshot hash mismatch: ${prior.snapshot}`);
      if (!prior.origins.some((entry) => entry.url === origin.url && entry.filename === origin.filename)) {
        prior.origins.push(origin);
        atomicJson(manifestFile, manifest);
      }
      return { vault: root, snapshot: prior.snapshot, fingerprint, duplicate: true, url: originUrl };
    }

    const stem = path.basename(input, path.extname(input)).replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-|-$/g, "").slice(0, 80) || "source";
    const relative = path.posix.join(profile.paths.sources.replaceAll("\\", "/"), `${stem}-${fingerprint}.md`);
    const target = withinVault(root, relative);
    let recovered = false;
    try {
      fs.writeFileSync(target, bytes, { flag: "wx" });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const existingHash = crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex");
      if (existingHash !== fingerprint) throw new Error(`Unrecorded source snapshot hash mismatch: ${relative}`);
      recovered = true;
    }
    manifest.sources[fingerprint] = {
      snapshot: relative,
      imported_at: new Date().toISOString(),
      origins: [origin],
    };
    atomicJson(manifestFile, manifest);
    return { vault: root, snapshot: relative, fingerprint, duplicate: false, recovered, url: originUrl };
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockFile);
  }
}

if (require.main === module) {
  try {
    const args = parseOptions(process.argv.slice(2));
    const vault = resolveVault({ selector: args.vault, configPath: args.config });
    const report = importMarkdown({ vault, file: args.file, url: args.url });
    process.stdout.write(args.json ? `${JSON.stringify(report)}\n` : `${report.snapshot} (${report.duplicate ? "existing" : "new"})\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { importMarkdown };
