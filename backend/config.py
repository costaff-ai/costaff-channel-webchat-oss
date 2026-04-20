import os
from dotenv import load_dotenv
load_dotenv()

SECRET_KEY = os.getenv("WEBCHAT_JWT_SECRET", "webchat-default-secret-please-change")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("WEBCHAT_TOKEN_EXPIRE_MINUTES", "480"))  # 8 hours

ADK_API_BASE_URL = os.getenv("ADK_API_BASE_URL", "http://costaff-agent-costaff:8080")
ADK_APP_NAME = os.getenv("ADK_APP_NAME", "costaff_agent")
DB_URI = os.getenv("ADK_SESSION_SERVICE_URI", "sqlite:///./webchat.db")
ID_SALT = os.getenv("ID_SALT", "costaff_default_salt")
PREFERRED_LANG = os.getenv("COSTAFF_PREFERRED_LANGUAGE", "Traditional Chinese (繁體中文)")
