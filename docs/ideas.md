# Ideas

Reviewed 2026-11-07. This file keeps proposals and already implemented ideas with links to decisions. The current development queue is in [status.md](status.md); an idea being recorded does not mean it has been included in the nearest release.

## Scale by area — implemented; additional methods undecided (2026-11-05)

Per D-038 the area is asked right after the photo. From the first rectangle the scale is set approximately; after the rooms are bound it is refined by the area without shafts and, unless the user ticks the box, without the balcony and loggia. Instead of the area, a known wall length can be given. Code — [flows.js](../editor/src/editor/flows.js).

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

The room panel has a floor choice and a custom color: eight quick swatches and a window with all 24 coverings. The automatic guess by name remains the default and can be changed. Walls and individual wall sides also have a finish and their own color (D-028, D-031; [rooms.js](../editor/src/editor/modes/rooms.js), [surfaces.js](../editor/src/core/surfaces.js)).

## Lower walls in the general view (2026-11-04)

Currently the facade on the camera side is hidden and partitions stay full height. The idea is to lower walls by about half in the general view so small interior rooms are visible, and restore the height when zooming in. Not implemented, behavior not chosen.

## Sun and weather outside the window (2026-11-04)

The idea is to move the sun by real time and change the look by weather. Orientation will need north on the plan; the assumed data source is HA. Currently there is a manual “Day / Night” switch, and there is no real HA connection.

Open questions are behavior, data and the free / Pro boundary. The November competitor research is [competitors.md](research/competitors.md); this idea is not yet in the implementation plan.
