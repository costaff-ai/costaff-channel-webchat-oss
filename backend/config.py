import logging
import os
import sys

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Placeholder values used by .env.example. Refusing to boot on these is
# intentional — silently falling back to a known default secret is
# exactly how OSS deployments leak.
_PLACEHOLDER_VALUES = {
    "",
    "REPLACE_WITH_A_LONG_RANDOM_SECRET",
    "REPLACE_WITH_A_RANDOM_STRING",
    # Legacy strings from older .env.template versions.
    "webchat-default-secret-please-change",
    "costaff_default_salt",
    "change-me-to-a-long-random-secret",
    "change-me-to-a-random-string",
}

SECRET_KEY = os.getenv("WEBCHAT_JWT_SECRET", "")
ID_SALT = os.getenv("ID_SALT", "")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("WEBCHAT_TOKEN_EXPIRE_MINUTES", "480"))  # 8 hours

ADK_API_BASE_URL = os.getenv("ADK_API_BASE_URL", "http://costaff-agent-costaff:8080")
ADK_APP_NAME = os.getenv("ADK_APP_NAME", "costaff_agent")
DB_URI = os.getenv("ADK_SESSION_SERVICE_URI", "sqlite:///./webchat.db")
PREFERRED_LANG = os.getenv("COSTAFF_PREFERRED_LANGUAGE", "Traditional Chinese (繁體中文)")

# CORS — comma-separated list of allowed origins, or "*" for any. The
# default of "*" keeps the local-demo flow frictionless; production
# deployments should narrow this to the exact frontend origins.
_origins_raw = os.getenv("WEBCHAT_ALLOWED_ORIGINS", "*").strip()
ALLOWED_ORIGINS = (
    ["*"] if _origins_raw == "*" else [o.strip() for o in _origins_raw.split(",") if o.strip()]
)


def assert_secrets_configured() -> None:
    """Hard fail when the operator hasn't set WEBCHAT_JWT_SECRET / ID_SALT.

    Called from main.py's @startup handler. Splitting it out of module
    import time lets pytest / linters import this file without a
    configured .env."""
    bad: list[str] = []
    if SECRET_KEY in _PLACEHOLDER_VALUES:
        bad.append("WEBCHAT_JWT_SECRET")
    if ID_SALT in _PLACEHOLDER_VALUES:
        bad.append("ID_SALT")
    if bad:
        sys.stderr.write(
            "\n[FATAL] CoStaff Webchat refuses to start: the following "
            "required environment variables are missing or still use "
            "the .env.example placeholder values:\n"
            f"    {', '.join(bad)}\n"
            "Generate strong values, e.g.\n"
            "    python -c \"import secrets; print(secrets.token_urlsafe(48))\"\n"
            "and put them in your .env file. See .env.example for the layout.\n\n"
        )
        sys.exit(1)
