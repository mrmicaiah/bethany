# Bethany

A personal life assistant.

## Architecture

- **Bethany (Chat)** — Mobile-first PWA, talk to Claude about your life
- **Life App** — Visual dashboard with Life View and News Feed toggle
- **D1 Database** — Stores all user data
- **Cloudflare Worker** — API layer, Claude integration

## Tech Stack

- Cloudflare Pages (frontend)
- Cloudflare Workers (API)
- Cloudflare D1 (database)
- Claude API (AI)

## Structure

```
bethany/
├── apps/
│   ├── chat/           # Bethany chat PWA
│   └── life/           # Life View + News Feed PWA
├── worker/             # Cloudflare Worker API
├── schema/             # D1 schema
└── docs/               # System docs (mode system, etc.)
```
