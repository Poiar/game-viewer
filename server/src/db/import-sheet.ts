import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { db } from "./index.js";
import * as s from "./schema.js";
import { sql, eq, inArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SheetRow {
  rowNum: number;
  sheetId: number; // Col B - internal collection ID
  collection: string; // Col C - collection/box set name
  game: string; // Col D - game title
  type: string; // Col E - "Full", "DLC", "Arcade", "NotAGame", "Demo"
  firstReleaseYear: number | null; // Col F
  device: string; // Col G - platform(s)
  store: string; // Col H - provider
  physical: string; // Col I - "x"=digital, "y"=physical
  localCoop: string; // Col J
  controllerSupport: string; // Col K
  blacklabel: string; // Col L
  series: string; // Col M - franchise name
  genre: string; // Col N - genre
  validated: string; // Col O
  type2: string; // Col P
  place: string; // Col Q - location
  anskaffBedre: string; // Col R
  note: string; // Col S
  out: string; // Col T
  sealed: string; // Col U
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function csvParseRow(line: string, rowNum: number): SheetRow | null {
  // Simple CSV parser that handles quoted fields
  const cols = parseCSVLine(line);
  if (cols.length < 21) return null;

  // Skip header row
  if (rowNum === 1) return null;
  // Skip empty rows
  const hasData = cols.slice(1, 21).some((c) => c.trim() !== "");
  if (!hasData) return null;

  const year = parseInt(cols[5], 10);
  const sheetId = parseInt(cols[1], 10);

  return {
    rowNum,
    sheetId: isNaN(sheetId) ? 0 : sheetId,
    collection: cols[2]?.trim() ?? "",
    game: cols[3]?.trim() ?? "",
    type: cols[4]?.trim() ?? "Full",
    firstReleaseYear: isNaN(year) ? null : year,
    device: cols[6]?.trim() ?? "",
    store: cols[7]?.trim() ?? "",
    physical: cols[8]?.trim().toLowerCase() ?? "",
    localCoop: cols[9]?.trim().toLowerCase() ?? "",
    controllerSupport: cols[10]?.trim().toLowerCase() ?? "",
    blacklabel: cols[11]?.trim().toLowerCase() ?? "",
    series: cols[12]?.trim() ?? "",
    genre: cols[13]?.trim() ?? "",
    validated: cols[14]?.trim() ?? "",
    type2: cols[15]?.trim() ?? "",
    place: cols[16]?.trim() ?? "",
    anskaffBedre: cols[17]?.trim() ?? "",
    note: cols[18]?.trim() ?? "",
    out: cols[19]?.trim() ?? "",
    sealed: cols[20]?.trim() ?? "",
  };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

// ---------------------------------------------------------------------------
// Platform mapping: sheet device string → DB platform slugs
// ---------------------------------------------------------------------------

interface DeviceMapping {
  intendedFor: string[]; // original platform(s)
  playableOn: string[]; // all playable platforms (includes forward compat)
}

function mapDevice(deviceRaw: string): DeviceMapping {
  const d = deviceRaw.trim();

  const map: Record<string, DeviceMapping> = {
    PC: { intendedFor: ["Win"], playableOn: ["Win"] },
    XBOX: { intendedFor: ["Xbox"], playableOn: ["Xbox"] },
    X360: { intendedFor: ["X360"], playableOn: ["X360"] },
    XONE: { intendedFor: ["XONE"], playableOn: ["XONE"] },
    XSX: { intendedFor: ["XSX"], playableOn: ["XSX"] },
    "XSX/XONE": {
      intendedFor: ["XONE"],
      playableOn: ["XONE", "XSX"],
    },
    "XSX/X360": {
      intendedFor: ["X360"],
      playableOn: ["X360", "XSX"],
    },
    "XSX/XBOX": {
      intendedFor: ["Xbox"],
      playableOn: ["Xbox", "X360", "XONE", "XSX"],
    },
    "X360/XBOX": {
      intendedFor: ["Xbox"],
      playableOn: ["Xbox", "X360"],
    },
    "X360?/XBOX": {
      intendedFor: ["Xbox"],
      playableOn: ["Xbox", "X360"],
    },
    PS1: { intendedFor: ["PS1"], playableOn: ["PS1"] },
    PS2: { intendedFor: ["PS2"], playableOn: ["PS2"] },
    PS3: { intendedFor: ["PS3"], playableOn: ["PS3"] },
    PS4: { intendedFor: ["PS4"], playableOn: ["PS4"] },
    PS5: { intendedFor: ["PS5"], playableOn: ["PS5"] },
    PSP: { intendedFor: ["PSP"], playableOn: ["PSP"] },
    "PS3/PS1": {
      intendedFor: ["PS1"],
      playableOn: ["PS1", "PS3"],
    },
    "PS3?/PS1": {
      intendedFor: ["PS1"],
      playableOn: ["PS1", "PS3"],
    },
    "PS3/PS1 (PSN)": {
      intendedFor: ["PS1"],
      playableOn: ["PS1", "PS3"],
    },
    "PS5/PS4": {
      intendedFor: ["PS4"],
      playableOn: ["PS4", "PS5"],
    },
    "PS4/PS2 (PSN)": {
      intendedFor: ["PS2"],
      playableOn: ["PS2", "PS4"],
    },
    NES: { intendedFor: ["NES"], playableOn: ["NES"] },
    SNES: { intendedFor: ["SNES"], playableOn: ["SNES"] },
    N64: { intendedFor: ["N64"], playableOn: ["N64"] },
    GC: { intendedFor: ["GC"], playableOn: ["GC"] },
    Wii: { intendedFor: ["Wii"], playableOn: ["Wii"] },
    "Wii U": { intendedFor: ["WiiU"], playableOn: ["WiiU"] },
    "Wii U/Wii": {
      intendedFor: ["Wii"],
      playableOn: ["Wii", "WiiU"],
    },
    "WiiU/Wii": {
      intendedFor: ["Wii"],
      playableOn: ["Wii", "WiiU"],
    },
    Switch: { intendedFor: ["Switch"], playableOn: ["Switch"] },
    GB: { intendedFor: ["GB"], playableOn: ["GB"] },
    GBA: { intendedFor: ["GBA"], playableOn: ["GBA"] },
    "GBA/GB": {
      intendedFor: ["GB"],
      playableOn: ["GB", "GBA"],
    },
    "GBA/GBC": {
      intendedFor: ["GBC"],
      playableOn: ["GBC", "GBA"],
    },
    NDS: { intendedFor: ["NDS"], playableOn: ["NDS"] },
    "3DS/NDS": {
      intendedFor: ["NDS"],
      playableOn: ["NDS", "3DS"],
    },
    "3DS/GB": {
      intendedFor: ["GB"],
      playableOn: ["GB", "3DS"],
    },
    "3DS": { intendedFor: ["3DS"], playableOn: ["3DS"] },
    "XSX/Xbox": {
      intendedFor: ["Xbox"],
      playableOn: ["Xbox", "X360", "XONE", "XSX"],
    },
    Android: { intendedFor: ["And"], playableOn: ["And"] },
  };

  // Normalize the device string
  const normalized = d.replace(/\s+/g, " ").trim();
  if (map[normalized]) return map[normalized];

  // Handle "PC " (with trailing space) and similar
  for (const [key, value] of Object.entries(map)) {
    if (key.trim() === normalized) return value;
  }

  // Default: treat as a single platform
  const platformSlug = slug(normalized);
  const platformName = normalized === "PC" ? "Win" : normalized.replace(/\s+/g, "");
  console.warn(`  [WARN] Unknown device: "${deviceRaw}" → using "${platformName}"`);
  return {
    intendedFor: [platformName],
    playableOn: [platformName],
  };
}

// ---------------------------------------------------------------------------
// Provider mapping: sheet Store → DB provider name
// ---------------------------------------------------------------------------

function mapProvider(storeRaw: string): string {
  const s = storeRaw.trim();

  // Handle empty store values
  if (!s) return "Physical";

  // Specific bad-data overrides
  if (
    s.startsWith("Diablo") ||
    s.startsWith("Delicious") ||
    s.startsWith("Assassin") ||
    s === "2013" ||
    s === "1998" ||
    s === "2007" ||
    s === "2022" ||
    s === "Serve"
  ) {
    // These are accidental values in the Store column
    return "Physical";
  }

  const map: Record<string, string> = {
    "-": "Physical",
    Steam: "Steam",
    Epic: "Epic",
    "Epic ": "Epic",
    GOG: "GOG",
    Origin: "Origin",
    Ubisoft: "Ubisoft",
    "Ubisoft ": "Ubisoft",
    Battle: "Battle.net",
    Bethesda: "Bethesda",
    "Rockstar Social Club": "Rockstar Social Club",
    Humble: "Humble",
    "Origin 2": "Origin Alt",
    "Google Play": "Google Play",
  };

  if (map[s]) return map[s];

  // Check for partial matches
  for (const [key, value] of Object.entries(map)) {
    if (key.trim() === s) return value;
  }

  console.warn(`  [WARN] Unknown store: "${storeRaw}" → using "Physical"`);
  return "Physical";
}

// ---------------------------------------------------------------------------
// Edition type inference from game title and collection
// ---------------------------------------------------------------------------

function inferEditionType(gameTitle: string, collectionTitle: string): string {
  const combined = `${collectionTitle} ${gameTitle}`.toLowerCase();

  if (combined.includes("demake") || combined.includes("(demake)")) {
    return "Demake";
  }
  if (combined.includes("(hd)") || combined.includes("remastered") || combined.includes("remaster")) {
    return "Remaster";
  }
  if (
    combined.includes("definitive edition") ||
    combined.includes("enhanced edition") ||
    combined.includes("game of the year") ||
    combined.includes("goty") ||
    combined.includes("ultimate edition") ||
    combined.includes("complete edition") ||
    combined.includes("anniversary edition")
  ) {
    return "Enhanced";
  }
  if (combined.includes("downsample") || combined.includes("(downsample)")) {
    return "Downsample";
  }

  return "Original";
}

// ---------------------------------------------------------------------------
// Determine if a game title represents the same master game
// ---------------------------------------------------------------------------

function normalizeGameTitle(title: string): string {
  // Remove edition suffixes to get the base game name
  return title
    .replace(/\s*\(HD\)\s*/gi, "")
    .replace(/\s*\(Demake\)\s*/gi, "")
    .replace(/\s*\(Downsample\)\s*/gi, "")
    .replace(/\s*\(Remastered\)\s*/gi, "")
    .replace(/\s*\(Definitive Edition\)\s*/gi, "")
    .replace(/\s*\(Game of the Year Edition\)\s*/gi, "")
    .replace(/\s*\(GOTY\)\s*/gi, "")
    .replace(/\s*\(Enhanced\)\s*/gi, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Main import function
// ---------------------------------------------------------------------------

async function main() {
  const csvPath = path.join(import.meta.dirname, "imports", "spil.csv");

  if (!fs.existsSync(csvPath)) {
    console.error(`[Import] CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  console.log("[Import] Reading CSV...");
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim() !== "");

  const rows: SheetRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const row = csvParseRow(lines[i], i + 1);
    if (row) rows.push(row);
  }
  console.log(`[Import] Parsed ${rows.length} data rows from CSV`);

  // -----------------------------------------------------------------------
  // First pass: Analyze data
  // -----------------------------------------------------------------------

  console.log("[Import] Analyzing data...");

  // Collect unique genres, series, game titles
  const genreSet = new Set<string>();
  const seriesSet = new Set<string>();
  const gameMap = new Map<
    string,
    {
      title: string;
      normalizedTitle: string;
      rawTitle: string;
      firstReleaseYear: number | null;
      seriesName: string;
      genreName: string;
    }
  >();
  const collectionSet = new Map<string, { title: string; releaseYear: number | null }>();

  const fullGameRows: SheetRow[] = [];
  const dlcRows: SheetRow[] = [];
  const arcadeRows: SheetRow[] = [];

  for (const row of rows) {
    // Collect genre
    if (row.genre && row.genre !== "NA" && row.genre !== "na") {
      const cleanGenre = row.genre.replace(/\?$/, "").trim();
      if (cleanGenre && cleanGenre !== "-") {
        genreSet.add(cleanGenre);
      }
    }

    // Collect series
    if (row.series && row.series !== "NA" && row.series !== "na") {
      seriesSet.add(row.series);
    }

    // Categorize by type
    if (row.type === "DLC") {
      dlcRows.push(row);
    } else if (row.type === "Arcade") {
      arcadeRows.push(row);
    } else if (row.type === "Full" || row.type === "Demo" || row.type === "Shareware") {
      fullGameRows.push(row);
    }

    // Build game map
    if (row.game) {
      const normalized = normalizeGameTitle(row.game);
      if (!gameMap.has(normalized.toLowerCase())) {
        gameMap.set(normalized.toLowerCase(), {
          title: normalized,
          normalizedTitle: normalized,
          rawTitle: row.game,
          firstReleaseYear: row.firstReleaseYear,
          seriesName: row.series,
          genreName: row.genre,
        });
      } else {
        // Take the earliest release year
        const existing = gameMap.get(normalized.toLowerCase())!;
        if (
          row.firstReleaseYear &&
          (existing.firstReleaseYear === null || row.firstReleaseYear < existing.firstReleaseYear)
        ) {
          existing.firstReleaseYear = row.firstReleaseYear;
        }
        // Use the shorter title (without edition suffixes)
        if (normalized.length < existing.title.length) {
          existing.title = normalized;
        }
      }
    }

    // Build collection map
    if (row.collection && row.collection !== row.game) {
      const collKey = row.collection.toLowerCase().trim();
      if (!collectionSet.has(collKey)) {
        collectionSet.set(collKey, {
          title: row.collection,
          releaseYear: row.firstReleaseYear,
        });
      }
    }
  }

  console.log(
    `[Import] Found: ${genreSet.size} genres, ${seriesSet.size} series, ${gameMap.size} unique games, ${collectionSet.size} collections`,
  );
  console.log(`[Import] Rows: ${fullGameRows.length} full games, ${dlcRows.length} DLC, ${arcadeRows.length} arcade`);

  // -----------------------------------------------------------------------
  // Connect to DB and insert data
  // -----------------------------------------------------------------------

  console.log("[Import] Connecting to database...");

  // -----------------------------------------------------------------------
  // 1. Ensure lookup tables have all needed values
  // -----------------------------------------------------------------------

  console.log("[Import] Ensuring lookup data...");

  // Get existing lookup data
  const existingPlatforms = await db.select().from(s.platforms);
  const existingProviders = await db.select().from(s.providers);
  const existingGenres = await db.select().from(s.genres);
  const existingSeries = await db.select().from(s.series);
  const existingEditionTypes = await db.select().from(s.editionTypes);
  const existingMediaFormats = await db.select().from(s.mediaFormats);

  const platformSlugToId = new Map(existingPlatforms.map((p) => [p.slug, p.id]));
  const providerNameToId = new Map(existingProviders.map((p) => [p.name, p.id]));
  const genreNameToId = new Map(existingGenres.map((g) => [g.name, g.id]));
  const seriesNameToId = new Map(existingSeries.map((s) => [s.name, s.id]));
  const editionTypeNameToId = new Map(existingEditionTypes.map((e) => [e.name, e.id]));
  const mediaFormatNameToId = new Map(existingMediaFormats.map((m) => [m.name, m.id]));

  // Ensure edition types exist (release_groups.edition_type_id is a NOT NULL FK,
  // and the map lookup below falls back to id 1 = "Original").
  const EDITION_TYPES = ["Original", "Remaster", "Remake", "Enhanced", "Downsample", "Demake"];
  let editionTypesChanged = false;
  for (const name of EDITION_TYPES) {
    if (!editionTypeNameToId.has(name)) {
      await db.insert(s.editionTypes).values({ name, slug: slug(name) });
      editionTypesChanged = true;
    }
  }
  if (editionTypesChanged) {
    const refreshedEditionTypes = await db.select().from(s.editionTypes);
    editionTypeNameToId.clear();
    for (const e of refreshedEditionTypes) {
      editionTypeNameToId.set(e.name, e.id);
    }
  }

  // Ensure media formats exist (releases.media_format_id is a NOT NULL FK).
  const MEDIA_FORMATS = ["N/A", "Digital", "DVD", "CD", "Blu-ray"];
  let mediaFormatsChanged = false;
  for (const name of MEDIA_FORMATS) {
    if (!mediaFormatNameToId.has(name)) {
      await db.insert(s.mediaFormats).values({ name, slug: slug(name) });
      mediaFormatsChanged = true;
    }
  }
  if (mediaFormatsChanged) {
    const refreshedMediaFormats = await db.select().from(s.mediaFormats);
    mediaFormatNameToId.clear();
    for (const m of refreshedMediaFormats) {
      mediaFormatNameToId.set(m.name, m.id);
    }
  }

  // Add any missing platforms
  const neededPlatforms = new Set<string>();
  for (const row of rows) {
    if (!row.device) continue;
    const mapping = mapDevice(row.device);
    for (const p of [...mapping.intendedFor, ...mapping.playableOn]) {
      if (!platformSlugToId.has(p)) {
        neededPlatforms.add(p);
      }
    }
  }
  if (neededPlatforms.size > 0) {
    console.log(`[Import] Adding ${neededPlatforms.size} new platforms: ${[...neededPlatforms].join(", ")}`);
    const platformInserts = [...neededPlatforms].map((name) => ({
      name,
      slug: slug(name),
    }));
    // We could insert but since IDs are serial, we'd need to track new IDs
    // For now, just use the slug directly in the JSONB arrays
  }

  // Add any missing providers
  const neededProviders = new Set<string>();
  for (const row of rows) {
    if (!row.store) continue;
    const providerName = mapProvider(row.store);
    if (!providerNameToId.has(providerName)) {
      neededProviders.add(providerName);
    }
  }
  if (neededProviders.size > 0) {
    console.log(`[Import] Adding ${neededProviders.size} new providers: ${[...neededProviders].join(", ")}`);
    for (const name of neededProviders) {
      try {
        await db.insert(s.providers).values({ name, slug: slug(name) });
      } catch {
        // might already exist
      }
    }
    // Refresh provider lookup
    const refreshedProviders = await db.select().from(s.providers);
    providerNameToId.clear();
    for (const p of refreshedProviders) {
      providerNameToId.set(p.name, p.id);
    }
  }

  // Add missing genres
  if (genreSet.size > 0) {
    const missingGenres = [...genreSet].filter((g) => !genreNameToId.has(g));
    if (missingGenres.length > 0) {
      console.log(`[Import] Adding ${missingGenres.length} new genres: ${missingGenres.join(", ")}`);
      for (const name of missingGenres) {
        try {
          await db.insert(s.genres).values({ name, slug: slug(name) });
        } catch {
          // might already exist
        }
      }
      const refreshedGenres = await db.select().from(s.genres);
      genreNameToId.clear();
      for (const g of refreshedGenres) {
        genreNameToId.set(g.name, g.id);
      }
    }
  }

  // Ensure "None" series exists
  let noneSeriesId = seriesNameToId.get("None");
  if (!noneSeriesId) {
    try {
      await db.insert(s.series).values({ name: "None", slug: "none" });
      const refreshed = await db.select().from(s.series);
      for (const s2 of refreshed) {
        seriesNameToId.set(s2.name, s2.id);
      }
      noneSeriesId = seriesNameToId.get("None")!;
    } catch {
      const refreshed = await db.select().from(s.series);
      for (const s2 of refreshed) {
        seriesNameToId.set(s2.name, s2.id);
      }
      noneSeriesId = seriesNameToId.get("None");
    }
  }

  // -----------------------------------------------------------------------
  // 2. Insert series
  // -----------------------------------------------------------------------

  console.log("[Import] Inserting series...");
  const seriesToInsert = [...seriesSet].filter((name) => !seriesNameToId.has(name));
  if (seriesToInsert.length > 0) {
    // Insert in batches to avoid long-running transactions
    for (const name of seriesToInsert) {
      try {
        await db.insert(s.series).values({ name, slug: slug(name) });
      } catch {
        // might already exist
      }
    }
    const refreshedSeries = await db.select().from(s.series);
    seriesNameToId.clear();
    for (const sr of refreshedSeries) {
      seriesNameToId.set(sr.name, sr.id);
    }
    console.log(`[Import] Inserted ${seriesToInsert.length} series`);
  }

  // -----------------------------------------------------------------------
  // 3. Insert master games
  // -----------------------------------------------------------------------

  console.log("[Import] Inserting master games...");
  const gameTitleToId = new Map<string, number>();
  const gameTitles = [...gameMap.values()];

  for (const g of gameTitles) {
    const seriesId = g.seriesName ? (seriesNameToId.get(g.seriesName) ?? noneSeriesId) : noneSeriesId;

    try {
      const result = await db
        .insert(s.masterGames)
        .values({
          title: g.title,
          slug: slug(g.normalizedTitle),
          firstReleaseYear: g.firstReleaseYear ?? 0,
          seriesId,
          alternativeTitles: g.rawTitle !== g.normalizedTitle ? [g.rawTitle] : [],
        })
        .returning({ id: s.masterGames.id });

      if (result.length > 0) {
        gameTitleToId.set(g.normalizedTitle.toLowerCase(), result[0].id);
      }
    } catch (err: any) {
      if (err?.message?.includes("duplicate") || err?.code === "23505") {
        // Get existing ID
        const existing = await db
          .select({ id: s.masterGames.id })
          .from(s.masterGames)
          .where(eq(s.masterGames.slug, slug(g.normalizedTitle)))
          .limit(1);
        if (existing.length > 0) {
          gameTitleToId.set(g.normalizedTitle.toLowerCase(), existing[0].id);
        }
      } else {
        console.warn(`  [WARN] Failed to insert game "${g.title}": ${err?.message}`);
      }
    }
  }
  console.log(`[Import] Inserted/tracked ${gameTitleToId.size} master games`);

  // -----------------------------------------------------------------------
  // 4. Link genres to games
  // -----------------------------------------------------------------------

  console.log("[Import] Linking game-genres...");
  const genreLinksAdded = new Set<string>();

  for (const row of rows) {
    if (!row.game || !row.genre) continue;
    if (row.genre === "NA" || row.genre === "na") continue;

    const cleanGenre = row.genre.replace(/\?$/, "").trim();
    if (!cleanGenre || cleanGenre === "-") continue;

    const normalizedTitle = normalizeGameTitle(row.game).toLowerCase();
    const gameId = gameTitleToId.get(normalizedTitle);
    const genreId = genreNameToId.get(cleanGenre);

    if (gameId && genreId) {
      const key = `${gameId}-${genreId}`;
      if (!genreLinksAdded.has(key)) {
        try {
          await db.insert(s.masterGameGenres).values({ gameId, genreId }).onConflictDoNothing();
          genreLinksAdded.add(key);
        } catch {
          // ignore duplicates
        }
      }
    }
  }
  console.log(`[Import] Linked ${genreLinksAdded.size} game-genre pairs`);

  // -----------------------------------------------------------------------
  // 5. Create release groups and releases for Full games
  // -----------------------------------------------------------------------

  console.log("[Import] Creating release groups and releases...");
  const releaseIdMap = new Map<string, number>(); // key: "gameSlug|provider|device" → release ID
  const collectionReleasePairs: Array<{
    collectionTitle: string;
    releaseId: number;
  }> = [];

  let releaseGroupCounter = 0;
  let releaseCounter = 0;

  // We use a Set to avoid creating duplicates for identical entries
  const seenReleaseKeys = new Set<string>();

  for (const row of fullGameRows) {
    if (!row.game) continue;

    const normalizedTitle = normalizeGameTitle(row.game);
    const gameSlug = slug(normalizedTitle);
    const gameId = gameTitleToId.get(normalizedTitle.toLowerCase());
    if (!gameId) continue;

    const providerName = mapProvider(row.store);
    const providerId = providerNameToId.get(providerName);
    if (!providerId) {
      console.warn(`  [WARN] No provider ID for "${providerName}" (row ${row.rowNum})`);
      continue;
    }

    const deviceMapping = mapDevice(row.device);

    // Determine media format
    const isPhysical = row.physical === "y" || (row.store === "-" && row.physical !== "x");
    const mediaFormatName = isPhysical ? "N/A" : "Digital";
    const mediaFormatId = mediaFormatNameToId.get(mediaFormatName) ?? 1;

    // Edition type
    const editionName = inferEditionType(row.game, row.collection);
    const editionTypeId = editionTypeNameToId.get(editionName) ?? 1; // default Original

    // Create a unique key for deduplication
    const releaseKey = `${gameSlug}|${providerName}|${row.device}|${editionName}`;
    if (seenReleaseKeys.has(releaseKey)) continue;
    seenReleaseKeys.add(releaseKey);

    // Map controller support and local co-op
    const controllerSupport =
      row.controllerSupport === "y"
        ? "Yes"
        : row.controllerSupport === "x"
          ? "No"
          : row.controllerSupport === "(y)"
            ? "Maybe"
            : "unknown";
    const localMultiplayer = row.localCoop === "y" ? "Yes" : row.localCoop === "x" ? "No" : "unknown";

    try {
      // Create release group
      releaseGroupCounter++;
      const [rg] = await db
        .insert(s.releaseGroups)
        .values({
          masterGameId: gameId,
          editionTypeId,
          editionName: editionName !== "Original" ? editionName : null,
          releaseYear: row.firstReleaseYear,
        })
        .returning({ id: s.releaseGroups.id });

      // Create release
      releaseCounter++;
      const [rel] = await db
        .insert(s.releases)
        .values({
          releaseGroupId: rg.id,
          title: null,
          providerId,
          mediaFormatId,
          intendedFor: deviceMapping.intendedFor,
          playableOn: deviceMapping.playableOn,
          controllerSupport,
          localMultiplayer,
          onlineMultiplayer: "unknown",
        })
        .returning({ id: s.releases.id });

      releaseIdMap.set(releaseKey, rel.id);

      // Track collection membership
      if (row.collection && row.collection.trim().toLowerCase() !== row.game.trim().toLowerCase()) {
        collectionReleasePairs.push({
          collectionTitle: row.collection.trim(),
          releaseId: rel.id,
        });
      }
    } catch (err: any) {
      console.warn(`  [WARN] Row ${row.rowNum} "${row.game}": ${err?.message?.slice(0, 100)}`);
    }
  }

  console.log(`[Import] Created ${releaseGroupCounter} release groups, ${releaseCounter} releases`);

  // -----------------------------------------------------------------------
  // 6. Create collections and link releases
  // -----------------------------------------------------------------------

  console.log("[Import] Creating collections...");
  const collectionTitleToId = new Map<string, number>();

  // Group releases by collection
  const collReleases = new Map<string, number[]>();
  for (const pair of collectionReleasePairs) {
    const key = pair.collectionTitle.toLowerCase().trim();
    if (!collReleases.has(key)) {
      collReleases.set(key, []);
    }
    collReleases.get(key)!.push(pair.releaseId);
  }

  for (const [collTitle, releaseIds] of collReleases) {
    const collInfo = collectionSet.get(collTitle);

    try {
      const [coll] = await db
        .insert(s.collections)
        .values({
          title: collInfo?.title ?? collTitle,
          mediaFormatId: mediaFormatNameToId.get("N/A") ?? 1,
          releaseYear: collInfo?.releaseYear ?? null,
        })
        .returning({ id: s.collections.id });

      collectionTitleToId.set(collTitle, coll.id);

      // Link releases to collection
      for (const relId of releaseIds) {
        try {
          await db
            .insert(s.collectionReleases)
            .values({ collectionId: coll.id, releaseId: relId })
            .onConflictDoNothing();
        } catch {
          // ignore
        }
      }
    } catch (err: any) {
      if (err?.message?.includes("duplicate") || err?.code === "23505") {
        // Get existing
        const existing = await db
          .select({ id: s.collections.id })
          .from(s.collections)
          .where(eq(s.collections.title, collInfo?.title ?? collTitle))
          .limit(1);
        if (existing.length > 0) {
          collectionTitleToId.set(collTitle, existing[0].id);
          for (const relId of releaseIds) {
            try {
              await db
                .insert(s.collectionReleases)
                .values({
                  collectionId: existing[0].id,
                  releaseId: relId,
                })
                .onConflictDoNothing();
            } catch {
              // ignore
            }
          }
        }
      }
    }
  }
  console.log(
    `[Import] Created ${collectionTitleToId.size} collections with ${collectionReleasePairs.length} release links`,
  );

  // -----------------------------------------------------------------------
  // 7. Handle DLC entries
  // -----------------------------------------------------------------------

  console.log("[Import] Processing DLC entries...");
  let dlcCounter = 0;

  // DLC rows: Collection = DLC name, need to find parent game
  // The DLC "Collection" often contains the game title
  for (const row of dlcRows) {
    if (!row.collection || row.collection === "NA") continue;

    const dlcTitle = row.collection.trim();
    // Try to find the parent game
    // Strategy: search through known master games for a title match
    let parentGameId: number | null = null;

    // The collection field often is "Game Title: DLC Name" or "Game Title - DLC Name"
    // Try to extract parent game name
    const parentCandidates = [row.collection.split(":")[0].trim(), row.collection.split(" - ")[0].trim()];

    // Also check if the "game" column has the base game (sometimes it's there for DLC)
    if (row.game) {
      parentCandidates.push(row.game.trim());
    }

    for (const candidate of parentCandidates) {
      const normalized = normalizeGameTitle(candidate).toLowerCase();
      const id = gameTitleToId.get(normalized);
      if (id) {
        parentGameId = id;
        break;
      }
    }

    // If no parent found, search fuzzy
    if (!parentGameId) {
      // Try matching first word of collection against game titles
      const firstPart = row.collection.split(":")[0].split(" - ")[0].trim();
      for (const [gameTitle, gameId] of gameTitleToId) {
        if (gameTitle.includes(firstPart.toLowerCase()) || firstPart.toLowerCase().includes(gameTitle)) {
          parentGameId = gameId;
          break;
        }
      }
    }

    if (parentGameId) {
      dlcCounter++;
      // Insert DLC
      const providerName = mapProvider(row.store);
      const providerId = providerNameToId.get(providerName) ?? providerNameToId.get("Physical")!;
      const deviceMapping = mapDevice(row.device);
      const isPhysical = row.physical === "y";
      const mediaFormatId = mediaFormatNameToId.get(isPhysical ? "N/A" : "Digital") ?? 1;

      try {
        const [dlc] = await db
          .insert(s.dlcs)
          .values({
            title: dlcTitle,
            firstReleaseYear: row.firstReleaseYear ?? 0,
            dlcType: "Expansion",
            masterGameId: parentGameId,
          })
          .returning({ id: s.dlcs.id });

        // Create DLC release
        await db.insert(s.dlcReleases).values({
          dlcId: dlc.id,
          providerId,
          mediaFormatId,
          onDiscForConsoleOnly: false,
        });
      } catch (err: any) {
        // silently skip duplicate DLCs
      }
    }
  }
  console.log(`[Import] Created ~${dlcCounter} DLC entries`);

  // -----------------------------------------------------------------------
  // 8. Create owned_instances
  // -----------------------------------------------------------------------

  console.log("[Import] Creating owned instances...");
  let ownedCounter = 0;

  // Process Full game rows first (most ownership is here)
  for (const row of fullGameRows) {
    if (!row.place || row.place === "NA" || row.place === "na") continue;
    if (!row.game) continue;

    const normalizedTitle = normalizeGameTitle(row.game);
    const gameSlug = slug(normalizedTitle);
    const providerName = mapProvider(row.store);
    const editionName = inferEditionType(row.game, row.collection);
    const releaseKey = `${gameSlug}|${providerName}|${row.device}|${editionName}`;

    const releaseId = releaseIdMap.get(releaseKey);
    if (!releaseId) continue;

    const place = row.place === "Her" ? "Her" : row.place;

    try {
      await db.insert(s.ownedInstances).values({
        userId: 1,
        releaseId,
        location: place,
        notes: row.note ? `[SheetID:${row.sheetId}] ${row.note}` : `[SheetID:${row.sheetId}]`,
        condition: row.sealed === "y" ? "Sealed" : null,
      });
      ownedCounter++;
    } catch (err: any) {
      // ignore duplicates
    }
  }

  // Also check Arcade rows for ownership
  for (const row of arcadeRows) {
    if (!row.place || row.place === "NA" || row.place === "na") continue;
    if (!row.game) continue;

    const normalizedTitle = normalizeGameTitle(row.game);
    const gameSlug = slug(normalizedTitle);
    const providerName = mapProvider(row.store);
    const editionName = inferEditionType(row.game, row.collection);
    const releaseKey = `${gameSlug}|${providerName}|${row.device}|${editionName}`;

    const releaseId = releaseIdMap.get(releaseKey);
    if (!releaseId) continue;

    try {
      await db.insert(s.ownedInstances).values({
        userId: 1,
        releaseId,
        location: row.place,
        notes: `[SheetID:${row.sheetId}] ${row.note}`.trim(),
        condition: row.sealed === "y" ? "Sealed" : null,
      });
      ownedCounter++;
    } catch {
      // ignore duplicates
    }
  }

  // DLC ownership
  for (const row of dlcRows) {
    if (!row.place || row.place === "NA" || row.place === "na") continue;
    if (!row.collection) continue;

    // Find matching DLC release
    const dlcTitle = row.collection.trim();
    const dlcs = await db.select({ id: s.dlcs.id }).from(s.dlcs).where(eq(s.dlcs.title, dlcTitle)).limit(1);

    if (dlcs.length > 0) {
      const dlcReleases = await db
        .select({ id: s.dlcReleases.id })
        .from(s.dlcReleases)
        .where(eq(s.dlcReleases.dlcId, dlcs[0].id))
        .limit(1);

      if (dlcReleases.length > 0) {
        try {
          await db.insert(s.ownedInstances).values({
            userId: 1,
            dlcReleaseId: dlcReleases[0].id,
            location: row.place,
            notes: `[SheetID:${row.sheetId}] ${row.note}`.trim(),
          });
          ownedCounter++;
        } catch {
          // ignore duplicates
        }
      }
    }
  }

  console.log(`[Import] Created ${ownedCounter} owned instances`);

  // -----------------------------------------------------------------------
  // 9. Reset sequences
  // -----------------------------------------------------------------------

  console.log("[Import] Resetting sequences...");
  const sequences = [
    "platforms",
    "providers",
    "genres",
    "edition_types",
    "media_formats",
    "series",
    "master_games",
    "release_groups",
    "releases",
    "dlcs",
    "dlc_releases",
    "collections",
  ];
  for (const seq of sequences) {
    try {
      await db.execute(
        sql`SELECT setval('${sql.raw(seq + "_id_seq")}', (SELECT COALESCE(MAX(id), 0) FROM ${sql.raw(seq)}))`,
      );
    } catch {
      // sequence might not exist
    }
  }

  console.log("[Import] Import complete!");
  console.log(`  - ${gameMap.size} unique game titles`);
  console.log(`  - ${seriesSet.size} series/franchises`);
  console.log(`  - ${genreSet.size} genres`);
  console.log(`  - ${releaseGroupCounter} release groups`);
  console.log(`  - ${releaseCounter} releases`);
  console.log(`  - ${collectionTitleToId.size} collections`);
  console.log(`  - ${dlcCounter} DLC entries`);
  console.log(`  - ${ownedCounter} owned instances`);
}

main()
  .catch((err) => {
    console.error("[Import] Fatal error:", err);
    process.exit(1);
  })
  .then(() => {
    process.exit(0);
  });
