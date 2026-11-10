# Which models Home Twin needs: research and a catalog of 120 items

Date of the original research: 2026-11-04. According to the implementation log, the list of 120 functional items was closed on November 4; on November 5 the catalog was extended based on typical homes. Review of 2026-11-07: `CATALOG` has 128 entries, 124 of them visible (including “Custom item”); four old Kenney entries are hidden. The number of entries does not equal the number of functional items in the research. New models are not the current priority per D-029: next, check the placement on typical plans ([status.md](../status.md)).

Main conclusion: it is more useful to close the missing household scenarios — a kitchen with appliances, a bathroom, corner furniture, a laundry room and a children's room. Then expand shapes and styles. For a live twin, the air conditioner, radiator, curtains and lamps are especially valuable.

These are **120 functional items of the target catalog**, including existing ones. They do not equal 120 new model files: some use shared geometry and different configurations. Color, wood species, bed width, left/right corner and the same item in another room do not increase the count. Household appliances, plumbing and lighting are included deliberately: without them an apartment cannot be fully reproduced. Doors, windows, walls and staircases belong to the building structure and are not counted here.

## What the selection is based on

Primary sources were studied: manufacturers' product categories, planner libraries and Home Assistant documentation. They confirm the composition of item groups and scenarios, but **do not give statistics of demand among Home Twin users**. The priorities below are our product estimate for apartments; there is no sales ranking or measured coverage percentage here. Popularity data for a specific country was not collected.

