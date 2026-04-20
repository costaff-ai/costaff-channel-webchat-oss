from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.database import get_engine
from backend.auth import router as auth_router
from backend.adk_proxy import router as proxy_router

app = FastAPI(title="CoStaff WebChat Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure DB tables exist on startup
@app.on_event("startup")
def startup():
    get_engine()

app.include_router(auth_router)
app.include_router(proxy_router)
