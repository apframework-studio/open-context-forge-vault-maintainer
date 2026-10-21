# Public release readiness

This repository remains **private**. Changing its visibility requires a separate decision.

## Prepared

- MIT license is present.
- The main README is in English, with a linked Simplified Chinese README.
- GitHub has a project description and relevant topics.
- A CI workflow is configured to run tests on Node.js 20 and 22.
- Local tests and Skill metadata validation pass.
- A basic scan of tracked files found no machine-specific vault paths or common credential patterns. This is not a comprehensive secret audit.

## Before making the repository public

1. Decide whether to translate `SKILL.md` and its detailed references into English. The English README currently points to Chinese operational instructions.
2. Push the documentation and CI workflow to the private repository, then confirm that the GitHub Actions run passes. Test installation from a fresh clone and exercise both a new vault and an adopted vault.
3. Review the complete Git history, examples, and any future assets for credentials, personal paths, private article text, and material requiring attribution. Recheck immediately before changing visibility.
4. Review public support expectations: issue handling, vulnerability reporting, compatibility claims, and a first tagged release or changelog if needed.
5. Confirm how this Skill should link to the broader Open Context Forge project once that project is ready to be referenced publicly.

Do not change repository visibility as part of this checklist.
