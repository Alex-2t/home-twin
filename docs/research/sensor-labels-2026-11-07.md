# Readings on walls: the user or the camera chooses the place

Research 2026-11-07. Code checked against `editor/src/core/sensors.js` (`wallSpot`, `spotScore`) and `editor/src/core/scene.js` (`chooseLabels`).

## Decision

2026-11-07, the owner: “a backup wall sounds complicated; for now, just a static attachment to a wall”. Option B was implemented: the label sits on the wall for the home view or where it was dragged, and does not move when 3D is rotated. When the wall turns away, the label hides along with it. Option D stays in the [ideas](../ideas.md) in case the numbers are missing from some angles.

## The owner's question

“I like that the place for the readings changes depending on how we rotate the model. But then what is the point of choosing a place on the walls? Maybe let us choose: static or dynamic?”

## How it works now

There are actually already two modes, but the user does not see or choose them.

| | “Auto” (the label was not touched) | Dragged on the plan |
|---|---|---|
| Where it stands | Each wall of the room gets its own free area computed. In 3D the line sits on the wall best facing the camera | Where it was put (`at`) |
| When 3D rotates | Moves to another wall as soon as that one faces the camera noticeably better (margin 0.35 in score, fade-in 280 ms) | Does not move |
| The wall turned away | Already stands on another wall | The label is not visible: the facade on the camera side hides, and from the back side the label is not drawn |
| On the plan | The place for the home view | The place where it was put |

Hence the owner's question. The user drags a label to choose its place. But the place of an "auto" label changes on rotation anyway, and a dragged one disappears from half the angles. The choice on the plan looks like "where it will be", but works as "where it will be only from the home view".

An "auto" label moves even when its current wall still reads well: it is enough for another one to face the camera noticeably better. So there are more moves than needed.

## How others do it

Similar products have no labels directly on walls that move by themselves on rotation. Three approaches occur.

- **Static on a chosen surface.** `floor3d-card` for HA: `type3d: text` writes an entity's state onto a flat model object (a TV screen, a painting), the object is chosen by the user via `object_id`. The place does not change. From the other side the label is simply not visible.
- **An icon at a point (sprite), always facing the camera.**
  - Autodesk APS Data Visualization (sensors in buildings): sensors are 2D icons in the model, next to them a heat map on the floor and surfaces.
  - NeonPlan 3D: a device marker above the floor with a value; the Values mode writes numbers under the room name.
  - Hotspots in Sketchfab, PlayCanvas, Vectary: a point with a caption. If geometry covers it, it fades. In Vectary the transparency behind geometry is configurable from "fully visible" to "hidden".
- **Tinting objects by data.** Azure Digital Twins 3D Scenes, "visual rules": an overlay or color on an element by state. APS and NeonPlan: a floor heat map.

Matterport: tags are bound to the scan surface. On the forum people complain that tags are visible through walls and floors. So it is right to hide or dim a label when it is not visible, rather than show it through.

## What label research says

- **Been, Daiches, Yap — “Dynamic Map Labeling” (IEEE TVCG, 2006).** Four requirements for label consistency during navigation. The main ones: a label must not flicker (appear and disappear more than once) and jump (abruptly change place) during one continuous motion.
- **Gemsa, Nöllenburg, Rutter — rotating maps (2011, 2014).** The same requirements for rotation: labels must neither jump nor flicker. Existing layout methods did not satisfy them.
- **Bell, Feiner, Höllerer — “View Management for Virtual and Augmented Reality” (UIST 2001).** The layout takes past frames into account to reduce jumps. Later works call hysteresis the standard technique: the place changes with a delay.

For us this means: a label should change walls as rarely as possible, only when it cannot be read otherwise. Now the margin 0.35 and the 280 ms fade-in soften the moves, but the label leaves a wall that is still clearly visible.

## Options

| | What it is | Pros | Cons |
|---|---|---|---|
| A. Auto only | Remove dragging, the place is always by camera | Always visible, nothing to configure | The user has no control; in the home view the numbers may land above the TV; jumps |
| B. Static only | "Auto" picks the place once for the home view, does not move on rotation | Predictable, "paint on the wall" | No numbers from half the angles |
| C. A “static / dynamic” switch | A global choice or a choice per label | Gives both behaviors | Two unclear words. A person does not know in advance what they want; finds out only by rotating the model |
| **D. Own wall + backup** | A label has its own wall: chosen automatically for the home view or dragged. The label stays there while the wall is visible. The wall turned away — the label moves to a visible one, rotated back — returns | Choosing a place makes sense (that is how it will be on the card and from all angles where the wall is visible); numbers never disappear; fewer moves than now | A bit harder to explain. Needs a short text in the label panel |
| E. Not on a wall | A number above the room facing the camera, on the floor, or as a heat map | No wall-choice problem at all | Loses the difference from competitors (D-033: "paint on the wall"). Suits as a separate display method, not a replacement |