| Source | What was taken for the research |
|---|---|
| [IKEA: furniture](https://www.ikea.com/us/en/cat/furniture-fu001/) | Basic groups: beds, wardrobes, tables, seating, storage, workspace. |
| [IKEA: sofas and armchairs](https://www.ikea.com/us/en/cat/sofas-armchairs-700640/) | Differences between straight, sectional, modular and sleeper sofas; poufs and daybeds. |
| [IKEA: kitchen systems](https://www.ikea.com/us/en/cat/kitchens-ka003/) | A kitchen is worth assembling from combinable elements. |
| [Bosch: home appliances](https://www.bosch-home.com/us/products/) | Refrigerators, dishwashers, ovens, hobs, range hoods, washing machines and dryers. |
| [Roca: bathroom categories](https://spareparts.roca.com/en/gb/site-map) | Toilets, sinks, bathtubs, shower trays and screens, furniture, mirrors. |
| [IKEA: children's](https://www.ikea.com/us/en/cat/baby-kids-bc001/), [children's furniture](https://www.ikea.com/us/en/cat/kids-furniture-18767/) | The children's room as a scenario of its own; play tables, seating and storage a child can reach. |
| [IKEA: laundry and cleaning](https://www.ikea.com/us/en/cat/laundry-cleaning-lc001/) | Baskets, household storage, drying racks, ironing boards, waste sorting. |
| [Sweet Home 3D: object library](https://www.sweethome3d.com/free-3d-models/) | A completeness check of a planner library: furniture, equipment and furnishings. The range was studied, assets were not imported. |
| [Floorplanner: manual, Furniture Library section](https://cdn.floorplanner.com/static/brochures/FloorplannerManualEN.pdf) | Search by categories and subcategories; the difference between resizable and fixed dimensions. |
| [HA: Climate](https://www.home-assistant.io/integrations/climate/), [Cover](https://www.home-assistant.io/integrations/cover/), [Vacuum](https://www.home-assistant.io/integrations/vacuum/) | A possible later link of climate equipment, curtains and the robot with the home state. The presence of a model does not by itself implement this link. |

The list and notes below are a synthesis of these sources and the project's goals. The sources do not publish our P0/P1/P2 queue.

## How priority is defined

Four criteria were assessed: whether the item is needed for a main household scenario; how much it affects the occupied space; whether there is an adequate substitute in the catalog; how much it helps to recognize the apartment and show its state. Modeling cost is taken into account when composing a batch but does not replace usefulness.

- **P0 — foundation.** The main volumes of a room, the main appliances and items without which a scenario is significantly incomplete. Also wall landmarks and basic lighting that matter for Home Twin.
- **P1 — next in the queue.** Common alternatives and full scenarios for particular rooms or families.
- **P2 — expansion.** Special scenarios and details worth doing after the main volumes.

P0 does not mean “present in every apartment”, P2 does not mean “nobody needs it”. For example, the P1 baby crib is critical for a family with an infant. The row number is an identifier for discussion; the order within a section is not a ranking.

## Baseline at the start of the research

[catalog.js](../../editor/src/core/catalog.js), [furniture3d.js](../../editor/src/core/furniture3d.js) and [fixtures.js](../../editor/src/core/fixtures.js) were checked.

At the start of the research CATALOG had 30 entries. In this list they covered 26 functional items: three bed entries are merged into one, two nightstands into one, two bookcases into one. “Present” means the basic item exists, not that all the proposed variants are implemented or that quality is verified. Nine items from the previous change are also counted. At that time the hob was a part of the base cabinets, and the pendant, wall lamp and table lamp needed development in the lights mode. Subsequent changes are listed in the implementation log at the end of the document.

## Full list

The last column gives our assessment of usefulness and requirements for future variants. Names of current models are given as in the source code.

Total: **120 items — 46 P0, 54 P1, 20 P2**. Current coverage: **120 present** — the whole list.

### Living room — 14

| № | Item | Priority | Now | Why needed / what to provide |
|---|---|---|---|---|
| 001 | Straight sofa | P0 | Present: loungeSofa — own generator, any size and fabric | The basis of the lounge area. Two- and three-seaters are sizes of one family. |
| 002 | Corner sofa | P0 | Present: sofaCorner | Defines the passages; needs left and right sections, a separate ottoman length. |
| 003 | Modular U-shaped sofa | P1 | Present: sofaU — a U shape on the plan | For a large living room; module configuration and a free area inside the outline. |
| 004 | Sofa bed | P0 | Present: sofaBed | A sleeping place in a studio; folded and unfolded states with different dimensions. |
| 005 | Armchair | P0 | Present: loungeChair — own generator | A second seat; armrest width and seat depth. |
| 006 | Recliner | P2 | Present: recliner — “Upright / Reclined” | The extending footrest changes the occupied space; check both states. |
| 007 | Chaise / chaise longue for a room | P2 | Present: chaise | An elongated place to rest, differing from an ordinary armchair in depth and silhouette. |
| 008 | Pouf / ottoman | P1 | Present: ottoman | An extra seat; circle and rectangle as variants. |
| 009 | Coffee table | P0 | Present: tableCoffee — own, rectangular and round | The center of the sofa group; circle, oval and rectangle within the family. |
| 010 | Side table | P1 | Present: sideTable — round and C-shaped | A compact surface next to the sofa; ordinary and C-shaped support. |
| 011 | TV stand | P0 | Present: tvStand | The footprint of the media area and a support for equipment; open and closed sections. |
| 012 | TV | P0 | Present: tv | A recognizable center of the living room; currently wall-mounted, a stand-mounted variant is also needed. |
| 013 | Soundbar | P2 | Present: soundbar | Placement under the TV; wall mount or the stand surface. |
| 014 | Floor speaker | P2 | Present: speaker | Takes space at the sides of the media area; a pair is placed as two instances. |

### Bedroom and walk-in closet — 7

| № | Item | Priority | Now | Why needed / what to provide |
|---|---|---|---|---|
| 015 | Bed | P0 | Present: bed (bedDouble, bedSingle hidden from the catalog) | The main footprint of the bedroom. Single and double are width variants, not new types. |
| 016 | Nightstand | P0 | Present: nightstand (cabinetBedDrawerTable hidden) | Passages by the bed and a surface for a lamp; left and right are instances. |
| 017 | Dressing table | P1 | Present: dressingTable | A place for grooming; the mirror and seating space distinguish it from an ordinary table. |
| 018 | Floor mirror | P1 | Present: floorMirror | Useful in the bedroom and walk-in closet; support, tilt and the space in front of the mirror. |
| 019 | Fold-down wall bed | P2 | Present: wallBed — “Folded / Unfolded” | For small rooms; the dimensions in the open state must be shown. |
| 020 | Open clothes rack | P1 | Present: clothesRack | An alternative to a wardrobe; rail, bottom shelf and the depth of clothes on hangers. |
| 021 | Room divider | P2 | Present: screen | Zoning a studio; number of sections and opening angle. |

### Storage and hallway — 15

| № | Item | Priority | Now | Why needed / what to provide |
|---|---|---|---|---|
| 022 | Hinged wardrobe | P0 | Present: wardrobe | A large storage volume; account for the space in front of the doors. |
| 023 | Sliding wardrobe | P1 | Present: wardrobe, variant sliding | A different way of opening; shared carcass with the wardrobe, sliding fronts. |
| 024 | Corner wardrobe | P1 | Present: wardrobeCorner | Occupies a corner differently from a straight one; left and right arm. |
| 025 | Open wardrobe section | P1 | Present: openWardrobe | Storage along a wall; shelves, rails and pull-out units as configuration. |
| 026 | Dresser | P0 | Present: dresser | Storage in the bedroom, children's room and living room; number of drawers and width. |
| 027 | Open shelving / bookcase | P0 | Present: shelf (bookcaseOpen hidden) | Storage and space division; height and number of sections. |
| 028 | Wall shelf | P0 | Present: wallShelf | Storage above a desk or bed; length and mounting height. |
| 029 | Display cabinet | P1 | Present: displayCabinet | Closed storage with glass; noticeably different from a solid cabinet. |
| 030 | Sideboard / buffet | P1 | Present: sideboard | Dish storage near the dining area; doors and inner shelves. |
| 031 | Shoe cabinet | P0 | Present: shoeCabinet | A key volume of a narrow hallway; tilt-out fronts as a future variant. |
| 032 | Bench / banquette | P1 | Present: bench | A place to put on shoes or at the foot of the bed; padded seat and drawer are options. |
| 033 | Console | P1 | Present: console | A shallow surface in a passage; width, depth, bottom shelf. |
| 034 | Coat stand | P1 | Present: coatStand | Jackets by the entrance; account for the width of hung clothes. |
| 035 | Wall coat rack with hooks | P0 | Present: coatHooks | A hallway without a separate wardrobe; panel width and mounting height. |
| 036 | Wall mirror | P0 | Present: wallMirror | Hallway and bathroom; shape, size and height, no floor area used. |

### Kitchen and dining — 24

| № | Item | Priority | Now | Why needed / what to provide |
|---|---|---|---|---|
| 037 | Base kitchen cabinet | P0 | Present: kitchenBase | The kitchen foundation; separate modules, fronts and a variant without a built-in hob are needed. |
| 038 | Wall kitchen cabinet | P0 | Present: kitchenWall | The second tier of the kitchen; width, mounting height, open or solid sections. |
| 039 | Corner base kitchen cabinet | P0 | Present: kitchenCorner | Allows assembling L- and U-shaped kitchens; two arms and orientation. |
| 040 | Tall kitchen cabinet | P0 | Present: kitchenTall | Tall storage; variants for an oven and a built-in refrigerator. |
| 041 | Kitchen island / peninsula | P1 | Present: kitchenIsland — bar stools under the overhang | Changes the passages; size, countertop overhang and accessible sides. |
| 042 | Kitchen sink with faucet | P0 | Present: kitchenSink | A mandatory landmark of the work area; one or two bowls, drainboard, countertop fit. |
| 043 | Hob | P0 | Present: kitchenHob | A standalone module is needed; number of burners and position on the countertop. |
| 044 | Built-in oven | P0 | Present: variant of kitchenHob and kitchenTall | Takes a kitchen module; placed under the countertop or in a tall cabinet. |
| 045 | Freestanding cooker | P1 | Present: stove — electric and gas | A standalone volume with an oven and burners; an alternative to two built-in appliances. |
| 046 | Refrigerator-freezer | P0 | Present: fridge | Our own model with two compartments; size and color vary. The overhang and the door-opening zone are the next stage. |
| 047 | Wide multi-door refrigerator | P1 | Present: fridge, variants sbs and french | A different outline and opening; side-by-side and French door are variants of the family. |
| 048 | Dishwasher | P0 | Present: dishwasher | A kitchen module with a drop-down door; narrow and full-size are widths of one type. |
| 049 | Range hood | P0 | Present: hood | The upper zone above the cooker; built-in, slanted and dome forms. |
| 050 | Microwave oven | P1 | Present: microwave — on the countertop (`lift`) | Takes countertop space or a niche; must not be placed on the floor by default. |
| 051 | Rectangular dining table | P0 | Present: diningTable | The foundation of a dining area; width and length, space for pulling out chairs. |
| 052 | Round dining table | P0 | Present: tableRound — own, circle or oval | A different walk-around outline; diameter and a central or four-leg support. |
| 053 | Extendable dining table | P1 | Present: tableExt — “Folded / Extended” | Checks everyday and guest arrangements; two length states. |
| 054 | Drop-leaf wall table | P1 | Present: tableFold — “Open / Folded” | For a small kitchen; wall mounting and the outline when open. |
| 055 | Bar stool | P1 | Present: barStool | Seating at an island or counter; seat height, back and footrest. |
| 056 | Dining chair | P0 | Present: chairCushion — own | Affects the number of seats and passages; with a back, with or without armrests. |
| 057 | Stool | P1 | Present: stool — round and square | A compact seat without a back; round and square forms. |
| 058 | Kitchen cart | P2 | Present: kitchenCart | A mobile extra surface; shelves, wheels, storage position. |
| 059 | Coffee machine | P2 | Present: coffee | Takes a noticeable part of the countertop; body dimensions and the access zone from above. |
| 060 | Trash bin / sorting unit | P1 | Present: bin — bin and sorting | A place under the sink or near the kitchen; separate placement or inside a cabinet. |

### Bathroom and toilet — 16

| № | Item | Priority | Now | Why needed / what to provide |
|---|---|---|---|---|
| 061 | Floor-standing toilet with a cistern | P0 | Present: toilet | The main volume of the toilet room; real base outline and cistern protrusion. |
| 062 | Wall-hung toilet with an in-wall frame | P0 | Present: toilet, variant wall | A different mounting; the bowl and the visible frame box if it is not set by the wall. |
| 063 | Rectangular alcove bathtub | P0 | Present: bath | The largest object in a bathroom; length, width, screen side. |
| 064 | Freestanding bathtub | P1 | Present: bathFree — oval and rectangular | Requires walking around; oval and rectangular bowls as variants. |
| 065 | Shower cabin / enclosure with a tray | P0 | Present: shower | Replaces a bathtub; rectangle or quarter circle, door opening. |
| 066 | Walk-in shower area | P1 | Present: walkIn | A glass partition and a floor zone without a tall tray; free entry. |
| 067 | Wall-mounted sink without a cabinet | P0 | Present: basin | For a compact toilet room; width, depth, pedestal variant. |
| 068 | Floor-standing sink cabinet | P0 | Present: vanity | Storage and washing; one or two basins as a configuration. |
| 069 | Wall-hung sink cabinet | P1 | Present: vanity, variant wall | Free floor under the cabinet; separate mounting height. |
| 070 | Mirror cabinet | P0 | Present: mirrorCabinet | Storage above the sink; depth and mounting height, doors. |
| 071 | Tall bathroom cabinet | P1 | Present: bathTall — floor-standing and wall-hung | Narrow tall storage; floor-standing and wall-hung mounting. |
| 072 | Open bathroom shelving | P1 | Present: bathShelf | Towels and baskets; light construction and small depth. |
| 073 | Towel warmer | P0 | Present: towelRail | Takes wall space; ladder or serpentine, size and mounting height. |
| 074 | Bidet | P2 | Present: bidet | An additional toilet-room object; a separate place next to the toilet. |
| 075 | Storage water heater | P1 | Present: waterHeater — round and flat | A large wall-mounted volume; vertical, horizontal or flat body. |
| 076 | Shower column with a mixer | P1 | Present: showerColumn | For a bathtub and a shower; position on the wall, height and the projection of the overhead shower. |

### Laundry and household items — 8

| № | Item | Priority | Now | Why needed / what to provide |
|---|---|---|---|---|
| 077 | Front-loading washing machine | P0 | Present: washer | A large appliance of a bathroom or kitchen; depth, door and space for opening. |
| 078 | Top-loading washing machine | P1 | Present: washer, variant top | A different footprint and access from above; important for narrow rooms. |
| 079 | Dryer | P1 | Present: dryer — can also be placed on the washer (“Above floor”) | Next to the washer or above it; a stack is a composition of two appliances. |
| 080 | Laundry basket | P1 | Present: laundryBasket | A real floor volume in a bathroom; width and lid opening. |
| 081 | Folding drying rack | P1 | Present: dryingRack — “Unfolded / Folded” | Temporarily takes a significant area; folded and working states. |
| 082 | Ironing board | P1 | Present: ironingBoard — “Unfolded / Folded” | Checks a temporary work zone and a storage place; two states. |
| 083 | Utility cabinet | P1 | Present: utilityCabinet | Storage for a vacuum cleaner, mop and supplies; a tall section without solid shelves. |
| 084 | Robot vacuum with a dock | P1 | Present: robotVacuum | The dock takes a permanent place; the robot and the station are parts of one set, a potential link with HA. |

### Workspace — 8

| № | Item | Priority | Now | Why needed / what to provide |
|---|---|---|---|---|
| 085 | Straight desk | P0 | Present: desk — own, sizes vary | The main volume of a study; adjustable width and depth are needed beyond the current fixed model. |
| 086 | Corner desk | P1 | Present: deskCorner | Two work arms; left and right configuration, a free niche for the chair. |
| 087 | Height-adjustable desk | P1 | Present: deskStanding — “Sitting / Standing” | Working sitting and standing; a separate shape of the supports and height states. |
| 088 | Office chair | P0 | Present: chairDesk — own | A place in front of the desk; wheeled base and space to roll back. |
| 089 | Rolling pedestal | P1 | Present: pedestal — slides under the desk | Storage under the desk; must not conflict with the desktop as two solid volumes. |
| 090 | Monitor | P1 | Present: monitor — stands on the desk (`lift`) | Scale and recognizability of the workspace; stand or bracket, several instances. |
| 091 | PC tower | P2 | Present: pcTower | Takes floor or desk space; vertical case and space for access. |
| 092 | Printer / MFP | P2 | Present: printer | Needs a separate surface; body, trays and access from above. |

### Children's room — 8

| № | Item | Priority | Now | Why needed / what to provide |
|---|---|---|---|---|
| 093 | Baby crib | P1 | Present: crib | A new bedroom scenario; side rails, height and a place next to the adult bed. |
| 094 | Bunk bed | P1 | Present: bunkBed | Two sleeping places and a ladder; height and the position of the climb are essential. |
| 095 | Loft bed | P1 | Present: loftBed — the bed is raised (`lift`), a desk under it does not overlap | A desk or storage can be placed under the sleeping place; the volume under it must be free. |
| 096 | Changing table / dresser | P1 | Present: changer | Distinguished by the top rail and a work surface; room for front access. |
| 097 | High chair | P1 | Present: highChair | A child's place at the shared table; wide base and removable tray. |
| 098 | Toy storage system | P1 | Present: toyStorage | Low open containers; number of sections and access from the child's side. |
| 099 | Playpen | P2 | Present: playpen | A fenced play area; the real occupied outline and height. |
| 100 | Kids' play table | P2 | Present: kidsTable | A low play surface; provide compact dimensions and room for children's chairs. |

### Climate and apartment equipment — 8

| № | Item | Priority | Now | Why needed / what to provide |
|---|---|---|---|---|
| 101 | Heating radiator | P0 | Present: radiator | Prevents placing furniture flush against the wall; width, depth and height above the floor. |
| 102 | Wall-mounted air conditioner | P0 | Present: aircon | A noticeable wall object and a future climate-control point in HA. |
| 103 | Air purifier | P1 | Present: purifier | A separate floor device; installation place and access to the body. |
| 104 | Humidifier | P2 | Present: humidifier | A floor or tabletop device; place on a surface and body shape. |
| 105 | Floor fan | P2 | Present: fan | A seasonal object; base, height and head rotation. |
| 106 | Electric convector | P1 | Present: convector — wall-mounted and on legs | A volume by the wall; wall-mounted or floor version. |
| 107 | Electric fireplace / mantel | P2 | Present: fireplace | The compositional center of a room; mantel depth and free space in front of it. |
| 108 | Wall thermostat | P1 | Present: thermostat | A small but useful object for the HA twin; placement point and status display. |

### Textiles, decor and pets — 8

| № | Item | Priority | Now | Why needed / what to provide |
|---|---|---|---|---|
| 109 | Rug | P1 | Present: rug — under furniture, conflicts with nothing | Unites a zone; rectangular, round, oval. Furniture may stand on top of it. |
| 110 | Curtains with a rod | P0 | Present: curtains | Change the look of a room a lot; width, length, open and closed states, the HA cover perspective. |
| 111 | Roller blind / blinds | P1 | Present: blind — roller, venetian, day-night | Window treatment; the type of fabric or slats and the degree of opening, the HA cover perspective. |
| 112 | Potted floor plant | P1 | Present: pottedPlant — own | Fills empty corners. 2026-11-07: five silhouettes as variants — monstera, fiddle-leaf fig, palm, sansevieria, hydrangea; the pot follows the crown, five pot colors. Next to it — a floor vase (dried flowers, eucalyptus, empty). |
| 113 | Painting / poster | P2 | Present: picture — painting and poster | Helps recognize one's own room; frame size, orientation and height on the wall. |
| 114 | Aquarium with a stand | P2 | Present: aquarium | A noticeable permanent volume; the tank and the support as one set. |
| 115 | Scratching post / cat tree | P2 | Present: catTree | Takes area and height; number of platforms and posts. |
| 116 | Pet bed | P2 | Present: petBed | A real place on the floor; size and round or rectangular shape. |

### Lamps — 4

| № | Item | Priority | Now | Why needed / what to provide |
|---|---|---|---|---|
| 117 | Floor lamp | P0 | Present: lampRoundFloor — own; shape lamp, variant floor | An object by an armchair; link the visible body with the already existing light shape. |
| 118 | Table lamp | P1 | Present: shape lamp, variant table — own look in 3D | Light by the bed and on the desk; shade or a directional head, support on a surface. |
| 119 | Pendant light | P0 | Present: shape pendant — opal dome, cord, canopy | Develop the look of the existing shape; hanging height and shade, without a second independent source. |
| 120 | Wall sconce | P0 | Present: shape wall — plate, bracket, shade | Develop the existing shape; projection and mounting height, a single object with the light. |

<a id="where-to-start-adding-the-first-20-items"></a>

## Initial queue: the first 20 items (completed)

This is the implementation order; completed items are marked in the table. First the main missing volumes, then composite geometry and wall items. Before each batch we take the editor dependencies below into account.

| Queue | № in the list | Item | Why now |
|---|---|---|---|
| 1 | 046 | Refrigerator — added | Own generator, two compartments, resizable; no third-party assets. |
| 2 | 061 | Floor-standing toilet — added | Makes a basic toilet-room layout possible. |
| 3 | 063 | Rectangular bathtub — added | The main variant of the bathing area. |
| 4 | 065 | Shower cabin — added | An alternative to a bathtub for a compact room. |
| 5 | 077 | Washing machine — added | The main missing appliance outside the kitchen. |
| 6 | 042 | Kitchen sink — added | Allows defining the kitchen work zone. |
| 7 | 043 | Hob — added | Separates cooking from an arbitrary cabinet-run size. |
| 8 | 044 | Oven — added | Completes the basic built-in appliances. |
| 9 | 048 | Dishwasher — added | Gives a separate module and the open-door footprint. |
| 10 | 049 | Range hood — added | Completes the upper part of the cooking zone. |
| 11 | 039 | Corner kitchen cabinet — added | Opens up L-shaped kitchens. |
| 12 | 040 | Tall kitchen cabinet — added | Opens up tall storage and layouts with built-in appliances. |
| 13 | 002 | Corner sofa — added | Significantly expands living room options. |
| 14 | 004 | Sofa bed — added | Allows checking day and night arrangements of a studio. |
| 15 | 067 | Wall-mounted sink — added | An option for a small toilet room where a cabinet does not fit. |
| 16 | 070 | Mirror cabinet — added | Complements the washing area with storage. |
| 17 | 073 | Towel warmer — added | Accounts for the occupied bathroom wall. |
| 18 | 101 | Radiator — added | Helps to place furniture near windows precisely. |
| 19 | 102 | Air conditioner — added | Adds a recognizable object with the prospect of control in HA. |
| 20 | 110 | Curtains — added | Noticeably improve the similarity of rooms to the real apartment. |

Then close the remaining P0 gaps: the wall-hung toilet, wall shelf, coat rack, mirror, and the look of the pendant and sconce. Existing P0 items should also be checked for size and recognizability; the “Present” status does not remove this task. After the basic set, add P1 in small thematic batches: children's room, workspace, laundry, storage. Leave P2 for expansion.

## Original requirements for the expansion (2026-11-04)

The following eight points describe the state at the start of the research. They are kept as a rationale, not as a list of what is still undone. Check against the current code:

| Point | State as of 2026-11-07 |
|---|---|
| 1. Outline | L- and U-shaped items are handled via `footRects`, tests exist |
| 2. Height | Overlaps account for height; scenarios under a table, on a table and one above another are implemented. A universal link with a support is not implemented separately |
| 3. Kitchen | There are compatible straight and corner modules, a sink and a cooker; arbitrary insertion into a shared countertop is not implemented |
| 4. States | There are variants of folding items; a general system of opening and use zones is not implemented |
| 5. Lights | Light shapes and furniture backlighting exist. Static catalog items and lamps remain different entities |
| 6–7. Variants and search | Variants and mirroring, tags and search are implemented |
| 8. Sizes | Size checks and fixes are recorded in D-029; further checking of look and placement is on typical plans |

Original wording:

1. **Outline on the plan.** Currently [layout.js](../../editor/src/core/layout.js) treats each item as a rectangle. For a corner sofa and table, the free niche must stay free; otherwise another item inside it gets a false warning.
2. **Height and support.** Currently conflicts are divided by the `lift` attribute: floor-standing and hanging. For a monitor on a desk, an oven inside a tall cabinet, a rug under furniture, a dryer above a washing machine and a desk under a loft bed, height, a link to the support and more precise intersection rules are needed.
3. **Kitchen as a composition.** The sink and hob must be placed into a countertop, appliances into a module. An L-shaped kitchen is a set of straight and corner modules, not yet another immovable model of a whole kitchen.
4. **Working states.** A sofa bed, extendable table, wall bed and drying rack need at least two footprints. A simple stretch of the closed model does not replace the open state. Store opening and use zones separately from the solid body.
5. **Light without double counting.** The floor lamp already exists both as furniture and as a light shape. The look of a lamp is worth linking to the existing light. Ceiling shades, spots, lines and strips are already part of the lights mode; they stay in its development, although they are not included as extra rows in these 120.
6. **Families and variants.** A hinged wardrobe and a sliding wardrobe can share a carcass; base cabinets, a common generator; bathtubs, a common bowl base. A catalog item should denote an item understandable to the user, not a separate color or a random size.
7. **Items in different rooms.** A shelving unit, pouf, mirror and bench should be found by several room tags without duplicating the model. Search by synonyms is useful: “banquette”, “bench”, “shoe cabinet”, “shoe rack”.
8. **Sizes and style.** At the modeling stage, choose real reference products and verify dimensions; exact sizes were not asserted here. Appliances are better with several size presets, cabinet furniture with adjustable sizes, upholstered furniture with controlled proportions. All items must read well in the overall view of the apartment.

## How to check priorities after the first batch

Assemble several reference scenes: a studio with a sofa bed, an apartment with a separate bedroom, a family apartment with a children's room, a compact toilet room and a kitchen with a corner. Check the ability to reproduce large items without substituting random boxes, the correctness of passages and intersections, the clarity of search and the look in 3D.

During further trials, record which missing items the user looked for, what they had to replace them with and what prevented finishing the room. Reorder P1/P2 based on these observations. Do not promise an apartment coverage percentage in advance: there is no data for it yet.

## Implementation progress

- 2026-11-09 (D-064, furnishing the examples): added tabletop decor (books, a vase of eucalyptus, candles on a tray, a fruit bowl, a bowl — stands on furniture at its height), a staircase (solid or open steps, a handrail on the open side, mirrored) and a piano (upright, digital). Variants: a bed with an upholstered or a wooden headboard (in a fabric color upholstered all over), a shelving unit with books / styled / boxes / empty, toy storage with neutral bins, an upholstered bench, a botanical print. A kitchen worktop (gray stone, white quartz, oak, walnut, black stone) for every unit with one, set for the whole room. Colors: sage for sofas and armchairs, poufs in fabrics, black chairs, stools and shelving, navy decor. The laundry basket is now woven, the sun lounger's wheels sit on legs.
- 2026-11-05: the catalog was checked against the ten typical homes ([typical-homes.md](typical-homes.md), D-030) — added garage and outdoors items, a boiler, an electrical panel, a network cabinet, a double sink and a double kitchen sink. Next, check against these homes rather than a single apartment.
- 2026-11-05: check for the first version (D-029). The furnishings of the owner's apartment from `apartment.glb` were moved onto the catalog — 51 items; added wall bars, “Above floor” for the TV stand, nightstand and sideboard, tall cabinets and wall cabinets up to the ceiling, the wall-hung toilet box wider than the bowl, “Custom item” for niches and panels. Default sizes were checked against typical ones (point 8 of “What matters to decide”): the bed, air conditioner, mirror and bar stool were corrected.
- 2026-11-04: the list was closed. The remaining P1 — living room and bedroom (U-shaped sofa — a U on the plan, side and dressing tables, floor mirror, clothes rack), kitchen (island with an overhang for bar stools, electric and gas cooker, side-by-side and French door as refrigerator variants, countertop microwave, extendable and drop-leaf tables, bar stool, stool, bin and sorting), bathroom (freestanding bathtub, shower without a tray, wall-hung cabinet as a variant, tall cabinet, water heater, shower column; the sink cabinet was reworked — a ceramic countertop with a bowl), climate (purifier, convector, thermostat), decor (rug under furniture, roller blind, blinds and “day-night”). Then all P2: recliner, chaise, soundbar, speaker, electric fireplace, wall bed, room divider, cart, coffee machine, bidet, PC tower, printer, playpen, kids' table, humidifier, fan, painting and poster, aquarium, scratching post, pet bed. Next — by observations: what was looked for and not found, what is awkward to place.
- 2026-11-04: look of lamps in 3D — pendant (opal dome, cap, cord, ceiling canopy), sconce (wall plate, bracket, shade), floor lamp and table lamp (open shade with a bulb, a ceramic base for the table one), ceiling shade. P1 in thematic batches: children's room (crib, bunk bed, loft bed, changing dresser, high chair, toy shelf), workspace (corner desk, “Sitting / Standing” adjustable desk, rolling pedestal, monitor), laundry (vertical washer — a variant, dryer, basket, drying rack and ironing board “Unfolded / Folded”, utility cabinet, robot vacuum with a dock), storage (sliding wardrobe — a wardrobe variant, corner wardrobe, wardrobe section, display cabinet, sideboard, coat stand). Point 2 of “What matters to decide” advanced: the chair, armchair and rolling pedestal slide under a desk, the monitor stands on a desk, the loft bed goes over a desk, the dryer over a washer. P1 of the living room, kitchen, bathroom, climate and decor remain, then P2.
- 2026-11-04: the first 20 are closed. Added: a corner sofa with an ottoman (an L on the plan — the niche is free, point 1 is closed for L-shaped items), a sofa bed (two states with different depth, point 4 — for it), a wall-mounted sink and a pedestal one, a mirror cabinet with backlight, a towel warmer (ladder, serpentine), a radiator (sectional, panel), an air conditioner, curtains (sheer, drapes open or closed; they center on the window and take its width). Existing P0 items were redone in our own code instead of Kenney — sofa, armchair, coffee table, round table, chair, desk (sizes are now adjustable), work chair, floor lamp, plant; Kenney duplicates are hidden from the catalog. Colors by the item's nature (fabrics, fronts, appliances, chrome). Then from the remaining P0: wall shelf, coat rack with hooks (with or without a shelf), wall mirror (rectangular, round, arch); the wall-hung toilet is a toilet variant. Of P0 the look of the pendant and sconce remains (lights mode) — then P1 in batches.
- 2026-11-04: the queue moved to the editor's main thread (D-027). Items 2–12 of the queue were added: toilet (floor-standing and wall-hung — 061 and 062 as one item), bathtub, shower cabin (rectangular and semicircular, left and right), washing machine, sink (from 80 cm — with a drainboard), hob (drawers or an oven under it — this also closes 044), dishwasher (semi-integrated, with a button panel), corner cabinet (L, left and right), tall cabinet (cabinet or with an oven), range hood (dome or slanted, height above the floor varies). All of it is our own code, with no external models. For this the editor got: item variants (`vars`), “Mirror” (`mirror`), height of hanging items, snapping to a neighbor at a wall, overlap by height (point 2 of “What matters to decide” — partly: hanging and floor-standing; support and “on a table” — not yet). Kitchen modules are 60 cm each with a shared plinth and countertop (point 3 — partly: the sink and hob as modules, not as an insertion into an arbitrary countertop). The outline on the plan of the corner cabinet is still a rectangle (point 1).
- 2026-11-04: added `fridge` — a generic two-compartment refrigerator created in code without external models, textures or branding. Initial size 60 × 65 × 185 cm (width × depth × height); width 50–90, depth 50–85, height 140–220 cm. These are the parameters of our model, not the specification of a specific product. Checked: dimensions, position on the floor, display in the editor, the build and existing tests. The model is static: door opening and the access zone are not implemented yet.
