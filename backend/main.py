from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.adk_proxy import router as proxy_router
from backend.auth import router as auth_router
from backend.config import ALLOWED_ORIGINS, assert_secrets_configured
from backend.database import bootstrap_single_user, get_engine

app = FastAPI(title="CoStaff WebChat Backend")

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
