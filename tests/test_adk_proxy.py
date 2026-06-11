"""Tests for the refactored ADK proxy (shared-library based).

Locks in:
  - /api/run delegates to the shared run_adk_prompt and returns
    {reply, files}; file references are resolved, rewritten and exposed
    as signed download links
  - rate limiting returns 429
  - /api/files/{token}: valid token serves the file; invalid/expired/
    out-of-root tokens are rejected
  - /api/upload stores documents in a per-user directory under DATA_ROOT
  - /api/session calls the shared delete_session
"""
import pytest

from backend import adk_proxy
from backend.file_links import make_token
from costaff_channel_chatbot import RateLimiter
from costaff_channel_chatbot import response as response_module


@pytest.fixture(autouse=True)
def _fresh_rate(monkeypatch):
    monkeypatch.setattr(adk_proxy, "_rate", RateLimiter(max_calls=100, window_seconds=60))


def _patch_adk(monkeypatch, reply: str):
    async def fake_run(app, uid, sid, prompt=None, parts=None):
        fake_run.calls.append({"app": app, "uid": uid, "sid": sid, "parts": parts})
        return reply

    fake_run.calls = []
    monkeypatch.setattr(adk_proxy, "run_adk_prompt", fake_run)
    return fake_run


def test_run_returns_reply_and_no_files(client, monkeypatch):
    fake = _patch_adk(monkeypatch, "你好！")
    res = client.post("/api/run", json={"text": "hi"})
    assert res.status_code == 200
    assert res.json() == {"reply": "你好！", "files": []}
    # Context ID injected for the agent
    assert fake.calls[0]["parts"][0]["text"].startswith("(Context ID: ")


def test_run_resolves_file_references(client, monkeypatch, tmp_path):
    monkeypatch.setattr(response_module, "DATA_ROOT", str(tmp_path))
    out = tmp_path / "agent-ba" / "report.pdf"
    out.parent.mkdir(parents=True)
    out.write_bytes(b"%PDF")

    _patch_adk(monkeypatch, f"完成！[FILE: {out}]")
    res = client.post("/api/run", json={"text": "go"})
    assert res.status_code == 200
    data = res.json()
    assert len(data["files"]) == 1
    f = data["files"][0]
    assert f["filename"] == "report.pdf"
    assert f["url"].startswith("/api/files/")
    # The raw absolute path never reaches the user
    assert str(out) not in data["reply"]

    # The signed link actually serves the file
    monkeypatch.setenv("WEBCHAT_FILE_ROOT", str(tmp_path))
    dl = client.get(f["url"])
    assert dl.status_code == 200
    assert dl.content == b"%PDF"


def test_run_trusts_structured_envelope(client, monkeypatch, tmp_path):
    monkeypatch.setattr(response_module, "DATA_ROOT", str(tmp_path))
    out = tmp_path / "report.pdf"
    out.write_bytes(b"%PDF")
    _patch_adk(
        monkeypatch,
        f"status: ok\nsummary: 報告完成。\nfiles:\n  - {out}\n",
    )
    res = client.post("/api/run", json={"text": "go"})
    data = res.json()
    assert "報告完成" in data["reply"]
    assert "status: ok" not in data["reply"]
    assert [f["filename"] for f in data["files"]] == ["report.pdf"]


def test_run_rate_limited(client, monkeypatch):
    monkeypatch.setattr(adk_proxy, "_rate", RateLimiter(max_calls=1, window_seconds=60))
    _patch_adk(monkeypatch, "ok")
    assert client.post("/api/run", json={"text": "1"}).status_code == 200
    assert client.post("/api/run", json={"text": "2"}).status_code == 429


def test_download_rejects_invalid_token(client):
    assert client.get("/api/files/garbage.token").status_code == 403


def test_download_rejects_path_outside_root(client, monkeypatch, tmp_path):
    inner = tmp_path / "inner"
    inner.mkdir()
    monkeypatch.setenv("WEBCHAT_FILE_ROOT", str(inner))
    outside = tmp_path / "secret.txt"
    outside.write_text("nope")
    res = client.get(f"/api/files/{make_token(str(outside))}")
    assert res.status_code == 403


def test_download_404_when_missing(client, monkeypatch, tmp_path):
    monkeypatch.setenv("WEBCHAT_FILE_ROOT", str(tmp_path))
    res = client.get(f"/api/files/{make_token(str(tmp_path / 'gone.pdf'))}")
    assert res.status_code == 404


def test_upload_document_lands_in_per_user_dir(client, monkeypatch, tmp_path):
    monkeypatch.setattr(adk_proxy, "DATA_ROOT", str(tmp_path))
    res = client.post(
        "/api/upload",
        files={"file": ("data.csv", b"a,b\n1,2\n", "text/csv")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "document"
    from backend.database import hash_user_id

    uid = hash_user_id("tester@example.com")
    assert f"/uploads/{uid}/" in data["path"]


def test_upload_image_returns_inline_data(client):
    res = client.post(
        "/api/upload",
        files={"file": ("pic.png", b"\x89PNG fake", "image/png")},
    )
    data = res.json()
    assert data["type"] == "image"
    assert data["mimeType"] == "image/png"
    assert data["data"]  # base64 payload present


def test_session_reset_uses_shared_delete(client, monkeypatch):
    calls = []

    async def fake_delete(app, uid, sid):
        calls.append(sid)
        return True

    monkeypatch.setattr(adk_proxy, "delete_session", fake_delete)
    res = client.delete("/api/session")
    assert res.status_code == 200
    assert len(calls) == 1 and calls[0].startswith("web_")
