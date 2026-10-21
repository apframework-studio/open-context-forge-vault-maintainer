const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { parseOptions, resolveVault } = require("./vault-target");
const { withinVault } = require("./vault-profile");

function sectionsFromLines(lines) {
  const headings = [];
  let fence = null;
  for (let i = 0; i < lines.length; i += 1) {
    const marker = lines[i].match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = lines[i].match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) headings.push({ heading: heading[2], level: heading[1].length, start_line: i + 1 });
  }
  if (headings.length === 0) return [{ heading: "(document)", level: 0, start_line: 1, end_line: lines.length }];
  const sections = [];
  if (headings[0].start_line > 1 && lines.slice(0, headings[0].start_line - 1).some((line) => line.trim())) {
    sections.push({ heading: "(preamble)", level: 0, start_line: 1, end_line: headings[0].start_line - 1 });
  }
  for (let i = 0; i < headings.length; i += 1) {
    sections.push({ ...headings[i], end_line: i + 1 < headings.length ? headings[i + 1].start_line - 1 : lines.length });
  }
  return sections;
}

function sourceContext({ vault, source, lines: ranges, maxChars = 12000 } = {}) {
  if (!vault || !source) throw new Error("Source context requires a vault and source path");
  const root = fs.realpathSync(vault);
  const target = withinVault(root, source);
  const bytes = fs.readFileSync(target);
  const text = bytes.toString("utf8");
  const lineArray = text.replace(/\r\n/g, "\n").split("\n");
  if (lineArray.at(-1) === "") lineArray.pop();
  const report = {
    source: path.relative(root, target).split(path.sep).join("/"),
    fingerprint: crypto.createHash("sha256").update(bytes).digest("hex"),
    line_count: lineArray.length,
  };
  if (!ranges) {
    report.sections = sectionsFromLines(lineArray).map((section) => ({
      ...section,
      preview: lineArray.slice(section.start_line - 1, section.end_line).join(" ").slice(0, 240),
    }));
    return report;
  }
  report.slices = ranges.split(",").map((range) => {
    const match = range.trim().match(/^(\d+)(?::(\d+))?$/);
    if (!match) throw new Error(`Invalid line range: ${range}`);
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > lineArray.length) throw new Error(`Line range outside source: ${range}`);
    return { start_line: start, end_line: end, text: lineArray.slice(start - 1, end).join("\n") };
  });
  if (report.slices.reduce((total, slice) => total + slice.text.length, 0) > maxChars) throw new Error("Evidence exceeds maxChars; request smaller ranges");
  return report;
}

if (require.main === module) {
  try {
    const args = parseOptions(process.argv.slice(2));
    const vault = resolveVault({ selector: args.vault, configPath: args.config });
    const report = sourceContext({ vault, source: args.source, lines: args.lines });
    process.stdout.write(`${JSON.stringify(report, null, args.json ? 0 : 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { sourceContext };
