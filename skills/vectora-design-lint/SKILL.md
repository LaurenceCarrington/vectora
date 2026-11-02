---
name: vectora-design-lint
description: Lint native .vectora design files, interpret geometry and import diagnostics, and maintain the offline builder and validator as the native document format evolves. Use for design-file validation rather than UI CSS linting.
---

The dependency-free linter lives with the authoring skill. Run from the repo root, or resolve its script relative to this folder:

```sh
node skills/vectora-design/scripts/vectora.mjs lint drawing.vectora --json
node skills/vectora-design/scripts/vectora.mjs lint drawing.vectora --strict
```

Exit 0 means no errors (and, with `--strict`, no warnings); exit 1 means invalid JSON/design or strict-warning failure; exit 2 means usage/filesystem failure. JSON output always has a `files` array containing `file`, `ok`, `errors`, `warnings`, `truncated`, `issues` and, for parsed designs, `summary`. Each issue has `severity`, stable `code`, JSON `path` and actionable `message`. No file is rewritten.

Read [the native format reference](../vectora-design/references/native-format.md) when constructing or repairing native fields. Fix errors against the source recipe when available, rebuild to a new output, and rerun lint. Preserve source curves, dimensions, object identity and intended operations. Resolve ambiguous design choices with the user instead of automatically closing cuts, removing duplicate-looking geometry or changing their dimensions. Explain intentional warnings. An `EDITABLE_METADATA` warning means the shape's schema can be checked offline but font/annotation behavior still needs an in-app edit and save/reopen check.

For future tooling or format development:

1. Read `src/documentFormat.ts` and its relevant limits, geometry, font, grid and canvas validators. The native importer is the authority; do not weaken it to accommodate generated output.
2. Add a failing meaningful test in `skills/vectora-design/tests/*.test.mjs`, then update `scripts/build.mjs`, `scripts/geometry.mjs`, `scripts/lint.mjs` or `scripts/vectora.mjs` as needed. Keep CLI runtime dependencies at zero. Check malformed inputs, immutable lint behavior, allocation limits, correct status codes and output overwrite protection as appropriate.
3. Run `npm run design:test`. When the native format or geometry generation changes, also run `npx playwright test tests/offlineDesign.spec.ts --reporter=line` in this checkout: it exercises actual browser decoding, File Open, save/reopen and shared limit/font drift checks. The browser integration test stays local under the repository's existing test policy; the Node self-tests travel with the skill kit. A harness using only a copied kit can run Node tests, but must report that native-import parity was not checked if it has no app checkout/browser tests.
4. Update the native-format/recipe references, example recipe/output, and root `AGENTS.md` commands or limitations in the same task. Run `npm run build` for application or package changes. If the file version changes, add explicit handling/tests; do not silently relabel or rescale old files.

This linter intentionally does not certify all curve intersections, contour winding for nonzero fills, manufacturing clearances, kerf or machine settings. Keep these limits explicit when reporting a clean file. For creating a new design use [vectora-design](../vectora-design/SKILL.md).
