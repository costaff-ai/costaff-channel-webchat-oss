# CoStaff 頻道 — WebChat

[![Python Version](https://img.shields.io/badge/python-3.12%2B-blue.svg)](https://www.python.org/)
[![Docker Support](https://img.shields.io/badge/docker-supported-blue.svg)](https://www.docker.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-latest-009688.svg)](https://fastapi.tiangolo.com/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

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

1. 使用者在瀏覽器開啟 WebChat 網址並登入（或註冊）
2. 後端使用 JWT 驗證身份，並將使用者 ID 雜湊對應
3. 對話訊息透過後端代理轉發至 CoStaff Agent ADK API
4. Agent 回應即時串流回瀏覽器

---

## 功能特色

- **瀏覽器直接存取** — 不需要 Telegram、Discord 或 LINE 帳號
- **使用者註冊與登入** — Email + 密碼認證，採用 bcrypt 雜湊與 JWT
- **身份雜湊保護** — 真實使用者 ID 從不儲存，全程使用 16 字元 SHA-256 雜湊
- **ADK 代理** — 所有 Agent 互動透過後端路由至 CoStaff Agent
- **nginx 靜態前端** — 輕量部署，正式環境無需 Node.js 執行環境
- **健康端點** — 提供 `GET /.well-known/agent.json`，供 CoStaff 平台註冊使用

---

## 快速開始

### 前置需求

- Docker 與 Docker Compose
- 正在運行的 [CoStaff](https://github.com/costaff-ai/costaff) 核心服務

### 透過 CoStaff CLI 部署

```bash
# 在 costaff-channel-webchat 目錄下執行
cst channel deploy --local .
```

CoStaff 會讀取 `costaff.channel.json`，自動建置容器並連接至 platform 網路。

### 手動 Docker Compose

```bash
cp .env.example .env   # 填入您的設定值
docker compose up -d --build
```

WebChat 介面將可於 `http://your-server:18088` 存取。

---

## 環境變數

| 變數名稱 | 必填 | 預設值 | 說明 |
|---|---|---|---|
| `ADK_API_BASE_URL` | ❌ | `http://costaff-agent-costaff:8080` | CoStaff Agent ADK API 位址 |
| `ADK_APP_NAME` | ❌ | `costaff_agent` | ADK 應用程式名稱 |
| `ADK_SESSION_SERVICE_URI` | ❌ | — | ADK Session 服務 URI |
| `ID_SALT` | ❌ | — | 使用者 ID 雜湊鹽值（正式環境請設定機密值） |
| `WEBCHAT_JWT_SECRET` | ❌ | — | JWT 簽名金鑰（正式環境請設定強密碼） |
| `COSTAFF_PREFERRED_LANGUAGE` | ❌ | `Traditional Chinese (繁體中文)` | Agent 回應語言 |
| `WEBCHAT_PORT` | ❌ | `80` | nginx 內部監聽 port |

---

## 專案架構

```
costaff-channel-webchat/
├── backend/
│   ├── main.py             # FastAPI 應用 — CORS、路由器掛載
│   ├── auth.py             # 註冊、登入、JWT 驗證端點
│   ├── adk_proxy.py        # ADK API 代理端點
│   ├── database.py         # SQLAlchemy 資料模型與 DB 初始化
│   └── config.py           # 環境變數載入
├── index.html              # 主對話介面
├── login.html              # 登入 / 註冊頁面
├── js/                     # 前端 JavaScript
├── css/                    # 前端樣式
├── nginx.conf              # nginx 反向代理設定
├── supervisord.conf        # 同一容器中同時執行 nginx + uvicorn
├── Dockerfile
├── docker-compose.yaml
├── costaff.channel.json    # CoStaff 頻道註冊描述檔
└── requirements.txt
```

容器透過 supervisord 同時執行 nginx（靜態前端）與 uvicorn（FastAPI 後端），加入 `costaff_default` Docker 網路。

---

## 授權

依 AGPL v3 授權條款發布。詳見 `LICENSE`。
