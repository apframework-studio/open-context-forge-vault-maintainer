# Open Context Forge Vault Maintainer

[简体中文](README.zh-CN.md)

Turn articles, Markdown files, and web clips into traceable notes in a Markdown or Obsidian vault. This Agent Skill covers the **source-to-knowledge** stage of Open Context Forge. Question answering, article writing, and publishing are outside its current scope.

The Skill guides an agent through saving an immutable source snapshot, reading it with line numbers, checking existing notes, planning changes, writing useful knowledge notes, and validating the result. You can select among multiple vaults for each task. The scripts use Node.js built-ins and do not fetch web pages or send vault content anywhere.

The operational [SKILL.md](SKILL.md) and detailed references are currently written in Chinese. This README explains installation and usage in English.

> Importing a file with the CLI only saves the source. An agent must follow [SKILL.md](SKILL.md) to analyze it and write knowledge notes.

## What you need

- Node.js 20 or newer.
- An agent that can read this Skill, run local commands, and write to the selected vault.
- A way for the agent to read full web articles if you give it URLs. The import script accepts a local Markdown file and does not download URLs.

The vault is always selected explicitly. A path works directly; a short name requires a separate JSON configuration file. The Skill does not choose a default vault or rely on conversation memory to store vault paths.

## Use it in a conversation

You can point an agent at this repository without installing the Skill. Replace the example paths with your own.

**Create a new vault:**

> Read `/absolute/path/to/open-context-forge-vault-maintainer/SKILL.md` and initialize a blank vault at `/absolute/path/to/new-vault` for collecting AI engineering practices. Run scripts from the Skill directory and tell me which files were created.

**Add an article to an existing vault:**

> Use `/absolute/path/to/open-context-forge-vault-maintainer/SKILL.md` to compile `https://example.com/article` into `/absolute/path/to/my-vault`. If the vault has not been adopted yet, its notes are at the root and source snapshots should go in `Clippings/`. Check that the full article is available, import it, record evidence, review related notes, make a compilation plan, write the notes, and validate the result.

For a local article, replace the URL with `/absolute/path/to/article.md`. To save only the source, say “import the source snapshot only; do not write knowledge notes.” If a page is truncated or login-gated, provide a complete Markdown copy before asking the agent to compile it.

**Tell the agent who wrote the article when you know.** For example: “This is my article; compile it into my vault,” or “This is an article I collected by Ada; compile it into my vault.” The import records `self`, `third_party`, or `unknown` separately from the URL or local file path. If you do not say, it stays `unknown`; a local Markdown file is not assumed to be yours. The author name is optional.

A full run normally leaves an immutable source snapshot, an analysis card and compilation plan under `.ocf/compilations/`, and created or updated knowledge notes. In a new standard vault, the agent also updates `wiki/index.md` and `wiki/log.md`. It should report what it created, updated, or skipped.

## Install for Codex

Link the **whole repository** into your personal Skill directory so its scripts, references, and templates remain together:

```bash
mkdir -p "$HOME/.agents/skills"
ln -s "/absolute/path/to/open-context-forge-vault-maintainer" \
  "$HOME/.agents/skills/open-context-forge-vault-maintainer"
```

Then ask:

> Use `$open-context-forge-vault-maintainer` to compile `/absolute/path/to/article.md` into `/absolute/path/to/my-vault` and validate the result.

For one repository only, place the link in that repository's `.agents/skills/` directory. Codex supports both locations and symlinked Skill folders; see the [official Skill documentation](https://learn.chatgpt.com/docs/build-skills). If a newly added Skill does not appear, restart Codex. Installation makes the Skill discoverable; you still select a target vault in each task.

## Configure multiple vaults

Store personal vault paths **outside this repository**, for example in `~/.config/open-context-forge/vaults.json`. Copy the shape from [config/vaults.example.json](config/vaults.example.json):

```json
{
  "vaults": {
    "research": { "path": "/absolute/path/to/research-vault" },
    "reading": { "path": "/absolute/path/to/reading-vault" }
  }
}
```

