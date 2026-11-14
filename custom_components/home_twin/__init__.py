"""Home Twin — a live 3D twin of your home for Home Assistant.

The integration gives the editor a place in HA: the /home-twin panel (frontend/panel.js — the editor/ build) and plan storage
in .storage/home_twin.plan. The panel is in the sidebar ("Home Twin", like other floor-plan integrations — each user can hide it
with HA's own sidebar editing) and is also the integration's config panel: the “Configure” button on Home Twin in
“Devices & services” opens it too (D-056). The editor talks to HA through the hass object that HA hands to the panel, and
reads and writes the plan with the websocket commands home_twin/plan/get and home_twin/plan/save. The revision number (rev) grows
with every write — that is how the editor sees that the plan was changed in another window.

The plan photo (D-058) is a file, .storage/home_twin.photo, sent and read over HTTP at /api/home_twin/photo. Its id, type and
placement on the plan are kept with the plan (home_twin/photo/get, home_twin/photo/place, home_twin/photo/delete).

The dashboard card (D-059): frontend/card.js is a small file HA loads on every page (add_extra_js_url), so “Home Twin” is in the card
picker without setup; the 3D itself (frontend/card-app.js) loads only where a card is shown. The card follows the plan with
home_twin/plan/subscribe: the plan now and after every write.

The panel and the card are served build by build (serve.py, D-NEXT): a new editor build put into frontend/ (an update) is taken up
without restarting HA — within a minute, or as soon as a page asks for it — and panels and cards already open are told
(home_twin/frontend/subscribe) so they offer a reload; an open editor is never reloaded by itself. A change to this Python code still
needs a restart, as with any integration.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import hashlib
from http import HTTPStatus
import json
import logging
import os
from pathlib import Path
from typing import Any

from aiohttp import web
import voluptuous as vol

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import KEY_HASS_USER, HomeAssistantView
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import Unauthorized
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_connect, async_dispatcher_send
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType

from .const import (
    DOMAIN,
    PANEL_ELEMENT,
    PANEL_URL,
    PHOTO_FILE,
    PHOTO_MAX_BYTES,
    PHOTO_URL,
    PLACE_MAX_BYTES,
    PLAN_MAX_BYTES,
    STATIC_URL,
    STORE_KEY,
    STORE_VERSION,
)
from .serve import Build, FrontendFiles, FrontendView

_LOGGER = logging.getLogger(__name__)

FRONTEND = Path(__file__).parent / "frontend"
SIGNAL_PLAN = f"{DOMAIN}_plan"  # the plan was written
SIGNAL_FRONTEND = f"{DOMAIN}_frontend"  # a new build of the panel and the card is in frontend/
DATA_FILES = f"{DOMAIN}_files"  # the frontend/ folder (serve.FrontendFiles): lives from HA start to stop, like the view serving it
NO_BUILD = "none"  # the build in the addresses while frontend/ holds none (its address answers “try again” until one is there)
# how often frontend/ is looked at for a new build (only the folder listing; the files are hashed again only when it changes)
FRONTEND_CHECK_INTERVAL = timedelta(seconds=60)
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Once per HA start: serve frontend/, the photo address and the websocket commands (they can't be unregistered — they live until restart)."""
    files = hass.data[DATA_FILES] = FrontendFiles(FRONTEND)

    async def take_up(build: Build) -> None:
        await _async_take_up(hass, build)

    hass.http.register_view(FrontendView(hass, STATIC_URL, files, take_up))
    hass.http.register_view(PhotoView(hass))
    for command in (
        ws_plan_get,
        ws_plan_save,
        ws_plan_subscribe,
        ws_photo_get,
        ws_photo_place,
        ws_photo_delete,
        ws_frontend_subscribe,
        ws_frontend_update_panel,
    ):
        websocket_api.async_register_command(hass, command)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """The integration was added: read the plan and show the panel."""
    store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, STORE_KEY)
    data = await store.async_load() or {}
    # data is what goes to disk: plan, rev and, once a photo has been sent, photo (null — it was removed)
    hass.data[DOMAIN] = d = {"store": store, "data": {**data, "plan": data.get("plan"), "rev": int(data.get("rev", 0))}}
    files: FrontendFiles = hass.data[DATA_FILES]
    build = await hass.async_add_executor_job(files.current)
    d["build"] = build.id if build else NO_BUILD
    d["open_panels"] = 0
    _set_card(hass, d, d["build"])
    await _async_register_panel(hass, d, d["build"])

    async def look(now: datetime) -> None:
        await _async_look_at_frontend(hass)

    entry.async_on_unload(async_track_time_interval(hass, look, FRONTEND_CHECK_INTERVAL))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """The integration is removed or reloaded: remove the panel, write the plan if a save is pending. The plan and photo stay (reinstall — they are still there)."""
    frontend.async_remove_panel(hass, PANEL_URL)
    if (d := hass.data.pop(DOMAIN, None)) is not None:
        frontend.remove_extra_js_url(hass, d["card_url"])
        await d["store"].async_save(d["data"])
    return True


