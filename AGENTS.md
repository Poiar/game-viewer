# AGENTS.md

## Quick reference

Frontend (repo root):

| Command                                   | Description                                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `npm start` (or `ng serve`)               | Dev server at `http://localhost:4200/` — **prefer the "ng: serve" run configuration in WebStorm over running this in a terminal** |
| `npm run build`                           | Production build to `dist/game-viewer/`                                                                                           |
| `npm test`                                | Playwright E2E tests (UI mode)                                                                                                    |
| `npm run test:headless`                   | Playwright E2E tests (headless)                                                                                                   |
| `npm run test:unit`                       | Vitest unit tests                                                                                                                 |
| `npm run lint`                            | ESLint (TS/HTML) + Stylelint (CSS)                                                                                                |
| `npm run lint:fix`                        | Lint and auto-fix                                                                                                                 |
| `npm run format` / `npm run format:check` | Prettier write / check                                                                                                            |
| `npm run typecheck`                       | `tsc --noEmit`                                                                                                                    |
| `npm run build-readme`                    | Regenerate `README.md` — **run this, never hand-edit README.md**                                                                  |
| `npm run prepare`                         | Install Husky git hooks                                                                                                           |

Backend (`cd server`):

| Command                   | Description                            |
| ------------------------- | -------------------------------------- |
| `npm run dev`             | Express API on `:3001` (tsx watch)     |
| `npm run db:push`         | Push Drizzle schema to Postgres        |
| `npm run db:generate`     | Generate a Drizzle migration           |
| `npm run db:import-sheet` | Import catalog data from Google Sheets |
| `npm run db:seed`         | Seed demo data                         |
| `npm run test`            | Vitest unit tests                      |

## Architecture

- **Angular v21** (`^21.2.14`) routed SPA — Angular Router with **16 lazy-loaded page routes** defined in `src/app/routes.ts` (`dashboard`, `games`, `games/:slug`, `series`, `series/:slug`, `collections`, `collections/:id`, `inventory`, `versions`, `favorites`, `dlc`, `dlc/:id`, `platforms`, `providers`, `stats`, `timeline`); the empty path redirects to `dashboard`.
- **Frontend layout** (`src/app/`): `pages/` (16 lazy route components), `services/` (16 services — 12 HTTP-backed + 4 auth/UI-state), `shared/` (empty-state, error-console, error-state, global-search, loading-spinner), plus `auth/`, `dashboard/`, `game-ui/`, `inventory/`, `model-viewer/` (Three.js), `profile/`, `types/`, `interceptors/`.
- **Backend** (`server/`): Express + **Drizzle ORM** over **PostgreSQL** (Docker container `game-catalog-db`, port 5432, db `gamedb`). 21 tables in `server/src/db/schema.ts` (`master_games`, `release_groups`, `releases`, `dlcs`, `dlc_releases`, `dlc_release_compatibility`, `collections`, `collection_releases`, `collection_dlc_releases`, `users`, `refresh_tokens`, `user_favorites`, `owned_instances`, `user_game_photos`, and lookup tables `platforms`/`providers`/`genres`/`edition_types`/`media_formats`/`series`). Routes in `server/src/routes/` (auth, games, series, collections, dlc, inventory, dashboard, favorites, releases, lookup); auth = JWT + refresh tokens (`server/src/middleware/auth.ts`).
- **Strict TypeScript** — `strict`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, strict template checking.

## Legacy hardcoded model (`src/classes/`) — being phased out

An older in-memory data model still lives in `src/classes/` (`model.ts` + `*Data.ts`: `Content → Game → SuperVersion → GameVersion`, `Dlc → DlcVersion`, `Series`, `Collection`). It is **partially wired in** — `game-ui.component.ts` still imports from it. The app has migrated to the Postgres backend + HTTP services; treat `src/classes/` as legacy and prefer the backend for new data.

If you must touch `src/classes/`: every class constructor **self-registers** the instance into a module-level array (`allGames`, `allSeries`, `allSuperVersions`, `allGameVersions`, `allDlcs`, `allDlcVersions`, `allCollections`) as a side effect — importing a module from `src/classes/` triggers all its top-level `new X(...)` calls. Classes/enums live in `model.ts`; data instances are split across `seriesData.ts`, `gameData.ts`, `superVersionData.ts`, `gameVersionData.ts`, `dlcData.ts`, `dlcVersionData.ts`, `collectionData.ts`. Key enums: `genreEnum`, `versionEnum`, `systemEnum`, `providerEnum`, `unsureBoolEnum`, `dlcTypeEnum`, `mediaEnum`.

## Data model (backend)

- Game master data in `master_games`; platform-split versions in `releases`, grouped by `release_groups`; DLCs in `dlcs` + `dlc_releases` (+ `dlc_release_compatibility`); collections in `collections` (+ `collection_releases`, `collection_dlc_releases`).
- Google Sheets is the import source for catalog data (`server/src/db/import-sheet.ts`); cover/IGDB enrichment via `server/src/services/` (`enrichment`, `steamgriddb`, `scrape-enrichment`).

## Linting & formatting

ESLint (TS/HTML) + Stylelint (CSS) + Prettier. `npm run lint` checks, `npm run lint:fix` fixes. `.editorconfig` enforces LF. Husky + lint-staged run on `git commit` (staged `*.{ts,html}` → eslint + prettier; `*.css` → stylelint + prettier).

## Testing

- **Vitest** (`npm run test:unit`, happy-dom) — unit tests in `src/**/*.spec.ts`.
- **Playwright** (`npm test` = UI mode, `npm run test:headless` = headless) — E2E in `e2e/*.spec.ts`; `playwright.config.ts` auto-starts `ng serve` on :4200. Also `npx playwright test --headed` / `--debug` for interactive runs.
- Backend: `cd server && npm run test` (Vitest) — `server/src/**/*.test.ts`.