## Recommendation

**D — own wall plus backup — as the default behavior. Do not build a “static / dynamic” switch.**

- **Why.** An HA dashboard most often hangs on a tablet and shows the home view. There it matters exactly where the numbers stand, and the user controls that. When the model is rotated, it matters more that the numbers are readable, and the backup wall handles that. A switch forces a choice between these two goals, while D gives both.
- **Fewer jumps.** A label leaves its own wall only when it can no longer be read, and returns right away. This is closer to the "don't jump, don't flicker" requirements than now.
- **Dragging gains meaning.** "Drag the numbers — this is how they will stand on the card" is true at any rotation where the wall is visible.
- **“Pin” — optional, later.** For those who need strictly one place, even if it is invisible from some angles: a switch in the label panel under “⋯”. Change nothing until someone asks.
- **Display method is a separate question (E).** "How to show: on walls, above the room, on the floor, as a heat map" — a global setting, when we get to those views (see [ideas](../ideas.md)). Do not mix it with choosing the place.

### What it looks like for the user

- On the plan the numbers stand on their own wall, as now.
- A hint in the “Sensors” step and in the label panel, one line: "The numbers stand on this wall. If you rotate 3D and the wall is not visible, they move to a visible one".
- “↺” in the label panel: the own wall is chosen automatically again (for the home view).

### What to change in the code

1. `wallSpot`: for a dragged label, compute not only its own place but also backup places on other walls (`alts`), as for an "auto" one.
2. `layoutSensors`: for each label mark its own place: the dragged one or the best for the home view (`env.cam`).
3. `chooseLabels`: the own place while the wall is readable (turned toward the camera by more than about 15° and its facade not hidden); otherwise the best of the backups. Hysteresis: leave the own wall when the wall has turned away more strongly, return when it has turned back noticeably; keep the fade-in.
4. Tests for the choice: wall visible — own; turned away — backup; rotated back — own again; near the threshold it does not flicker.

Scope — about half a day, with a check on the demo and on ten typical plans (D-030).

## Open questions

- Will it be possible to rotate the model on the HA card, or does the card show only the home view (D-015, O-006)? If only the home view, the backup wall is needed only in the editor. The recommendation does not change.
- Tune the "wall is readable" thresholds (currently −0.1 by cosine in `spotScore`) on the demo and typical plans.

## Sources

- `floor3d-card`, text on a model object: [README](https://github.com/ricetea/floor3d-card), [configuration example on the HA forum](https://community.home-assistant.io/t/your-home-digital-twin-interactive-floor-3d-plan/301549/552).
- Autodesk APS Data Visualization, sensor icons and heat maps: [APS blog](https://aps.autodesk.com/blog/learn-how-integrate-iot-data-your-model-new-data-visualization-extensions), [forge-iot-extensions](https://github.com/petrbroz/forge-iot-extensions).
- Azure Digital Twins 3D Scenes Studio, visual rules: [Microsoft documentation](https://learn.microsoft.com/azure/digital-twins/concepts-3d-scenes-studio).
- Hotspots behind geometry: [Vectary](https://help.vectary.com/documentation/3d-configurator/hotspots), [PlayCanvas annotation](https://app.unpkg.com/playcanvas@2.14.4/files/scripts/esm/annotation.mjs), [three.js discussion](https://discourse.threejs.org/t/how-to-create-sketchfab-like-annotations-with-three-js/12595).
- Matterport, tags through walls: [WeGetAround forum](https://www.wegetaroundnetwork.com/topic/17964/page/1/matterport-mattertags-visible-through-floors-and-walls-help-please/).
- NeonPlan 3D: [README](https://github.com/Mastershort/neonplan3d) (more detail in [sensors.md](sensors.md)).
- Been, Daiches, Yap. Dynamic Map Labeling, IEEE TVCG 2006: [PDF](https://cs.nyu.edu/visual/home/pub/infovis06.pdf).
- Gemsa, Nöllenburg, Rutter. Consistent Labeling of Rotating Maps: [arXiv:1104.5634](https://arxiv.org/abs/1104.5634); Evaluation of Labeling Strategies for Rotating Maps: [arXiv:1404.1849](https://arxiv.org/abs/1404.1849).
- Bell, Feiner, Höllerer. View Management for Virtual and Augmented Reality, UIST 2001: [project page](https://graphics.cs.columbia.edu/projects/ViewManagement/index.html), [PDF](https://sites.cs.ucsb.edu/~holl/pubs/bell-2001-uist.pdf).
