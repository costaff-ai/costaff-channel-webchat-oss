# Changelog

All notable changes to this project are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased]

### Added

- `CONTRIBUTING.md` (DCO sign-off + smoke-test expectations),
  `SECURITY.md` (responsible disclosure), `CODE_OF_CONDUCT.md`
  (Contributor Covenant v2.1) for the first public release.
- `CHANGELOG.md` (this file).
- `WEBCHAT_ALLOWED_ORIGINS` env var — comma-separated CORS allowlist;
  defaults to `*` so the local-demo flow stays frictionless, but
  production deployments can pin a single origin without a code edit.
- `WEBCHAT_TOKEN_EXPIRE_MINUTES` env var — JWT session TTL (default 480
  / 8h). Was already wired in `config.py` but undocumented.
- Boot-time enforcement: `assert_secrets_configured()` in the FastAPI
  startup hook hard-fails the container when `WEBCHAT_JWT_SECRET` or
  `ID_SALT` are missing OR still match a known `.env.example` /
  legacy placeholder string. Prevents accidentally running with a
  predictable JWT signing key.

### Changed

- Renamed `.env.template` → `.env.example` to match GitHub / IDE
  conventions.
- `.env.example` placeholder values renamed to
  `REPLACE_WITH_A_LONG_RANDOM_SECRET` / `REPLACE_WITH_A_RANDOM_STRING`
  so they read as "you must change me" instead of looking like
  workable defaults.
- `.env.example` no longer ships a literal default DB password —
  `<db-user>` / `<db-password>` / `<db-name>` placeholders only.
- `costaff.channel.json` now declares `WEBCHAT_JWT_SECRET` and
  `ID_SALT` under `env_required`, plus the full set of optional env
  vars under `env_optional`. `costaff channel add` will prompt for the
  required ones at deploy time.
- README (EN + zh-TW) updated:
  - CLI deploy command corrected to `costaff channel add` (was the
    outdated `cst channel deploy --local`).
  - Environment-variable table reflects which vars are actually
    required, and includes the new optional ones.
  - Mentions the secret-generator one-liner and the boot-time refusal.

### Removed

- The old defaulted JWT secret (`webchat-default-secret-please-change`)
  and salt (`costaff_default_salt`) inside `config.py`. Both now read
  empty by default and trip the startup assertion.

## [0.1.0]

Initial implementation. See git history for details.
