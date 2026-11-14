"""The editor panel and the dashboard card are served build by build, so a new build takes effect without restarting HA (D-NEXT).

Every build of the editor (editor: npm run build) writes frontend/build.json: the sha256 of every file and the build id made from
them. The files are served at /home_twin_static/<build>/<file>:
- the current build — cached by the browser for a year: that address never gets other content;
- an older build's panel.js or card.js (an HA page or panel list that still points there) — sent on to the current build;
- an older build's card-app.js (an old card.js loading its 3D) — not found: the old card offers a reload instead of mixing builds.
A build is taken up only when the files on disk match its build.json, so files half-replaced by an update are never served.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
import hashlib
from http import HTTPStatus
import json
import logging
from pathlib import Path
import re
import threading
import time

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

MANIFEST = "build.json"  # written by the editor's build next to the files
FILE_NAME = re.compile(r"^[a-z0-9][a-z0-9-]*\.js$")  # what the build makes: panel.js, card.js, card-app.js
# what HA itself loads (the panel from the panel list, card.js on every page): a stale address is sent on to the current build
ENTRY_FILES = frozenset({"panel.js", "card.js"})
BUILD_ID_LENGTH = 12
# build.json that still does not match the files after this long is stale (files copied over by hand): the files are served as they are
STALE_MANIFEST_SECONDS = 30
YEAR_SECONDS = 365 * 86400
IMMUTABLE = f"public, max-age={YEAR_SECONDS}, immutable"
NO_STORE = "no-store"

# one file as the folder listing sees it: name, size, modification time (ns) — changes whenever the file is replaced
FileStamp = tuple[str, int, int]


@dataclass(frozen=True)
class Build:
    """One build of the frontend: its id and the sha256 of each file in it."""

    id: str
    digests: dict[str, str]


@dataclass
class _Seen:
    """What the folder held at the last look, and since when build.json has disagreed with the files."""

    stamps: tuple[FileStamp, ...] = ()
    build: Build | None = None
    mismatch_since: float | None = None
    warned: bool = False


def build_id(digests: dict[str, str]) -> str:
    """The build id: a hash of every file's name and sha256 (the editor's build.ts makes it the same way)."""
    lines = "".join(f"{name}:{digests[name]}\n" for name in sorted(digests))
    return hashlib.sha256(lines.encode()).hexdigest()[:BUILD_ID_LENGTH]


def _stamps(folder: Path) -> tuple[FileStamp, ...]:
    stamps = []
    for path in sorted(folder.glob("*")):
        if FILE_NAME.match(path.name) or path.name == MANIFEST:
            stat = path.stat()
            stamps.append((path.name, stat.st_size, stat.st_mtime_ns))
    return tuple(stamps)


def _digests(folder: Path) -> dict[str, str]:
    return {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(folder.glob("*.js"))
        if FILE_NAME.match(path.name)
    }


def _manifest(folder: Path) -> dict | None:
    """build.json, or None when there is none (a build from before it existed) or it cannot be read."""
    try:
        data = json.loads((folder / MANIFEST).read_text())
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


@dataclass
class FrontendFiles:
    """The frontend/ folder: which complete build it holds now, and the files of that build."""

    folder: Path
    _seen: _Seen = field(default_factory=_Seen)
    # the timer and page requests may look at the same time, from different executor threads
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def current(self) -> Build | None:
        """The build in the folder; None while there is none or its files are being replaced. Runs in the executor (it reads files).
        Cheap when nothing changed: only the folder listing is read; the files are hashed again only after they change."""
        with self._lock:
            return self._current()

    def _current(self) -> Build | None:
        try:
            stamps = _stamps(self.folder)
        except OSError:
            stamps = ()
        seen = self._seen
        if stamps == seen.stamps and seen.mismatch_since is None:
            return seen.build
        if stamps != seen.stamps:
            seen.stamps = stamps
            seen.mismatch_since = None
            seen.warned = False
            seen.build = self._read()
        if seen.build is not None or not stamps:
            return seen.build
        return self._stale_manifest_fallback()

    def _read(self) -> Build | None:
        """The folder's build if its files match build.json (no build.json — the files as they are); None otherwise."""
        try:
            digests = _digests(self.folder)
        except OSError:
            return None
        if not digests:
            return None
        build = Build(build_id(digests), digests)
        manifest = _manifest(self.folder)
        if manifest is None:
            return build
        if manifest.get("files") == digests and manifest.get("build") == build.id:
            return build
        self._seen.mismatch_since = time.monotonic()
        return None

    def _stale_manifest_fallback(self) -> Build | None:
        """build.json has disagreed with the files for a while and nothing changes any more: it is left over, serve the files."""
        seen = self._seen
        if seen.mismatch_since is None or time.monotonic() - seen.mismatch_since < STALE_MANIFEST_SECONDS:
            return None
        try:
            digests = _digests(self.folder)
        except OSError:
            return None
        if not digests:
            return None
        if not seen.warned:
            _LOGGER.warning("%s does not match the frontend files; serving the files as they are", self.folder / MANIFEST)
            seen.warned = True
        seen.mismatch_since = None
        seen.build = Build(build_id(digests), digests)
        return seen.build

    def read(self, build: Build, name: str) -> bytes | None:
        """The file as it is in that build; None if it changed since (an update is replacing it). Runs in the executor."""
        try:
            body = (self.folder / name).read_bytes()
        except OSError:
            return None
        if hashlib.sha256(body).hexdigest() != build.digests.get(name):
            return None
        return body


class FrontendView(HomeAssistantView):
    """/home_twin_static/<build>/<file> — the panel and the card. No sign-in, like HA's own frontend files: a page's <script> sends
    no token, and the files hold no data."""

    requires_auth = False
    name = "home_twin:frontend"

    def __init__(
        self,
        hass: HomeAssistant,
        url_root: str,
        files: FrontendFiles,
        on_build: Callable[[Build], Awaitable[None]],
    ) -> None:
        self.hass = hass
        self.url = url_root + "/{build}/{filename}"
        self.url_root = url_root
        self.files = files
        # called with the build found on disk: a new one is taken up (the panel and the card get its addresses)
        self.on_build = on_build

    async def get(self, request: web.Request, build: str, filename: str) -> web.Response:
        if not FILE_NAME.match(filename):
            return _not_found()
        current = await self.hass.async_add_executor_job(self.files.current)
        if current is None:
            # no build, or an update is replacing its files: ask again shortly
            return _try_again()
        await self.on_build(current)
        if build != current.id:
            if filename in ENTRY_FILES and filename in current.digests:
                location = f"{self.url_root}/{current.id}/{filename}"
                return web.Response(
                    status=HTTPStatus.TEMPORARY_REDIRECT, headers={"Location": location, "Cache-Control": NO_STORE}
                )
            return _not_found()
        if filename not in current.digests:
            return _not_found()
        body = await self.hass.async_add_executor_job(self.files.read, current, filename)
        if body is None:
            return _try_again()
        response = web.Response(
            body=body, content_type="text/javascript", charset="utf-8", headers={"Cache-Control": IMMUTABLE}
        )
        # a few MB of script: compressed it is about a quarter of that (sent once per build, then the browser keeps it)
        response.enable_compression()
        return response


def _not_found() -> web.Response:
    return web.Response(status=HTTPStatus.NOT_FOUND, headers={"Cache-Control": NO_STORE})


def _try_again() -> web.Response:
    return web.Response(status=HTTPStatus.SERVICE_UNAVAILABLE, headers={"Cache-Control": NO_STORE, "Retry-After": "2"})
