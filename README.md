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

1. The single user opens the WebChat URL and logs in with the credentials configured in `.env`
2. The backend authenticates the user with JWT and maps their identity to a hashed user ID
3. Chat messages are proxied to the CoStaff Agent via the ADK API
4. Responses are streamed back to the browser in real time

---

## Features

- **Browser-based access** — no Telegram, Discord, or LINE account required
- **Single-user mode** — credentials configured via `.env`; no public registration endpoint. For multi-tenant / org-based access, use the enterprise edition
- **Identity hashing** — real user ID is never stored; a 16-character SHA-256 hash is used throughout
- **ADK proxy** — all agent interactions are routed through the backend to the CoStaff Agent
- **React frontend (Vite + TS + Tailwind)** served as static assets by nginx — no Node.js runtime in production, just a multi-stage build
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
| `WEBCHAT_USER_EMAIL` | ✅ | — | Email for the single login account. |
| `WEBCHAT_USER_PASSWORD` | ✅ | — | Password for the single login account (min 6 chars). Container restart re-syncs the hash. |
| `WEBCHAT_USER_NAME` | ❌ | `User` | Display name shown in the sidebar. |
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
├── frontend/                   # React + Vite + TypeScript + Tailwind
│   ├── src/
│   │   ├── pages/              # Login / Chat
│   │   ├── components/         # (reserved for future split)
│   │   ├── hooks/              # useVoiceInput
│   │   ├── lib/                # api.ts, markdown.ts, types.ts
│   │   ├── App.tsx             # token-gate routing
│   │   ├── main.tsx            # React entry
│   │   └── index.css           # design tokens + Tailwind base
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── postcss.config.js
├── backend/                    # FastAPI
│   ├── main.py                 # FastAPI app — CORS, router registration
│   ├── auth.py                 # Registration, login, JWT auth endpoints
│   ├── adk_proxy.py            # ADK API proxy endpoints
│   ├── database.py             # SQLAlchemy models and DB setup
│   └── config.py               # Environment variable loading
├── nginx.conf                  # nginx reverse proxy config
├── supervisord.conf            # Runs nginx + uvicorn together in one container
├── Dockerfile                  # multi-stage: Node build → Python + nginx
├── docker-compose.yaml
├── costaff.channel.json        # CoStaff channel registration manifest
└── requirements.txt
```

The Docker image is built in two stages: Node builds the React frontend
to static assets, then the Python image serves them via nginx alongside
the FastAPI backend (uvicorn). Both processes run together under
supervisord in a single container, joined to the `costaff_default`
Docker network.

### Local frontend development

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173, /api/* proxied to localhost:8000
```

Run the FastAPI backend separately on port 8000 (`uvicorn backend.main:app --reload`) for full-stack local dev.

---

## License

Distributed under the Apache 2.0 License. See `LICENSE` for details.
