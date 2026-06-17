from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from app.db.session import engine, Base, run_migrations, SessionLocal
from sqlalchemy import text

from app.api.router import api_router

# Import models to register in Base.metadata
from app.db import base  # noqa: F401

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup - Move DB logic here to avoid blocking during module import
    try:
        # Run migrations/patches
        run_migrations(engine)
        # SQLAlchemy create all
        Base.metadata.create_all(bind=engine)
        
        from app.modules.finance.alerts import init_scheduler
        app.state.scheduler = init_scheduler()
    except Exception as e:
        print(f"Error during startup initialization: {e}")
        import traceback
        traceback.print_exc()
    
    yield
    # Shutdown
    if hasattr(app.state, "scheduler"):
        app.state.scheduler.shutdown()

app = FastAPI(title="Quintal Agross API v2", lifespan=lifespan)

# Ensure uploads directory exists
if not os.path.exists("uploads"):
    os.makedirs("uploads")

# Mount static files
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
# Note: excel directory was moved to app/api/excel in my refactor logic
app.mount("/templates", StaticFiles(directory="app/api/excel"), name="templates")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom CORS middleware for redirects/errors
@app.middleware("http")
async def ensure_cors_headers(request, call_next):
    try:
        response = await call_next(request)
    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        print("--- DEBUG ERROR ---")
        print(error_msg)
        from starlette.responses import PlainTextResponse
        response = PlainTextResponse(f"Internal Server Error: {error_msg}", status_code=500)

    response.headers.setdefault("Access-Control-Allow-Origin", "*")
    response.headers.setdefault("Access-Control-Allow-Credentials", "false")
    response.headers.setdefault("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
    response.headers.setdefault("Access-Control-Allow-Headers", "*")
    return response

@app.api_route("/health", methods=["GET", "HEAD"])
def health_check():
    return {"ok": True}



# Centralized Router
app.include_router(api_router)

# Added by Antigravity: trigger reload for auto-migration
