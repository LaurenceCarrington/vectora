---
name: vectora-design
description: Construct editable native .vectora design files offline from millimetre dimensions, primitives, exact Bézier paths and compound contours, for opening in Vectora. Use for creating design artifacts rather than changing the editor UI.
---

Use the version-1 native document format, not SVG renamed to `.vectora`. Authoring and linting require Node 18+ and only its standard library; they work without npm install, a browser, a server or network access. Resolve paths relative to this skill folder when the checkout is elsewhere.

## Default delivery: one native file

Create and deliver **one `.vectora` file containing the complete design** unless the user explicitly requests separate files or additional formats. Keep multiple floor plans, views, parts or variants in that same document, arranged with clear spacing and organized using descriptive object/layer names. Preserve full-size millimetre geometry; use document-space offsets to separate views rather than rescaling them to fit a screen. Use an infinite canvas when needed, keep object IDs globally unique and retain the intended layer roles.

Recipes and generator scripts are temporary build inputs, not default deliverables. PDFs, SVGs, PNG previews, ZIP bundles, READMEs and separate native documents are produced only when requested. A request for a PDF adds that PDF; it does not imply a request for recipes, previews or a bundle. If native limits prevent a single valid document, explain the specific limit and ask how to divide the design instead of silently splitting it.

For speed, use the offline build-and-lint workflow below. Do not install dependencies, start an app server or build a preview/export pipeline for an ordinary native-file delivery. An in-app check can use an already available app or be performed when explicitly requested; keep the verification status accurate.

## Build and check

1. Establish the required dimensions, layer operations and intended holes/open paths from the user's request. Do not guess material thickness, kerf, tolerances or minimum feature sizes; those are separate design decisions.
2. Read [the recipe guide](references/recipe.md) and author a `vectora-design` JSON recipe in a temporary working directory. For exact curves, existing-document edits or advanced native data, also read [the native format](references/native-format.md). Prefer the builder for ordinary shapes; preserve existing coordinates, styles, metadata and layers when editing.
3. Build and lint, using absolute artifact paths or running from the repository root:

   ```sh
   node skills/vectora-design/scripts/vectora.mjs build /tmp/design.design.json --out design.vectora
   node skills/vectora-design/scripts/vectora.mjs lint design.vectora
   ```

   Use a task-specific temporary recipe path; `/tmp/design.design.json` is illustrative. The builder validates before writing and refuses to replace an existing output unless `--force` is explicitly supplied. The linter never rewrites the file. Use `--json` for machine diagnostics or `--strict` to fail on warnings too. Read the warnings; intentional open cuts are allowed and must not be closed just to silence lint.
4. Review dimensions, object counts and bounds against the request. If performing an in-app check, use File → Open to inspect the native file and check a save/reopen round trip before claiming one passed. Otherwise report offline checks only. A clean lint report does not prove manufacturing suitability or rule out arbitrary curve intersections, overlaps, insufficient wall thickness or kerf problems.
5. Deliver one link to the complete `.vectora` file and a brief lint result in the response. Explain any intentional warnings; include other files only as explicitly requested. The user opens the file in Vectora through File → Open / Ctrl or Cmd+O; no server upload or account is required for native import. The current editor opens native files in a new active tab and retains existing document tabs; it does not merge the geometry into the current drawing.

The ready-to-open [mounting plate](assets/mounting-plate.vectora) and its [recipe](assets/mounting-plate.design.json) demonstrate closed cut contours, two circular holes, a separate engraving and a custom Artwork layer. Their dimensions are illustrative, not a machining recommendation.

## Labels, dimensions and arrows

Use recipe `text`, `dimension` and `arrow` helpers instead of writing font/arrow geometry for each design; their fields and examples are in the [recipe guide](references/recipe.md#labels-dimensions-and-arrows). Text uses bundled Lato outlines with native editable text metadata. Dimensions use native independent annotation metadata, with labels rendered by Vectora; keep them in Artwork layers. Arrows are ordinary open compounds. All sizes and coordinates are mm; increase annotation `size` for full-size architectural drawings without rescaling the design.

The [annotated plate](assets/annotated-plate.vectora) and its [recipe](assets/annotated-plate.design.json) demonstrate these helpers together in one document. Their `EDITABLE_METADATA` warnings are intentional: offline lint checks structure but cannot certify font regeneration or label placement. Preserve the metadata and report the verification actually performed.

Portable authoring uses the prepared `assets/Lato-Regular.glyphs.json` and [font license](assets/Lato-OFL.txt). Only font-data maintenance requires the application checkout and its existing `opentype.js` dependency: run `node skills/vectora-design/scripts/prepare-font.mjs` after changing the source Lato font, or add `--check` to detect drift. Do not run this maintenance step when creating an ordinary design.

For a complete portable kit, copy both skill folders so the optional cross-skill links resolve. For lint repair and format/tooling development, use [vectora-design-lint](../vectora-design-lint/SKILL.md). Do not translate SVG `d` strings directly into the native segment array: native handles are **relative vectors**, not absolute control-point coordinates. Ordinary paths do not need circle, arc, text or annotation metadata.
