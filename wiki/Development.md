## Tech stack

| Layer | Stack |
| --- | --- |
| Backend | Bun, Hono, `bun:sqlite` |
| Frontend | React, Vite, TypeScript |
| Storage | SQLite |
| Runtime | Docker or local Bun |

## Repository layout

```text
.
├── app/                 # Bun + Hono backend
│   └── src/
│       ├── db.ts        # SQLite schema, migrations, settings
│       ├── routes.ts    # API routes
│       ├── auth.ts      # Authentication (sessions, WebAuthn, OIDC, proxy)
│       ├── refresher.ts # RSS/live/background refresh work
│       └── youtube.ts   # YouTube parsing and fetch helpers
├── ui/                  # React + Vite frontend
│   └── src/
│       ├── pages/       # App screens
│       ├── components/  # Shared UI components
│       ├── api.ts       # API client and shared types
│       └── i18n/        # Per-language UI text (en, pl, de)
├── scripts/             # setup/dev/build/start helpers
├── wiki/                # Source for the GitHub Wiki
├── data/                # Local runtime data, usually gitignored
├── Dockerfile
├── docker-compose.yml      # Run with the published GHCR image
└── docker-compose.dev.yml  # Build locally from source
```

## Workflow

Install everything and run both servers:

```bash
bun run setup
bun run dev
```

Type and build checks for the frontend:

```bash
cd ui
bunx tsc --noEmit
bun run build
```

The backend is TypeScript executed by Bun. In development it runs with:

```bash
cd app
bun run dev
```
