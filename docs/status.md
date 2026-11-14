# Project state and remaining work

Checked against the code: **2026-11-14** (the table and the counts; the sections below keep their own dates). The main development is in [`editor/`](../editor/README.md). It runs as a standalone web app with demo Home Assistant data and as a panel inside Home Assistant (the integration [`custom_components/home_twin`](../custom_components/home_twin), [integration/README.md](../integration/README.md)); the dashboard card — the first step (D-059).

This is the current work list. The [decision journal](decisions.md) keeps the history, the [free version plan](free-version.md) describes the target product, and research and sketch READMEs record the state as of their own dates. “Implemented” below means present in the code, not ready for a public release.

## Already implemented

| Area | What exists | Where to check |
|---|---|---|
| App | Standalone editor, start from a photo / from scratch / one of thirteen examples, each furnished like a designer interior (D-062, D-064), continuing a project | [main.ts](../editor/src/main.ts), [flows.ts](../editor/src/editor/flows.ts) |
| Wizard | Outline, rooms, windows and doors, room binding, furniture, lights. Additionally a question about sensors (the 3D view is their first tile), and in the summary “See the result”. Confirmation and postponement are saved in the plan | [wizard-path.ts](../editor/src/editor/wizard-path.ts), [wizard-state.ts](../editor/src/editor/wizard-state.ts); D-041–D-043 |
| Photo and scale | Underlay, automatic alignment, rotation and moving, scale by area or wall length | [underlay.ts](../editor/src/editor/underlay.ts), [flows.ts](../editor/src/editor/flows.ts); D-038, D-040 |
| Geometry | Rooms, split, corners, shared walls, thickness, merging, doors and windows | [plan.ts](../editor/src/core/plan.ts), [geometry.ts](../editor/src/core/geometry.ts), [openings.ts](../editor/src/editor/modes/openings.ts) |
| Areas | Binding to an area from mockHA, two parts of one room with different areas | [rooms.ts](../editor/src/editor/modes/rooms.ts); D-024 |
| Finishes | 26 floor coverings (with lawn and gravel), 42 wall finishes (paint, plaster, wallpaper, tile, marble, zellige, brick, wood and fluted panels, boiserie), custom color, finishing of individual wall sides | [surfaces.ts](../editor/src/core/surfaces.ts); D-028, D-031 |
| Furniture | Sizes, variants, mirroring, snapping, height-aware intersections, “Custom item”, merging parts by material; tabletop decor standing on furniture, a staircase, a piano; the kitchen worktop for the whole kitchen (five or a custom colour, D-NEXT); upholstered or wooden bed headboards; shelving books / styled / boxes (D-064) | [catalog.ts](../editor/src/core/catalog.ts), [layout.ts](../editor/src/core/layout.ts), [furniture3d.ts](../editor/src/core/furniture3d.ts); D-027, D-029 |
| Lights | Fixture shapes, points and lines, strips along walls and furniture, room draft and confirmation, fixture parts and relays; a pendant's shade (opal, black metal, globe, rattan), a linear light's body white or black (D-064); every fitting's body colour: default, white, black or custom (`light.body`, D-NEXT) | [fixtures.ts](../editor/src/core/fixtures.ts), [lights.ts](../editor/src/editor/modes/lights.ts); D-025, D-026 |
| Sensors | A separate mode, choice of readings, placement on walls, size and caption, columns and skipping; values from mockHA | [sensors.ts](../editor/src/editor/modes/sensors.ts), [core/sensors.ts](../editor/src/core/sensors.ts); D-034 |
| View | Plan and 3D, switching the main view, window / split screen, day and night, home camera angle, themes | [app.ts](../editor/src/editor/app.ts), [scene.ts](../editor/src/core/scene.ts); D-017, D-018, D-035 |
| Preview | Full-screen 3D and the apartment card panel from 3d_floor one to one (its styles, icons, rules; Shadow DOM): weather with an hourly forecast (from HA, its own in the demo), “Now”, scenes “Home / Away / Night” with “Customize”, rooms with climate and charts, “Lights & climate” tiles, “Security” (camera, water tap, leaks), “Cleaning” (robot vacuum), “Statistics” (climate, energy, connectivity — from what HA keeps itself), “Customize panel” via a gear (order, remove / restore, “Favorites” cards with any HA entities; each room screen has its own layout), the room screen, the room strip; entered from the top bar and from the wizard summary. Light, climate, curtains and the tap work via states and commands through the HA layer (checked against the owner's live HA on 2026-11-08). There is no TV yet; statistics of lights and appliances come with the integration | [look.ts](../editor/src/editor/look.ts), [look/](../editor/src/look/); D-047, D-049, D-050 |
| Devices | Air conditioners, curtains and blinds, window and door sensors from HA: the “Devices” mode, auto-placement, airflow and curtains in 3D, open openings glow; control in “Preview”; a question in the wizard | [modes/devices.ts](../editor/src/editor/modes/devices.ts), [devices.ts](../editor/src/core/devices.ts); D-048 |
| Languages | Russian and nine translations; a string scanner and completeness tests | [i18n/](../editor/src/i18n/), [scanner](../editor/tools/i18n-scan.ts); D-036 |
| Saving | Autosave, undo/redo (survives a reload), “Version history”, the backup slot “Restore previous plan”, JSON, file validation, saving drafts; a plan that arrives unchecked is mended on load, one bad entry left out or drawn as a box instead of breaking the home (D-NEXT); the photo separately in IndexedDB (in the HA panel — in HA, D-058) | [Report 2026-11-07](research/persistence-audit-2026-11-07.md), [history.ts](../editor/src/editor/history.ts), [versions.ts](../editor/src/editor/versions.ts); D-051 |

| AI build (paid, D-063) | The editor's side of the paid “build my home” service: the way in, the upload, the progress that keeps talking, the finished home with pins and their answers (D-072–D-079, D-081, D-083); what the build may set beyond the manual controls — items from parts, a custom colour on every model, pieces of finish, skirting and trim (D-069, D-070, D-080, D-084); the package shown in percent and its checkout (D-085, D-086). Sign-in with the balance on an account (D-088) is on the branch `ai-build-accounts`, not merged yet. The build itself runs on our server and is not in this repository | [ai-build.ts](../editor/src/editor/ai-build.ts), [ai-review.ts](../editor/src/editor/ai-review.ts), [ai-pins.ts](../editor/src/editor/ai-pins.ts) |
| Code | TypeScript (strict), formatted by Prettier; `npm run check` runs the formatter's check, `tsc` and the tests (D-087) | [code-style.md](code-style.md) |

2026-11-10: items from parts (`model: "parts"`, D-069) and a custom `#rrggbb` colour on every catalog model with a rug border colour (D-070). 2026-11-14: 362 tests pass.

The catalog on 2026-11-14: **134 entries, 129 visible**, including “Custom item”. All visible entries use their own generators; four old Kenney entries are hidden. 13 Kenney files are still included in the build. These numbers do not equal the 120 functional items of the [research](research/furniture-catalog.md): items and variants were counted differently there.

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
3. HA layer on `hass` — **exists** ([ha-live.ts](../editor/src/editor/ha-live.ts)): registries, states, commands, history, statistics, energy, weather, the entity card; checked on the test HA. Checked 2026-11-08 (D-058): a non-administrator does not see the panel and can only read the plan and photo; a lost connection does not lose edits; leaving the panel frees its 3D (HA removes the iframe). Left: what the dashboard card shows to non-administrators.
4. Dashboard card — **first step exists** (D-059): `custom:home-twin-card` in the card picker without setup, the editor's “Preview” (3D and the home panel, control) on any dashboard, the plan updates live, stops drawing out of sight; free and open (D-052). “Add to dashboard” creates the Home Twin dashboard; on other dashboards the card is compact and opens it (D-060); checked in a browser at phone, tablet and desktop sizes. Left: checks on a real phone and tablet and in the HA companion app.
5. User upload of a ready apartment `.glb`. Loading built-in furniture models already exists; this is a different scenario.
6. Public delivery — **exists** (D-054): the repository [Alex-2t/home-twin](https://github.com/Alex-2t/home-twin) is public, release v0.1.0 with `home_twin.zip`, `hacs.json`, `LICENSE`, an icon, a build without `3d_floor` and personal data (a typical demo apartment), GitHub Actions (release; hassfest, HACS, tests — green); installation from the archive checked on an empty HA. Left: a more detailed README, a demo in the user's language.
7. Submission to the general catalog (hacs/default) — at the owner's decision. For now it is installed via “Add from link” (GitHub must be connected to HA) or from the archive.

## Questions not yet decided

- **O-009:** how to show lights and sensors together on the plan. Currently light is also drawn in sensors mode.
- **O-008:** arbitrary zones over rooms. Two parts of one room exist; zones over several rooms do not.
- **O-007:** the AI draft in the product and in which release. There is an experiment in a sketch; there is no AI Task call from the editor.
- **O-005:** final storage and API inside HA; there is the D-015 proposal.
- **The AI build's package (D-085, D-086):** prepaid packages replaced the one-time purchase of D-063. Not decided: the exact package and top-up sizes, whether and when an unused balance expires and how that is worded, a refund of the unspent part within 14 days, how the bar estimates an action before it starts. A lawyer checks the terms before launch.
- **O-011:** privacy for the AI build. Since it was written, photos and videos are kept after the build and faces are not blurred on the server (2026-11-13, 2026-11-14), and the service is hosted outside the EU for now — see O-011's update.
- **O-006:** the content and price of Pro, the boundary of the free version. The presence of sensors in the editor does not determine whether the future card is paid. O-004 is decided: GPL-3.0.
- **O-003:** payment from Moldova — a merchant of record is chosen and its checkout works in test mode (D-086); live payments, payouts and the terms are left.
- The name, a public demo; floors, ceiling height, attics and open terraces from D-030 — a separate decision about scope.

O-010 was withdrawn by D-041: furniture is before lights again. O-002 is effectively closed by the implementation: our own editor on three.js and polygon-clipping. For O-001 the nearest order D-016 is set — a standalone app, then embedding in HA; a website as a standalone editor remains a separate possibility.

## Verified and limitations

The latest code run, **2026-11-14**: 362 tests passed (including the thirteen example homes, D-061, D-064), the build succeeded. Earlier: all thirteen homes looked at in Preview (overview and room close-ups) — 2026-11-09; the wizard card at 768–1366 px — 2026-11-08; browser checks of saving — in the [report](research/persistence-audit-2026-11-07.md). No new functional checks were made during this documentation review.

The editor is single-floor, and the wall height is fixed in the code. JSON does not contain the photo. Real HA devices and public installation have not been verified yet. The ten typical homes are made-up plans checked by the editor's code and by eye, not by real users.
