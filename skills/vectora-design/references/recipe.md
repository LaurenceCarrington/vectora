# Offline authoring recipe

A recipe is input to the builder, not a file Vectora can open directly. The output is the native `.vectora` document. All geometry is in mm, with +X right and +Y down. Do not snap or round exact dimensions unless the user asks.

Default to one `.vectora` containing the complete design, including multiple floor plans, views or variants. Arrange them using document-space offsets and descriptive names/layers while preserving full-size mm geometry and globally unique object IDs; use an infinite canvas when needed. Keep the recipe in a task-specific temporary directory. Deliver recipes, separate native files or additional formats only when explicitly requested; see the [delivery policy](../SKILL.md#default-delivery-one-native-file).

```json
{
  "format": "vectora-design",
  "version": 1,
  "units": "mm",
  "canvasSize": {"kind": "fixed", "width": 120, "height": 80, "unit": "mm"},
  "objects": [
    {"type": "rectangle", "id": "plate", "name": "Plate", "layer": "cutline", "x": 10, "y": 10, "width": 100, "height": 60},
    {"type": "circle", "id": "hole", "name": "Hole", "layer": "cutline", "cx": 20, "cy": 20, "radius": 3}
  ]
}
```

The default layers are Artwork, Cut Path, Engrave Path, Construction Path and Raster Engrave, matching the current application. Their IDs/roles are `artwork`, `cutline`, `engrave`, `construction`, `raster`. Empty default layers are harmless. Objects default to Artwork. Use Cut Path for cuts and Engrave Path for engraving; colour alone does not select an operation. Raster image payloads are not supported by this vector recipe builder.

Custom `layers` replace the defaults entirely. Each needs `id`, `name`, `role`; `visible` defaults true and `locked` false. A six-digit `colour` override is allowed only on a custom ID (not any default role ID). Assign each object by layer **ID**. `activeLayerId` defaults to the first Artwork layer, then the first layer. IDs use letters, numbers, underscore or hyphen, 1–100 characters. Object IDs are globally unique; omitted IDs are deterministic `object-N` values, so explicit IDs should use descriptive names to avoid collisions.

| Type | Required geometry | Meaning |
| --- | --- | --- |
| `rectangle` | `x`, `y`, `width`, `height` | Top-left corner; positive width/height |
| `circle` | `cx`, `cy`, `radius` | Four connected cubic spans, matching the normal circle representation |
| `ellipse` | `cx`, `cy`, `rx`, `ry` | Positive half-width/half-height |
| `polygon` | `cx`, `cy`, `radius`, `sides` | Regular polygon, 3–64 sides; optional clockwise `angle` in degrees from +X |
| `line` | `points: [[x1,y1],[x2,y2]]` | Open two-anchor path |
| `polyline` | `points: [[x,y],...]` | Open path with at least two anchors |
| `path` | `closed`, `segments` | Native six-number Bézier segments; see the format reference |
| `compound` | `contours: [...]` | Primitive/path definitions grouped into one object, without new connections |
| `text` | `content`, `x`, `y` | Filled, editable Lato text with exact stored glyph outlines |
| `dimension` | `points: [[x1,y1],[x2,y2]]`, `position: [x,y]` | Native independent measurement or leader annotation, in Artwork |
| `arrow` | `points: [[x,y],...]` | Open shaft and arrowhead(s) grouped into one native compound |

Dimensions and radii must be at least 0.001 mm. The builder bakes all geometry into document coordinates. It has no generic transform or SVG-import option. Text supports its own rotation/alignment; generate rotated points/handles yourself for other ordinary shapes and preserve exact relative handle vectors. Unknown recipe fields are errors, so misspellings cannot silently change a design. Helper types cannot be children of `compound.contours`; each already generates one complete native object.

Common object options: `id`, `name`, `layer`, `visible`, `locked`, `style`. Children in `compound.contours` specify geometry only: object identity and style belong to the compound parent. Place outer and inner closed contours in a compound to keep a perforated part together; `evenodd` is the default fill rule. Independent cut paths can also describe holes using nested geometry. Do not repeat the first anchor at the end of a closed contour; `closed: true` creates that segment.

`style` overrides any native style field. Default artwork is unfilled charcoal, cuts red, engravings blue and construction magenta; custom layer ink takes precedence. Default line widths match the editor's non-scaling strokes (1 for Artwork, 1.5 for operation layers). Use `scaling: true` and a width in mm for a physical-width stroke. Fill may be `null` or a native colour; use `null` for ordinary outlines and cut geometry. Gradient/pattern metadata requires coordinated native style data and is not generated automatically.

## Labels, dimensions and arrows

```json
[
  {"type":"text","id":"room-label","content":"KITCHEN\n4.2 × 3.6 m","x":2000,"y":1500,"size":220,"align":"center"},
  {"type":"dimension","id":"width","kind":"linear","axis":"x","points":[[0,0],[4200,0]],"position":[0,-500],"size":200},
  {"type":"arrow","id":"direction","points":[[0,0],[10,0]],"ends":"end","headLength":2.2,"headWidth":1.4}
]
```

The array above is an `objects` array, not a complete recipe. Every helper accepts the common ID/name/layer/visibility/lock/style fields and produces one native compound. Expanded contours/segments count against normal native budgets; exact geometry and metadata must both fit coordinate limits.

**Text:** `size` is em height in mm (0.1–1000, default 3.2), not a point size or guaranteed glyph height. `fontId` currently accepts only `lato`; other native fonts remain valid when preserving existing documents. `x,y` position the font's top-of-em origin. `align` is `left` (default), `center` or `right`, relative to the widest line's advance; it shifts the entire block, with lines left-justified within that block. `angle` rotates clockwise in degrees about `x,y`. Newlines use 1.2 em line spacing; CR/CRLF normalize to newlines and tabs to four spaces. Glyphs and pair kerning match the application's Lato text routine without ligature substitution. Content must include visible supported glyphs and be at most 500 characters. Unsupported glyphs fail explicitly rather than becoming missing-character boxes. Text is filled in its layer colour with no stroke and uses the native text `nonzero` fill rule; `style.fill` can override the colour, while null fill or a visible stroke is rejected. Stored outlines, glyph mappings and affine metadata preserve native text editing, transforms and export.

**Dimensions:** `kind` is `aligned` (default), `linear`, `radial`, `diameter` or `leader`. The two `points` are measured endpoints for aligned/linear, centre and radius reference for radial/diameter, or arrow tip and elbow for leader. `position` is the placement/label reference. Linear `axis` is `x` or `y`; when omitted it is chosen from placement as in Vectora. Only leaders accept `text`, which must be nonblank and at most 5000 characters. Other labels are calculated from the measurements and use the editor's current measurement-display preferences when opened. These are independent reference measurements, not constraints linked to source objects.

Dimension `size` sets the annotation label em size (0.1–1000 mm, default 3.2) and proportionally scales arrowheads, extension gaps and label spacing. Local reference coordinates and the native affine transform are scaled together, preserving measured document-mm distances. Defaults match `src/dimensions.ts`: 3.2 mm label, 2.2 mm arrow length, 1.4 mm full arrow width, 1 mm extension gap and 2 mm overrun. The builder emits stroke geometry plus `data.dimension`; Vectora renders the label once from that metadata. No duplicate text object is created. Dimensions/leaders require an Artwork-type layer and no fill.

**Arrows:** `points` contains two or more finite points with consecutive points at least 0.001 mm apart. `ends` is `end` (default), `start` or `both`; `headLength` defaults to 2.2 mm and `headWidth` to 1.4 mm, both at least 0.001 mm. The shaft follows the supplied polyline; open V-shaped heads point along its first/last segment. Arrow geometry remains unfilled, uses the layer stroke and has no annotation metadata.

Text/dimensions intentionally receive `EDITABLE_METADATA` lint warnings: structure is checked offline, while font/label consistency needs real app verification. Do not discard metadata or flatten curves to silence these warnings. See the [annotated-plate recipe](../assets/annotated-plate.design.json) for a complete example.

Optional top-level `grid`, `view` and `canvasSize` use the native format. With no canvas specified, the canvas is infinite. With no view specified, the builder centres on geometry at 100% zoom. Canvas `unit` only changes display units: even when it is `in` or `cm`, `width`, `height`, points and handles remain **mm**. Canvas bounds do not clip exports.

From the repository root:

```sh
npm run design:build -- design.design.json --out design.vectora
npm run design:lint -- design.vectora --json
```

Or copy this skill directory and run `node /path/to/vectora-design/scripts/vectora.mjs ...` from any working directory; npm and the application source are not required.
