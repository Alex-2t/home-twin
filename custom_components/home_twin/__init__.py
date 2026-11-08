"""Home Twin — a live 3D twin of your home for Home Assistant.

The integration gives the editor a place in HA: the /home-twin panel (frontend/panel.js — the editor/ build) and plan storage
in .storage/home_twin.plan. The panel is in the sidebar ("Home Twin", like other floor-plan integrations — each user can hide it
with HA's own sidebar editing) and is also the integration's config panel: the “Configure” button on Home Twin in
“Devices & services” opens it too (D-056). The editor talks to HA through the hass object that HA hands to the panel, and
reads and writes the plan with the websocket commands home_twin/plan/get and home_twin/plan/save. The revision number (rev) grows
with every write — that is how the editor sees that the plan was changed in another window.

The plan photo (D-058) is a file, .storage/home_twin.photo, sent and read over HTTP at /api/home_twin/photo. Its id, type and
placement on the plan are kept with the plan (home_twin/photo/get, home_twin/photo/place, home_twin/photo/delete).
"""

from __future__ import annotations

import hashlib
from http import HTTPStatus
import json
import os
from pathlib import Path
from typing import Any

from aiohttp import web
import voluptuous as vol

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import KEY_HASS_USER, HomeAssistantView, StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import Unauthorized
from homeassistant.helpers import config_validation as cv
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

FRONTEND = Path(__file__).parent / "frontend"
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Once per HA start: serve frontend/, the photo address and the websocket commands (they can't be unregistered — they live until restart)."""
    await hass.http.async_register_static_paths([StaticPathConfig(STATIC_URL, str(FRONTEND), False)])
    hass.http.register_view(PhotoView(hass))
    for command in (ws_plan_get, ws_plan_save, ws_photo_get, ws_photo_place, ws_photo_delete):
        websocket_api.async_register_command(hass, command)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """The integration was added: read the plan and show the panel."""
    store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, STORE_KEY)
    data = await store.async_load() or {}
    # data is what goes to disk: plan, rev and, once a photo has been sent, photo (null — it was removed)
    hass.data[DOMAIN] = {"store": store, "data": {**data, "plan": data.get("plan"), "rev": int(data.get("rev", 0))}}
    # ?v= — so the browser loads the new build after an update instead of the old one from cache
    stamp = int((FRONTEND / "panel.js").stat().st_mtime) if (FRONTEND / "panel.js").exists() else 0
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name=PANEL_ELEMENT,
        frontend_url_path=PANEL_URL,
        module_url=f"{STATIC_URL}/panel.js?v={stamp}",
        sidebar_title="Home Twin",
        sidebar_icon="mdi:floor-plan",
        require_admin=True,
        # also the integration's config panel: the “Configure” button on its page opens it
        config_panel_domain=DOMAIN,
        # in its own iframe: the editor has its own document and styles — like the standalone app
        embed_iframe=True,
        config={},
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """The integration is removed or reloaded: remove the panel, write the plan if a save is pending. The plan and photo stay (reinstall — they are still there)."""
    frontend.async_remove_panel(hass, PANEL_URL)
    if (d := hass.data.pop(DOMAIN, None)) is not None:
        await d["store"].async_save(d["data"])
    return True


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
