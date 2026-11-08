# Home Twin

A live 3D twin of your home for Home Assistant: draw the floor plan, place lights, devices and sensors, and see the home in 3D with live states. Early alpha.

## Install
Requires Home Assistant 2026.11 or newer.

1. In Home Assistant open the Marketplace (HACS) → **Add from link** → `https://github.com/Alex-2t/home-twin` (the Marketplace asks to connect a GitHub account first, as for any repository outside its catalog). Download **Home Twin** and restart Home Assistant.
2. Settings → Devices & services → Add integration → **Home Twin**.
3. Click **Draw your home** in the dialog that follows. Later, open **Home Twin** in the sidebar (or Settings → Devices & services → Home Twin → Configure).

Manual install: download `home_twin.zip` from the latest release, unzip it into `config/custom_components/home_twin`, restart Home Assistant.

The editor is for administrators. The plan is stored in Home Assistant (`.storage/home_twin.plan`) and is included in backups. Removing the integration keeps the plan, so reinstalling brings it back; delete that file to remove it completely. For now the photo of the plan stays in the browser it was added from.

License: [GPL-3.0](LICENSE).

## Development

Product: a live 3D twin of your home for Home Assistant. The floor-plan editor and the card are free; paid services and add-ons are planned ([D-052](docs/decisions.md)).

This repository holds the code, decisions, business notes and research. It contains no personal data from the owner's apartment: its demo, openings and plan photo are kept local only (`editor/demo/own.mjs`, `prototypes/walls-from-json/own/` and the neighbouring `3d_floor` are in `.gitignore`); without them the demo is an invented typical apartment.

State as of 2026-11-08: a standalone editor and a Home Assistant integration (configuration panel, plan stored in HA), packaging for the catalog. The dashboard card is still ahead.

- [Project state and remaining work](docs/status.md) — what already works, the nearest tasks and open decisions
- [Decision journal](docs/decisions.md) — what was decided, why, status
- [Ideas](docs/ideas.md) — things that came to mind, not yet decided
- [Business](docs/business.md) — free and paid, marketplaces, payment, stages
- [Free version: target product and stages](docs/free-version.md)
- [Editor](editor/README.md)
- [Home Assistant integration](integration/README.md) — how it works, test HA in Docker, releasing a version
- [Competitors](docs/research/competitors.md)
- [Libraries and assets](docs/research/libraries.md)
- [Sketch: walls from JSON](prototypes/walls-from-json/README.md)
- [Sketch: floor-plan editor](prototypes/room-editor/README.md)
- [Furniture catalog: research of 120 functional items and progress](docs/research/furniture-catalog.md)
