/**
 * README Builder — auto-generates a comprehensive README.md by scanning the project.
 *
 * Usage: npx tsx scripts/build-readme.ts
 */
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const out: string[] = [];

function w(line = "") {
  out.push(line);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(path.resolve(ROOT, p), "utf-8"));
}

function fileExists(p: string): boolean {
  return fs.existsSync(path.resolve(ROOT, p));
}

function grepLines(dir: string, pattern: RegExp, glob = "*.ts"): Array<{ file: string; line: string; match: string }> {
  const results: Array<{ file: string; line: string; match: string }> = [];
  const walk = (d: string) => {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
        walk(full);
      } else if (e.isFile() && e.name.endsWith(glob.replace("*", ""))) {
        const content = fs.readFileSync(full, "utf-8");
        const lines = content.split("\n");
        for (const l of lines) {
          const m = l.match(pattern);
          if (m) {
            results.push({ file: full.replace(ROOT + path.sep, ""), line: l.trim(), match: m[1] ?? m[0] });
          }
        }
      }
    }
  };
  walk(path.resolve(ROOT, dir));
  return results;
}

function tryGit(field: string): string {
  try {
    return execSync(`git config --get ${field}`, { cwd: ROOT, encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

function tryGitRemote(): string {
  try {
    return execSync("git remote get-url origin", { cwd: ROOT, encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Scan: package.json scripts
// ---------------------------------------------------------------------------

function scanScripts(): Array<{ name: string; command: string; description: string }> {
  const rootPkg = readJson("package.json");
  const serverPkg = readJson("server/package.json");

  const descriptions: Record<string, string> = {
    start: "Start Angular dev server (port 4200)",
    build: "Production build to dist/game-viewer/",
    watch: "Build in watch mode (development)",
    test: "Playwright E2E tests (UI mode)",
    "test:headless": "Playwright E2E tests (headless)",
    lint: "Lint TypeScript + HTML (ESLint + Prettier)",
    "lint:fix": "Lint and auto-fix issues",
    format: "Format source files with Prettier",
    "format:check": "Check formatting without fixing",
    typecheck: "TypeScript type checking (tsc --noEmit)",
    prepare: "Install Husky git hooks",
    // Server scripts
    "server:dev": "Start backend dev server (port 3001, hot reload)",
    "server:build": "Compile backend TypeScript",
    "server:start": "Start compiled backend",
    "db:push": "Push Drizzle schema to database",
    "db:generate": "Generate Drizzle migrations",
    "db:seed": "Seed database with demo data",
    "db:import-sheet": "Import game collection from Google Sheets CSV",
    "server:test": "Run backend unit tests (Vitest)",
    "server:test:watch": "Run backend tests in watch mode",
  };

  const scripts: Array<{ name: string; command: string; description: string }> = [];

  for (const [k, v] of Object.entries<string>(rootPkg.scripts ?? {})) {
    scripts.push({ name: k, command: v, description: descriptions[k] ?? "" });
  }
  for (const [k, v] of Object.entries<string>(serverPkg.scripts ?? {})) {
    const label = `server:${k}`;
    scripts.push({ name: label, command: v, description: descriptions[label] ?? descriptions[k] ?? "" });
  }

  return scripts;
}

// ---------------------------------------------------------------------------
// Scan: API routes
// ---------------------------------------------------------------------------

function scanApiRoutes(): Array<{
  method: string;
  path: string;
  file: string;
  auth: boolean;
}> {
  const results: Array<{ method: string; path: string; file: string; auth: boolean }> = [];
  const routesDir = path.resolve(ROOT, "server/src/routes");
  if (!fs.existsSync(routesDir)) return results;

  const files = fs.readdirSync(routesDir).filter((f) => f.endsWith(".ts"));
  for (const file of files) {
    const full = path.join(routesDir, file);
    const content = fs.readFileSync(full, "utf-8");

    // Extract all router.METHOD calls
    const routeRegex = /router\.(get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]/g;
    let m: RegExpExecArray | null;
    while ((m = routeRegex.exec(content)) !== null) {
      const method = m[1].toUpperCase();
      const routePath = m[2];

      // Determine base prefix from routes/index.ts
      const baseMap: Record<string, string> = {
        "auth.ts": "/api/auth",
        "games.ts": "/api/games",
        "releases.ts": "/api/releases",
        "series.ts": "/api/series",
        "dlc.ts": "/api/dlc",
        "collections.ts": "/api/collections",
        "inventory.ts": "/api/inventory",
        "favorites.ts": "/api/favorites",
        "dashboard.ts": "/api/dashboard",
        "lookup.ts": "/api/lookup",
      };
      const prefix = baseMap[file] ?? "/api";

      // Detect authentication
      const routeBlock = extractRouteBlock(content, m.index);
      const auth = routeBlock.includes("authenticate");

      results.push({
        method,
        path: `${prefix}${routePath}`,
        file,
        auth,
      });
    }
  }

  return results;
}

function extractRouteBlock(content: string, startIdx: number): string {
  // Extract ~20 lines starting from the route definition
  const before = content.slice(0, startIdx).split("\n");
  const lineIdx = before.length - 1;
  const allLines = content.split("\n");
  return allLines.slice(lineIdx, lineIdx + 30).join("\n");
}

// ---------------------------------------------------------------------------
// Scan: DB schema tables
// ---------------------------------------------------------------------------

function scanSchemaTables(): Array<{ name: string; columns: string[] }> {
  const schemaPath = path.resolve(ROOT, "server/src/db/schema.ts");
  if (!fs.existsSync(schemaPath)) return [];

  const content = fs.readFileSync(schemaPath, "utf-8");
  const tables: Array<{ name: string; columns: string[] }> = [];

  // Match pgTable definitions
  const tableRegex = /export const (\w+)\s*=\s*pgTable\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = tableRegex.exec(content)) !== null) {
    tables.push({ name: m[2], columns: [] });
  }

  return tables;
}

function getTableDescriptions(): Record<string, { desc: string; columns: Record<string, string> }> {
  return {
    platforms: {
      desc: "Gaming platforms (Win, PS5, Switch, etc.)",
      columns: { id: "PK", name: "Platform name", slug: "URL-safe identifier" },
    },
    providers: {
      desc: "Storefronts and distribution channels",
      columns: { id: "PK", name: "Provider name", slug: "URL-safe identifier" },
    },
    genres: {
      desc: "Game genres (RPG, FPS, Platformer, etc.)",
      columns: { id: "PK", name: "Genre name", slug: "URL-safe identifier" },
    },
    edition_types: {
      desc: "Edition classification (Original, Remaster, Remake, etc.)",
      columns: { id: "PK", name: "Edition type name", slug: "URL-safe identifier" },
    },
    media_formats: {
      desc: "Physical/digital media types",
      columns: { id: "PK", name: "Format name", slug: "URL-safe identifier" },
    },
    series: {
      desc: "Game franchises and series groupings",
      columns: {
        id: "PK",
        name: "Series name",
        slug: "URL-safe identifier",
        description: "Optional description",
        created_at: "Timestamp",
        updated_at: "Timestamp",
      },
    },
    master_games: {
      desc: "Canonical game entries (like Discogs master releases)",
      columns: {
        id: "PK",
        title: "Game title",
        slug: "URL-safe identifier",
        first_release_year: "Original release year",
        description: "Optional description",
        cover_image_url: "Cover art URL",
        series_id: "FK → series",
        alternative_titles: "JSONB array of alternate names",
        created_at: "Timestamp",
        updated_at: "Timestamp",
      },
    },
    master_game_genres: {
      desc: "Junction: games ↔ genres (many-to-many)",
      columns: { game_id: "FK → master_games", genre_id: "FK → genres" },
    },
    release_groups: {
      desc: "A specific edition/version grouping of a game",
      columns: {
        id: "PK",
        master_game_id: "FK → master_games",
        edition_type_id: "FK → edition_types",
        edition_name: "Optional edition label",
        release_year: "Year of this edition",
        created_at: "Timestamp",
      },
    },
    releases: {
      desc: "Concrete releases (platform + store + format combination)",
      columns: {
        id: "PK",
        release_group_id: "FK → release_groups",
        title: "Optional variant title",
        provider_id: "FK → providers",
        media_format_id: "FK → media_formats",
        intended_for: "JSONB: target platforms",
        playable_on: "JSONB: all compatible platforms",
        barcode: "Optional barcode",
        catalog_number: "Optional catalog number",
        publisher: "Optional publisher",
        region: "Optional region code",
        release_date: "Optional release date",
        controller_support: "Yes/No/Maybe/Not applicable",
        local_multiplayer: "Yes/No/Maybe/Not applicable",
        online_multiplayer: "Yes/No/Maybe/Not applicable",
        version_image_url: "Optional version-specific image",
        created_at: "Timestamp",
      },
    },
    dlcs: {
      desc: "Downloadable content / expansions",
      columns: {
        id: "PK",
        title: "DLC title",
        first_release_year: "Release year",
        dlc_type: "Expansion / Season Pass / Bonus Content",
        master_game_id: "FK → master_games",
        created_at: "Timestamp",
      },
    },
    dlc_releases: {
      desc: "Concrete DLC releases (platform + store)",
      columns: {
        id: "PK",
        dlc_id: "FK → dlcs",
        provider_id: "FK → providers",
        media_format_id: "FK → media_formats",
        release_date: "Optional date",
        on_disc_for_console_only: "Boolean",
        created_at: "Timestamp",
      },
    },
    dlc_release_compatibility: {
      desc: "Junction: which DLC releases work with which game releases",
      columns: { dlc_release_id: "FK → dlc_releases", release_id: "FK → releases" },
    },
    collections: {
      desc: "Box sets, compilations, bundles",
      columns: {
        id: "PK",
        title: "Collection name",
        media_format_id: "FK → media_formats",
        release_year: "Optional year",
        created_at: "Timestamp",
      },
    },
    collection_releases: {
      desc: "Junction: collections ↔ releases",
      columns: { collection_id: "FK → collections", release_id: "FK → releases" },
    },
    collection_dlc_releases: {
      desc: "Junction: collections ↔ DLC releases",
      columns: { collection_id: "FK → collections", dlc_release_id: "FK → dlc_releases" },
    },
    users: {
      desc: "User accounts",
      columns: {
        id: "PK",
        username: "Unique username",
        display_name: "Display name",
        email: "Unique email",
        password_hash: "Bcrypt hash",
        created_at: "Timestamp",
        updated_at: "Timestamp",
      },
    },
    refresh_tokens: {
      desc: "JWT refresh token store",
      columns: {
        id: "PK",
        user_id: "FK → users",
        token_hash: "SHA-256 of refresh token",
        expires_at: "Expiration timestamp",
        created_at: "Timestamp",
      },
    },
    user_favorites: {
      desc: "User favorited games",
      columns: { user_id: "FK → users", master_game_id: "FK → master_games", created_at: "Timestamp" },
    },
    owned_instances: {
      desc: "User's owned copies (the core collection)",
      columns: {
        id: "PK",
        user_id: "FK → users",
        release_id: "FK → releases (nullable)",
        dlc_release_id: "FK → dlc_releases (nullable)",
        condition: "Optional condition (Sealed, etc.)",
        location: "Where it's stored (Her, Kurv, bins 1-7, etc.)",
        notes: "Free-text notes (includes SheetID for traceability)",
        acquired_date: "Optional acquisition date",
        purchase_price: "Optional decimal price",
        created_at: "Timestamp",
        updated_at: "Timestamp",
      },
    },
    user_game_photos: {
      desc: "User-uploaded photos and 3D scan models for owned games",
      columns: {
        id: "PK",
        user_id: "FK → users",
        owned_instance_id: "FK → owned_instances",
        image_path: "Photo file path",
        scan_model_path: "Optional 3D scan model path",
        uploaded_at: "Timestamp",
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Scan: Angular components
// ---------------------------------------------------------------------------

function scanComponents(): Array<{ selector: string; file: string; dir: string }> {
  return grepLines("src/app", /selector:\s*["']([^"']+)["']/).map((r) => {
    const dir = path.dirname(r.file).replace(/\\/g, "/");
    const componentName = path.basename(dir);
    return { selector: r.match, file: r.file, dir: componentName };
  });
}

// ---------------------------------------------------------------------------
// Scan: Angular services
// ---------------------------------------------------------------------------

function scanServices(): Array<{ name: string; file: string }> {
  const servicesDir = path.resolve(ROOT, "src/app/services");
  if (!fs.existsSync(servicesDir)) return [];

  return fs
    .readdirSync(servicesDir)
    .filter((f) => f.endsWith(".ts") && f !== "api-base.service.ts")
    .map((f) => ({
      name: f.replace(".service.ts", ""),
      file: `src/app/services/${f}`,
    }));
}

// ---------------------------------------------------------------------------
// Build README
// ---------------------------------------------------------------------------

function build(): string {
  const rootPkg = readJson("package.json");
  const serverPkg = readJson("server/package.json");
  const repoUrl = tryGitRemote();
  const repoName = repoUrl ? repoUrl.split("/").pop()?.replace(".git", "") : "game-viewer";

  // =========================================================================
  // Header
  // =========================================================================
  w(`# ${repoName}`);
  w();
  w(
    `**${repoName}** is a personal video game collection tracker — a "Discogs for video games." Catalog your game library, track versions and DLCs, organize them into series and collections, and see your entire library at a glance.`,
  );
  w();
  w(
    `> 🤖 _This README is auto-generated by \`scripts/build-readme.ts\`. Run \`npx tsx scripts/build-readme.ts\` to regenerate._`,
  );
  w();

  // =========================================================================
  // Quick Start
  // =========================================================================
  w("## Quick Start");
  w();
  w("```bash");
  w("git clone " + (repoUrl || "https://github.com/Poiar/game-viewer.git"));
  w(`cd ${repoName}`);
  w("npm install");
  w("# Backend setup");
  w("cd server && npm install && cd ..");
  w("# Create server/.env from server/.env.example (see Configuration below)");
  w("# Push DB schema:");
  w("cd server && npm run db:push && cd ..");
  w("# Import game data from Google Sheets:");
  w("cd server && npm run db:import-sheet && cd ..");
  w("# Start both servers (backend on :3001, frontend on :4200):");
  w("cd server && npm run dev & cd .. && npm start");
  w("```");
  w();

  // =========================================================================
  // Project Structure
  // =========================================================================
  w("## Project Structure");
  w();
  w("```");
  w("game-viewer/");
  w("├── src/app/                  # Angular 21 frontend");
  w("│   ├── auth/                 # Login/register component");
  w("│   ├── dashboard/            # Stats dashboard");
  w("│   ├── game-ui/              # Game detail panel");
  w("│   ├── inventory/            # Your collection view");
  w("│   ├── model-viewer/         # 3D model viewer");
  w("│   ├── profile/              # User profile");
  w("│   ├── shared/               # Shared UI components (loading, errors, empty states)");
  w("│   ├── types/                # TypeScript interfaces");
  w("│   ├── services/             # HTTP service layer (11 services)");
  w("│   └── interceptors/         # HTTP interceptors");
  w("├── server/                   # Express + Drizzle backend");
  w("│   └── src/");
  w("│       ├── index.ts          # Express app entry point");
  w("│       ├── config.ts         # Configuration");
  w("│       ├── db/");
  w("│       │   ├── schema.ts     # Drizzle ORM schema (22 tables)");
  w("│       │   ├── index.ts      # DB connection");
  w("│       │   ├── seed.ts       # Demo data seeder");
  w("│       │   ├── import-sheet.ts  # Google Sheets importer");
  w("│       │   └── imports/      # CSV files from Google Sheets");
  w("│       ├── routes/           # REST API routes (10 route files)");
  w("│       └── middleware/       # Auth, validation, error handling");
  w("├── scripts/");
  w("│   └── build-readme.ts       # This README generator");
  w("├── package.json              # Frontend dependencies + scripts");
  w("├── angular.json              # Angular workspace config");
  w("└── proxy.conf.json           # API proxy config (→ :3001)");
  w("```");
  w();

  // =========================================================================
  // Architecture
  // =========================================================================
  w("## Architecture");
  w();
  w("### Frontend — Angular v21");
  w();
  w(`- **${rootPkg.dependencies["@angular/core"]}** — standalone components, no routing (single-page app)`);
  w("- Strict TypeScript: `strict`, `noImplicitOverride`, `noImplicitReturns`, strict template checking");
  w("- Styling: component-scoped CSS files");
  w("- **Playwright** for E2E testing");
  w("- **Three.js** for 3D model viewing (`.obj` file support)");
  w();

  const components = scanComponents();
  w("#### Components");
  w();
  w("| Selector | Component |");
  w("|----------|-----------|");
  for (const c of components) {
    w(`| \`${c.selector}\` | \`${c.dir}\` |`);
  }
  w();

  const services = scanServices();
  w("#### Services");
  w();
  w("| Service | Purpose |");
  w("|---------|---------|");
  const serviceDescs: Record<string, string> = {
    "api-base": "Base HTTP service with typed get/post/put/delete",
    auth: "Authentication (login, register, token refresh)",
    games: "Master game queries and CRUD",
    releases: "Release management",
    series: "Series/franchise queries",
    dlc: "DLC and DLC release management",
    collections: "Collection/compilation management",
    inventory: "Owned instances (your collection)",
    favorites: "Favorites/wishlist",
    dashboard: "Dashboard statistics",
    lookup: "Lookup tables (platforms, providers, genres, etc.)",
  };
  for (const srv of services) {
    w(`| \`${srv.name}.service.ts\` | ${serviceDescs[srv.name] ?? ""} |`);
  }
  w();

  w("#### Types");
  w();
  w("Core interfaces in `src/app/types/`:");
  w();
  w("| File | Key Interfaces |");
  w("|------|---------------|");
  w(
    "| `game.types.ts` | `MasterGame`, `Release`, `ReleaseGroup`, `Dlc`, `Collection`, `Series`, `Genre`, `Platform`, `Provider`, `OwnedInstance`, `DashboardStats`, `UserProfile` |",
  );
  w("| `api.types.ts` | `ApiResponse<T>`, `PaginationMeta`, `ApiError` |");
  w();

  // =========================================================================
  // Backend
  // =========================================================================
  w("### Backend — Express + Drizzle ORM");
  w();
  w(`- **Express** — REST API on port \`${process.env.PORT ?? "3001"}\``);
  w(`- **Drizzle ORM** — PostgreSQL via Neon serverless (\`@neondatabase/serverless\`)`);
  w("- **JWT auth** — access tokens (15min) + refresh tokens (7 days, httpOnly cookie)");
  w("- **Security** — Helmet, CORS, rate limiting (100 req/min), bcrypt (12 rounds)");
  w("- **Validation** — Zod schemas on all mutating endpoints");
  w("- **Testing** — Vitest (unit tests)");
  w();

  // =========================================================================
  // API Reference
  // =========================================================================
  w("## API Reference");
  w();
  w("All endpoints are prefixed with `/api`. Auth-required endpoints marked with 🔒.");
  w();

  const routes = scanApiRoutes();
  const groupedRoutes: Record<string, typeof routes> = {};
  for (const r of routes) {
    const section = r.file.replace(".ts", "");
    if (!groupedRoutes[section]) groupedRoutes[section] = [];
    groupedRoutes[section].push(r);
  }

  const sectionDescs: Record<string, string> = {
    auth: "Authentication & user profile",
    games: "Master games (canonical game entries)",
    releases: "Release management",
    series: "Game series & franchises",
    dlc: "DLC / expansions",
    collections: "Compilations & box sets",
    inventory: "Your owned collection",
    favorites: "Favorites & wishlist",
    dashboard: "Stats & analytics",
    lookup: "Reference data (platforms, providers, genres, etc.)",
  };

  for (const [section, sectionRoutes] of Object.entries(groupedRoutes)) {
    w(`### ${sectionDescs[section] ?? section}`);
    w();
    w("| Method | Path | Auth |");
    w("|--------|------|------|");
    for (const r of sectionRoutes) {
      w(`| \`${r.method}\` | \`${r.path}\` | ${r.auth ? "🔒" : ""} |`);
    }
    w();
  }

  // =========================================================================
  // Database Schema
  // =========================================================================
  w("## Database Schema");
  w();
  w(`${getTableDescriptions() ? "22" : ""} tables on PostgreSQL (Neon serverless). Managed with Drizzle ORM.`);
  w();

  const tableDescs = getTableDescriptions();
  if (Object.keys(tableDescs).length > 0) {
    // Group tables
    const lookupTables = ["platforms", "providers", "genres", "edition_types", "media_formats"];
    const coreTables = ["series", "master_games", "master_game_genres", "release_groups", "releases"];
    const dlcTables = ["dlcs", "dlc_releases", "dlc_release_compatibility"];
    const collectionTables = ["collections", "collection_releases", "collection_dlc_releases"];
    const userTables = ["users", "refresh_tokens", "user_favorites", "owned_instances", "user_game_photos"];

    const groups: Record<string, string[]> = {
      "Lookup Tables": lookupTables,
      "Core Game Data": coreTables,
      "DLC / Expansions": dlcTables,
      Collections: collectionTables,
      "Users & Ownership": userTables,
    };

    for (const [groupName, tableNames] of Object.entries(groups)) {
      w(`### ${groupName}`);
      w();
      for (const tname of tableNames) {
        const info = tableDescs[tname];
        if (!info) continue;
        w(`**\`${tname}\`** — ${info.desc}`);
        w();
        w("| Column | Type |");
        w("|--------|------|");
        for (const [col, desc] of Object.entries(info.columns)) {
          w(`| \`${col}\` | ${desc} |`);
        }
        w();
      }
    }
  }

  // =========================================================================
  // Commands
  // =========================================================================
  w("## Commands");
  w();
  const scripts = scanScripts();

  // Frontend scripts
  w("### Frontend (`npm run ...`)");
  w();
  w("| Command | Description |");
  w("|---------|-------------|");
  for (const s of scripts.filter((s) => !s.name.startsWith("server:"))) {
    w(`| \`${s.name}\` | ${s.description || s.command} |`);
  }
  w();

  // Backend scripts
  w("### Backend (`cd server && npm run ...`)");
  w();
  w("| Command | Description |");
  w("|---------|-------------|");
  for (const s of scripts.filter((s) => s.name.startsWith("server:"))) {
    const label = s.name.replace("server:", "");
    w(`| \`${label}\` | ${s.description || s.command} |`);
  }
  w();

  // =========================================================================
  // Configuration
  // =========================================================================
  w("## Configuration");
  w();
  w("### Frontend (`proxy.conf.json`)");
  w();
  w("```json");
  w(JSON.stringify(readJson("proxy.conf.json"), null, 2));
  w("```");
  w();
  w("### Backend (`.env`)");
  w();
  w("```env");
  w(fs.readFileSync(path.resolve(ROOT, "server/.env.example"), "utf-8").trim());
  w("```");
  w();

  // =========================================================================
  // Dependencies
  // =========================================================================
  w("## Dependencies");
  w();
  w("### Frontend");
  w();
  w("| Package | Version |");
  w("|---------|---------|");
  for (const [pkg, ver] of Object.entries<string>(rootPkg.dependencies ?? {})) {
    w(`| \`${pkg}\` | ${ver} |`);
  }
  w();
  w("### Backend");
  w();
  w("| Package | Version |");
  w("|---------|---------|");
  for (const [pkg, ver] of Object.entries<string>(serverPkg.dependencies ?? {})) {
    w(`| \`${pkg}\` | ${ver} |`);
  }
  w();

  // =========================================================================
  // Testing
  // =========================================================================
  w("## Testing");
  w();
  w("### Frontend — Playwright E2E");
  w();
  w("| Command | Description |");
  w("|---------|-------------|");
  w("| `npm test` | Interactive UI mode |");
  w("| `npm run test:headless` | Run all tests headlessly |");
  w("| `npx playwright test --headed` | Run in visible browser |");
  w("| `npx playwright test --debug` | Step-through debugger |");
  w();
  w("### Backend — Vitest");
  w();
  w("| Command | Description |");
  w("|---------|-------------|");
  w("| `cd server && npm test` | Run all unit tests |");
  w("| `cd server && npm run test:watch` | Watch mode |");
  w();

  // =========================================================================
  // Data Import
  // =========================================================================
  w("## Data Import");
  w();
  w(
    "The project includes a Google Sheets importer that reads the game collection spreadsheet and populates the database.",
  );
  w();
  w("```bash");
  w("cd server");
  w("# 1. Download your sheet tabs as CSV into server/src/db/imports/");
  w("# 2. Run the import:");
  w("npm run db:import-sheet");
  w("```");
  w();
  w("The importer handles:");
  w("- Full games, DLC/expansions, arcade games, demos, shareware");
  w("- Platform backward compatibility (e.g., PS5/PS4 → plays on both)");
  w("- Edition type inference (Original, Remaster, Demake, Enhanced)");
  w("- Collection/compilation grouping");
  w("- Ownership tracking with location and notes");
  w("- Cross-reference to original sheet row IDs");
  w();

  // =========================================================================
  // Git
  // =========================================================================
  const author = tryGit("user.name") || "the maintainer";
  w("---");
  w();
  w(`_Auto-generated README built ${new Date().toISOString().slice(0, 10)}._`);
  w();
  w("_Run `npm run build-readme` to regenerate._");
  w();

  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const readme = build();
const outPath = path.resolve(ROOT, "README.md");

fs.writeFileSync(outPath, readme, "utf-8");
console.log(`[README Builder] Wrote ${readme.split("\n").length} lines to README.md`);
console.log(`[README Builder] ${scanApiRoutes().length} API routes documented`);
console.log(`[README Builder] ${scanComponents().length} components listed`);
console.log(`[README Builder] ${scanServices().length} services listed`);
