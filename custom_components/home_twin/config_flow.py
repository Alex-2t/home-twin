"""Home Twin setup: one button, no fields — everything else is in the panel itself."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult

from .const import DOMAIN


class HomeTwinConfigFlow(ConfigFlow, domain=DOMAIN):
    """Add Home Twin. The dialog after adding shows a link to the editor (translations: config.create_entry.default)."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(title="Home Twin", data={})
        return self.async_show_form(step_id="user")
