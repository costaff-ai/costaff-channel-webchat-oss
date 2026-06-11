"""pytest fixtures for the WebChat OSS backend.

backend.config reads env at import; we provide test values BEFORE any
backend import so the module loads without a configured .env.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

os.environ.setdefault("WEBCHAT_JWT_SECRET", "unit-test-secret-not-a-placeholder")
os.environ.setdefault("ID_SALT", "unit-test-salt")
os.environ.setdefault("WEBCHAT_USER_EMAIL", "tester@example.com")
os.environ.setdefault("WEBCHAT_USER_PASSWORD", "secret123")
os.environ.setdefault("ADK_SESSION_SERVICE_URI", "sqlite:///:memory:")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


class FakeUser:
    email = "tester@example.com"
    username = "tester"


@pytest.fixture
def client(monkeypatch):
    """A TestClient for the proxy router with auth/approval bypassed —
    these tests target the ADK proxy behaviour, not the auth stack."""
    from backend import adk_proxy

    app = FastAPI()
    app.include_router(adk_proxy.router)
    app.dependency_overrides[adk_proxy.get_current_user] = lambda: FakeUser()
    app.dependency_overrides[adk_proxy.get_db] = lambda: None
    monkeypatch.setattr(adk_proxy, "_require_approved", lambda user, db: None)
    return TestClient(app)
