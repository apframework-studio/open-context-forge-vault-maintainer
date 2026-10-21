# Vault Maintainer Bootstrap Implementation Plan

> **For agentic workers:** Use the repository spec and complete each checked task with fresh tests. This plan is executed inline in the current session.

**Goal:** Initialize a usable standalone article-to-vault Skill with explicit multi-vault selection and safe blank-vault creation.

**Architecture:** Keep Agent judgment in `SKILL.md` and references. Node built-in scripts own deterministic vault resolution, initialization, source snapshots and structural checks. A per-vault JSON manifest records source identity without binding the vault to a machine path.

**Tech Stack:** Node.js 20+ built-ins, Markdown, JSON, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-21-vault-maintainer-bootstrap-design.md`

## Global Constraints

- All writes require explicit vault selection.
- Existing nonempty directories are not initialized or overwritten.
- Raw source snapshots are immutable; duplicate content is idempotent.
- No third-party runtime dependency or machine-specific path is committed.

---

### Task 1: Vault selection and initialization

**Files:** Create `scripts/vault-target.js`, `scripts/init-vault.js`, `scripts/adopt-vault.js`, `tests/vault-init.test.js`, `config/vaults.example.json`.

**Interfaces:** `resolveVault({selector, configPath})` returns an absolute target path; `initializeVault(path, {purpose})` and `adoptVault(path, {sourcesDir, wikiDir})` return the vault ID and paths.

- [x] Write tests for explicit path, named configuration with relative paths, missing selector, new vault, repeated init, nonempty directory, and adoption of existing vaults.
- [x] Run `node --test tests/vault-init.test.js` and confirm the missing implementation fails.
- [x] Implement `resolveVault`, `initializeVault` and `adoptVault` using Node built-ins and the exact standard files in the spec.
- [x] Run the focused test until it passes.

### Task 2: Source snapshot and validation

**Files:** Create `scripts/import-markdown.js`, `scripts/source-context.js`, `scripts/check-vault.js`, `tests/source-ingest.test.js`.

**Interfaces:** `importMarkdown({vault, file, url})` returns the snapshot path and duplicate status; `sourceContext(vault, source, ranges)` returns hash, sections, and bounded evidence; `checkVault(vault)` returns structural issues.

- [x] Write tests for first import, duplicate import, same-URL changed content, source path containment, evidence lines, and manifest path checks.
- [x] Run `node --test tests/source-ingest.test.js` and confirm the missing implementation fails.
- [x] Implement source snapshot, context, and validation scripts using the profile created by Task 1.
- [x] Run the focused tests until they pass.

### Task 3: Skill package and user documentation

**Files:** Create `SKILL.md`, `references/ingest-workflow.md`, `references/vault-layout.md`, `assets/templates/source-analysis.md`, `assets/templates/compilation-plan.md`, `README.md`, `AGENTS.md`, `package.json`.

**Interfaces:** The Skill invokes the tested CLI scripts and produces analysis and plan artifacts before Wiki writes.

- [x] Run a read-only baseline scenario without the new Skill and record missing choices. The baseline is captured in this conversation.
- [x] Write instructions and templates that settle target selection, provenance, evidence, deduplication and writeback decisions from that baseline.
- [x] Validate Skill metadata with `quick_validate.py` and run a realistic temporary-vault trial.
- [x] Run the complete test command and inspect Git diff before reporting completion.
