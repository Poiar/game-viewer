import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

// ---------------------------------------------------------------------------
// Helpers under test (replicated for pure unit testing)
// ---------------------------------------------------------------------------

function grepLines(dir: string, pattern: RegExp, glob = "*.ts"): Array<{ file: string; line: string; match: string }> {
  const results: Array<{ file: string; line: string; match: string }> = [];
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    // Handle single file paths
    const stat = fs.statSync(d);
    if (stat.isFile()) {
      const content = fs.readFileSync(d, "utf-8");
      const lines = content.split("\n");
      for (const l of lines) {
        const m = l.match(pattern);
        if (m) {
          results.push({
            file: d.replace(ROOT + path.sep, ""),
            line: l.trim(),
            match: m[1] ?? m[0],
          });
        }
      }
      return;
    }
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
            results.push({
              file: full.replace(ROOT + path.sep, ""),
              line: l.trim(),
              match: m[1] ?? m[0],
            });
          }
        }
      }
    }
  };
  walk(path.resolve(ROOT, dir));
  return results;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("README Builder", () => {
  // ---------------------------------------------------------------------------
  // Project file existence
  // ---------------------------------------------------------------------------

  describe("project structure", () => {
    it("has root package.json", () => {
      expect(fs.existsSync(path.join(ROOT, "package.json"))).toBe(true);
    });

    it("has server package.json", () => {
      expect(fs.existsSync(path.join(ROOT, "server/package.json"))).toBe(true);
    });

    it("has angular.json", () => {
      expect(fs.existsSync(path.join(ROOT, "angular.json"))).toBe(true);
    });

    it("has proxy.conf.json", () => {
      expect(fs.existsSync(path.join(ROOT, "proxy.conf.json"))).toBe(true);
    });

    it("has server entry point", () => {
      expect(fs.existsSync(path.join(ROOT, "server/src/index.ts"))).toBe(true);
    });

    it("has DB schema", () => {
      expect(fs.existsSync(path.join(ROOT, "server/src/db/schema.ts"))).toBe(true);
    });

    it("has the README builder script itself", () => {
      expect(fs.existsSync(path.join(ROOT, "scripts/build-readme.ts"))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Component scanning
  // ---------------------------------------------------------------------------

  describe("component scanning", () => {
    it("finds all Angular component selectors", () => {
      const components = grepLines("src/app", /selector:\s*["']([^"']+)["']/);
      expect(components.length).toBeGreaterThanOrEqual(7);

      const selectors = components.map((c) => c.match);
      expect(selectors).toContain("app-root");
      expect(selectors).toContain("app-inventory");
      expect(selectors).toContain("app-game-ui");
    });

    it("every component selector follows kebab-case convention", () => {
      const components = grepLines("src/app", /selector:\s*["']([^"']+)["']/);
      for (const c of components) {
        expect(c.match).toMatch(/^app-[a-z-]+$/);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Service scanning
  // ---------------------------------------------------------------------------

  describe("service scanning", () => {
    it("finds all Injectable services", () => {
      const services = grepLines("src/app/services", /@Injectable/);
      expect(services.length).toBeGreaterThanOrEqual(10);
    });

    it("api-base service exists", () => {
      expect(fs.existsSync(path.join(ROOT, "src/app/services/api-base.service.ts"))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // API route scanning
  // ---------------------------------------------------------------------------

  describe("API route scanning", () => {
    it("finds routes in all route files", () => {
      const routes = grepLines("server/src/routes", /router\.(get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]/);
      expect(routes.length).toBeGreaterThanOrEqual(40);
    });

    it("has expected route files", () => {
      const files = fs.readdirSync(path.join(ROOT, "server/src/routes")).filter((f) => f.endsWith(".ts"));
      const expectedFiles = [
        "auth.ts",
        "games.ts",
        "releases.ts",
        "series.ts",
        "dlc.ts",
        "collections.ts",
        "inventory.ts",
        "favorites.ts",
        "dashboard.ts",
        "lookup.ts",
        "index.ts",
      ];
      for (const f of expectedFiles) {
        expect(files).toContain(f);
      }
    });

    it("GET /api/games exists", () => {
      const routes = grepLines(
        "server/src/routes/games.ts",
        /router\.(get|post|put|delete)\s*\(\s*["'`]([^"'`]+)["'`]/,
      );
      expect(routes.length).toBeGreaterThanOrEqual(5);
      // Verify both read and write methods exist
      const methods = routes.map((r) => r.match);
      expect(methods).toContain("get");
      expect(methods).toContain("post");
    });

    it("inventory has CRUD endpoints", () => {
      const routes = grepLines(
        "server/src/routes/inventory.ts",
        /router\.(get|post|put|delete)\s*\(\s*["'`]([^"'`]+)["'`]/,
      );
      expect(routes.length).toBeGreaterThanOrEqual(4);
    });
  });

  // ---------------------------------------------------------------------------
  // DB schema scanning
  // ---------------------------------------------------------------------------

  describe("database schema scanning", () => {
    it("has all core tables defined", () => {
      const content = fs.readFileSync(path.join(ROOT, "server/src/db/schema.ts"), "utf-8");
      const tableNames = [
        "platforms",
        "providers",
        "genres",
        "editionTypes",
        "mediaFormats",
        "series",
        "masterGames",
        "releaseGroups",
        "releases",
        "dlcs",
        "dlcReleases",
        "collections",
        "users",
        "userFavorites",
        "ownedInstances",
      ];
      for (const name of tableNames) {
        expect(content).toContain(`export const ${name}`);
      }
    });

    it("has junction tables for many-to-many relationships", () => {
      const content = fs.readFileSync(path.join(ROOT, "server/src/db/schema.ts"), "utf-8");
      expect(content).toContain("masterGameGenres");
      expect(content).toContain("collectionReleases");
      expect(content).toContain("dlcReleaseCompatibility");
    });
  });

  // ---------------------------------------------------------------------------
  // Package scripts
  // ---------------------------------------------------------------------------

  describe("npm scripts", () => {
    it("root package.json has build-readme script", () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
      expect(pkg.scripts["build-readme"]).toBeDefined();
    });

    it("server package.json has db:import-sheet script", () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "server/package.json"), "utf-8"));
      expect(pkg.scripts["db:import-sheet"]).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Generated README integrity
  // ---------------------------------------------------------------------------

  describe("generated README integrity", () => {
    const readmePath = path.join(ROOT, "README.md");

    it("README.md exists and is non-empty", () => {
      expect(fs.existsSync(readmePath)).toBe(true);
      const content = fs.readFileSync(readmePath, "utf-8");
      expect(content.length).toBeGreaterThan(500);
    });

    it("contains required sections", () => {
      const content = fs.readFileSync(readmePath, "utf-8");
      const sections = [
        "# game-viewer",
        "## Quick Start",
        "## Project Structure",
        "## Architecture",
        "### Frontend",
        "### Backend",
        "## API Reference",
        "## Database Schema",
        "## Commands",
        "## Configuration",
        "## Dependencies",
        "## Testing",
        "## Data Import",
      ];
      for (const section of sections) {
        expect(content).toContain(section);
      }
    });

    it("documents at least 40 API routes", () => {
      const content = fs.readFileSync(readmePath, "utf-8");
      const routeCount = (content.match(/\/api\/([a-z]|[A-Z])/g) || []).length;
      expect(routeCount).toBeGreaterThanOrEqual(40);
    });

    it("has auto-generation notice", () => {
      const content = fs.readFileSync(readmePath, "utf-8");
      expect(content).toContain("auto-generated by");
      expect(content).toContain("build-readme.ts");
    });

    it("has the project tree diagram", () => {
      const content = fs.readFileSync(readmePath, "utf-8");
      expect(content).toContain("├── src/app/");
      expect(content).toContain("├── server/");
      expect(content).toContain("├── scripts/");
    });
  });
});
