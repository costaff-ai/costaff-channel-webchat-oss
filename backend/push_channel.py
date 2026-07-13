"""Async push for WebChat OSS — the same shared capability every channel has.

The CoStaff Manager delivers finished async-task results and sub-agent
progress to `/api/internal/push` (shared contract in
costaff_channel_chatbot.make_internal_push_router). Here we plug in a
ChannelAdapter whose `push_frame` forwards each frame to the user's browser
over an SSE stream (`/api/stream`), so a background task the user was told
would "notify later" actually lands in the chat.
"""
import asyncio
import json
import logging
import os

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from jose import JWTError

from costaff_channel_chatbot import ChannelAdapter, make_internal_push_router

from backend.auth import decode_token
from backend.config import INTERNAL_SECRET, SINGLE_USER_EMAIL
from backend.database import new_session, WebchatUser, hash_user_id
from backend.file_links import make_token
from backend.sse_hub import hub

logger = logging.getLogger(__name__)

_IMG_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}


class WebChatSSEAdapter(ChannelAdapter):
    """Delivers push frames to the browser over SSE. Inbound stays
    request/response (adk_proxy), so the reply/file/download methods are not
    used — only push / push_frame."""
    platform_prefix = "web"

    async def push(self, real_id: str, text: str) -> None:
        await hub.publish(real_id, {"type": "agent_text", "text": text})

    async def push_frame(self, real_id: str, frame: dict) -> None:
        # For agent_file frames, mint a signed download link the browser can
        # fetch (the raw /app/data path is not reachable from the browser).
        if frame.get("type") == "agent_file" and frame.get("path"):
            path = frame["path"]
            token = make_token(path)
            if token:
                name = frame.get("name") or os.path.basename(path)
                ext = os.path.splitext(name)[1].lower()
                await hub.publish(real_id, {
                    "type": "agent_file",
                    "name": name,
                    "url": f"/api/files/{token}",
                    "preview": "image" if ext in _IMG_EXTS else None,
                })
            return
        await hub.publish(real_id, frame)

    async def reply(self, msg, text):  # not used by OSS (request/response)
        raise NotImplementedError
    async def send_file(self, msg, path):
        raise NotImplementedError
    async def download_attachment(self, attachment):
        raise NotImplementedError


_adapter = WebChatSSEAdapter()


def _resolve_real_id(session_id: str | None, hashed_id: str | None) -> str | None:
    """Map the Manager's push target to this channel's SSE key (the user's
    hashed_id). Single-user, so a push always belongs to the one account."""
    if session_id and session_id.startswith("web_"):
        return session_id[len("web_"):]
    if hashed_id:
        return hashed_id
    return hash_user_id(SINGLE_USER_EMAIL) if SINGLE_USER_EMAIL else None


# The shared receiver — identical contract to every other channel.
internal_push_router = make_internal_push_router(
    adapter=_adapter,
    get_secret=lambda: INTERNAL_SECRET,
    resolve_real_id=_resolve_real_id,
)


stream_router = APIRouter()


@stream_router.get("/api/stream")
async def stream(request: Request, token: str = Query(...)):
    """SSE stream of push frames for the authenticated user.

    Auth via `?token=` because EventSource cannot send an Authorization
    header. The token is the same JWT issued at login."""
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    db = new_session()
    try:
        user = db.query(WebchatUser).filter(WebchatUser.id == user_id).first()
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="User not found or inactive")
        key = hash_user_id(user.email)
    finally:
        db.close()

    q = hub.subscribe(key)

    async def gen():
        try:
            yield ": connected\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    frame = await asyncio.wait_for(q.get(), timeout=20.0)
                    yield f"data: {json.dumps(frame, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"  # keepalive so proxies don't drop the conn
        finally:
            hub.unsubscribe(key, q)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
