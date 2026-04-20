import os
import io
import base64
import httpx
from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session

from backend.auth import get_current_user, get_identity
from backend.config import ADK_API_BASE_URL, ADK_APP_NAME, PREFERRED_LANG
from backend.database import get_db, WebchatUser, hash_user_id

UPLOADS_DIR = "/app/data/coding_workspace/shared/uploads"
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}
MIME_MAP = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
}

router = APIRouter()

TIMEOUT = 300.0


def _require_approved(user: WebchatUser, db: Session):
    identity = get_identity(user, db)
    if not identity or not identity.is_approved:
        raise HTTPException(status_code=403, detail="Account pending admin approval")


@router.post("/api/run")
async def run(
    request: Request,
    current_user: WebchatUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_approved(current_user, db)

    body = await request.json()
    hashed_id = hash_user_id(current_user.email)
    session_id = f"web_{hashed_id}"

    # Ensure session exists
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        await client.post(
            f"{ADK_API_BASE_URL}/apps/{ADK_APP_NAME}/users/{hashed_id}/sessions",
            json={"sessionId": session_id, "state": {}},
        )

    # Build ADK-compliant payload
    user_text = body.get("text", "")
    attachments = body.get("attachments", [])  # list of {type, mimeType?, data?, path?, filename}

    parts = [{"text": f"(Context ID: {hashed_id}) {user_text}"}]

    uploaded_paths = []
    for att in attachments:
        if att.get("type") == "image":
            parts.append({"inlineData": {"mimeType": att["mimeType"], "data": att["data"]}})
        elif att.get("type") == "document" and att.get("path"):
            uploaded_paths.append(att["path"])

    if uploaded_paths:
        rel_paths = [os.path.relpath(p, "/app/data/coding_workspace") for p in uploaded_paths]
        paths_note = (
            "（使用者上傳了以下檔案：" + ", ".join(uploaded_paths) + "。"
            "coding_agent 可用 read_file 工具以相對路徑存取：" + ", ".join(rel_paths) + "）"
        )
        parts[0]["text"] += " " + paths_note

    payload = {
        "appName": ADK_APP_NAME,
        "userId": hashed_id,
        "sessionId": session_id,
        "newMessage": {
            "role": "user",
            "parts": parts,
        },
    }

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.post(f"{ADK_API_BASE_URL}/run", json=payload)

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail="ADK error")

    events = resp.json()
    reply = ""
    for event in reversed(events):
        if event.get("author") != "user" and "content" in event:
            texts = [p.get("text", "") for p in event["content"].get("parts", []) if "text" in p]
            if texts:
                reply = "".join(texts).strip()
                break

    if not reply:
        # Nudge agent to summarize
        nudge = {
            "appName": ADK_APP_NAME,
            "userId": hashed_id,
            "sessionId": session_id,
            "newMessage": {
                "role": "user",
                "parts": [{"text": f"任務已完成，請用{PREFERRED_LANG}向用戶說明結果摘要。"}],
            },
        }
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp2 = await client.post(f"{ADK_API_BASE_URL}/run", json=nudge)
        if resp2.status_code == 200:
            for event in reversed(resp2.json()):
                if event.get("author") != "user" and "content" in event:
                    texts = [p.get("text", "") for p in event["content"].get("parts", []) if "text" in p]
                    if texts:
                        reply = "".join(texts).strip()
                        break

    return {"reply": reply or "⚠️ 無法取得 Agent 回應。"}


@router.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: WebchatUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_approved(current_user, db)

    content = await file.read()
    fname = file.filename or "upload"
    ext = os.path.splitext(fname)[1].lower()

    if ext in IMAGE_EXTS:
        mime = MIME_MAP.get(ext, "image/jpeg")
        data = base64.b64encode(content).decode()
        return {"type": "image", "mimeType": mime, "data": data, "filename": fname}
    else:
        os.makedirs(UPLOADS_DIR, exist_ok=True)
        safe_name = fname.replace("/", "_").replace("..", "_")
        fpath = os.path.join(UPLOADS_DIR, safe_name)
        with open(fpath, "wb") as f:
            f.write(content)
        return {"type": "document", "path": fpath, "filename": fname}


@router.delete("/api/session")
async def reset_session(
    current_user: WebchatUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_approved(current_user, db)
    hashed_id = hash_user_id(current_user.email)
    session_id = f"web_{hashed_id}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        await client.delete(
            f"{ADK_API_BASE_URL}/apps/{ADK_APP_NAME}/users/{hashed_id}/sessions/{session_id}"
        )
    return {"status": "reset"}
