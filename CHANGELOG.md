# Changelog

All notable changes to this project are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased]

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
