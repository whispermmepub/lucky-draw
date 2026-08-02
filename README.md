# 🎰 WoW - Lucky Draw

Cyberpunk-style lucky draw web app for live events. Every visitor can see the shared
participant list and spin the casino slot, but **only the owner can add/remove names**.

- Live: https://whispermmepub.github.io/lucky-draw/
- Deploy: GitHub Pages from `docs/` on `main` (`npm run build` → copy `dist` to `docs`)

## How the shared list works

- The participant list lives in [`data/participants.json`](data/participants.json) and the winner
  history in [`data/winners.json`](data/winners.json) in this repo.
- All visitors **read** them from the raw CDN (`raw.githubusercontent.com` / jsDelivr) — no auth needed.
  The winner history is shared, so everyone sees the same winners list.
- The **owner writes** it through the GitHub Contents API using a personal access token
  entered once in the browser. The token is stored only in the owner's browser
  (`localStorage`) and is **never committed** to the repo or bundled into the app.
- The app polls the shared list every 4 seconds so every open tab stays in sync.

## Owner setup (one time)

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic).
2. Create a token with the `repo` scope.
3. Open the app → click 🔒 → paste the token → ချိတ်မယ်.
4. The participant input panel appears; everyone else only sees the list and can spin.

## Scripts

- `npm run dev` — local dev server
- `npm run build` — type-check + production build (also copies `index.html` to `404.html` for SPA)
- `npm run lint` — oxlint
