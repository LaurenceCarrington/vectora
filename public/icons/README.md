# Vectora interface icons

The shared SVG symbols in `index.html` and the local `reference/design-system.html` use **Tabler Outline 3.50.0**, plus purpose-built Vectora CAD extensions. The same symbols serve toolbar buttons, menus, panels, dialogs, notifications, search and the reference catalogue.

- Upstream: https://github.com/tabler/tabler-icons/tree/v3.50.0
- Package: `@tabler/icons@3.50.0`, `icons/outline/`.
- License: [Tabler MIT license](Tabler-LICENSE.txt), retained verbatim.
- Coverage: 112 Tabler mappings and 34 CAD extensions (146 shared symbols).
- Each symbol records its exact upstream name or original CAD identity in `data-icon-source`. Existing `i-*` identifiers remain stable.

## Rendering and adaptations

Only used SVG geometry is bundled inline; there is no runtime library, icon font or external request. The upstream empty bounding path is removed. Tabler's root sizing and 2-unit stroke are replaced by Vectora's shared 16/20/24px sizes and `--icon-stroke: 1.75` on a 24-unit viewBox. Symbols inherit `currentColor` and use round caps/joins. Pictograms remain unfilled, including the Colour fill bucket; the native Tabler focus-point dot retains its tiny ink fill. Theme and active-state colours are supplied by the shared stylesheet.

Custom CAD extensions are original Vectora drawings using those same visual rules: `polyline`, `pattern-circular`, `explode`, `convert-text`, `chamfer`, `node-smooth`, `node-corner`, `node-split`, `hinge-pattern`, `maze`, `paint-numbers`, `halftone`, `truss`, `arc`, `offset`, `intersect`, `grid-isometric`, `close-path`, `z-position`, `dimension-aligned`, `dimension-linear`, `dimension-radial`, `dimension-diameter`, `leader`, `arc-endpoints`, `arc-three-point`, `dissect-delete`, `line-delete`, `view-front`, `view-left`, `view-right`, `view-top`, `view-back`, `view-iso`. They describe exact CAD operations where a general-purpose pictogram would be ambiguous. View-control hatching identifies the corresponding cube face without colour fills.

The Vectora favicon, document artwork, generator previews, dimension graphics and the dedicated overlapping-square canvas duplicate handle are not interface-library icons.

When changing an icon, update the application and reference symbols together, retain the source metadata, and update the reference catalogue. Keep shared styles mirrored in `src/design-system.css`.
