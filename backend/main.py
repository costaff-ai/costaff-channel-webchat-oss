from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend import __version__
from backend.adk_proxy import router as proxy_router
from backend.auth import router as auth_router
from backend.config import ALLOWED_ORIGINS, assert_secrets_configured
from backend.database import bootstrap_single_user, get_engine
from backend.push_channel import internal_push_router, stream_router

app = FastAPI(title="CoStaff WebChat Backend", version=__version__)


@app.get("/api/version")
def version():
    return {"version": __version__}

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    # Hard-fail before the DB engine is built if the operator hasn't
    # provided real secrets — otherwise we'd silently sign JWTs with
    # the placeholder string from .env.example.
    assert_secrets_configured()
    get_engine()
    bootstrap_single_user()


app.include_router(auth_router)
app.include_router(proxy_router)
app.include_router(stream_router)         # SSE: browser <- async push frames
app.include_router(internal_push_router)  # Manager -> /api/internal/push
