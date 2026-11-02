# Offline authoring recipe

A recipe is input to the builder, not a file Vectora can open directly. The output is the native `.vectora` document. All geometry is in mm, with +X right and +Y down. Do not snap or round exact dimensions unless the user asks.

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

Dimensions and radii must be at least 0.001 mm. The builder bakes all geometry into document coordinates. It does not have transform, text-shaping or SVG-import options. Generate rotated points/handles yourself when needed; preserve exact relative handle vectors. Unknown recipe fields are errors, so misspellings cannot silently change a design.

Common object options: `id`, `name`, `layer`, `visible`, `locked`, `style`. Children in `compound.contours` specify geometry only: object identity and style belong to the compound parent. Place outer and inner closed contours in a compound to keep a perforated part together; `evenodd` is the default fill rule. Independent cut paths can also describe holes using nested geometry. Do not repeat the first anchor at the end of a closed contour; `closed: true` creates that segment.

`style` overrides any native style field. Default artwork is unfilled charcoal, cuts red, engravings blue and construction magenta; custom layer ink takes precedence. Default line widths match the editor's non-scaling strokes (1 for Artwork, 1.5 for operation layers). Use `scaling: true` and a width in mm for a physical-width stroke. Fill may be `null` or a native colour; use `null` for ordinary outlines and cut geometry. Gradient/pattern metadata requires coordinated native style data and is not generated automatically.

Optional top-level `grid`, `view` and `canvasSize` use the native format. With no canvas specified, the canvas is infinite. With no view specified, the builder centres on geometry at 100% zoom. Canvas `unit` only changes display units: even when it is `in` or `cm`, `width`, `height`, points and handles remain **mm**. Canvas bounds do not clip exports.

From the repository root:

```sh
npm run design:build -- design.design.json --out design.vectora
npm run design:lint -- design.vectora --json
```

Or copy this skill directory and run `node /path/to/vectora-design/scripts/vectora.mjs ...` from any working directory; npm and the application source are not required.
