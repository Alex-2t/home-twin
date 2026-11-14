"""Home Twin constants."""

DOMAIN = "home_twin"
PANEL_URL = "home-twin"  # panel path: /home-twin
PANEL_ELEMENT = "home-twin-panel"  # panel element in frontend/panel.js
STATIC_URL = "/home_twin_static"  # where HA serves frontend/ from: /home_twin_static/<build>/<file> (serve.py)
STORE_KEY = "home_twin.plan"  # file .storage/home_twin.plan: the plan, its revision, the plan photo's id and placement
STORE_VERSION = 1
PLAN_MAX_BYTES = 5_000_000  # the plan is JSON without photos; anything larger means something is wrong
PHOTO_URL = "/api/home_twin/photo"  # the plan photo itself (the image the rooms are traced over)
PHOTO_FILE = "home_twin.photo"  # file .storage/home_twin.photo
PHOTO_MAX_BYTES = 15_000_000  # HA accepts request bodies up to 16 MB; the editor shrinks big photos before sending
PLACE_MAX_BYTES = 10_000  # photo placement: a few numbers
