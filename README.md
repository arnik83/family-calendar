# Family Calendar

A free, self-hosted family calendar. One shared schedule for the whole household — month and agenda views, per-person colors, holidays, and a free-time finder.

![Family Calendar](https://img.shields.io/badge/license-MIT-green) ![Bun](https://img.shields.io/badge/runtime-Bun-black) ![React](https://img.shields.io/badge/UI-React%2019-blue)

## Features

- **Month & agenda views** — browse the month grid or scan a chronological agenda
- **Per-person colors** — every family member gets their own color across all views
- **Holidays** — track holidays for the whole family or a single person, with a dedicated Holidays view
- **Quick ranges** — jump to the next 30 / 60 / 90 days in one tap
- **Title search** — find any appointment instantly
- **Free-after finder** — see which weekdays are free after a chosen time
- **Recurring & multi-day events** — once, multiple dates, ranges, or repeat rules (daily / weekly / monthly)
- **All-day events, locations, notes** — everything a family schedule needs, nothing it doesn't
- **SQLite storage** — your data lives in a single local file; no account, no cloud, no tracking

## Screenshots

| Schedule | Holidays | Free after |
|---|---|---|
| ![Month schedule view](screenshots/schedule.png) | ![Holidays view](screenshots/holidays.png) | ![Free-after finder](screenshots/free-after.png) |

## Quickstart

You need [Bun](https://bun.sh) 1.3+.

```bash
bun install
bun run build   # build the client once
bun start       # migrate + seed + serve on http://localhost:3000
```

On first run the app seeds sample family data (Alex, Jordan, Sam, Riley) so you can explore. Delete or edit them in the app — the seed only runs on an empty database.

Set `PORT` to change the port:

```bash
PORT=8080 bun start
```

Your data is stored in `./data/family-calendar.db` — set `DATA_DIR` to keep it elsewhere.

## Install a released version

Every release ships a ready-to-run tarball on the [Releases page](https://github.com/arnik83/family-calendar/releases). Download it, unpack it, then:

```bash
bun install --production
bun start
```

## Docker

```bash
docker build -t family-calendar .
docker run -d -p 3000:3000 -v family-calendar-data:/data --name family-calendar family-calendar
```

The database persists in the `family-calendar-data` volume. Set `-e PORT=...` to change the port.

## How it works

- `server/src/index.ts` — tiny Bun HTTP server: serves the built client and a `POST /api/actions` JSON-RPC endpoint
- `server/src/actions.ts` — 12 typed actions (list/create/update/delete appointments & holidays, member list, search), validated with Zod
- `server/src/schema.ts` + `drizzle/` — SQLite schema and migrations (Drizzle ORM)
- `server/src/seed.ts` — sample data for first run
- `client/src/` — React 19 + TanStack Query + Tailwind CSS 4

The database lives at `data/family-calendar.db` (gitignored). Back it up by copying the file.

## Project structure

```
family-calendar/
├── client/
│   ├── src/          # React app (App.tsx, api.ts, theme.css, …)
│   └── build.mjs     # client build: Bun.build + Tailwind CLI
├── server/
│   └── src/          # actions.ts, db.ts, index.ts, schema.ts, seed.ts
├── drizzle/          # SQL migrations
└── data/             # SQLite database (created on first run, gitignored)
```

## License

MIT — see [LICENSE](LICENSE). Free for personal and commercial use.
