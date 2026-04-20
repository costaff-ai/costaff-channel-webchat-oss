import hashlib
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Boolean, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker

from backend.config import DB_URI, ID_SALT

Base = declarative_base()


class WebchatUser(Base):
    __tablename__ = "webchat_users"
    id = Column(String(36), primary_key=True)
    username = Column(String(64), unique=True, nullable=False)
    email = Column(String(256), unique=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class IdentityMap(Base):
    __tablename__ = "identity_maps"
    session_id = Column(String, primary_key=True)
    hashed_id = Column(String, index=True, nullable=False)
    real_id = Column(String, nullable=False)
    is_approved = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


_engine = None
_SessionLocal = None


def get_engine():
    global _engine, _SessionLocal
    if _engine is None:
        uri = DB_URI.replace("postgresql+asyncpg://", "postgresql://")
        _engine = create_engine(uri)
        # Only create webchat_users — identity_maps already exists
        WebchatUser.__table__.create(_engine, checkfirst=True)
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
    return _engine


def get_db():
    get_engine()
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_user_id(username: str) -> str:
    return hashlib.sha256(f"{username}{ID_SALT}".encode()).hexdigest()[:16]
