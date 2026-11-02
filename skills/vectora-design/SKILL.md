---
name: vectora-design
description: Construct editable native .vectora design files offline from millimetre dimensions, primitives, exact Bézier paths and compound contours, for opening in Vectora. Use for creating design artifacts rather than changing the editor UI.
---

Use the version-1 native document format, not SVG renamed to `.vectora`. The scripts here require Node 18+ and only its standard library; they work without npm install, a browser, a server or network access. Resolve paths relative to this skill folder when the checkout is elsewhere.

1. Establish the required dimensions, layer operations and intended holes/open paths from the user's request. Do not guess material thickness, kerf, tolerances or minimum feature sizes; those are separate design decisions.
2. Read [the recipe guide](references/recipe.md) and author a `vectora-design` JSON recipe. For exact curves, existing-document edits or advanced native data, also read [the native format](references/native-format.md). Prefer the builder for ordinary shapes; preserve existing coordinates, styles, metadata and layers when editing.
3. Build and lint, using absolute artifact paths or running from the repository root:

   ```sh
   node skills/vectora-design/scripts/vectora.mjs build design.design.json --out design.vectora
   node skills/vectora-design/scripts/vectora.mjs lint design.vectora
   ```

   The builder validates before writing and refuses to replace an existing output unless `--force` is explicitly supplied. Keep the recipe so the user can revise dimensions later. The linter never rewrites the file. Use `--json` for machine diagnostics or `--strict` to fail on warnings too. Read the warnings; intentional open cuts are allowed and must not be closed just to silence lint.
4. Review dimensions, object counts and bounds against the request. If the app is available, use File → Open to inspect the native file and check a save/reopen round trip. A clean lint report does not prove manufacturing suitability or rule out arbitrary curve intersections, overlaps, insufficient wall thickness or kerf problems.
5. Deliver the `.vectora` file, its editable recipe and a brief lint summary, with links to the actual files. Explain any intentional warnings. The user opens the file in Vectora through File → Open / Ctrl or Cmd+O; no server upload or account is required for native import. The current editor opens native files in a new active tab and retains existing document tabs; it does not merge the geometry into the current drawing.

The ready-to-open [mounting plate](assets/mounting-plate.vectora) and its [recipe](assets/mounting-plate.design.json) demonstrate closed cut contours, two circular holes, a separate engraving and a custom Artwork layer. Their dimensions are illustrative, not a machining recommendation.

For a complete portable kit, copy both skill folders so the optional cross-skill links resolve. For lint repair and format/tooling development, use [vectora-design-lint](../vectora-design-lint/SKILL.md). Do not translate SVG `d` strings directly into the native segment array: native handles are **relative vectors**, not absolute control-point coordinates. Ordinary paths do not need circle, arc, text or annotation metadata.
