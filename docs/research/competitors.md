# Competitors

**Historical research, 2026-11-03–04.** Information about competitors' versions, prices, and features applies to the dates of the sections. The sites were not rechecked when the documentation was reconciled on 2026-11-07. The current state of Home Twin is in [status.md](../status.md).

## NeonPlan 3D — the closest one

**Update 2026-11-04:** [detailed check of the version 3.0.0 models](neonplan-models.md) — 80 built-in types, 68 in the standard catalog groups; the store claims 1,209 items in packs. There are cards with previews and a daytime view. The v2.3.0 notes below are historical: the conclusion "furniture as simple boxes" and the unconditional superiority of our look do not describe the current version.

- [GitHub](https://github.com/Mastershort/neonplan3d), [forum post](https://community.home-assistant.io/t/neonplan-3d-draw-your-home-in-home-assistant-and-control-it-in-a-live-3d-floor-plan-free-hacs-online-demo/1027224).
- Free open-source core (MIT), in the default HACS list: in-browser plan editor, floors, roofs, garden, 80 furniture models, 19 languages, rooms linked to HA zones, devices, lights, curtains, sensors, alarms.
- Paid — one-time purchases without a subscription in the mastershort.de store: furniture packs, Pro modules (cameras, weather, energy, "time machine"). A purchase gives a license key, modules are signed for the installation, the key is checked daily. Without the key, what is installed keeps working.
- Forum response (as of 2026-11-03): 8 likes, 8 replies.
- Lessons: user vincen almost went to a competitor because of confusing packs ("overcomplicated the bundles things, so many options"); the store is half in German; registration emails went to spam.

### NeonPlan editor up close (online demo v2.3.0, 2026-11-03)
- Rooms: rectangle, freeform, and "by dimensions" — a rectangle by width and depth, or walls by length plus a direction arrow. A selected room has fields X, Y, width, depth, side lengths on the plan; "+" on a side inserts a corner, keyboard arrows shift it.
- Walls belong to each room separately: thickness and height of each wall, slope, "no wall". A new room is placed over the old one; there is a "Rooms overlap" warning and a "Close gaps" button (join rooms if inner dimensions were measured). A neighbors' shared wall does not move together.
- A room is linked to an HA zone; there are names for voice control and robot-vacuum cleaning by room.
- Furniture: a list by rooms and kinds (sofas, beds, wardrobes, kitchen, appliances, lights), without pictures. An item is placed in the middle of the selected room, then moved or edited via fields: X, Y, width, depth, height, rotation, mirror. Any size for all items.
- Lights are also catalog items (13 kinds: ceiling, spots, pendant, floor lamp, wall sconce, 2 m LED strip, etc.), linked to entities. An item can glow depending on an entity state (bed occupied) and be shown only in a certain state (Christmas tree in December).
- 3D — a dark neon "hologram" style, furniture as simple boxes; the whole house with roof, garden, sun, energy.
- Comparison with our draft: by editor features NeonPlan is clearly ahead (exact input, wall settings, floors, garden). We are stronger in the shared wall, dragging furniture to a wall, strips along walls, the AI draft, and above all the look: real light and furniture that resembles an apartment, not a diagram.

## Others
- floor3d-card, Hollako, ha-floorplan — not examined in detail.

## Services on Fiverr
- hired4ucom: $0.10 per sq. ft. for design, $0.20 with code.

## Walls in planners (2026-11-04)
Why: the owner finds working with walls in the editor hard. We looked at how programs focused purely on plans do it.

- **Rooms are the basis, a shared wall appears by itself on contact:**
  - magicplan: "room-based… rather than adding a wall, add a new room" ([FAQ](https://help.magicplan.app/magicplan-floor-plan-editor-faq)), there are Split and Merge for rooms;
  - Live Home 3D: coinciding walls of neighboring rooms give one wall ([help](https://www.livehome3d.com/support/help/mac/en/working-with-objects-walls));
  - Chief Architect Room Planner: walls merge when rooms are "bumped together" and separate when they are moved apart;
  - Floor Plan Creator: an interior wall is the snapping gap between rooms.

  Our model (D-005, D-009) is confirmed.
- **Thickness:**
  - magicplan has only two values per floor, interior and exterior walls; an individual wall's is not changed ([thickness](https://help.magicplan.app/change-exterior-and-interior-wall-thickness));
  - Planner 5D and RoomSketcher have thickness per individual wall, but it is changed in properties, not with a handle.
- **Dimensions:**
  - interior, as measured with a tape;
  - editing the number right on the plan: Floorplanner ([help](https://help.floorplanner.com/en/articles/2406466)), magicplan (tap the number, the entered value locks);
  - it is shown which side moves: tabs in Floorplanner, arrows in RoomSketcher, three buttons in Live Home 3D.
- **A selected wall has a mini-menu** "Split / Round / Remove" (Floorplanner, Homestyler) instead of hidden modifiers.
- **Open plan:** an invisible zone boundary — a wall of thickness 0 in Floorplanner, Divider in RoomSketcher; in magicplan the shared wall is removed, the labels remain.
- **Split a room with a line and merge rooms:** Planner 5D (web), magicplan, Chief.
- **Doors and windows are dragged onto a wall**, they rotate by themselves and sit at the wall's thickness (Sweet Home 3D, RoomSketcher, Floorplanner).
- **What to avoid:**
  - walls and rooms as independent objects — double walls, mismatches (Sweet Home 3D, complaints about Planner 5D);
  - rituals like "split a wall into 4 parts and pull out the middle one" (Planner 5D on a phone);
  - hidden modifiers like Option+drag;
  - dimensions along the wall axis;
  - unexpected dragging of neighboring walls (Homestyler added an Auto Connect switch).
- **"Floor Plan 3D":** there is no notable app with exactly this name; there is "smart3Dplanner | Floor Plan 3D" for Mac — without documentation and with almost no reviews.

## Windows and doors in planners (2026-11-04)
Why: the next wizard step is windows and doors; we looked for the simplest and clearest way ([D-023](../decisions.md)).
- **How they are added:**
  - a catalog and dragging onto a wall — almost everyone: Floorplanner ([door](https://help.floorplanner.com/en/articles/8439089-how-to-place-a-door)), RoomSketcher ([help](https://help.roomsketcher.com/hc/en-us/articles/360000808925)), Sweet Home 3D ([user guide](https://www.sweethome3d.com/userGuide.jsp)), Homestyler, Planner 5D;
  - click a wall → "Add door / Add window" → catalog — HomeByMe ([tutorial](https://home.by.me/en/tutorials/how-to-add-doors-and-windows));
  - tap a wall → "+ Add" → object → drag, 4–5 actions — magicplan ([help](https://help.magicplan.app/adding-wall-objects));
  - a "Door" tool, two clicks on a wall — Archilogic ([help](https://help.archilogic.com/knowledge/how-to-draw-doors)).
- **Width and position:** drag by the ends or enter a number by clicking the size — ArcSite ([help](https://support.arcsite.com/en/articles/8047399-add-a-door-or-window-openings-to-a-wall)), RoomSketcher; distances to the corner while dragging — SmartDraw; the door moves only along the wall — Floorplanner.
- **Door leaf:** one Flip button or the Q key — RoomSketcher; Rotate through a cycle of 4 positions — Moasure ([docs](https://docs.moasure.com/en/moasure-lx1/your-moasure-app/editing-your-floor-plan/edit-doors)); magicplan also stores 4 states ([API](https://apidocs.magicplan.app/guide/basic-concepts/plan-exchange-xml-format/exploded-floor/door)); Flip H/V in Floorplanner and Homestyler is unclear for a door.
- **Complaints:** magicplan — placing doors and windows is "tedious", a narrow door can't be placed ([G2](https://www.g2.com/products/magicplan/reviews?page=2)); Sweet Home 3D — a window doesn't snap near the wall edge; Planner 5D — changing sizes is only possible for money ([help](https://support.planner5d.com/en/articles/5876845-changing-dimensions-web)).

## Room names and HA areas (2026-11-04)
Why: the wizard step "name the rooms" and linking plan rooms to Home Assistant areas ([D-024](../decisions.md)).
- **Robot vacuums** (Roborock, Dreame, Xiaomi, Tapo, Wyze, iRobot): the map is cut into "Room 1…N", then "Edit map" → tap a room → "Rename" → a standard list or your own ([Tapo](https://www.tapo.com/us/faq/286/), [Roborock](https://forum-us.roborock.com/discussion/comment/2646)). iRobot fills in names itself, accuracy is noticeable only for the kitchen ([iRobot](https://homesupport.irobot.com/articles/en_US/Knowledge/64102)). Complaints: names are lost after the map is re-cut ([Roborock](https://forum-us.roborock.com/discussion/4114/i-can-no-longer-recommend-roborock-due-to-the-map-editor)), faceless room1/room2, identical names break Alexa ([Tapo](https://tapo.com/en/faqs/how-to-optimize-and-edit-the-map-of-your-tapo-robot-vacuum/)).
- **SmartThings Map View:** the app's rooms as a strip at the bottom, dragged onto the plan, devices appear in the same place ([Samsung](https://www.samsung.com/us/support/answer/ANS10004030/)).
- **Apple, Google, Alexa:** a choice from suggested names or your own, "Add a custom room" at the end ([Google](https://support.google.com/googlenest/answer/15559809)); a taken name is not allowed.
- **Home Assistant:** on setup creates the areas living_room, kitchen, bedroom ([const.py](https://raw.githubusercontent.com/home-assistant/core/dev/homeassistant/components/onboarding/const.py)); an area has aliases ([docs](https://www.home-assistant.io/docs/organizing/areas/)); "Zone" is a geofence, not a room.
- **Plans for HA:** ha-floorplan — id `area.<slug>` by hand in the SVG; floor3d — binding to model object names breaks on editing ([forum](https://community.home-assistant.io/t/your-home-digital-twin-interactive-floor-3d-plan/301549?page=26)); Ramses Extras — a "Sync areas" button, devices with a matching area are placed at the room's center ([wiki](https://github.com/wimpie70/ramses_extras/wiki/Floorplan-Getting-Started)).
- **Planners:** RoomSketcher — its own list of names by language, the R key ([help](https://www.roomsketcher.com/?p=3557)); magicplan — as text ([help](https://help.magicplan.app/how-to-change-a-room-name)).

## Lights on the plan (2026-11-04)
Why: the wizard step "Lights" — the user says what kind of light a lamp has (spots, strip), how many points and where (D-011).
- **NeonPlan 3D:** a lamp is a catalog item: ceiling, recessed spot, surface spot, LED panel, pendant, fan with light, floor lamp, uplight, table lamp, wall sconce, strip, garden. "Place spots" — a grid of lamps (columns × rows) for one entity, for example 6 spots on one dimmer. Instead of a lamp you can choose a switch (relay); on/off from the relay, color from another entity. Strips and sconces stick to the wall; a strip below 1 m shines up the wall, above — down; a sconce defaults to 1.75 m; for a pendant you set how far it hangs. "Place all …" places all of a room's devices at once ([manual](https://raw.githubusercontent.com/Mastershort/neonplan3d/main/docs/manual.md)).
- **Philips Hue:** each lamp has an "archetype" — a fixture icon: ceiling round and square, pendant, recessed, spot single and double, floor lamp, table lamp, sconce, strip, string lights, outdoor — about 50 in all ([list](https://hub.liblab.com/open-hue-io/open-hue-api/2.0.0/python/1.0.0/models/LightArchetype)).
- **floor3d-card:** an entity is bound to a Sweet Home 3D model object by name, brightness is set in lumens, all in YAML ([GitHub](https://github.com/ricetea/floor3d-card)).
- **Lighting design programs:** layouts as a "field" (rows × columns with a step), a "line", "around a circle" — DIALux ([evo 9.1](https://www.dial.de/en-GB/news/dialux-evo-91-is-now-available-for-download)), AGi32 ([arrays](https://docs.agi32.com/AGi32/Content/add_luminaire_commands/Arraying_Luminaires.htm)), CYPELUX ([circular](https://info.cype.com/en/subject/cypelux-circular-distribution/)).
