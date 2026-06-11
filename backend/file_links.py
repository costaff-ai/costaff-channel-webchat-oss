"""Signed, expiring download links for agent-produced files.

The chat reply references files on the shared volume; the frontend
renders them as plain <a href> links, which carry no Authorization
header — so the download route can't rely on the JWT. Instead each link
embeds an HMAC token that binds the exact file path and an expiry
timestamp: users can't request arbitrary paths, and stale links die on
their own.

Token format: base64url(json{"p": path, "exp": ts}) + "." + hexdigest
Signature key: WEBCHAT_JWT_SECRET (already required configuration).
"""
import base64
import hashlib
import hmac
import json
import logging
import time

from backend.config import SECRET_KEY

logger = logging.getLogger(__name__)

DEFAULT_TTL_SECONDS = 86400  # links stay valid for 24h


def _sign(payload: bytes) -> str:
    return hmac.new(SECRET_KEY.encode(), payload, hashlib.sha256).hexdigest()


def make_token(path: str, ttl_seconds: int = DEFAULT_TTL_SECONDS) -> str | None:
    """Mint a signed download token for `path`. None when no secret is set."""
    if not SECRET_KEY:
        logger.error("file_links: WEBCHAT_JWT_SECRET not configured")
        return None
    payload = json.dumps(
        {"p": path, "exp": int(time.time()) + ttl_seconds}, separators=(",", ":")
    ).encode()
    body = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    return f"{body}.{_sign(payload)}"


def verify_token(token: str) -> str | None:
    """Return the file path a valid, unexpired token grants. None otherwise."""
    if not token or "." not in token or not SECRET_KEY:
        return None
    body, sig = token.rsplit(".", 1)
    try:
        payload = base64.urlsafe_b64decode(body + "=" * (-len(body) % 4))
    except Exception:
        return None
    if not hmac.compare_digest(_sign(payload), sig):
        return None
    try:
        data = json.loads(payload)
    except Exception:
        return None
    if not isinstance(data, dict) or int(data.get("exp", 0)) < time.time():
        return None
    path = data.get("p")
    return path if isinstance(path, str) and path else None
