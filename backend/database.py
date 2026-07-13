import hashlib
import uuid
from datetime import datetime
import bcrypt
from sqlalchemy import create_engine, Column, String, Boolean, DateTime, Integer, Text
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


class WebchatMessage(Base):
    """One line of the user's single, persistent conversation.

    OSS WebChat is single-user and single-thread — there is exactly one
    conversation per account and no session switching — so a flat row per
    message keyed by hashed_id is all that's needed to restore the
    transcript on reload. `role`: 'user' | 'agent' | 'file'. File rows carry
    the on-disk path so a fresh download token can be minted at load time."""
    __tablename__ = "webchat_oss_messages"
    id = Column(Integer, primary_key=True, autoincrement=True)
    hashed_id = Column(String, index=True, nullable=False)
    role = Column(String(16), nullable=False)
    text = Column(Text, nullable=True)
    file_name = Column(String, nullable=True)
    file_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


_engine = None
_SessionLocal = None


def get_engine():
    global _engine, _SessionLocal
    if _engine is None:
        uri = DB_URI.replace("postgresql+asyncpg://", "postgresql://")
        _engine = create_engine(uri)
        # Only create OSS-owned tables — identity_maps already exists (core).
        WebchatUser.__table__.create(_engine, checkfirst=True)
        WebchatMessage.__table__.create(_engine, checkfirst=True)
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


def persist_message(hashed_id: str, role: str, *, text: str | None = None,
                    file_name: str | None = None, file_path: str | None = None) -> None:
    """Append one message to the user's persistent transcript. Best-effort:
    a persistence hiccup must never break the live chat response."""
    db = new_session()
    try:
        db.add(WebchatMessage(
            hashed_id=hashed_id, role=role, text=text,
            file_name=file_name, file_path=file_path,
        ))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def load_history(hashed_id: str, limit: int = 1000) -> list["WebchatMessage"]:
    """The user's whole conversation, oldest first (id is monotonic)."""
    db = new_session()
    try:
        rows = (
            db.query(WebchatMessage)
            .filter(WebchatMessage.hashed_id == hashed_id)
            .order_by(WebchatMessage.id.asc())
            .limit(limit)
            .all()
        )
        db.expunge_all()
        return rows
    finally:
        db.close()


def clear_history(hashed_id: str) -> None:
    db = new_session()
    try:
        db.query(WebchatMessage).filter(WebchatMessage.hashed_id == hashed_id).delete()
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


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
