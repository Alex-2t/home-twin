# Ideas

Reviewed 2026-11-07. This file keeps proposals and already implemented ideas with links to decisions. The current development queue is in [status.md](status.md); an idea being recorded does not mean it has been included in the nearest release.

## A custom colour wherever there is a colour (owner, 2026-11-09) — done, re-checked 2026-11-14 (D-070, D-NEXT)

Every colour choice in the editor offers the predefined swatches **and** a custom colour (`#rrggbb`, a colour picker); a picked colour within ΔE 3 of a swatch selects that swatch. The paid AI build (D-063) needs it too: colours taken from a real home rarely match a named one (a real rug was ΔE 11.7 from the nearest named colour).
- **Done 2026-11-10 (D-070):** every catalog model and generator, the furniture panel's custom colour, the rug's border colour, plan files.
- **Re-checked everywhere 2026-11-14** (the owner's parked check): a plan with a custom colour on every catalog model in every variant, the rug's border, the worktop, every finish and piece of finish, an item from parts, a sensor's digits and a lamp, taken through the plan file, the panel's picker, undo and redo, a version, a save and reload, an export and import, and the dashboard card; every item's colour found in the 3D. Kept as a test (`colour-everywhere.test.ts`).

  | Place | Swatches + custom | Kept (file, undo, versions, export, card) | Drawn |
  |---|---|---|---|
  | Catalog models and generators, every variant; curtains and blinds, also those placed as HA covers | yes | yes | 3D, card |
  | Rug border | yes | yes | 3D, card |
  | Kitchen worktop | yes (custom added 2026-11-14) | yes | 3D, card |
  | Room finishes, a wall's own finish, pieces of finish | yes (tint) | yes | 3D, card |
  | Items from parts | `#rrggbb` per material | yes | 3D, card |
  | Sensor digits | yes | yes | plan, 3D |
  | Lamp light colour | custom (Home Assistant gives it) | yes | plan, 3D |
  | Light fitting body (shade, rail, stand) | yes (added 2026-11-14) | yes | 3D, card |

  The plan view is a schematic and shows no furniture colours, by design. Found on the way: floor and table lamps drew only their stand since 2026-11-10 (fixed).
- **Left:** a wardrobe up to any ceiling height (a wall height per plan).

## From furnishing the examples (2026-11-09, D-064)

Noted by the agents who furnished the thirteen homes; not done yet:

- **3D view:** the wall between a room and its balcony is interior, so it does not hide like a facade and can block a lounge (the large home has its own view because of it); a room close-up of a kitchen can look from behind the cabinet run (the cabinets hide the room); hiding tall wall-hung items is strict at 30°.
- **Catalog:** an outdoor sofa, a wood stove with a flue (now a custom cylinder), a roller blind shown rolled up (a full one reads as a white panel), decor on a dressing table (its box takes the mirror's height), a wall-hung toilet seen from behind is a plain box.
- **Finishes:** a checkerboard in two chosen colors (the dark tile is fixed near-black), white zellige reads as a gray grid from the overview distance, kitchen fronts in olive and terracotta.

## From the ten typical homes (2026-11-08, D-061)

Found by the homes check and by the agents who built the plans; not done yet:

- **Zones in auto-placement.** In a room with two HA areas, covers go onto the room's windows by name order and sensor labels share one row across the zone boundary; both should follow the zone.
- **A TV backlight behind the TV** — a strip variant on the TV, like “Under cabinets” on wall cabinets; now it becomes a ceiling strip on the longest wall.
- **A catalog floor lamp as the body of an HA floor lamp.** Now the HA lamp draws its own floor lamp: placed next to a catalog one, there are two.
- **Contacts and covers:** a window contact in a room with several windows (by a direction word in the name: “east”, “south”); a roller shutter on a terrace door (covers go only onto windows); a garage door in the model.
- **Doors:** double doors (now one leaf as wide as both, or no leaf from 1.15 m); a door from a file in the middle of a thin wall attaches to one of the two rooms by rounding — a side or swing in the file would make it exact.
- **A sensor label on a glazed balcony:** when glazing takes every wall, the label could sit on the parapet below it.
- **Catalog:** a ceiling fan with a light (common in US homes; in HA both a fan and a light), an upholstered bench, a tankless water heater, a piano, a wallbox, base-cabinet fillers of 15–30 cm.
- **Houses:** floors, ceiling height per room, a garden without walls or with a low fence (a terrace has a railing since D-071), a staircase as structure (typical-homes.md, “What the editor needs”).
- **Styles in the editor** (D-062, D-064 — every example now has its own concept and palette): the examples are finished by a style that finds the accents from the furniture (headboard wall, media wall, backsplash). The same could be a button for your own home: “Style: scandi / warm / classic / modern / green”, one click, then adjust.
- **The default walls and the light in 3D:** light wall colors read as white, every room the same; a quieter default wall and a little less exposure would help every home, not only the examples — a change of the look, at the owner's word.

## Scale by area — implemented; additional methods undecided (2026-11-05)

Per D-038 the area is asked right after the photo. From the first rectangle the scale is set approximately; after the rooms are bound it is refined by the area without shafts and, unless the user ticks the box, without the balcony and loggia. Instead of the area, a known wall length can be given. Code — [flows.ts](../editor/src/editor/flows.ts).

Remaining proposals:

- Scale check by door width: notice an obviously implausible size and suggest a refinement. Not implemented.
- A draft without a photo from HA areas and the total area: rectangles by typical proportions. This will not recover the real layout of rooms; its value as a quick demo still has to be checked. Not implemented.
- Select rooms by clicking inside the photo — the owner is not sure yet, the mechanic is not chosen.

## Options for placing sensor readings (2026-11-05)

Currently readings are placed on walls and are selected and moved in the separate “Sensors” mode (D-034). The owner suggested returning to other ways in the future:

- on the floor under the room name;
- tinting the floor by temperature, humidity or CO₂ with a scale;
- an icon at the place of the sensor itself;
- a label above the room, turned toward the camera;
- a screen on furniture or an appliance;
- on the ceiling;
- only in the room panel.

The proposal is one common choice for the plan and a separate one for a room; the HA card has its own setting. These ways are not implemented. Historical research — [sensors.md](research/sensors.md).

2026-11-07: where on the wall the numbers sit when the model is rotated — [research](research/sensor-labels-2026-11-07.md). The owner chose a static place to start with (D-034). Return to “own wall + backup” if people complain that the numbers are not visible from some angles. The display method (walls, above the room, floor, heat map) is a separate common setting.

## Floor covering — implemented (idea of 2026-11-04)

The room panel has a floor choice and a custom color: eight quick swatches and a window with all 24 coverings. The automatic guess by name remains the default and can be changed. Walls and individual wall sides also have a finish and their own color (D-028, D-031; [rooms.ts](../editor/src/editor/modes/rooms.ts), [surfaces.ts](../editor/src/core/surfaces.ts)).

## Lower walls in the general view (2026-11-04)

Currently the facade on the camera side is hidden and partitions stay full height. The idea is to lower walls by about half in the general view so small interior rooms are visible, and restore the height when zooming in. Not implemented, behavior not chosen.

## Sun and weather outside the window (2026-11-04)

The idea is to move the sun by real time and change the look by weather. Orientation will need north on the plan; the assumed data source is HA. Currently there is a manual “Day / Night” switch, and there is no real HA connection.

Open questions are behavior, data and the free / Pro boundary. The November competitor research is [competitors.md](research/competitors.md); this idea is not yet in the implementation plan.
