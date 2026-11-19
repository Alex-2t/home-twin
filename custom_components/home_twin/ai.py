"""The AI build inside Home Assistant (D-131).

The AI build's screens run in the panel, and their requests go to our service from here, not from the browser. The account is
the payments service's session cookie (ht_session): a browser would not send it from a Home Assistant page (it is a third-party
cookie there), but this integration is a client of the service like any other, so it keeps the session itself, in
.storage/home_twin.ai, for the whole home: every browser and phone of this HA is signed in once one is.

  /api/home_twin/ai/<key>/<path>   the service's /<path> (api/…, pay/… and showcase/… only), the method, query and body as they came;
                                   the session goes with it, a session the service sets or clears comes back here, never to the
                                   browser. Bodies are streamed both ways: a video goes in chunks of 16 MB, HA's own limit.
  home_twin/ai/key                 a key for those addresses (administrators): the editor's images and uploads use plain
                                   addresses, which carry no HA token, so the key is in the address, as HA's camera proxy does.
                                   A key lapses after KEY_IDLE of not being used.

The service is https://twin.sync.md; HOME_TWIN_AI_SERVICE in HA's environment points the integration at another (staging,
local work).
"""

from __future__ import annotations

from datetime import datetime, timedelta
from http import HTTPStatus
from http.cookies import SimpleCookie
import logging
import os
import secrets
from typing import Any

import aiohttp
from aiohttp import web
import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_create_clientsession
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import AI_SERVICE, AI_STORE_KEY, AI_STORE_VERSION, AI_URL, DOMAIN

_LOGGER = logging.getLogger(__name__)

SESSION_COOKIE = "ht_session"  # the payments service's session cookie
SERVICE_ENV = "HOME_TWIN_AI_SERVICE"
DATA_AI = f"{DOMAIN}_ai"
KEY_IDLE = timedelta(hours=12)  # a key not used for this long no longer opens the addresses
# only the service's API, its account, and the examples it shows (the AI build's upload page shows a few, ai-showcase.ts):
# never its pages or its other files
ALLOWED_PREFIXES = ("api/", "pay/", "showcase/")
# the request headers that go on to the service, and the answer headers that come back
REQUEST_HEADERS = ("content-type", "accept", "accept-language", "content-length")
ANSWER_HEADERS = ("content-type", "cache-control", "content-disposition", "etag", "last-modified")
# a chunk of a video may take a while on a slow uplink; a status answer is quick
REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=15 * 60, sock_connect=20)
STREAM_PIECE_BYTES = 64 * 1024


class AiBuild:
    """The service's address, the account's session (kept in .storage) and the keys handed to the panel."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.service = (os.environ.get(SERVICE_ENV) or AI_SERVICE).rstrip("/")
        self._store: Store[dict[str, Any]] = Store(hass, AI_STORE_VERSION, AI_STORE_KEY)
        self._session: str | None = None
        self._keys: dict[str, datetime] = {}
        # its own client: the service's cookie must not land in HA's shared cookie jar
        self.client = async_create_clientsession(hass, cookie_jar=aiohttp.DummyCookieJar())

    async def async_load(self) -> None:
        stored = await self._store.async_load() or {}
        session = stored.get("session")
        self._session = session if isinstance(session, str) and session else None

    def new_key(self) -> str:
        """A key for the proxy's addresses; the ones not used for KEY_IDLE are dropped."""
        now = dt_util.utcnow()
        self._keys = {key: used for key, used in self._keys.items() if now - used < KEY_IDLE}
        key = secrets.token_urlsafe(32)
        self._keys[key] = now
        return key

    def key_valid(self, given: str) -> bool:
        """Whether the key opens the addresses; using it keeps it alive."""
        now = dt_util.utcnow()
        for key, used in self._keys.items():
            if secrets.compare_digest(key, given) and now - used < KEY_IDLE:
                self._keys[key] = now
                return True
        return False

    @property
    def session(self) -> str | None:
        return self._session

    def take_cookies(self, set_cookie_headers: list[str]) -> None:
        """The session the service set (a sign-in) or cleared (a sign-out, an expired session), kept for the home."""
        for header in set_cookie_headers:
            cookie: SimpleCookie = SimpleCookie()
            try:
                cookie.load(header)
            except Exception:  # noqa: BLE001 — a header we cannot read is not ours to keep
                continue
            morsel = cookie.get(SESSION_COOKIE)
            if morsel is None:
                continue
            cleared = not morsel.value or morsel["max-age"] == "0"
            session = None if cleared else morsel.value
            if session != self._session:
                self._session = session
                self._store.async_delay_save(lambda: {"session": self._session}, 1)


