# CoStaff Channel — WebChat

[![Python Version](https://img.shields.io/badge/python-3.12%2B-blue.svg)](https://www.python.org/)
[![Docker Support](https://img.shields.io/badge/docker-supported-blue.svg)](https://www.docker.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-latest-009688.svg)](https://fastapi.tiangolo.com/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)

[繁體中文](./README_zhtw.md) | **English**

**CoStaff Channel — WebChat** is the official browser-based chat interface for the [costaff-ai](https://github.com/costaff-ai/costaff) platform. It provides direct access to the CoStaff Agent without requiring any third-party messaging app, accessible at `http://your-server:18088`.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Features](#features)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Architecture](#architecture)
- [License](#license)

---

## How It Works

```
Browser User
     │
     │  HTTP (port 18088)
     ▼
nginx (static frontend)
     │
     │  /api/*  reverse proxy
     ▼
FastAPI backend  ──►  CoStaff Agent (A2A / ADK API)
```

1. The user opens the WebChat URL in a browser and logs in (or registers)
2. The backend authenticates the user with JWT and maps their identity to a hashed user ID
3. Chat messages are proxied to the CoStaff Agent via the ADK API
4. Responses are streamed back to the browser in real time

---

## Features

- **Browser-based access** — no Telegram, Discord, or LINE account required
- **User registration and login** — email + password authentication with bcrypt and JWT
- **Identity hashing** — real user IDs are never stored; a 16-character SHA-256 hash is used throughout
- **ADK proxy** — all agent interactions are routed through the backend to the CoStaff Agent
- **Static frontend served by nginx** — lightweight, no Node.js runtime required in production
- **Health endpoint** — exposes `GET /.well-known/agent-card.json` for CoStaff platform registration

---

## Getting Started

### Prerequisites

- Docker and Docker Compose
- A running [CoStaff](https://github.com/costaff-ai/costaff) core stack

### Deploy via CoStaff CLI

```bash
# From the costaff-channel-webchat-oss directory
costaff channel add webchat --local .
```

CoStaff reads `costaff.channel.json`, prompts you for the values listed
in `env_required` (`WEBCHAT_JWT_SECRET`, `ID_SALT`), builds the
container, and connects it to the platform network automatically.

### Manual Docker Compose

```bash
cp .env.example .env   # then edit .env and fill in your own values
docker compose up -d --build
```

The backend will refuse to start while `WEBCHAT_JWT_SECRET` or `ID_SALT`
still match the placeholder strings — generate strong values with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

The WebChat interface will be available at `http://your-server:18088`.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `WEBCHAT_JWT_SECRET` | ✅ | — | JWT signing secret. Boot fails with the `.env.example` placeholder. |
| `ID_SALT` | ✅ | — | Salt for user ID hashing — **must match** the value in your core CoStaff `.env`. |
| `ADK_API_BASE_URL` | ❌ | `http://costaff-agent-costaff:8080` | CoStaff Agent ADK API base URL |
| `ADK_APP_NAME` | ❌ | `costaff_agent` | ADK application name |
| `ADK_SESSION_SERVICE_URI` | ❌ | `sqlite:///./webchat.db` | Session / user DB URI |
| `WEBCHAT_TOKEN_EXPIRE_MINUTES` | ❌ | `480` | Session token TTL (minutes) |
| `WEBCHAT_ALLOWED_ORIGINS` | ❌ | `*` | Comma-separated CORS origins. Set to your frontend domain(s) in production. |
| `COSTAFF_PREFERRED_LANGUAGE` | ❌ | `Traditional Chinese (繁體中文)` | Language for agent responses |
| `WEBCHAT_PORT` | ❌ | `80` | Internal nginx port |

---

## Architecture

```
costaff-channel-webchat-oss/
├── backend/
│   ├── main.py             # FastAPI app — CORS, router registration
│   ├── auth.py             # Registration, login, JWT auth endpoints
│   ├── adk_proxy.py        # ADK API proxy endpoints
│   ├── database.py         # SQLAlchemy models and DB setup
│   └── config.py           # Environment variable loading
├── index.html              # Main chat UI
├── login.html              # Login / registration page
├── js/                     # Frontend JavaScript
├── css/                    # Frontend styles
├── nginx.conf              # nginx reverse proxy config
├── supervisord.conf        # Runs nginx + uvicorn together in one container
├── Dockerfile
├── docker-compose.yaml
├── costaff.channel.json    # CoStaff channel registration manifest
└── requirements.txt
```

The container runs both nginx (static frontend) and uvicorn (FastAPI backend) via supervisord, joined to the `costaff_default` Docker network.

---

## License

Distributed under the Apache 2.0 License. See `LICENSE` for details.