Tell the agent both the vault name and the configuration file: “Use `research` from `/absolute/path/to/vaults.json`.” It should pass `--vault research --config /absolute/path/to/vaults.json`. You can instead set `OCF_VAULT_CONFIG` in the agent's environment, but `--vault` is still required. Relative paths inside the JSON file are resolved from that file's directory.

Each vault also has its own `.ocf/vault.json`. That profile records the vault's internal source and note directories; it does not replace the multi-vault configuration file.

## Integrate with another agent

If the platform supports Agent Skills, register this entire directory as one Skill. Otherwise, give the agent access to [SKILL.md](SKILL.md), `references/`, `assets/`, and `scripts/`, plus Node.js 20+, the source files, and the selected vault. It also needs a web-reading capability for URL inputs.

You can use this standing instruction, replacing the paths:

> When I ask you to add a URL or Markdown file to a knowledge vault, read `/absolute/path/to/open-context-forge-vault-maintainer/SKILL.md` and follow it. Run scripts from that directory. The vault-name configuration is `/absolute/path/to/vaults.json`. Take the target vault from each request; never select one implicitly. For URLs, obtain and check the complete article before passing its Markdown to the import script.

The agent should pass `--authorship self` for an article you explicitly identify as yours, `--authorship third_party` for an explicitly collected article, and optionally `--author "Name"` when the source author is known. It should leave authorship `unknown` if the request does not establish it.

The workflow is: initialize a new vault or adopt an existing one → import the full source → analyze line-based evidence → search and read related notes → plan and write changes → validate. The detailed judgment rules are in [the ingestion workflow](references/ingest-workflow.md) and [note-writing guide](references/note-writing.md). This repository is a file-based Skill, not a background service or HTTP API.

## Run the scripts yourself

Run these examples from the Skill directory. Initialize **or** adopt a vault once; use `--wiki-dir .` when an existing vault keeps notes at its root.

```bash
# New, empty directory:
node scripts/init-vault.js --vault /absolute/path/to/new-vault \
  --purpose "Knowledge vault purpose" --json

# Existing vault instead:
node scripts/adopt-vault.js --vault /absolute/path/to/existing-vault \
  --sources-dir Clippings --wiki-dir . --json

# After initialization or adoption:
node scripts/import-markdown.js --vault /absolute/path/to/vault \
  --file /absolute/path/to/article.md --authorship self \
  --author "Your Name" --json
node scripts/vault-query.js --vault /absolute/path/to/vault \
  --query "article topic" --limit 10 --json
node scripts/check-notes.js --vault /absolute/path/to/vault --json
node scripts/check-vault.js --vault /absolute/path/to/vault --json
```

Initialization accepts only a new or empty directory. Adoption preserves existing notes. Imports are identified by SHA-256: importing identical content returns the existing snapshot, while changed content from the same URL keeps both versions. Only one import can run in a vault at a time. If an interrupted import leaves `.ocf/ingest.lock`, first confirm that no import is running before removing the lock; importing the same file again can register an intact orphaned snapshot.

For a collected article, use `--authorship third_party --author "Original Author"`. Omit both flags when authorship and author are unknown. The import manifest and `source-context.js` expose the attribution; standard vault notes carry it as `source_authorship` and, when known, `source_author`. Reimporting identical content can fill an unknown attribution, but a conflicting known attribution is rejected. Older manifest entries without the field remain readable as `unknown`.

`vault-query.js` returns candidates, not semantic duplicate decisions. `check-notes.js` checks local Markdown links and images, Obsidian wikilinks and embedded image attachments, and citations such as `raw/sources/article.md#L12-L18`. Standard-vault notes also need source metadata and a matching source hash; adopted vaults keep their own frontmatter conventions. Link checking verifies that files exist, not that heading anchors exist. `check-vault.js` checks the profile, manifest, and source snapshot hashes. An agent must still decide whether evidence supports each claim and whether indexes reflect the changes.

## Development

```bash
npm test
```

The project has no third-party runtime dependencies. It is licensed under [MIT](LICENSE).

The [public release readiness checklist](docs/public-release-readiness.md) tracks work that remains before changing repository visibility.