class AiProxyView(HomeAssistantView):
    """The service's API and account through Home Assistant, opened by a key the panel got from home_twin/ai/key."""

    url = AI_URL + "/{key}/{path:.*}"
    name = "api:home_twin:ai"
    # the key in the address is the authentication: the editor's images and uploads carry no HA token
    requires_auth = False

    def __init__(self, ai: AiBuild) -> None:
        self.ai = ai

    async def _forward(self, request: web.Request, key: str, path: str) -> web.StreamResponse:
        if not self.ai.key_valid(key):
            return web.Response(status=HTTPStatus.UNAUTHORIZED)
        if not path.startswith(ALLOWED_PREFIXES) or ".." in path.split("/"):
            return web.Response(status=HTTPStatus.NOT_FOUND)
        headers = {name: value for name in REQUEST_HEADERS if (value := request.headers.get(name))}
        if self.ai.session:
            headers["cookie"] = f"{SESSION_COOKIE}={self.ai.session}"
        body = request.content.iter_chunked(STREAM_PIECE_BYTES) if request.body_exists else None
        try:
            answer = await self.ai.client.request(
                request.method,
                f"{self.ai.service}/{path}",
                params=request.query,
                headers=headers,
                data=body,
                allow_redirects=False,
                timeout=REQUEST_TIMEOUT,
            )
        except (aiohttp.ClientError, TimeoutError) as error:
            _LOGGER.debug("AI build service unreachable: %s", error)
            return web.json_response({"error": "SERVICE_UNREACHABLE"}, status=HTTPStatus.BAD_GATEWAY)
        try:
            self.ai.take_cookies(answer.headers.getall("set-cookie", []))
            response = web.StreamResponse(status=answer.status)
            for name in ANSWER_HEADERS:
                if value := answer.headers.get(name):
                    response.headers[name] = value
            await response.prepare(request)
            async for piece in answer.content.iter_chunked(STREAM_PIECE_BYTES):
                await response.write(piece)
            await response.write_eof()
            return response
        finally:
            answer.release()

    async def get(self, request: web.Request, key: str, path: str) -> web.StreamResponse:
        return await self._forward(request, key, path)

    async def head(self, request: web.Request, key: str, path: str) -> web.StreamResponse:
        return await self._forward(request, key, path)

    async def post(self, request: web.Request, key: str, path: str) -> web.StreamResponse:
        return await self._forward(request, key, path)

    async def put(self, request: web.Request, key: str, path: str) -> web.StreamResponse:
        return await self._forward(request, key, path)

    async def delete(self, request: web.Request, key: str, path: str) -> web.StreamResponse:
        return await self._forward(request, key, path)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "home_twin/ai/key"})
@callback
def ws_ai_key(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """A key for the proxy's addresses, and where they lead (the panel shows the service's name nowhere; for diagnostics)."""
    ai: AiBuild | None = hass.data.get(DATA_AI)
    if ai is None:
        connection.send_error(msg["id"], "not_ready", "Home Twin is not set up")
        return
    connection.send_result(msg["id"], {"key": ai.new_key(), "base": f"{AI_URL}/", "service": ai.service})


async def async_setup_ai(hass: HomeAssistant) -> None:
    """Once per HA start: the session from .storage, the proxy's address and its websocket command."""
    ai = hass.data[DATA_AI] = AiBuild(hass)
    await ai.async_load()
    hass.http.register_view(AiProxyView(ai))
    websocket_api.async_register_command(hass, ws_ai_key)
