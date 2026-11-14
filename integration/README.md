# Home Twin integration for Home Assistant

The editor from [`editor/`](../editor/README.md) inside Home Assistant, with the plan stored in HA itself, and the dashboard card. The integration code is [`custom_components/home_twin`](../custom_components/home_twin) at the repository root (that is where the HACS / Marketplace catalog expects it); this page covers how it works, the test HA and releasing a version. Decisions: [D-053](../docs/decisions.md) (the editor in HA, plan in HA), D-054 and D-056 (where the editor is, packaging), D-058 (the plan photo, no connection), D-059 (the dashboard card).

## How it works
```
custom_components/home_twin/
  manifest.json      domain home_twin, one entry (single_config_entry); version is set by the release
  __init__.py        panel (panel_custom, in its own iframe), plan and photo commands, the photo address, taking up a new build
  serve.py           serving frontend/ build by build: /home_twin_static/<build>/<file>
  config_flow.py     one-button setup
  const.py           addresses and names
  translations/      en, ru — texts of the setup flow and the “Done” dialog with a link to the editor
  brand/             icon (icon.png 256, icon@2x.png 512) — HA 2026 takes it from a third-party integration
  frontend/          the build (editor: npm run build) — not in git, goes into the release archive:
    panel.js           the editor panel
    card.js            the dashboard card's small loader, on every HA page
    card-app.js        the card's 3D and home panel, loaded where a card is shown
    build.json         every file's sha256 and the build id made from them
hacs.json            for the catalog: install from the release archive home_twin.zip, HA from 2024.7
```
- **Where the editor is.** In the sidebar — “Home Twin” (`mdi:floor-plan`), admins only, like other floor-plan integrations (NeonPlan 3D, NextFloor); a user who doesn't need it hides it with HA's own sidebar editing. The panel is also the integration's configuration panel (`config_panel_domain`): the “Configure” button on Home Twin in “Settings → Devices & services” opens it, and the dialog after adding links to it (“Draw your home”). Address — `/home-twin`. Later the dashboard card will link to it too (D-054, D-056).
- **The plan** is `.storage/home_twin.plan`: `{plan, rev}`. Commands: `home_twin/plan/get` → `{plan, rev}`; `home_twin/plan/subscribe` → events `{plan, rev}` now and after every write (the card); `home_twin/plan/save {plan, rev?}` → `{rev}` (administrator only). `rev` is the revision the change was based on: if the plan was already changed in another window, the result is a `conflict` error and the editor asks “Load from HA / Keep mine”. Written to disk with a 2 s delay. Included in HA backups.
- **The plan photo** (D-058) is the file `.storage/home_twin.photo`. `POST /api/home_twin/photo` with the image as the body (administrator) → `{id}`; `GET /api/home_twin/photo?v=<id>` → the image (any signed-in user; the address changes with the photo, so the browser caches it). Its placement on the plan is kept with the plan: `home_twin/photo/get` → `{photo: {id, type, size, place} | null, never}`; `home_twin/photo/place {photo: id, place: {a, b, opacity, visible}}`; `home_twin/photo/delete`. `never` — HA has never had a photo: the editor then brings over the one it kept in the browser before D-058.
- **No connection.** While HA is unreachable the editor says “Not saved”, keeps the plan and the photo in the browser with a mark of what was not sent, and sends them when HA is back or at the next start (if another window wrote in between — “Load from HA / Keep mine”).
- **Removal.** If you remove the integration, the panel disappears but the plan and the photo stay: install it again and they are back. To delete them completely, remove the files `.storage/home_twin.plan` and `.storage/home_twin.photo`.
- **The panel** is `panel_custom` with `embed_iframe`: the editor has its own document, so its styles and `document.getElementById` work as in a standalone app. HA creates `<home-twin-panel>` and sets `hass`; [ha-panel.js](../editor/src/ha-panel.js) inserts the shell and starts the editor once the HA registries have arrived. Language, number and time formats (the HA profile’s “Number format” and “Time format”, D-055) and dark theme follow HA. There is no demo apartment in the panel.
- **Updating without a restart** (D-097). Each build is served at its own address, `/home_twin_static/<build>/<file>`. The build id comes from the files' sha256, listed in `frontend/build.json`. The browser and HA's service worker may keep that address for a year, because it never gets other content. An update (HACS or a new zip) only replaces the files. Within a minute, or as soon as a page asks, the integration takes up the new build once the files on disk match its `build.json`. Until then it answers “try again”, so files half replaced are never served. From then on card.js of the new build is in every page HA sends. Open cards and an open editor show “Home Twin was updated · Reload” (`home_twin/frontend/subscribe`). An open editor is never reloaded by itself: the panel keeps its address while an editor is open (HA rebuilds a panel whose address changes). It moves on when the editor closes, or when its “Reload” is pressed (`home_twin/frontend/update_panel`). An old page's address of `panel.js` or `card.js` is redirected to the current build. An old card's `card-app.js` is not found, so the old card offers the reload and never runs half old, half new. **A change to the integration's Python code still needs an HA restart**, as with any integration: HACS asks for one, and until then the frontend files are already served new.
- **The HA layer** is [ha-live.js](../editor/src/editor/ha-live.js): the same interface as the demo (`editor/ha.js`), built from `hass` — registries, states (events within a frame are merged), commands, history, statistics, weather with an hourly forecast, the HA entity card.
- Area for a lamp: for an entity without a name of its own, HA 2026.11 does not accept an area on the entity itself — it is written to its device.

