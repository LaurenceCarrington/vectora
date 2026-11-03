# Native Vectora document v1

The authoritative reader/writer is `src/documentFormat.ts` (`prepareDocument`, `decodeDocument`, `encodeDocument`). Limits come from `src/processingLimits.ts` and `src/units.ts`; canvas/grid rules come from `src/canvasSize.ts` and `src/gridSettings.ts`. Verify those sources before changing this reference or the independent offline validator. This format is not Paper.js export JSON, SVG, DXF, or a runtime/history snapshot.

## Envelope

```json
{
  "format": "vectora",
  "version": 1,
  "units": "mm",
  "rasterLayerInitialized": true,
  "grid": {"type": "square", "spacing": 10, "angle": 15},
  "canvasSize": {"kind": "infinite"},
  "activeLayerId": "artwork",
  "layers": [{"id": "artwork", "name": "Artwork", "role": "artwork", "visible": true, "locked": false, "objects": []}],
  "view": {"zoom": 3.7795275590551185, "center": [100, 70]}
}
```

Each layer is `{id,name,role,visible,locked,objects}`; custom layers may also have `colour: "#RRGGBB"`. Roles: `artwork`, `cutline`, `engrave`, `construction`, `raster`. IDs match `[A-Za-z0-9_-]{1,100}` and layer IDs are unique. The reserved `artwork` and `cutline` IDs require their corresponding roles. Default role IDs cannot have custom colour overrides. Layer names are nonblank, at most 200 characters. Set `rasterLayerInitialized: true` to prevent a legacy migration from adding a raster layer. Missing reserved layers are represented internally as deleted defaults on import.

The view uses zoom as CSS pixels per mm, **not a percentage**. 100% is `96 / 25.4`. Supported zoom is 0.1–100, with centre coordinates bounded like other points. Missing or invalid view state resets the camera without rejecting the geometry. `activeLayerId` should name an existing layer; the native reader falls back when it does not, while the offline linter treats the mistake as an error.

`canvasSize` is `{kind:"infinite"}` or `{kind:"fixed",width,height,unit}`. Fixed width/height are 0.1–10000 **mm**; `unit` is `mm`, `cm` or `in` for display only. Missing canvas/grid settings use defaults. Grid types: `square`, `isometric`, `polar`, `hexagonal`, `triangular`, `dot`, `none`; spacing 0.1–1000 mm; angle one of 5, 10, 15, 20, 30, 45, 60, 90 degrees.

## Objects and exact curves

```json
{
  "kind": "path",
  "contours": [{"closed": true, "segments": [[10,10,0,0,0,0],[50,10,0,0,0,0],[50,30,0,0,0,0],[10,30,0,0,0,0]]}],
  "data": {"uid": "rectangle-1", "role": "artwork", "name": "Rectangle"},
  "visible": true,
  "locked": false,
  "style": {"fill": null, "stroke": "#383838", "width": 1, "scaling": false, "fillRule": "evenodd", "cap": "round", "join": "round", "miter": 10, "dash": [], "offset": 0, "opacity": 1}
}
```

Native kinds are only `path` (exactly one contour) and `compound` (one or more independent contours). Rectangles, circles and polygons are stored as paths. Object `data.uid` is globally unique across all layers. `data.role` should match the layer; the importer derives it from that layer. Object names are at most 500 characters. Grouping contours into a compound does not connect or Boolean-union them. The parent holds style and metadata. `evenodd` preserves nested holes independently of winding direction when filled.

Each segment is `[x,y,inX,inY,outX,outY]`. All six values are finite mm values, bounded to ±1,000,000. Handles are **relative to their own anchor**. For consecutive anchors A and B, the cubic is:

- P0 = `[A.x,A.y]`
- P1 = `[A.x+A.outX,A.y+A.outY]`
- P2 = `[B.x+B.inX,B.y+B.inY]`
- P3 = `[B.x,B.y]`

For example, `[[0,0,0,0,10,20],[30,0,-10,20,0,0]]` is one open cubic. Zero handles describe straight spans. Set `closed: true` to connect the last anchor to the first without repeating it. Coordinates are already in document space; there is no object transform field in v1. Bake transforms into both anchors and relative handle vectors. Curve bounds, including interior extrema, must also fit ±1,000,000 mm. Do not flatten or round curves to make a file pass validation.

## Required style fields

