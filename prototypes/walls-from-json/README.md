# Sketch: walls from JSON + `.glb` furniture + card lighting

**Historical sketch.** Product development continues in [editor/](../../editor/README.md). The capabilities, measurements and lists of what is missing below refer to this sketch; the current queue is in [status.md](../../docs/status.md).

A check of decisions D-005 and D-006 (2026-11-03). The apartment from `3d_floor` without Blender: walls, floor, doors and windows are built in the browser from the room outlines, and the lighting is the card's code, unchanged. The furniture in the bedroom and kids' room is custom, cut out of `apartment.glb` (D-008); the other rooms use the Kenney kit. The “Bedroom and kids' room” button switches between the custom furniture and Kenney.

## How to build
```
npm i
node extract-own.mjs   # custom furniture from apartment.glb → own/*.glb (only needed when the model changes)
node build.mjs         # → index.html, a single file with the furniture embedded (~4 MB)
```
The build takes from the neighbouring repository `../../../3d_floor/apartment/smart-home/web`:
- `src/lighting.js` and `src/room-light-mask.js` — lamp and strip lighting and the “light stays inside the room” mask;
- `public/devices.json` — room outlines and lamp positions;
- `dist/apartment.glb` — only for `extract-own.mjs`, the source of the custom furniture;
- `node_modules` (three 0.186.1, esbuild, gltf-transform, meshoptimizer).

## What is where
- `own/plan.js` — openings (doors and windows), furniture placement and light strips of the owner's apartment. Doors and windows are placed by eye. Like everything else in `own/`, it is local only: it is not in the repository.
- `main.js` — the generator: outlines → walls (interior, plus the facade on four sides), height layers for the openings, floors with procedural textures, lighting and render settings as in the card.
- `models/` — 41 models from the Kenney Furniture Kit, CC0 (`LICENSE-Kenney.txt`).
- `extract-own.mjs` — cuts items out of `apartment.glb` by object name, moves the origin to the floor at the centre of the item, compresses with meshopt.
- `own/` — 15 custom furniture items (1.6 MB) and `placements.json`: sizes and where each one stood in the Blender model. This is the apartment's personal furniture and does not go into the public repository.

## How the walls are built
1. Each room is shrunk by 5 cm — this is the inner face of the wall.
2. The apartment outline is the union of the rooms expanded by 25 cm.
3. Walls = outline minus the shrunk rooms.
4. A wall close to two rooms (within 22 cm of each) is interior; the rest is facade. The facade is split into four sides, and the side facing the camera is hidden.
5. The height is cut into layers at the bottom and top of the openings; in each layer, the openings that overlap it are subtracted.

Coordinates are rounded to 1 mm: without this, `polygon-clipping` crashes on nearly coincident points.

## What we see
- The light falls the same way as in the card; the per-room mask works on the generated walls.
- The card's daylight overexposes light materials — it is reduced in the sketch.
- The Kenney furniture looks toy-like — the main visual difference from the Blender model.
- The custom furniture on the generated walls looks as in the card: the same materials and textures, lamp and strip light falls on it and stays inside the room. Next to Kenney in neighbouring rooms the mix of styles is noticeable (D-007).
- A tall wardrobe by the outer wall blocked the bedroom when the facade was hidden. Such an item is tagged with its facade side in `own/plan.js` and is hidden together with it.
- The heaviest item is the workplace (133 objects, 0.7 MB): chair, laptop, cables. Such details are unnecessary for a free kit.
