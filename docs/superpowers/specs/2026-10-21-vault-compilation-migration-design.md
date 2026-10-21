# Vault Compilation Migration Design

**Date:** 2026-10-21
**Scope:** The article-to-vault Skill only; query/brief, writing, publishing, style observation and Git checkpoint workflows stay outside this migration.

## Goal

Retain the original Skill's evidence-led compilation method while supporting standard and adopted Markdown/Obsidian vaults through `.ocf/vault.json`. No command may guess a default vault or assume `00-system/`, `10-raw/` or `20-wiki/` exists.

## Workflow and templates

Keep the source analysis card → compilation plan → knowledge notes sequence. The analysis card records a content fingerprint, evidence IDs with exact line spans, bounded excerpts or findings, relation to existing notes, and one of `compile_now`, `defer`, `keep_raw_only`, `ask_user`. The plan records create/update/skip decisions and why existing notes cannot carry each new idea. Later steps reuse bounded evidence; they reread only specific missing spans. A source summary, concept, claim or framework is optional and created only when useful. Port those four templates with generic provenance fields; adopted vaults keep their own note conventions.

## Candidate search

`vault-query.js` searches only Markdown below `profile.paths.wiki`, omitting `.ocf`, the configured source directory and Obsidian internals even when the wiki path is the vault root. It ranks bounded candidates by title and body matches, including Chinese phrases, and returns relative paths and match signals. It does not decide semantic duplication; the Agent reads candidates before a write.

## Note validation

`check-notes.js` checks all wiki notes or one selected note. It validates local Markdown links, images and Obsidian wikilinks against files inside the vault. It validates each machine-readable `path.md#Lstart-Lend` evidence span against an existing source file and actual line count. Standard vault knowledge notes require `source_snapshot`, `source_fingerprint` and an evidence span; index and log are exempt. Adopted vaults are not forced into the standard frontmatter schema, but links and any supplied provenance or evidence spans are checked. A note with ambiguous wikilinks is reported rather than silently resolved. The checker is read-only and reports codes, paths and details; it never rewrites user notes.

## Safety and acceptance

Path traversal and symlink escapes remain rejected. Existing note formats are preserved. The original source Skill is read-only reference material. Tests cover standard and root-level adopted vaults, Chinese candidate search, source exclusion, missing and ambiguous links, valid/invalid evidence spans, and a changed source hash. A realistic temporary-vault trial exercises the documented workflow. `npm test`, Skill validation and Git diff checks pass before completion.
