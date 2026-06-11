"""ADK proxy — chat requests in, agent replies (and file links) out.

Built on the shared `costaff-channel-chatbot` library so WebChat gets
the same conversation semantics as every other channel:

  - run_adk_prompt: per-session lock (no interleaved /run calls), retry
    with backoff, empty-reply nudge, 30-minute timeout for long agent
    tasks, shared HTTP client.
  - response helpers: file references in the agent reply are resolved
    against the shared volume, replaced with the filename in the text,
    and returned as signed download links (see backend/file_links.py).
  - RateLimiter: same env knobs (RATE_LIMIT_MAX / RATE_LIMIT_WINDOW).

WebChat is request/response (no push), so it uses the library's client
and response layers directly rather than the ChannelRuntime delivery
loop, which assumes an adapter it can push messages through.
"""
import base64
import logging
import os

from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from costaff_channel_chatbot import (
    RateLimiter,
    delete_session,
    parse_result_envelope,
    run_adk_prompt,
)
from costaff_channel_chatbot.response import (
    DATA_ROOT,
    extract_path_candidates,
    protect_code_blocks,
    resolve_path,
    restore_code_blocks,
    rewrite_with_hint,
    strip_leftover_hints,
)

from backend.auth import get_current_user, get_identity
from backend.config import ADK_APP_NAME
from backend.database import get_db, WebchatUser, hash_user_id
from backend.file_links import make_token, verify_token

logger = logging.getLogger(__name__)

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}
MIME_MAP = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
}

ATTACHMENT_HINT = "（詳見附件）"

router = APIRouter()

_rate = RateLimiter()


def _require_approved(user: WebchatUser, db: Session):
    identity = get_identity(user, db)
    if not identity or not identity.is_approved:
        raise HTTPException(status_code=403, detail="Account pending admin approval")


def _uploads_dir(hashed_id: str) -> str:
    # Per-user subdirectory on the shared volume — mirrors the channel
    # runtime so identical filenames from two users never collide.
    return os.path.join(DATA_ROOT, "uploads", hashed_id)


def _extract_files(final_res: str) -> tuple[str, list[dict]]:
    """Pull file references out of the agent reply.

    Returns (clean_text, files) where files is a list of
    {"filename", "url"} download descriptors. Mirrors
    ChannelRuntime.deliver_response: a structured RESULT envelope's
    `files:` list is trusted; otherwise regex extraction."""
    env = parse_result_envelope(final_res)
    if env.structured and env.files:
        candidates = env.files
        base_text = env.summary or final_res
    else:
        candidates = extract_path_candidates(final_res)
        base_text = final_res

    protected, code_blocks = protect_code_blocks(base_text)
    files: list[dict] = []
    for raw in candidates:
        resolved = resolve_path(raw, wait_seconds=2.0)
        if not resolved:
            logger.warning(f"Failed to resolve file reference: {raw}")
            continue
        name = os.path.basename(resolved)
        protected = rewrite_with_hint(protected, raw, name)
        token = make_token(resolved)
        if token:
            files.append({"filename": name, "url": f"/api/files/{token}"})

    clean = restore_code_blocks(protected, code_blocks)
    clean = strip_leftover_hints(clean, ATTACHMENT_HINT)
    return clean or final_res, files


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

    if _rate.exceeded(hashed_id):
        raise HTTPException(status_code=429, detail="Too many requests, slow down")

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
        paths_note = (
            f"（使用者上傳了檔案，已存放在 SHARED_DIR/uploads/：{', '.join(uploaded_paths)}）"
        )
        parts[0]["text"] += " " + paths_note

    # Session creation, locking, retries and the empty-reply nudge all
    # live inside run_adk_prompt.
    reply = await run_adk_prompt(ADK_APP_NAME, hashed_id, session_id, parts=parts)

    clean, files = _extract_files(reply)
    return {"reply": clean, "files": files}


@router.get("/api/files/{token}")
async def download_file(token: str):
    """Serve a file referenced by a signed token minted in _extract_files.

    The token alone authorizes the download (it binds path + expiry and
    is HMAC-signed). Defense-in-depth: the path must also live under the
    shared data root."""
    path = verify_token(token)
    if not path:
        raise HTTPException(status_code=403, detail="Invalid or expired link")
    real = os.path.realpath(path)
    allowed_root = os.path.realpath(os.getenv("WEBCHAT_FILE_ROOT", "/app/data"))
    if not real.startswith(allowed_root.rstrip("/") + "/"):
        raise HTTPException(status_code=403, detail="Forbidden path")
    if not os.path.isfile(real):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(real, filename=os.path.basename(real))


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
        hashed_id = hash_user_id(current_user.email)
        uploads_dir = _uploads_dir(hashed_id)
        os.makedirs(uploads_dir, exist_ok=True)
        safe_name = fname.replace("/", "_").replace("..", "_")
        fpath = os.path.join(uploads_dir, safe_name)
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
    await delete_session(ADK_APP_NAME, hashed_id, session_id)
    return {"status": "reset"}
