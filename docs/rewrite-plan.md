# game-viewer rewrite — plan

**Decision (locked):** rewrite game-viewer as a self-contained app with its own
sovereign schema. **GIDB is a data source, not a peer the app mounts into** —
metadata via a batch ETL pull, covers via GIDB's HTTP `/covers/` endpoint (never
copied, never filesystem-mounted). No GIDB compatibility is preserved for its own sake.

## Target stack

| Layer           | Pick                                                                             |
| --------------- | -------------------------------------------------------------------------------- |
| Language        | TypeScript, everywhere                                                           |
| Framework       | Next.js (App Router) — SSR/SSG public catalog, client components for private app |
| DB              | PostgreSQL 17 (existing Docker container `game-catalog-db`)                      |
| Query layer     | Drizzle ORM (already in use — schema ports)                                      |
| Auth            | Better Auth (replaces hand-rolled JWT/refresh)                                   |
| Media storage   | MinIO — user photos + version images ONLY. Covers are NOT stored here            |
| Background jobs | BullMQ + Redis (future enrichment/import jobs)                                   |
| Validation      | Zod                                                                              |
| Deploy          | Docker Compose + Caddy, non-standard external ports, manual forward              |

## The coupling (measured, not guessed)

The schema is **already sovereign** — `master_games`, `release_groups`, `releases`,
`dlcs`, `collections`, etc. are game-viewer's own catalog model and are _richer_ than
GIDB's `game`/`edition`. No restructuring is needed to decouple. The real coupling:

1. **Covers are served from GIDB's filesystem via a path mount.** `master_games
.cover_image_url` stores `/gicovers/<local_path>`; `server/src/routes/gicovers.ts`
   reads GIDB's `static/` tree from disk via `GIDB_STATIC_DIR` (default
   `C:\projects\gidb\static`). But GIDB **already serves covers over HTTP** —
   `server.py` exposes `GET /covers/<filename>` from `static/covers/` (with a `..`
   guard). So the mount can become an HTTP proxy with zero change to GIDB.
2. **`server/scripts/pull-gidb.py`** is the only enrichment write path. It reads
   GIDB's SQLite read-only, `import normalize` for slug/alias matching, and writes
   into game-viewer's Postgres.
3. **Duplicate fetchers still exist**: `server/src/routes/enrichment.ts` +
   `services/enrichment.ts`, `services/steamgriddb.ts`, `services/scrape-enrichment.ts`,
   plus `SGDB_API_KEY` / `IGDB_*` config. These hit Steam/SGDB directly and must die.

## The clean break (what changes)

- **Load covers from GIDB, never copy them.** `pull-gidb.py` stores the GIDB cover
  _filename_ instead of a `/gicovers/<local_path>`; a thin `/covers/<file>` proxy
  forwards to GIDB's HTTP endpoint (`GIDB_URL`, e.g. `http://127.0.0.1:8780`).
  GIDB stays loopback-only; the browser talks to one origin. No art duplication,
  no path into GIDB's tree.
- **Delete `gicovers.ts` + `GIDB_STATIC_DIR`.** Filesystem mount → HTTP `GIDB_URL`
  config. Migration is a one-line URL rewrite, not a file copy.
- **Delete the three enrichment services + enrichment route + SGDB/IGDB config.**
  GIDB is the sole enrichment path; game-viewer never hits Steam/SGDB/IGDB itself.
- **`pull-gidb.py` keeps `import normalize` matching** (reconciliation logic is not
  reimplemented in TS); only its cover write changes from `/gicovers/<local_path>`
  to the GIDB cover filename. GIDB field → game-viewer column mapping is an
  explicit layer in the script, not a frozen contract.

## Portable vs. rewritten

**Portable (near-free):** the Drizzle schema (21 tables) and all data; the matching
logic in GIDB's `normalize` (via the Python bridge); test _assertions_.

**Rewritten:** Express → Next.js route handlers (14 route files: auth, collections,
dashboard, dlc, enrichment[delete], favorites, games, gicovers[delete→proxy], index,
inventory, lookup, releases, series); JWT/refresh → Better Auth; Angular → React
(16 pages + shared + game-ui + dashboard + inventory + model-viewer → R3F);
16 Angular services → TanStack Query / route handlers.

## Phases

0. **Spike** — schema port (confirmed sovereign) + cover URL migration (rewrite
   `/gicovers/<path>` → GIDB `/covers/<file>` filename; prove the proxy).
1. **Skeleton** — pnpm monorepo (`apps/web`, `apps/worker`, `packages/db`,
   `packages/validation`), docker-compose (postgres + redis + minio + caddy),
   copy schema into `packages/db`, Better Auth, CI parity.
2. **API** — port the 13 surviving route files to route handlers; move import-sheet
   to a worker job; auth via Better Auth; `/covers/*` proxy to `GIDB_URL`.
3. **UI** — public catalog SSR/SSG; private app client components; model-viewer → R3F;
   shared components; keep JIRA-style filter conventions.
4. **Search + cutover** — Postgres FTS (Meilisearch later); deploy behind Caddy;
   Playwright green → delete `src/` (Angular) + `server/src/` (Express).
5. **GIDB ETL finalize** — cover URL rewrite to the GIDB `/covers/` filename +
   proxy (replacing the `gicovers.ts` filesystem mount), retire duplicate fetchers,
   wire `pull-gidb.py` mapping to the owned schema.

## Contract that survives

`pull-gidb.py` continues to `import normalize` from the GIDB repo for slug/alias
resolution. Covers continue to come from GIDB — over HTTP, never copied, never
filesystem-mounted. These are the two intentional dependencies: reconciliation
logic and cover art both stay in GIDB. Everything else is severed.

---

_Repo hygiene note (not part of the rewrite): `server/node_modules` appears tracked
in git — hundreds of "M"/"D" entries polluting `git status`. Should be gitignored and
untracked at some point; separate from this plan._
