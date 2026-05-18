# BET_System (frontend)

Real-time dashboard для composite multi-mode Polymarket bot. Bloomberg-terminal стиль, WS-driven.

**Live:** https://vp-network.github.io/BET_System (после первого деплоя)
**Backend repo:** [vp-network/BET_System-bot](https://github.com/vp-network/BET_System-bot) (private)
**Architecture:** см. `02_research/04_architecture.md` §10 в Obsidian vault.

## Stack

- Vite 5 + React 18 + TypeScript
- Tailwind CSS (monospace terminal palette)
- Zustand (state)
- Recharts (charts)
- framer-motion (5-sec blink на trade events)

## Local dev

```bash
npm ci
npm run dev
```

Откроется на `http://localhost:5173`. Backend ожидается на `http://localhost:8000` (см. `.env.example`).

## Build

```bash
npm run build
```

Output в `dist/`. GitHub Actions auto-deploy на push в `main` (workflow `.github/workflows/deploy.yml`).

## Environment

`VITE_API_URL` — base URL backend. Set as GitHub Actions secret в repo settings для production.

- Local: `http://localhost:8000`
- Production: `https://<TUNNEL_URL>.trycloudflare.com` (или своя стабильная subdomain)

## Auth

GitHub OAuth. Один admin = owner GitHub username (`VP-network`). Public visitors — read-only metrics.

## License

Public dashboard, render-only. Strategy edge — в private backend repo.