# ---------- the panel and the card, build by build (serve.py) ----------
# d["build"] — the newest complete build in frontend/: card.js in every page HA sends, the build open pages are told about.
# d["panel_build"] — the build in the panel's address. HA rebuilds an open panel whenever its registration changes, so while an
# editor is open (d["open_panels"]: its subscription is open) the panel keeps its address: the editor is never reloaded under the
# user's hands — it offers a reload (home_twin/frontend/update_panel) — and the panel moves on once no editor is open.


async def _async_register_panel(hass: HomeAssistant, d: dict[str, Any], build_id: str) -> None:
    """The panel at the address of this build. Changing it, HA tells every page to read the panel list again (panels_updated)."""
    if d.get("panel_build") is not None:
        frontend.async_remove_panel(hass, PANEL_URL)
    d["panel_build"] = build_id
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name=PANEL_ELEMENT,
        frontend_url_path=PANEL_URL,
        module_url=f"{STATIC_URL}/{build_id}/panel.js",
        sidebar_title="Home Twin",
        sidebar_icon="mdi:floor-plan",
        require_admin=True,
        # also the integration's config panel: the “Configure” button on its page opens it
        config_panel_domain=DOMAIN,
        # in its own iframe: the editor has its own document and styles — like the standalone app
        embed_iframe=True,
        config={},
    )


def _set_card(hass: HomeAssistant, d: dict[str, Any], build_id: str) -> None:
    """card.js of this build in every page HA sends from now on (pages already open keep theirs)."""
    if d.get("card_url") is not None:
        frontend.remove_extra_js_url(hass, d["card_url"])
    d["card_url"] = f"{STATIC_URL}/{build_id}/card.js"
    frontend.add_extra_js_url(hass, d["card_url"])


async def _async_take_up(hass: HomeAssistant, build: Build) -> None:
    """A complete build found in frontend/: a new one gets the card at once and the panel once no editor is open; open panels
    and cards are told."""
    d = hass.data.get(DOMAIN)
    if d is None or d["build"] == build.id:
        return
    _LOGGER.info("Home Twin frontend build %s is now served (was %s)", build.id, d["build"])
    # set before anything that waits: a second look running meanwhile then sees this build as taken up
    d["build"] = build.id
    _set_card(hass, d, build.id)
    if d["open_panels"] == 0:
        await _async_register_panel(hass, d, build.id)
    async_dispatcher_send(hass, SIGNAL_FRONTEND)


async def _async_look_at_frontend(hass: HomeAssistant) -> None:
    """Whether frontend/ holds a new complete build (an update put new files there): take it up."""
    build = await hass.async_add_executor_job(hass.data[DATA_FILES].current)
    if build is not None:
        await _async_take_up(hass, build)


async def _async_panel_to_newest(hass: HomeAssistant) -> None:
    """The panel at the newest build's address, if it is not there yet."""
    d = hass.data.get(DOMAIN)
    if d is not None and d["panel_build"] != d["build"]:
        await _async_register_panel(hass, d, d["build"])


