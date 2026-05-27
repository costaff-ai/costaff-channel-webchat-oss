from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import bcrypt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from backend.database import get_db, WebchatUser, IdentityMap, hash_user_id

router = APIRouter(prefix="/api/auth")
bearer = HTTPBearer()


def _verify_pw(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


class LoginRequest(BaseModel):
    email: str
    password: str


# ---------- Token helpers ----------

def create_access_token(data: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({**data, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


# ---------- Auth dependency ----------

def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> WebchatUser:
    try:
        payload = decode_token(creds.credentials)
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(WebchatUser).filter(WebchatUser.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def get_identity(user: WebchatUser, db: Session) -> IdentityMap:
    hashed_id = hash_user_id(user.email)
    session_id = f"web_{hashed_id}"
    return db.query(IdentityMap).filter(IdentityMap.session_id == session_id).first()


# ---------- Routes ----------

@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    email = req.email.lower().strip()
    user = db.query(WebchatUser).filter(WebchatUser.email == email).first()
    if not user or not _verify_pw(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    identity = get_identity(user, db)
    is_approved = identity.is_approved if identity else False

    token = create_access_token({"sub": user.id})
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user.username,
        "is_approved": is_approved,
    }


@router.get("/me")
def me(
    current_user: WebchatUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    identity = get_identity(current_user, db)
    hashed_id = hash_user_id(current_user.email)
    return {
        "username": current_user.username,
        "email": current_user.email,
        "hashed_id": hashed_id,
        "session_id": f"web_{hashed_id}",
        "is_approved": identity.is_approved if identity else False,
    }
