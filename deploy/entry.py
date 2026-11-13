"""Fly entrypoint: use the full API app when present, else serve the built site statically (early deploys)."""
import logging, os
from pathlib import Path

log = logging.getLogger("curiositycraft")
try:
    from app.main import app  # noqa: F401
except Exception as e:  # pragma: no cover
    log.warning("API app unavailable (%s); serving static site only", e)
    from fastapi import FastAPI
    from fastapi.responses import FileResponse, JSONResponse
    from fastapi.staticfiles import StaticFiles

    dist = Path(os.environ.get("WC_DIST", "/app/dist"))
    app = FastAPI()

    @app.get("/api/health")
    def health():
        return {"ok": True, "mode": "static-only"}

    @app.get("/api/{rest:path}")
    def api_down(rest: str):
        return JSONResponse({"detail": "The CuriosityCraft API is still being deployed."}, status_code=503)

    @app.get("/play")
    def play():
        p = dist / "play.html"
        return FileResponse(p if p.exists() else dist / "index.html")

    app.mount("/", StaticFiles(directory=dist, html=True), name="site")
