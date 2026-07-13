import hashlib
import uuid
from datetime import datetime
import bcrypt
from sqlalchemy import create_engine, Column, String, Boolean, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker

from backend.config import (
    DB_URI,
    ID_SALT,
    SINGLE_USER_EMAIL,
    SINGLE_USER_NAME,
    SINGLE_USER_PASSWORD,
)

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


def new_session():
    """A plain Session for callers outside FastAPI's dependency system
    (e.g. the SSE stream endpoint). Caller owns .close()."""
    get_engine()
    return _SessionLocal()


def hash_user_id(username: str) -> str:
    return hashlib.sha256(f"{username}{ID_SALT}".encode()).hexdigest()[:16]


def bootstrap_single_user() -> None:
    """Seed the one OSS user from env at startup. Idempotent: re-syncs
    password + display name to whatever the operator currently has in
    .env, so rotating the password just needs a container restart."""
    get_engine()
    db = _SessionLocal()
    try:
        user = db.query(WebchatUser).filter(WebchatUser.email == SINGLE_USER_EMAIL).first()
        password_hash = bcrypt.hashpw(
            SINGLE_USER_PASSWORD.encode(), bcrypt.gensalt()
        ).decode()
        if user is None:
            user = WebchatUser(
                id=str(uuid.uuid4()),
                username=SINGLE_USER_NAME,
                email=SINGLE_USER_EMAIL,
                password_hash=password_hash,
                is_active=True,
            )
            db.add(user)
        else:
            user.username = SINGLE_USER_NAME
            user.password_hash = password_hash
            user.is_active = True

        hashed_id = hash_user_id(SINGLE_USER_EMAIL)
        session_id = f"web_{hashed_id}"
        ident = db.query(IdentityMap).filter(IdentityMap.session_id == session_id).first()
        if ident is None:
            db.add(IdentityMap(
                session_id=session_id,
                hashed_id=hashed_id,
                real_id=SINGLE_USER_EMAIL,
                is_approved=True,
            ))
        else:
            ident.is_approved = True
        db.commit()
    finally:
        db.close()