@websocket_api.websocket_command(
    {vol.Required("type"): "home_twin/frontend/subscribe", vol.Optional("panel", default=False): bool}
)
@callback
def ws_frontend_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """The newest build of the panel and the card, now and whenever it changes (events {build}): an open panel or card running an
    older build offers a reload. Any signed-in user (the card). panel: true — the editor is open (the panel keeps its address
    meanwhile, see above); when its subscription ends (the editor closed, the page reloaded) the panel moves on."""
    if (d := _loaded(hass, connection, msg)) is None:
        return

    @callback
    def forward() -> None:
        if (d := hass.data.get(DOMAIN)) is not None:
            connection.send_message(websocket_api.event_message(msg["id"], {"build": d["build"]}))

    stop_forwarding = async_dispatcher_connect(hass, SIGNAL_FRONTEND, forward)
    is_panel = msg["panel"]
    if is_panel:
        d["open_panels"] += 1

    @callback
    def end() -> None:
        stop_forwarding()
        # counted where it was added: the integration may have been reloaded since (a new count)
        if not is_panel or hass.data.get(DOMAIN) is not d:
            return
        d["open_panels"] -= 1
        if d["open_panels"] == 0:
            hass.async_create_task(_async_panel_to_newest(hass))

    connection.subscriptions[msg["id"]] = end
    connection.send_result(msg["id"])
    forward()
    # a page has just opened: whether the files changed since the last look (no need to wait for the next one)
    hass.async_create_task(_async_look_at_frontend(hass))


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "home_twin/frontend/update_panel"})
@websocket_api.async_response
async def ws_frontend_update_panel(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """The editor's “Reload”: the panel moves to the newest build now, even with editors open (HA then rebuilds open panels).
    Answers {build}: the build the panel is at."""
    if (d := _loaded(hass, connection, msg)) is None:
        return
    await _async_panel_to_newest(hass)
    connection.send_result(msg["id"], {"build": d["panel_build"]})


def _save(d: dict[str, Any]) -> None:
    # to disk with a delay: dragging produces edits in quick succession
    d["store"].async_delay_save(lambda: d["data"], 2)


def _loaded(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> dict[str, Any] | None:
    d = hass.data.get(DOMAIN)
    if d is None:
        connection.send_error(msg["id"], "not_loaded", "Home Twin is not set up")
    return d


@websocket_api.websocket_command({vol.Required("type"): "home_twin/plan/get"})
@callback
def ws_plan_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """The plan and its revision number; no plan yet — plan: null."""
    if (d := _loaded(hass, connection, msg)) is not None:
        connection.send_result(msg["id"], {"plan": d["data"]["plan"], "rev": d["data"]["rev"]})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): "home_twin/plan/save", vol.Required("plan"): dict, vol.Optional("rev"): int}
)
@callback
def ws_plan_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Save the plan. rev — the revision it was edited from: if it differs, the plan was already changed in another window (conflict), not written."""
    if (d := _loaded(hass, connection, msg)) is None:
        return
    data = d["data"]
    if "rev" in msg and msg["rev"] != data["rev"]:
        connection.send_error(msg["id"], "conflict", f"plan changed elsewhere (rev {data['rev']})")
        return
    if len(json.dumps(msg["plan"], separators=(",", ":"))) > PLAN_MAX_BYTES:
        connection.send_error(msg["id"], "too_large", "plan is too large")
        return
    data["plan"], data["rev"] = msg["plan"], data["rev"] + 1
    _save(d)
    connection.send_result(msg["id"], {"rev": data["rev"]})
    async_dispatcher_send(hass, SIGNAL_PLAN)


@websocket_api.websocket_command({vol.Required("type"): "home_twin/plan/subscribe"})
@callback
def ws_plan_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """The plan and its revision now and after every write (events {plan, rev}) — for the dashboard card. Any signed-in user."""
    if _loaded(hass, connection, msg) is None:
        return

    @callback
    def forward() -> None:
        if (d := hass.data.get(DOMAIN)) is not None:
            connection.send_message(websocket_api.event_message(msg["id"], {"plan": d["data"]["plan"], "rev": d["data"]["rev"]}))

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, SIGNAL_PLAN, forward)
    connection.send_result(msg["id"])
    forward()


# ---------- the plan photo ----------


def _photo_path(hass: HomeAssistant) -> Path:
    return Path(hass.config.path(".storage", PHOTO_FILE))


def _write(path: Path, body: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(body)
    os.replace(tmp, path)  # a half-written file never replaces the photo


class PhotoView(HomeAssistantView):
    """The plan photo. GET — the image (any signed-in user, like the plan); POST — a new image as the request body (administrators)."""

    url = PHOTO_URL
    name = "api:home_twin:photo"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request: web.Request) -> web.Response:
        d = self.hass.data.get(DOMAIN)
        photo = d and d["data"].get("photo")
        path = _photo_path(self.hass)
        if not photo or not await self.hass.async_add_executor_job(path.is_file):
            return web.Response(status=HTTPStatus.NOT_FOUND)
        body = await self.hass.async_add_executor_job(path.read_bytes)
        # the editor asks for ?v=<photo id>: a new photo is a new address, so the browser may keep this one
        return web.Response(
            body=body, content_type=photo["type"], headers={"Cache-Control": "private, max-age=31536000, immutable"}
        )

    async def post(self, request: web.Request) -> web.Response:
        if not request[KEY_HASS_USER].is_admin:
            raise Unauthorized
        if (d := self.hass.data.get(DOMAIN)) is None:
            return self.json_message("Home Twin is not set up", HTTPStatus.NOT_FOUND)
        if not request.content_type.startswith("image/"):
            return self.json_message("not an image", HTTPStatus.UNSUPPORTED_MEDIA_TYPE)
        body = await request.read()
        if not body or len(body) > PHOTO_MAX_BYTES:
            return self.json_message("photo is empty or too large", HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
        photo_id = hashlib.sha256(body).hexdigest()[:16]
        await self.hass.async_add_executor_job(_write, _photo_path(self.hass), body)
        # placement comes next, from home_twin/photo/place: until then the photo is not shown
        d["data"]["photo"] = {"id": photo_id, "type": request.content_type, "size": len(body), "place": None}
        _save(d)
        return self.json({"id": photo_id})


@websocket_api.websocket_command({vol.Required("type"): "home_twin/photo/get"})
@callback
def ws_photo_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """The plan photo: id (the image is at /api/home_twin/photo?v=<id>), type, size, placement; no photo — photo: null.
    never — HA has never had a photo: the editor may bring over the one it kept in the browser before (D-058)."""
    if (d := _loaded(hass, connection, msg)) is not None:
        connection.send_result(msg["id"], {"photo": d["data"].get("photo"), "never": "photo" not in d["data"]})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): "home_twin/photo/place", vol.Required("photo"): str, vol.Required("place"): dict}
)
@callback
def ws_photo_place(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Where the photo (its id) sits on the plan: {a, b, opacity, visible} — the editor's image-to-metres transform. Another photo by now — not written."""
    if (d := _loaded(hass, connection, msg)) is None:
        return
    photo = d["data"].get("photo")
    if not photo or photo["id"] != msg["photo"]:
        connection.send_error(msg["id"], "no_photo", "no such plan photo")
        return
    if len(json.dumps(msg["place"], separators=(",", ":"))) > PLACE_MAX_BYTES:
        connection.send_error(msg["id"], "too_large", "placement is too large")
        return
    photo["place"] = msg["place"]
    _save(d)
    connection.send_result(msg["id"], {})


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "home_twin/photo/delete"})
@websocket_api.async_response
async def ws_photo_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Remove the plan photo."""
    if (d := _loaded(hass, connection, msg)) is None:
        return
    d["data"]["photo"] = None
    _save(d)
    await hass.async_add_executor_job(lambda: _photo_path(hass).unlink(missing_ok=True))
    connection.send_result(msg["id"], {})
