# CoStaff 頻道 — WebChat

[![Python Version](https://img.shields.io/badge/python-3.12%2B-blue.svg)](https://www.python.org/)
[![Docker Support](https://img.shields.io/badge/docker-supported-blue.svg)](https://www.docker.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-latest-009688.svg)](https://fastapi.tiangolo.com/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)

**[English](./README.md)** | 繁體中文

**CoStaff 頻道 — WebChat** 是 [CoStaff](https://github.com/costaff-ai/costaff) 平台的官方瀏覽器對話介面。不需要任何第三方通訊軟體，直接在瀏覽器中存取 CoStaff Agent，預設網址為 `http://your-server:18088`。

---

## 目錄

- [運作方式](#運作方式)
- [功能特色](#功能特色)
- [快速開始](#快速開始)
- [環境變數](#環境變數)
- [專案架構](#專案架構)
- [授權](#授權)

---

## 運作方式

```
瀏覽器使用者
     │
     │  HTTP (port 18088)
     ▼
nginx（靜態前端）
     │
     │  /api/*  反向代理
     ▼
FastAPI 後端  ──►  CoStaff Agent (A2A / ADK API)
```

1. 單一使用者開啟 WebChat 網址，用 `.env` 設定的帳密登入
2. 後端使用 JWT 驗證身份，並將使用者 ID 雜湊對應
3. 對話訊息透過後端代理轉發至 CoStaff Agent ADK API
4. Agent 回應即時串流回瀏覽器

---

## 功能特色

- **瀏覽器直接存取** — 不需要 Telegram、Discord 或 LINE 帳號
- **單一使用者模式** — 帳密由 `.env` 設定，無公開註冊端點。需要多租戶 / 組織級存取請改用 enterprise 版
- **身份雜湊保護** — 真實使用者 ID 從不儲存，全程使用 16 字元 SHA-256 雜湊
- **ADK 代理** — 所有 Agent 互動透過後端路由至 CoStaff Agent
- **React 前端（Vite + TS + Tailwind）** — 多階段建置產出靜態檔案後由 nginx 提供，正式環境無需 Node.js runtime
- **健康端點** — 提供 `GET /.well-known/agent-card.json`，供 CoStaff 平台註冊使用

---

## 快速開始

### 前置需求

- Docker 與 Docker Compose
- 正在運行的 [CoStaff](https://github.com/costaff-ai/costaff) 核心服務

### 透過 CoStaff CLI 部署

```bash
# 在 costaff-channel-webchat-oss 目錄下執行
costaff channel add webchat --local .
```

CoStaff 會讀取 `costaff.channel.json`,依 `env_required`(`WEBCHAT_JWT_SECRET`、`ID_SALT`)依序提示您填寫,然後自動建置容器並連接至 platform 網路。

### 手動 Docker Compose

```bash
cp .env.example .env   # 編輯 .env,把預設值換成您自己的
docker compose up -d --build
```

`WEBCHAT_JWT_SECRET` 與 `ID_SALT` 若仍保留 `.env.example` 內的 placeholder,後端會拒絕啟動。產生強隨機字串:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## 環境變數

| 變數名稱 | 必填 | 預設值 | 說明 |
|---|---|---|---|
| `WEBCHAT_JWT_SECRET` | ✅ | — | JWT 簽名金鑰。保留 `.env.example` placeholder 時後端會拒絕啟動 |
| `ID_SALT` | ✅ | — | 使用者 ID 雜湊鹽值 — **必須等同** core CoStaff `.env` 的同名變數 |
| `WEBCHAT_USER_EMAIL` | ✅ | — | 唯一登入帳號的 email |
| `WEBCHAT_USER_PASSWORD` | ✅ | — | 唯一登入帳號的密碼（≥ 6 字元）。重啟容器會自動同步新密碼 |
| `WEBCHAT_USER_NAME` | ❌ | `User` | sidebar 顯示的暱稱 |
| `ADK_API_BASE_URL` | ❌ | `http://costaff-agent-costaff:8080` | CoStaff Agent ADK API 位址 |
| `ADK_APP_NAME` | ❌ | `costaff_agent` | ADK 應用程式名稱 |
| `ADK_SESSION_SERVICE_URI` | ❌ | `sqlite:///./webchat.db` | Session / 使用者 DB URI |
| `WEBCHAT_TOKEN_EXPIRE_MINUTES` | ❌ | `480` | Session token TTL(分鐘) |
| `WEBCHAT_ALLOWED_ORIGINS` | ❌ | `*` | CORS 允許來源,逗號分隔。正式環境請設為您前端網域 |
| `COSTAFF_PREFERRED_LANGUAGE` | ❌ | `Traditional Chinese (繁體中文)` | Agent 回應語言 |
| `WEBCHAT_PORT` | ❌ | `80` | nginx 內部監聽 port |

---

## 專案架構

```
costaff-channel-webchat-oss/
├── frontend/                   # React + Vite + TypeScript + Tailwind
│   ├── src/
│   │   ├── pages/              # Login / Chat
│   │   ├── components/         # （預留拆分用）
│   │   ├── hooks/              # useVoiceInput
│   │   ├── lib/                # api.ts, markdown.ts, types.ts
│   │   ├── App.tsx             # 依 token 切換頁面
│   │   ├── main.tsx            # React 進入點
│   │   └── index.css           # 設計變數 + Tailwind base
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── postcss.config.js
├── backend/                    # FastAPI
│   ├── main.py                 # FastAPI 應用 — CORS、路由器掛載
│   ├── auth.py                 # 註冊、登入、JWT 驗證端點
│   ├── adk_proxy.py            # ADK API 代理端點
│   ├── database.py             # SQLAlchemy 資料模型與 DB 初始化
│   └── config.py               # 環境變數載入
├── nginx.conf                  # nginx 反向代理設定
├── supervisord.conf            # 同一容器中同時執行 nginx + uvicorn
├── Dockerfile                  # 多階段：Node build → Python + nginx
├── docker-compose.yaml
├── costaff.channel.json        # CoStaff 頻道註冊描述檔
└── requirements.txt
```

Docker image 採兩階段建置：Node 階段把 React 前端建成靜態資源，Python
階段再用 nginx 提供前端、用 uvicorn 跑 FastAPI 後端，兩者透過
supervisord 在同一容器執行，加入 `costaff_default` Docker 網路。

### 本地前端開發

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173，/api/* 會 proxy 到 localhost:8000
```

後端另起 port 8000（`uvicorn backend.main:app --reload`）即可全 stack 本地開發。

---

## 授權

依 Apache 2.0 授權條款發布。詳見 `LICENSE`。
