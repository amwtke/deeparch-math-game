"""Static file server that always sets Cache-Control: no-store.

Why: mobile Chrome aggressively caches /js/*.js, so incremental fixes
don't reach the kid's device until a manual cache clear. This makes
every fetch revalidate.
"""
from __future__ import annotations

from starlette.staticfiles import StaticFiles


class NoCacheStaticFiles(StaticFiles):
    """StaticFiles + Cache-Control: no-store on every response."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-store, must-revalidate"
        return response
