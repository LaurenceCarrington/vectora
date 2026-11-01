# Vectora

Vectora is a browser-based 2D vector editor for artwork, laser-cut paths and engraving designs. Draw in millimetres, refine exact geometry, save editable `.vectora` documents, and export designs for other tools.

The application runs in the browser, with local image processing and bundled fonts. No backend service or API keys are required to run it.

## Run locally

Use **Node.js 24** to match the deployment workflow, with npm installed.

From the repository directory:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://127.0.0.1:5173`. The development server binds to the loopback interface.

To build and preview the production application:

```sh
npm run build
npm run preview
```

The build writes the static application to `dist/`. Preview normally serves it at `http://127.0.0.1:4173`.

## What you can do

- **Draw:** rectangles, circles, ellipses, polygons, stars, hearts, lines, polylines, freehand strokes and three kinds of circular arc.
- **Edit:** select multiple objects, move, resize, rotate, mirror, duplicate, align and distribute. Refine Bézier nodes, join or explode contours, close paths, offset outlines, and apply boolean operations.
- **Work precisely:** use millimetre measurements, configurable grids, object snapping, numeric properties, dimensions and leader callouts.
- **Add text:** edit text directly on the canvas, choose bundled fonts, and convert lettering to paths. Single-line fonts support engraving workflows.
- **Trace images:** convert raster images into outlines, filled regions or centre lines with a live preview.
- **Apply colour:** fill bounded regions and adjust fills, gradients, patterns and appearance.
- **Generate geometry:** create gears, boxes, living hinges, patterns, puzzles and other procedural designs.
- **Organise documents:** use layers, document tabs, Undo/Redo, editable project files and browser recovery.
- **Preview fabrication:** inspect cut and engraving geometry in a 3D material preview before exporting.

Press **F1** for the built-in guide, or use the magnifying glass in the top toolbar to find a command.

## First drawing

1. Open Layers and select a visible, unlocked Artwork layer.
2. Press **R**, then drag on the canvas to draw a rectangle.
3. Press **V** to select it. Open Properties to enter exact dimensions.
4. For a cutting outline, drag the object from its expanded layer row onto Cut Path.
5. Use **File → Save** to keep an editable `.vectora` document, or **File → Export…** to choose an export format.

Hold **Space** and drag to pan. Scroll over the canvas to zoom; click the footer's zoom percentage to reset to 100%. Press **S** to pause or resume snapping. Configure individual snap modes in Settings → Snapping.

## Documents and exports

`.vectora` files preserve editable geometry, text metadata, styling, layers and view state. Browser recovery provides local workspace copies; save a project file when you need a portable copy.

Where native file pickers are supported, Save can update the selected file. Other browsers use downloads controlled by browser settings. Download fallback cannot confirm that a file was saved, so it keeps unsaved-change protection.

| Format | Purpose |
| --- | --- |
| `.vectora` | Editable project document for reopening in Vectora. |
| SVG | Vector artwork with exact curves, colours and holes; editable lettering exports as outlines. |
| PDF | Vector page output at physical dimensions. |
| PNG | Raster output for sharing or use in image-based workflows. |
| DXF | Cutting and engraving geometry in millimetres, with layer controls and optional Artwork. |
| Laser-compatible DXF | R12 output using basic line segments for restrictive importers. |

Construction geometry and editor overlays are excluded from exports. SVG, PDF and PNG use visible content; hiding a layer does not exclude its geometry from DXF. DXF exports geometry rather than rendered colour fills. When importing laser-compatible R12 DXF, select millimetres in the receiving application and check the imported dimensions.

## Common shortcuts

Use **Cmd** on macOS or **Ctrl** on Windows/Linux. Tool shortcuts apply while focus is outside text fields.

| Shortcut | Action |
| --- | --- |
| V / N | Select / Node editing |
| R / C / E | Rectangle / Circle / Ellipse |
| Y / Shift+Y | Polygon / Star |
| L / P / F | Line / Polyline / Freehand |
| A / Shift+A | Centre arc / Three-point arc |
| T / D / B | Text / Aligned dimension / Colour fill |
| K / Shift+K | Dissect delete / Line delete |
| S | Toggle snapping |
| Escape | Cancel an unfinished action |
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Shift+Z | Redo |
| Ctrl/Cmd+S | Save |
| Ctrl/Cmd+Shift+S | Save As |
| Ctrl/Cmd+O / Ctrl/Cmd+N | Open / New document |
| Ctrl/Cmd+E | Open SVG export settings |
| Ctrl/Cmd+Shift+E | Open DXF export settings |
| F1 | Help |

## Development

Vectora uses TypeScript and Vite, Paper.js for vector geometry, Clipper2 WASM for clipping and offsets, OpenType.js for font outlines, Three.js for 3D previews, and jsPDF/svg2pdf.js for PDF output.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server. |
| `npm run typecheck` | Check TypeScript without emitting files. |
| `npm run build` | Typecheck and create the production build. |
| `npm run preview` | Serve the production build locally. |
| `npm test` | Build, then run the local Playwright suite. |

The repository deliberately excludes `tests/` and `playwright.config.ts` from version control. `npm test` requires those local development files; a fresh clone contains the build inputs, not the browser test suite. The local Playwright configuration uses Google Chrome and starts servers on ports 5174 and 4173. The development test server enables the explicit test harness with `--mode test`; normal builds do not expose it.

### Source layout

| Path | Responsibility |
| --- | --- |
| [index.html](index.html) | Application markup and shared icons. |
| [src/main.ts](src/main.ts) | Application startup, UI wiring and command integration. |
| [src/editor.ts](src/editor.ts) | Canvas interaction, selection and editing. |
| [src/design-system.css](src/design-system.css) | Shared design tokens and component styles. |
| [src/editor.css](src/editor.css) | Editor-specific layout and integration styles. |
| [src/documentFormat.ts](src/documentFormat.ts) | Versioned project serialization and validation. |
| [src/documentFiles.ts](src/documentFiles.ts) | Document tabs, file operations and recovery integration. |
| [src/exportDialog.ts](src/exportDialog.ts) | Export settings and format selection. |
| [src/rasterToVector.ts](src/rasterToVector.ts) | Raster tracing interface. |
| [src/materialPreview.ts](src/materialPreview.ts) | 3D material preview. |
| [src/helpContent.ts](src/helpContent.ts) | Built-in user guide and shortcut reference. |
| [public/fonts/](public/fonts/) | Bundled fonts, stroke data and license notices. |

For editor UI changes, update the local `reference/design-system.html` in the same task. Keep its style block mirrored in `src/design-system.css`, place editor integration rules in `src/editor.css`, and synchronise relevant icons, specimens and descriptions. The design reference and `AGENTS.md` are local development resources excluded by the repository's allowlist; consult them when working in the full development workspace.

### Deployment

The [GitHub Pages workflow](.github/workflows/deploy.yml) runs on pushes to `main` and manual dispatch. It installs dependencies with `npm ci`, checks types, builds with the Pages base path, and publishes `dist/`. Browser regression tests run locally rather than in this workflow.

For another static host, publish `dist/`. When deploying under a subdirectory, set the matching Vite base path at build time, for example:

```sh
npm run build -- --base /vectora/
```

## Icon and font attribution

Interface icons use Tabler Outline with matching Vectora CAD extensions. See [public/icons/README.md](public/icons/README.md) for sources and the bundled MIT license.

Bundled fonts retain their own licenses and notices. See [public/fonts/README.md](public/fonts/README.md) for font sources, licensing and single-line engraving data provenance.
