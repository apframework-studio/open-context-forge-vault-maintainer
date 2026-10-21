const fs = require("node:fs");
const path = require("node:path");
const { parseOptions, resolveVault } = require("./vault-target");
const { loadProfile, withinVault } = require("./vault-profile");
const { listWikiMarkdown } = require("./wiki-files");

function searchTerms(query) {
  const normalized = query.toLocaleLowerCase();
  const terms = new Set([normalized]);
  for (const term of normalized.match(/[\p{Script=Han}]+|[\p{L}\p{N}]+/gu) || []) {
    if (/^[\p{Script=Han}]+$/u.test(term)) {
      if (term.length > 2) for (let i = 0; i < term.length - 1; i += 1) terms.add(term.slice(i, i + 2));
    } else if (term.length > 1) terms.add(term);
  }
  return [...terms].filter(Boolean);
}

function queryVault({ vault, query, limit = 10 } = {}) {
  if (!vault || !query?.trim()) throw new Error("Candidate search requires a vault and nonempty query");
  const count = Number(limit);
  if (!Number.isInteger(count) || count < 1 || count > 50) throw new Error("Limit must be an integer from 1 to 50");
  const root = fs.realpathSync(vault);
  const profile = loadProfile(root);
  const terms = searchTerms(query.trim());
  const results = [];
  for (const file of listWikiMarkdown(root, profile)) {
    if (file === profile.paths.index || file === profile.paths.log) continue;
    const content = fs.readFileSync(withinVault(root, file), "utf8");
    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(file, ".md");
    const titleText = `${path.basename(file, ".md")} ${title}`.toLocaleLowerCase();
    const bodyText = content.toLocaleLowerCase();
    const titleMatches = terms.filter((term) => titleText.includes(term));
    const bodyMatches = terms.filter((term) => bodyText.includes(term));
    if (!titleMatches.length && !bodyMatches.length) continue;
    const signals = [];
    if (titleMatches.length) signals.push("title");
    if (bodyMatches.length) signals.push("body");
    const phrase = query.trim().toLocaleLowerCase();
    const score = titleMatches.length * 10 + bodyMatches.length + (titleText.includes(phrase) ? 20 : 0);
    results.push({ file, title, score, signals });
  }
  results.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  return { vault: root, query: query.trim(), searched_root: profile.paths.wiki, results: results.slice(0, count) };
}

if (require.main === module) {
  try {
    const args = parseOptions(process.argv.slice(2));
    const vault = resolveVault({ selector: args.vault, configPath: args.config });
    const report = queryVault({ vault, query: args.query, limit: args.limit });
    process.stdout.write(`${JSON.stringify(report, null, args.json ? 0 : 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { queryVault };
