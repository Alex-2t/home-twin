# Free version: target product and stages

Updated **2026-11-07** per D-015, D-016, D-024–D-044 and the current code. This is the product plan; actual readiness and open tasks are in [status.md](status.md).

## Goal

The user installs the package in Home Assistant and gets their apartment in 3D with live lighting, without Blender or hand-written YAML. The goal for the first run is 15 minutes; for now that is a target, not a measured result. Principle D-014 — minimum effort from the user.

The free version introduces the product and the turnkey home-modelling service. The set of paid modules and the prices are not yet approved (O-006).

## Scope and readiness

| Part | Current state |
|---|---|
| Editor: photo, outline and rooms, doors and windows | Implemented as a standalone web app |
| Furniture, floor and wall finishes, light placement | Implemented in the editor |
| Sensors on walls and the home 3D view | Implemented as additional steps. Whether they are paid in the future package needs a decision |
| Ten languages, light and dark themes | Implemented |
| Saving and JSON | Work in the browser; there is no HA storage yet |
| Integration, panel in the HA sidebar, HACS package | Planned, not implemented in the repository |
| Real states and device control | For now `mockHA` with demo data |
| A card with 3D and a regular apartment dashboard | Planned per D-015; the light code from the card in the core is not a finished card |
| Ready-made apartment model `.glb` | Target scenario D-005; there is no user import of a whole apartment yet |
| AI draft from a photo | Experiment in a sketch; inclusion in the first release is undecided (O-007) |

Static models of curtains, air conditioners and a robot vacuum are in the catalog; this is not yet control of them through HA. Statistics, device history, energy, airflow and vacuum movement remain candidates for later releases / Pro. The undo history in the editor is a different, already implemented feature.

Multiple floors, round walls, variable ceiling height, attics, roofs and a garden are not part of the current editor. Extending it for houses needs a separate decision under D-030. The editor targets desktop and tablet; phone support for the editor is not promised. The future card needs to be checked on a phone separately.

## First run

Today the start screen offers “Upload a plan”, “Draw from scratch”, “Demo home” and, if a saved project exists, “Continue”.

After the photo, the user sets the area from documents or a known wall length. The photo is aligned automatically and can be rotated by hand. Then come **six main steps**:

1. **Outline** — trace the apartment.
2. **Rooms** — split the outline, remove what is extra.
3. **Windows and doors** — place openings on the walls.
4. **Room binding** — choose HA areas; two parts of one room are supported. For now the list comes from mockHA.
5. **Furniture** — place the needed items. This step comes before lights, because a strip may run under cabinets or a bed.
6. **Lights** — check the proposed view and the place of the fixtures, adjust and confirm the room.

A main step can be postponed: it stays unfinished in the summary. A light draft does not count as confirmed. Confirmation and postponement are stored in the plan (D-042).

The wizard card is pinned at the bottom; the step bar is always visible, help expands on “?”. The summary shows what is unfinished and offers sensors on walls and a view for the card (D-043). AI does not take part in the current scenario.

After embedding in HA, integration setup will appear before this scenario, and adding the card to a dashboard after it. These actions are not implemented yet.

## Screen

The canvas fills the screen, and the controls are in floating panels. Modes: “Plan / Furniture / Lights / Sensors”. Either the plan or 3D can be the main view, with the other one in a small window or side by side. A selected object has its own panel; exact parameters expand on demand. Details are in the [editor README](../editor/README.md).

For the future card, D-015 provides a panel on the right: the apartment, weather, scenes, rooms and their climate, light and climate per room; at the bottom, a row of rooms. What of the panel goes into the free version and what into Pro must be decided at the card stage.

## Proposed structure of the HA package

The current code is split into `editor/src/core/` and `editor/src/editor/`; the HA adapter must replace [`mockHA`](../editor/src/editor/ha.ts). The following structure is a draft; these files are not in the repository yet:

```text
custom_components/home_twin/
  __init__.py, manifest.json, config_flow.py, translations/
  frontend/               # built editor and card
```

Proposal for O-005: the plan in `.storage/home_twin` via HA storage, the last 10 versions for rollback; photos and models in `/config/home_twin/`. Commands to read, write and subscribe to the plan, and to upload files; writing with a permission check. Command names and file formats will be refined during implementation; there is no existing API yet.

When connecting, the registries, value subscriptions, commands and behavior on connection loss must be checked. The code and personal data from `3d_floor` remain the source of the demo for internal development; the public delivery must build on its own with a prepared demo.

## Release order

The numbers are kept for references from the journal. Per D-016, **stage 3 first**, then 0–2 and 4–7. The “5–7 weeks” estimate from the 2026-11-03 draft is outdated and is not the current schedule.

| # | Stage | What is left / readiness criterion |
|---|---|---|
| 3 | Finish the standalone editor | Most features already exist; what remains is checking typical plans, the beginner path, screen sizes and lighting speed. Tasks are in [status.md](status.md) |
| 0 | HA test environment | Choose an environment and check installation; Docker on Mac was a proposal |
| 1 | Integration and panel | Implement storage and loading; after an HA restart the plan and files are in place |
| 2 | Connection with HA | Bindings, states and commands work on test devices; placement follows the current wizard |
| 4 | Dashboard card | The plan, a regular apartment dashboard, control; checked on desktop, tablet and phone |
| 5 | Ready-made model | The user can upload an apartment model and a description of devices |
| 6 | Public package | Independent build, prepared demo, license, instructions, installation checks and release |
| 7 | Publications | Submission to the HACS catalog and posts on platforms — at the owner's decision |

Before the corresponding stages, decisions remain on the name, license, public demo, the content of the free card / Pro and whether to include the AI draft. They are listed together with other open questions in [status.md](status.md).
