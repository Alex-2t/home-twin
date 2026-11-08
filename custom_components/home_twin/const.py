"""Home Twin constants."""

DOMAIN = "home_twin"
PANEL_URL = "home-twin"  # panel path: /home-twin
PANEL_ELEMENT = "home-twin-panel"  # panel element in frontend/panel.js
STATIC_URL = "/home_twin_static"  # where HA serves frontend/ from
STORE_KEY = "home_twin.plan"  # file .storage/home_twin.plan
STORE_VERSION = 1
PLAN_MAX_BYTES = 5_000_000  # the plan is JSON without photos; anything larger means something is wrong