| Field | Domain |
| --- | --- |
| `fill`, `stroke` | `null`, native solid colour string or native gradient object |
| `width` | 0–10000; document mm when `scaling:true`, screen-sized width when false |
| `scaling` | Boolean |
| `fillRule` | `nonzero` or `evenodd` |
| `cap` | `butt`, `round`, `square` |
| `join` | `miter`, `round`, `bevel` |
| `miter` | Finite, magnitude ≤10000 (prefer a positive conventional value, e.g. 10) |
| `dash` | Up to 1000 numbers, each 0–10000 |
| `offset` | Finite, magnitude ≤1,000,000 |
| `opacity` | 0–1 |

Prefer six-digit hex solids. The current native reader also admits `#` plus 3–8 hex digits and numeric `rgb(...)` / `rgba(...)` strings. A gradient is `{type:"gradient",radial:boolean,stops:[{colour,opacity,offset},...],origin:[x,y],destination:[x,y],highlight:null|[x,y]}` with 2–8 solid-colour stops, each offset/opacity 0–1. `highlight` is required, usually null. Editor pattern fills additionally coordinate highlight and `data.fillPaint`; do not invent just one half of that representation.

## Optional metadata

Ordinary geometry needs only uid, name and role. The importer discards unknown metadata. Do not add semantic metadata merely because a shape looks like an arc or a letter:

- `rotationDegrees`: finite accumulated rotation, magnitude ≤1e12. Geometry must already be rotated; this field does not transform it.
- `sides`: integer 3–64 for a genuine regular polygon. Clear after arbitrary node edits.
- `joined`, `regionFill`, `customStroke`: booleans; `customColour`, `regionFillColor`: native solid colour or null. `customColour` prevents theme updates from recolouring custom neutral Artwork. Fill/region metadata is meaningful only with corresponding actual geometry/style.
- `arc`: `{cx,cy,radius,start,sweep}`, radius 0.001–1,000,000, signed sweep ±1–359°. Must be an open path with 1–4 equal-angle tangent-cubic spans, each ≤90° (native legacy allowance applies), with every anchor and handle matching `src/geometryCore/circularIdentity.ts`. Generic curved paths should omit arc metadata; otherwise import can reject them or later edits can misbehave.
- `text`: actual stored glyph outlines **plus** `{content,fontId,sizeMM,transform,glyphContours,glyphLabels}`. Content is nonblank, ≤500 characters; size 0.1–1000 mm; transform is `[a,b,c,d,tx,ty]`; glyph arrays have equal length ≤500, contour counts are integers 0–2000, labels ≤20 characters. Supported native font IDs are listed in `scripts/geometry.mjs` and checked against `src/text.ts` by integration tests. A bare text string is insufficient. The recipe `text` helper creates editable Lato text from bundled glyph outlines; it does not add font dependencies to portable authoring. Preserve existing valid text for other native fonts. Lint warns that glyph/transform consistency still needs an in-app check.
- `dimension`: annotation metadata uses one of `dimension-aligned`, `dimension-linear`, `dimension-radial`, `dimension-diameter`, `leader`, exactly three `[x,y]` points, an affine transform, optional axis `x`/`y` and text ≤5000 characters. The recipe `dimension` helper creates matching open annotation paths and metadata; labels are rendered by the application, not stored as extra glyph contours. Its `size` option scales local points and the affine matrix together without changing measured distances. Keep annotations in Artwork and validate in-app before relying on later edits.
- `fillPaint`, `rasterTrace`: keep coherent existing appearance/provenance; consult `src/fillPaint.ts` and the reader before authoring these advanced fields. Vector tracing provenance is not an embedded raster image.

## Limits, lint and opening

Maximum native file size is 50 MiB; at most 1000 source layers, 20000 objects, 50000 contours and 500000 segments. Empty contours count against the budget. The standalone CLI checks file size before reading and geometry counts before expensive bounds work.

```sh
node skills/vectora-design/scripts/vectora.mjs lint output.vectora --json
```

Errors identify importer/schema defects, or stricter authoring mistakes such as mismatched roles and missing active layers. Warnings flag design risks or normalizations. The linter is read-only: it does not close open cuts, move off-canvas geometry, change layers/roles, discard metadata, flatten curves or certify a manufacturing job. Duplicate checking covers identical ordered contour data within a process role; it does not find rotated-start/reversed/reparameterized duplicates, all intersections, material clearances, wall thickness or kerf. Diagnostics are capped at 1000 entries, while full error/warning counts and failure status remain correct.

Use **File → Open** / **Ctrl or Cmd+O** in Vectora and choose the `.vectora` file. The current native Open creates a new active document tab, retaining existing tabs; it is not an SVG import or a merge into an existing drawing. For DXF, include Artwork when required; construction geometry is excluded, while hidden process paths can still be included. SVG and 3D use their visibility/role policies. Inspect the result and save/reopen when editable text, arcs or annotations matter.
