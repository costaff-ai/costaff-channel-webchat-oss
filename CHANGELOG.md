# Changelog

All notable changes to this project are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased]

## [0.1.0-beta-3] - 2026-07-14

Version jumps alpha-2 → beta-3 to align with the CoStaff product line (core
is on beta-3); there were no separate WebChat beta-1/beta-2 releases.

### Added

- **Async task-result delivery ("notify you later").** A background task that
  finishes after the request returns is now pushed into the chat over SSE
  (`/api/stream`), via the shared `/api/internal/push` receiver. This is the
  same shared push capability the other channels have; requires the core to be
  on beta-3 (which sends to `WEBCHAT_PUSH_URL`).
- **Persistent single-thread history.** Messages are saved server-side
  (`webchat_oss_messages`); closing and reopening the window restores the full
  transcript via `/api/history`. One continuous thread by design — no
  multi-session switching (that stays an Enterprise feature). `RESET` clears it.
- **"OSS" edition badge** next to the CoStaff wordmark, so the open-source and
  Enterprise builds are distinguishable at a glance.

### Fixed

- **IME composition no longer sends prematurely.** Pressing Enter to pick a
  candidate while composing (Zhuyin/Pinyin/Japanese/Korean) confirmed the word
  *and* fired send, leaking a half-typed message and a stuck fragment. Enter is
  now ignored while `isComposing`.
- **Code blocks render cleanly.** Fenced code kept literal newlines instead of
  `<br>`, and inline-code styling no longer bleeds onto each line of a block
  (which had painted a grey box per line). The `<pre>` owns one background.
- **Docker build.** Added `git` to the image so pip can fetch the `git+` shared
  library (the build previously failed).

## [0.1.0-alpha-2] - 2026-06-14

### Changed

- Adopted the shared `costaff-channel-chatbot` library.
- Version bumped to `0.1.0-alpha-2`.

## [0.1.0-alpha-1] - 2026-05-27

First tagged pre-release. Bundles the pre-open-source hardening, the
React frontend rewrite, the move to single-user mode, and the patched
dependency baseline.

### Added

- React frontend (Vite + TypeScript + Tailwind via PostCSS) under
  `frontend/`, replacing the vanilla HTML/JS pages at the repo root.
  Multi-stage `Dockerfile` builds the bundle with Node and ships it
  as static assets — no Node runtime in production.
- Single-user bootstrap. `WEBCHAT_USER_EMAIL`, `WEBCHAT_USER_PASSWORD`,
  `WEBCHAT_USER_NAME` env vars seed exactly one account at startup,
  idempotent on container restart (re-hashes the password). Manifest
  declares the two required keys.
- `/api/version` endpoint and `backend.__version__` for deploy verification.
- `WEBCHAT_ALLOWED_ORIGINS` env var — comma-separated CORS allowlist.
- `WEBCHAT_TOKEN_EXPIRE_MINUTES` env var — JWT session TTL (default 480).
- `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`
  for the first public release.
- Boot-time `assert_secrets_configured()` hard-fail on missing
  `WEBCHAT_JWT_SECRET` / `ID_SALT` / user credentials.
- Inline HTML tag allowlist in `formatReply` so Telegram-style
  `<b>`/`<strong>`/`<i>`/`<em>`/`<code>`/`<pre>`/`<br>` markup from
  the Manager Agent renders correctly; everything else stays escaped.

### Changed

- **Security baseline bumped** (Dependabot):
  - `python-jose[cryptography]` 3.3.0 → 3.5.0 (CVE: algorithm
    confusion with OpenSSH ECDSA keys; JWE DoS).
  - `python-multipart` 0.0.9 → 0.0.27 (multiple CVEs: DoS via
    unbounded headers / preamble, arbitrary file write).
  - `python-dotenv` 1.0.1 → 1.2.2 (symlink-following in `set_key`).
  - `vite` ^5.4.11 → ^6.4.2 (path traversal in optimized deps `.map`;
    transitively patches `esbuild`).
  - `@vitejs/plugin-react` ^4.3.4 → ^4.7.0.
- `/api/auth/register` endpoint and the Register tab on the login
  page are removed. Account creation is operator-controlled via `.env`.
- Renamed `.env.template` → `.env.example`; placeholders read as
  "you must change me"; no literal default DB password.
- `costaff.channel.json` declares the full required/optional env set
  so `costaff channel add` prompts at deploy time.
- README (EN + zh-TW) reflects the new layout and the single-user model.

### Removed

- Vanilla `index.html` / `login.html` / `js/` / `css/` (replaced by
  `frontend/`).
- Public registration flow (`/api/auth/register`, `RegisterRequest`,
  pending-approval UI).
- Legacy defaulted JWT secret and salt strings inside `config.py`.

## [0.1.0]

Initial implementation. See git history for details.
