# Home Twin integration for Home Assistant

The editor from [`editor/`](../editor/README.md) inside Home Assistant, with the plan stored in HA itself. The integration code is [`custom_components/home_twin`](../custom_components/home_twin) at the repository root (that is where the HACS / Marketplace catalog expects it); this page covers how it works, the test HA and releasing a version. Decisions: [D-053](../docs/decisions.md) (dashboard, plan in HA), D-054 (setup dashboard instead of a menu item, packaging). There is no dashboard card yet.

## How it works
```
custom_components/home_twin/
  manifest.json      domain home_twin, one entry (single_config_entry); version is set by the release
  __init__.py        panel (panel_custom, in its own iframe), serving frontend/, plan websocket commands
  config_flow.py     one-button setup
  const.py           addresses and names
  translations/      en, ru — texts of the setup flow and the “Done” dialog with a link to the editor
  brand/             icon (icon.png 256, icon@2x.png 512) — HA 2026 takes it from a third-party integration
  frontend/panel.js  editor build (editor: npm run build) — not in git, goes into the release archive
hacs.json            for the catalog: install from the release archive home_twin.zip, HA from 2026.11
```
- **Where the editor is.** It is opened at the start and then only occasionally, so there is no sidebar item: the panel is registered as the integration's configuration panel (`config_panel_domain`, as with ZHA, Z-Wave, Matter) — the “Configure” button on Home Twin in “Settings → Devices & services”. Right after adding, the “Done” dialog has a “Draw your home” link (`config.create_entry.default`). The address is `/home-twin`, administrators only. Later there will also be an entry point on the dashboard card.
- **The plan** is `.storage/home_twin.plan`: `{plan, rev}`. Commands: `home_twin/plan/get` → `{plan, rev}`; `home_twin/plan/save {plan, rev?}` → `{rev}` (administrator only). `rev` is the revision the change was based on: if the plan was already changed in another window, the result is a `conflict` error and the editor asks “Load from HA / Keep mine”. Written to disk with a 2 s delay. Included in HA backups.
- **Removal.** If you remove the integration, the panel disappears but the plan stays: install it again and it is back. To delete it completely, remove the file `.storage/home_twin.plan`.
- **The panel** is `panel_custom` with `embed_iframe`: the editor has its own document, so its styles and `document.getElementById` work as in a standalone app. HA creates `<home-twin-panel>` and sets `hass`; [ha-panel.js](../editor/src/ha-panel.js) inserts the shell and starts the editor once the HA registries have arrived. Language, number and time formats (the HA profile’s “Number format” and “Time format”, D-055) and dark theme follow HA. There is no demo apartment in the panel.
- **The HA layer** is [ha-live.js](../editor/src/editor/ha-live.js): the same interface as the demo (`editor/ha.js`), built from `hass` — registries, states (events within a frame are merged), commands, history, statistics, weather with an hourly forecast, the HA entity card.
- Area for a lamp: for an entity without a name of its own, HA 2026.11 does not accept an area on the entity itself — it is written to its device.

Not yet as it will be: the plan photo is stored in the browser (IndexedDB), not in HA; there is no dashboard card.

## Releasing a version
A GitHub release tagged `v0.1.0` → [release.yml](../.github/workflows/release.yml) builds the editor, runs the tests, puts `0.1.0` into `manifest.json` and attaches `home_twin.zip` (the contents of `custom_components/home_twin` together with `frontend/panel.js`). The catalog installs exactly that (`hacs.json`: `zip_release`, `hide_default_branch` — it cannot be installed from a branch without a build). [validate.yml](../.github/workflows/validate.yml) on every push: hassfest, the HACS check (works only for a public repository), editor build and tests.

To build the same archive locally: `cd editor && npm run build && cd ../custom_components/home_twin && zip -r /tmp/home_twin.zip . -x '__pycache__/*'`.

## Test HA (Docker on Mac)
```
cd integration
docker run -d --name home-twin-ha -p 8123:8123 -e TZ="$(readlink /etc/localtime | sed 's#.*/zoneinfo/##')" \
  -v "$PWD/dev/config:/config" -v "$PWD/../custom_components/home_twin:/config/custom_components/home_twin" \
  ghcr.io/home-assistant/home-assistant:stable
node tools/ha-dev.mjs onboard   # user dev / devdevdev, language en, token in dev/token.json
node tools/ha-dev.mjs seed      # five areas, demo entities in them, the home_twin integration
node tools/ha-dev.mjs ws '{"type":"home_twin/plan/get"}'
```
`dev/config/configuration.yaml` has `demo:` (fake lights, climate, covers, sensors, taps, a camera, weather). `dev/` is not in git. Building the panel: `cd editor && npm run build` (or `npm run dev` — rebuilds on changes); then refresh the HA page. `node tools/ha-dev.mjs tokens` — tokens for the browser (`localStorage.hassTokens`), to log in without the form during checks.
