"""Home Twin — a live 3D twin of your home for Home Assistant.

The integration gives the editor a place in HA: the /home-twin panel (frontend/panel.js — the editor/ build) and plan storage
in .storage/home_twin.plan. The panel is in the sidebar ("Home Twin", like other floor-plan integrations — each user can hide it
with HA's own sidebar editing) and is also the integration's config panel: the “Configure” button on Home Twin in
“Devices & services” opens it too (D-056). The editor talks to HA through the hass object that HA hands to the panel, and
reads and writes the plan with the websocket commands home_twin/plan/get and home_twin/plan/save. The revision number (rev) grows
with every write — that is how the editor sees that the plan was changed in another window.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN, PANEL_ELEMENT, PANEL_URL, PLAN_MAX_BYTES, STATIC_URL, STORE_KEY, STORE_VERSION

FRONTEND = Path(__file__).parent / "frontend"
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Once per HA start: serve frontend/ and register the websocket commands (they can't be unregistered — they live until restart)."""
    await hass.http.async_register_static_paths([StaticPathConfig(STATIC_URL, str(FRONTEND), False)])
    websocket_api.async_register_command(hass, ws_plan_get)
    websocket_api.async_register_command(hass, ws_plan_save)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """The integration was added: read the plan and show the panel."""
    store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, STORE_KEY)
    data = await store.async_load() or {}
    hass.data[DOMAIN] = {"store": store, "plan": data.get("plan"), "rev": int(data.get("rev", 0))}
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
    """The integration is removed or reloaded: remove the panel, write the plan if a save is pending. The plan itself stays (reinstall — it is still there)."""
    frontend.async_remove_panel(hass, PANEL_URL)
    if (d := hass.data.pop(DOMAIN, None)) is not None:
        await d["store"].async_save({"plan": d["plan"], "rev": d["rev"]})
    return True


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
        connection.send_result(msg["id"], {"plan": d["plan"], "rev": d["rev"]})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): "home_twin/plan/save", vol.Required("plan"): dict, vol.Optional("rev"): int}
)
@callback
def ws_plan_save(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Save the plan. rev — the revision it was edited from: if it differs, the plan was already changed in another window (conflict), not written."""
    if (d := _loaded(hass, connection, msg)) is None:
        return
    if "rev" in msg and msg["rev"] != d["rev"]:
        connection.send_error(msg["id"], "conflict", f"plan changed elsewhere (rev {d['rev']})")
        return
    if len(json.dumps(msg["plan"], separators=(",", ":"))) > PLAN_MAX_BYTES:
        connection.send_error(msg["id"], "too_large", "plan is too large")
        return
    d["plan"], d["rev"] = msg["plan"], d["rev"] + 1
    # to disk with a delay: dragging produces edits in quick succession
    d["store"].async_delay_save(lambda: {"plan": d["plan"], "rev": d["rev"]}, 2)
    connection.send_result(msg["id"], {"rev": d["rev"]})
