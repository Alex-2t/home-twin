"""Home Twin constants."""

DOMAIN = "home_twin"
PANEL_URL = "home-twin"  # panel path: /home-twin
PANEL_ELEMENT = "home-twin-panel"  # panel element in frontend/panel.js
STATIC_URL = "/home_twin_static"  # where HA serves frontend/ from: /home_twin_static/<build>/<file> (serve.py)
STORE_KEY = "home_twin.plan"  # file .storage/home_twin.plan: the plan, its revision, the plan photo's id and placement
STORE_VERSION = 1  # the shape of that file ({plan, rev, photo}); the plan inside names its own format (plan.version, D-121)
# the last plan of each older format, kept when a newer editor first saves the plan in its format: .storage/home_twin.plan.format<N>
STORE_BEFORE_FORMAT_KEY = "home_twin.plan.format{}"
PLAN_MAX_BYTES = 5_000_000  # the plan is JSON without photos; anything larger means something is wrong
PHOTO_URL = "/api/home_twin/photo"  # the plan photo itself (the image the rooms are traced over)
PHOTO_FILE = "home_twin.photo"  # file .storage/home_twin.photo
PHOTO_MAX_BYTES = 15_000_000  # HA accepts request bodies up to 16 MB; the editor shrinks big photos before sending
PLACE_MAX_BYTES = 10_000  # photo placement: a few numbers
AI_SERVICE = "https://twin.sync.md"  # the AI build's service (D-131); HOME_TWIN_AI_SERVICE in HA's environment overrides it
AI_URL = "/api/home_twin/ai"  # the service through HA: /api/home_twin/ai/<key>/<path> (ai.py)
AI_STORE_KEY = "home_twin.ai"  # file .storage/home_twin.ai: the account's session with the service, for the whole home
AI_STORE_VERSION = 1
