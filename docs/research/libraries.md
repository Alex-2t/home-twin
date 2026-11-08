# Libraries and assets (2026-11-03)

**Status as of 2026-11-07:** the base choice is already implemented — our own editor on three.js and polygon-clipping ([package.json](../../editor/package.json), D-009/D-016). Pascal, openPlan3D and CSG are not used. The survey below is kept as of the research dates; versions, licenses and external services were not re-verified in this review.

Licenses and contents were checked on GitHub pages; no code was run except our own sketch.

## Plan editors

| Project | What it is | License | Notes |
|---|---|---|---|
| [Pascal Editor](https://github.com/pascalorg/editor) | 3D building editor on React Three Fiber: walls with joints and cutouts for doors and windows, floors from an outline, furniture placed on the floor, walls, ceiling | MIT | ~25k stars, 2,200 commits, npm packages (`@pascal-app/editor`, `core`, `viewer`). No 2D plan view, heavy React dependency. Export to `.glb` is not mentioned |
| [openPlan3D](https://github.com/laanlabs/openPlan3D) | 2D plan editor with a 3D view on SvelteKit + three.js: walls with snapping, many door and window types, a furniture catalog | MIT | ~270 stars. An application, not a library. Export: SVG, DXF, PDF, PNG, JSON, no `.glb` |
| [react-planner](https://github.com/alexlol76/react-planner) (cvdlab) and forks | 2D/3D planner | MIT | Looks abandoned (last push ~2 years ago) |
| [threejs-3d-room-designer](https://github.com/CodeHole7/threejs-3d-room-designer), [Home_View](https://github.com/lohith9/Home_View), [openfpc](https://www.npmjs.com/package/%40socialtables%2Fopenfpc) | Small or old | various | Do not use as a base |
| NeonPlan 3D | Competitor | MIT | The code can be used with attribution, but that loses our differentiation |

## Our own on three.js
- Walls are extruded outlines (`ExtrudeGeometry`), openings are layers by height or via `three-bvh-csg`, scene export is the built-in `GLTFExporter`.
- The [walls-from-json](../../prototypes/walls-from-json/README.md) sketch builds walls from room outlines via `polygon-clipping` (union and subtraction of outlines) without CSG.

## Furniture (free, commercial use allowed)
- [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) — CC0, 140 models, `.glb` available. Toy-like style, scale about half of real size. Used in the sketch.
- [Quaternius](https://opengameart.org/content/furniture-low-poly) — CC0, `.glb` availability not checked.
- Poly Haven — CC0, more realistic, fewer models.

## Scanning
- Apple RoomPlan (iPhone with LiDAR): walls, doors, windows and furniture as boxes in a minute. Format and quality in a real apartment not checked.

## Other programs as a model source
- Sweet Home 3D, SketchUp and Planner 5D export models that the card can load; after that an “assign devices to objects” step is needed.

## Origin of new models and rights (2026-11-04)

We create the basic cabinet furniture and appliances with our own generators in `editor/src/core/furniture3d.js`: generic shapes, simple materials, no copying of any specific branded product. The first item from the researched queue is `fridge`, with our own geometry and materials; no third-party meshes, photographs or textures were used.

For third-party models we keep the source and the license text. The [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit), already in use, is listed as CC0; the local text is [LICENSE-Kenney.txt](../../editor/assets/kenney/LICENSE-Kenney.txt). [CC0](https://creativecommons.org/publicdomain/zero/1.0/) permits copying, modification and distribution, including commercial use, but does not waive others' trademark and patent rights.

Modeling something yourself does not automatically give permission to reproduce someone else's protected design. According to [WIPO](https://www.wipo.int/en/web/designs/faq-industrial-designs), the appearance of furniture and household products may be protected by industrial design rights and, depending on the country and the design's features, by copyright as well. That is why we chose the approach of our own generic items; exact branded copies require a separate rights review. This is a working approach to asset provenance, not a legal guarantee for every country.
