# Vault Compilation Migration Implementation Plan

> **For agentic workers:** Execute tasks in order with red-green tests for scripts, then run a realistic Skill trial. This plan is executed in the current session against the uncommitted bootstrap checkout.

**Goal:** Migrate the original Skill's source-compilation quality rules and make candidate search and note validation work with arbitrary configured Markdown vaults.

**Architecture:** Keep semantic decisions in `SKILL.md`, references and templates. New read-only scripts use `.ocf/vault.json` to locate wiki and source directories; they report bounded search results and concrete note issues without changing existing notes.

**Tech Stack:** Node.js 20+ built-ins, Markdown, JSON, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-21-vault-compilation-migration-design.md`

## Global Constraints

- Every operation has an explicit vault target.
- Adopted vaults retain their existing note conventions.
- No dependency on `00-system/`, `10-raw/` or `20-wiki/` in the new scripts.
- No third-party runtime dependency, network write or automatic Git checkpoint.
- The original Skill remains unchanged.

---

### Task 1: Generic compilation guidance and templates

**Files:** Update `SKILL.md`, `references/ingest-workflow.md`, `references/vault-layout.md`; create `references/note-writing.md` and `assets/templates/{source-summary,concept,claim,framework}.md`.

**Interfaces:** Agent reads the guidance after source import and may use a template for standard vault notes; adopted vaults use their own conventions.

- [ ] Compare original analysis workflow, extraction rules and four note templates to the new generic workflow.
- [ ] Write the generic rules for evidence reuse, create/update/skip decisions, source summary, claim counterpoint, concept relationships and framework limits.
- [ ] Add optional note templates with `type`, `source_snapshot` and `source_fingerprint`; avoid fixed original directory names and writing-only fields.
- [ ] Run Skill metadata validation and a read-only baseline prompt without the changed guidance.

### Task 2: Profile-driven candidate search

**Files:** Create `scripts/wiki-files.js`, `scripts/vault-query.js`, `tests/vault-query.test.js`; update option parsing in `scripts/vault-target.js`.

**Interfaces:** `queryVault({vault, query, limit})` returns `{vault, query, searched_root, results}` with bounded candidates and match signals; `listWikiMarkdown(vault, profile)` returns vault-relative wiki Markdown paths, excluding configured sources and internal directories.

- [ ] Write tests for a standard vault, a root-level adopted vault, Chinese phrase matching, configured source exclusion, symlink exclusion and a limited ranked result set.
- [ ] Run `node --test tests/vault-query.test.js` and observe missing-behavior failures.
- [ ] Implement the walker and read-only query using `loadProfile`, safe paths and no hard-coded vault layout.
- [ ] Run focused and complete tests.

### Task 3: Profile-driven note validation

**Files:** Create `scripts/check-notes.js`, `tests/check-notes.test.js`; reuse `scripts/wiki-files.js`.

**Interfaces:** `checkNotes({vault, note})` returns `{vault, checked_notes, issues}`. Omitted `note` checks every wiki Markdown file; a selected note must be within the configured wiki directory.

- [ ] Write tests for valid standard provenance, missing wikilinks/images, ambiguous wikilinks, out-of-range evidence, source hash mismatch, and adopted notes without standard frontmatter.
- [ ] Run `node --test tests/check-notes.test.js` and observe missing-behavior failures.
- [ ] Implement link and evidence checks without modifying notes, honoring profile paths and symlink boundaries.
- [ ] Run focused and complete tests.

### Task 4: Wire the Skill and prove the workflow

**Files:** Update `SKILL.md`, `references/ingest-workflow.md`, `README.md`.

**Interfaces:** Agent queries candidate notes before a compilation plan and runs `check-notes.js` after writing, then `check-vault.js` for source integrity.

- [ ] Document the query and note-check commands, result interpretation and standard/adopted distinction.
- [ ] Run a temporary-vault Skill trial and inspect the actual notes, links and evidence.
- [ ] Run `npm test`, `quick_validate.py`, `git diff --check` and review changed files before reporting completion.