- **The dashboard card** (D-059) is `custom:home-twin-card`, “Home Twin” in the card picker: HA loads `card.js` on every page (`frontend.add_extra_js_url`), it loads `card-app.js` when a card is shown. The same 3D and home panel as the editor's “Preview” ([card-main.js](../editor/src/card-main.js)); the plan through `home_twin/plan/subscribe`. Best in a panel view (the whole screen); in other views it is 600 px tall (`height: 500` in its YAML to change). Settings written into the plan (scenes, panel layout) — administrators only. Out of sight it stops drawing; removed for a minute — it lets go of the 3D.
- **The Home Twin dashboard** (D-060): “Add to dashboard” at the end of the wizard or in the plan menu creates `home-twin-3d` (`lovelace/dashboards/create`, `lovelace/config/save`): in everyone's sidebar, one panel view with the card. While it exists, a card on any other dashboard is compact (3D, “Now”, rooms); a tap opens the dashboard, a room — with `?room=<id>`. `compact: false` keeps a card whole.

## Releasing a version
A GitHub release tagged `v0.1.0` → [release.yml](../.github/workflows/release.yml) builds the editor, runs the tests, puts `0.1.0` into `manifest.json` and attaches `home_twin.zip` (the contents of `custom_components/home_twin` together with the built `frontend/`: `panel.js`, `card.js`, `card-app.js`, `build.json`). The catalog installs exactly that (`hacs.json`: `zip_release`, `hide_default_branch` — it cannot be installed from a branch without a build). [validate.yml](../.github/workflows/validate.yml) on every push: hassfest, the HACS check (works only for a public repository), editor build and tests.

To build the same archive locally: `cd editor && npm run build && cd ../custom_components/home_twin && zip -r /tmp/home_twin.zip . -x '__pycache__/*'`.

## Older Home Assistant versions
The minimum is HA 2024.7: the integration serves the panel with `async_register_static_paths` / `StaticPathConfig`, which appeared in 2024.7 (also `ConfigFlowResult` — 2024.4, `single_config_entry` — 2024.3). Everything the panel reads from `hass` is older. Verified on 2024.7.4, 2025.1.4 and 2026.11.0: install from the zip, add, save the plan, Preview with weather and forecast, no console errors. Brand icons from `brand/` show from HA 2026 on; older versions show a placeholder. Check a version before a release:
```
integration/tools/try-version.sh 2024.7.4 8126   # fresh HA with demo, Home Twin from a release-like zip, demo plan saved
docker rm -f ht-try-2024-7-4
```

## Test HA (Docker on Mac)
```
cd integration
docker run -d --name home-twin-ha -p 8123:8123 -e TZ="$(readlink /etc/localtime | sed 's#.*/zoneinfo/##')" \
  -v "$PWD/dev/config:/config" -v "$PWD/../custom_components/home_twin:/config/custom_components/home_twin" \
  ghcr.io/home-assistant/home-assistant:stable
node tools/ha-dev.ts onboard   # user dev / devdevdev, language en, token in dev/token.json
node tools/ha-dev.ts seed      # five areas, demo entities in them, the home_twin integration
node tools/ha-dev.ts ws '{"type":"home_twin/plan/get"}'
```
`dev/config/configuration.yaml` has `demo:` (fake lights, climate, covers, sensors, taps, a camera, weather). `dev/` is not in git. Building the panel: `cd editor && npm run build` (or `npm run dev` — rebuilds on changes and rewrites `build.json`); then refresh the HA page. No HA restart is needed for frontend changes; Python changes need one. `node tools/ha-dev.ts tokens` — tokens for the browser (`localStorage.hassTokens`), to log in without the form during checks.
