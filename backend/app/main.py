"""
SOCIOSTAT — FastAPI Application Entry Point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from pathlib import Path

from app.core.config import settings
from app.core.database import create_tables
from app.routers import auth, projects, datasets, analysis

app = FastAPI(
    title="SOCIOSTAT API",
    description="Web-based Statistical Analysis Workbench API",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In dev allow all; restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(datasets.router)
app.include_router(analysis.router)


@app.on_event("startup")
def on_startup():
    create_tables()


@app.get("/api/health")
def health():
    return {"status": "ok", "version": settings.APP_VERSION}


# Serve frontend static files
_root = Path(__file__).parent.parent.parent
_frontend = _root / "frontend"
_frontend_src = _frontend / "src"

if _frontend_src.exists():
    app.mount("/static", StaticFiles(directory=str(_frontend_src)), name="static")

if _frontend.exists() and (_frontend / "index.html").exists():
    @app.get("/", include_in_schema=False)
    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str = ""):
        # Don't intercept API routes
        if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("openapi"):
            from fastapi.responses import Response
            return Response(status_code=404)
        index = _frontend / "index.html"
        return FileResponse(str(index))
