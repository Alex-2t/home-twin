# Project state and remaining work

Checked against the code: **2026-11-09**. The main development is in [`editor/`](../editor/README.md). It runs as a standalone web app with demo Home Assistant data and as a panel inside Home Assistant (the integration [`custom_components/home_twin`](../custom_components/home_twin), [integration/README.md](../integration/README.md)); the dashboard card — the first step (D-059).

This is the current work list. The [decision journal](decisions.md) keeps the history, the [free version plan](free-version.md) describes the target product, and research and sketch READMEs record the state as of their own dates. “Implemented” below means present in the code, not ready for a public release.

## Already implemented

| Area | What exists | Where to check |
|---|---|---|
| App | Standalone editor, start from a photo / from scratch / one of thirteen examples, each furnished like a designer interior (D-062, D-064), continuing a project | [main.js](../editor/src/main.js), [flows.js](../editor/src/editor/flows.js) |
| Wizard | Outline, rooms, windows and doors, room binding, furniture, lights. Additionally a question about sensors (the 3D view is their first tile), and in the summary “See the result”. Confirmation and postponement are saved in the plan | [wizard-path.js](../editor/src/editor/wizard-path.js), [wizard-state.js](../editor/src/editor/wizard-state.js); D-041–D-043 |
| Photo and scale | Underlay, automatic alignment, rotation and moving, scale by area or wall length | [underlay.js](../editor/src/editor/underlay.js), [flows.js](../editor/src/editor/flows.js); D-038, D-040 |
| Geometry | Rooms, split, corners, shared walls, thickness, merging, doors and windows | [plan.js](../editor/src/core/plan.js), [geometry.js](../editor/src/core/geometry.js), [openings.js](../editor/src/editor/modes/openings.js) |
| Areas | Binding to an area from mockHA, two parts of one room with different areas | [rooms.js](../editor/src/editor/modes/rooms.js); D-024 |
| Finishes | 26 floor coverings (with lawn and gravel), 42 wall finishes (paint, plaster, wallpaper, tile, marble, zellige, brick, wood and fluted panels, boiserie), custom color, finishing of individual wall sides | [surfaces.js](../editor/src/core/surfaces.js); D-028, D-031 |
| Furniture | Sizes, variants, mirroring, snapping, height-aware intersections, “Custom item”, merging parts by material; tabletop decor standing on furniture, a staircase, a piano; the kitchen worktop for the whole kitchen; upholstered or wooden bed headboards; shelving books / styled / boxes (D-064) | [catalog.js](../editor/src/core/catalog.js), [layout.js](../editor/src/core/layout.js), [furniture3d.js](../editor/src/core/furniture3d.js); D-027, D-029 |
| Lights | Fixture shapes, points and lines, strips along walls and furniture, room draft and confirmation, fixture parts and relays; a pendant's shade (opal, black metal, globe, rattan), a linear light's body white or black (D-064) | [fixtures.js](../editor/src/core/fixtures.js), [lights.js](../editor/src/editor/modes/lights.js); D-025, D-026 |
| Sensors | A separate mode, choice of readings, placement on walls, size and caption, columns and skipping; values from mockHA | [sensors.js](../editor/src/editor/modes/sensors.js), [core/sensors.js](../editor/src/core/sensors.js); D-034 |
| View | Plan and 3D, switching the main view, window / split screen, day and night, home camera angle, themes | [app.js](../editor/src/editor/app.js), [scene.js](../editor/src/core/scene.js); D-017, D-018, D-035 |
| Preview | Full-screen 3D and the apartment card panel from 3d_floor one to one (its styles, icons, rules; Shadow DOM): weather with an hourly forecast (from HA, its own in the demo), “Now”, scenes “Home / Away / Night” with “Customize”, rooms with climate and charts, “Lights & climate” tiles, “Security” (camera, water tap, leaks), “Cleaning” (robot vacuum), “Statistics” (climate, energy, connectivity — from what HA keeps itself), “Customize panel” via a gear (order, remove / restore, “Favorites” cards with any HA entities; each room screen has its own layout), the room screen, the room strip; entered from the top bar and from the wizard summary. Light, climate, curtains and the tap work via states and commands through the HA layer (checked against the owner's live HA on 2026-11-08). There is no TV yet; statistics of lights and appliances come with the integration | [look.js](../editor/src/editor/look.js), [look/](../editor/src/look/); D-047, D-049, D-050 |
| Devices | Air conditioners, curtains and blinds, window and door sensors from HA: the “Devices” mode, auto-placement, airflow and curtains in 3D, open openings glow; control in “Preview”; a question in the wizard | [modes/devices.js](../editor/src/editor/modes/devices.js), [devices.js](../editor/src/core/devices.js); D-048 |
| Languages | Russian and nine translations; a string scanner and completeness tests | [i18n/](../editor/src/i18n/), [scanner](../editor/tools/i18n-scan.mjs); D-036 |
| Saving | Autosave, undo/redo (survives a reload), “Version history”, the backup slot “Restore previous plan”, JSON, file validation, saving drafts; the photo separately in IndexedDB (in the HA panel — in HA, D-058) | [Report 2026-11-07](research/persistence-audit-2026-11-07.md), [history.js](../editor/src/editor/history.js), [versions.js](../editor/src/editor/versions.js); D-051 |

2026-11-10: items from parts (`model: "parts"`, D-069) and a custom `#rrggbb` colour on every catalog model with a rug border colour (D-070); 322 tests pass.

The catalog as of the review date: **133 entries, 129 visible**, including “Custom item”. All visible entries use their own generators; four old Kenney entries are hidden. 13 Kenney files are still included in the build. These numbers do not equal the 120 functional items of the [research](research/furniture-catalog.md): items and variants were counted differently there.

## Nearest work on the editor

The order rests on D-016, D-029 and D-030: first finish the standalone editor. Ideas do not become mandatory features by appearing in the documentation.

| Work | What is left | Readiness criterion |
|---|---|---|
| Typical layouts — D-030 | **Done for one floor** (D-061): ten reference plans with HA data and a check in `npm test` (rooms, openings, furniture conflicts, auto-placement of lights, sensors and devices); each home opens from the start screen (D-062) and is furnished like a designer interior, every light placed; “Auto-place” is also checked on all of a home's lights from scratch (D-064). Left: zones in auto-placement of covers and sensor labels; multi-floor houses depend on a separate decision | Kept green as the editor changes; findings from new homes go into the check |
| Wizard on different screens | **Card overlap fixed** (D-061): at 1024 px it fits between the panel and the 3D window, upright it goes above the 3D window; checked at 768–1366 px, furniture and lights steps, reduced motion. Left: the whole path with the keyboard only, a real tablet | Actions are available on a desktop and the target tablet; states are consistent |
| Lighting speed | 2026-11-07: a constant set of light sources (D-011) is done — `scene.setLights` no longer removes sources, extra ones fade to zero, with a reserve of +3 area and +2 point lights. Measurement on the demo (a strip in the “Kids' room”, a segment appearing and disappearing while dragging): before, 8 shader rebuilds and a 1.5 s frame; now 0 rebuilds, average frame 17 ms. Left: measuring on a weak device and a phone; after release 1–2 shaders are still rebuilt (the room mask) | Repeat the measurement on a weak device; no noticeable pause when adding a lamp and editing a strip |
| Testing with beginners | The goal “your own apartment in 15 minutes” is not measured. The onboarding audit was expert-based | Several independent runs with time recorded and pain points noted |

Testing on a real tablet, trackpad and new users requires access to devices or people. Preparing scenarios and automated checks can be done independently.

## After the editor: release in Home Assistant

These are the not-yet-implemented parts of the target package D-015. The stages are described in more detail in the [release plan](free-version.md).

1. HA test environment — **exists** (2026-11-08): HA 2026.11 in Docker with `demo`, set up by a script ([integration/README.md](../integration/README.md)).
2. Integration — **skeleton exists** (D-053, D-054): a sidebar panel that is also the integration's configuration panel (“Home Twin” in the sidebar, the “Configure” button, a link after adding — D-056), the plan in `.storage` with a revision number, the plan photo in HA, edits that survive a lost connection (D-058). Left: updating the panel without a restart; then hour counters for light and appliance statistics (D-049).
3. HA layer on `hass` — **exists** ([ha-live.js](../editor/src/editor/ha-live.js)): registries, states, commands, history, statistics, energy, weather, the entity card; checked on the test HA. Checked 2026-11-08 (D-058): a non-administrator does not see the panel and can only read the plan and photo; a lost connection does not lose edits; leaving the panel frees its 3D (HA removes the iframe). Left: what the dashboard card shows to non-administrators.
4. Dashboard card — **first step exists** (D-059): `custom:home-twin-card` in the card picker without setup, the editor's “Preview” (3D and the home panel, control) on any dashboard, the plan updates live, stops drawing out of sight; free and open (D-052). “Add to dashboard” creates the Home Twin dashboard; on other dashboards the card is compact and opens it (D-060); checked in a browser at phone, tablet and desktop sizes. Left: checks on a real phone and tablet and in the HA companion app.
5. User upload of a ready apartment `.glb`. Loading built-in furniture models already exists; this is a different scenario.
6. Public delivery — **exists** (D-054): the repository [Alex-2t/home-twin](https://github.com/Alex-2t/home-twin) is public, release v0.1.0 with `home_twin.zip`, `hacs.json`, `LICENSE`, an icon, a build without `3d_floor` and personal data (a typical demo apartment), GitHub Actions (release; hassfest, HACS, tests — green); installation from the archive checked on an empty HA. Left: a more detailed README, a demo in the user's language.
7. Submission to the general catalog (hacs/default) — at the owner's decision. For now it is installed via “Add from link” (GitHub must be connected to HA) or from the archive.

## Questions not yet decided

- **O-009:** how to show lights and sensors together on the plan. Currently light is also drawn in sensors mode.
- **O-008:** arbitrary zones over rooms. Two parts of one room exist; zones over several rooms do not.
- **O-007:** the AI draft in the product and in which release. There is an experiment in a sketch; there is no AI Task call from the editor.
- **O-005:** final storage and API inside HA; there is the D-015 proposal.
- **Price of the AI build (D-063):** a one-time purchase per home; the price is not decided, the cost per home is to be measured on real photos first.
- **O-006, O-004:** the content and price of Pro, the boundary of the free version, the license and the scope of open code. The presence of sensors in the editor does not determine whether the future card is paid.
- **O-003:** payment and withdrawing money. Commercial information from the research needs a separate up-to-date check before payment is launched.
- The name, a public demo; floors, ceiling height, attics and open terraces from D-030 — a separate decision about scope.

O-010 was withdrawn by D-041: furniture is before lights again. O-002 is effectively closed by the implementation: our own editor on three.js and polygon-clipping. For O-001 the nearest order D-016 is set — a standalone app, then embedding in HA; a website as a standalone editor remains a separate possibility.

## Verified and limitations

The latest code run, **2026-11-09**: 299 tests passed (including the thirteen example homes, D-061, D-064), the build succeeded; all thirteen homes looked at in Preview (overview and room close-ups) — 2026-11-09; the wizard card at 768–1366 px — 2026-11-08; browser checks of saving — in the [report](research/persistence-audit-2026-11-07.md). No new functional checks were made during this documentation review.

The editor is single-floor, and the wall height is fixed in the code. JSON does not contain the photo. Real HA devices and public installation have not been verified yet. The ten typical homes are made-up plans checked by the editor's code and by eye, not by real users.
