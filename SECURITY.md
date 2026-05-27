# Security Policy

## Reporting a vulnerability

**Please do not open public GitHub issues for security problems.**

If you find a security issue:

1. Email the maintainer directly. The contact address is listed in
   the project README or available through the [costaff-ai org page](https://github.com/costaff-ai).
2. Provide enough detail to reproduce: affected version, steps to
   reproduce, and (if applicable) a proof-of-concept.
3. Allow up to **7 days** for an initial response and up to **30 days**
   for a coordinated fix before any public disclosure.

We will acknowledge receipt within 7 days, share an assessment within
14 days, and aim to ship a fix or mitigation within 30 days for
confirmed issues. Credit will be given in the fix release notes unless
you prefer to remain anonymous.

## What counts as a security issue

- Authentication / authorization bypass — JWT forgery, session
  hijacking, login-as-another-user.
- Credential leakage — secrets surfaced via API error responses,
  server logs, or env-var dumps.
- Cross-user data exposure — reading another account's chat history
  or upload files through a crafted request.
- Path traversal / arbitrary file read or write through the upload
  endpoint or the ADK proxy.
- XSS in the chat surface (`index.html` / `login.html` / `app.js`)
  via crafted agent messages or registered display names.
- SQL injection in any auth or proxy route.

## What is NOT a security issue

- LLM jailbreaks affecting only the calling user's own session.
- Prompt injection bounded to that session's outputs (the upstream
  agent owns that surface, not this channel).
- Rate-limit absence on the public endpoints — we'll fix it, but
  please file as a normal issue.
- Bugs in dependencies — report to that dependency upstream.

## Supported versions

The `main` branch receives security fixes. Tagged releases older than
6 months are best-effort; please upgrade.
