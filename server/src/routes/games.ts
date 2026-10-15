import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import {
  masterGames,
  masterGameGenres,
  genres,
  series,
  releaseGroups,
  releases,
  editionTypes,
  dlcs,
  dlcReleases,
  dlcReleaseCompatibility,
  providers,
  mediaFormats,
  ownedInstances,
} from "../db/schema.js";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { enrichGame } from "../services/enrichment.js";
import { z } from "zod";
import { eq, and, or, ilike, like, desc, asc, count, sql, inArray } from "drizzle-orm";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createGameSchema = z.object({
  title: z.string().min(1).max(255),
  firstReleaseYear: z.number().int().min(1900).max(2100),
  description: z.string().optional().nullable(),
  coverImageUrl: z.string().url().max(500).optional().nullable(),
  seriesId: z.number().int().optional().nullable(),
  alternativeTitles: z.array(z.string()).optional(),
  genreIds: z.array(z.number().int()).optional(),
});

const updateGameSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  firstReleaseYear: z.number().int().min(1900).max(2100).optional(),
  description: z.string().optional().nullable(),
  coverImageUrl: z.string().url().max(500).optional().nullable(),
  seriesId: z.number().int().optional().nullable(),
  alternativeTitles: z.array(z.string()).optional(),
  genreIds: z.array(z.number().int()).optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET / — List master games with search, filters, pagination. Auth is optional; when
// present each game includes a summary of the releases the user owns.
router.get("/", optionalAuth, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(2500, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string)?.trim();
    const genreSlug = (req.query.genre as string)?.trim();
    const seriesId = parseInt(req.query.seriesId as string) || undefined;
    const platformSlug = (req.query.platform as string)?.trim();
    const providerSlug = (req.query.provider as string)?.trim();
    const sortBy = (req.query.sort as string) || "name";
    const order = (req.query.order as string)?.toLowerCase() === "desc" ? "desc" : "asc";

    // Build dynamic WHERE conditions
    const conditions: (ReturnType<typeof eq> | ReturnType<typeof and> | ReturnType<typeof sql>)[] = [];

    if (search) {
      conditions.push(
        or(
          ilike(masterGames.title, `%${search}%`),
          sql`${masterGames.alternativeTitles}::text ILIKE ${`%${search}%`}`,
        )!,
      );
    }

    if (genreSlug) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${masterGameGenres} mgg
          JOIN ${genres} g ON g.id = mgg.genre_id
          WHERE mgg.game_id = ${masterGames.id} AND g.slug = ${genreSlug}
        )`,
      );
    }

    if (seriesId) {
      conditions.push(eq(masterGames.seriesId, seriesId));
    }

    if (platformSlug) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${releaseGroups} rg
          JOIN ${releases} r ON r.release_group_id = rg.id
          WHERE rg.master_game_id = ${masterGames.id}
          AND ${releases.playableOn}::text ILIKE ${`%\"${platformSlug}\"%`}
        )`,
      );
    }

    if (providerSlug) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${releaseGroups} rg
          JOIN ${releases} r ON r.release_group_id = rg.id
          JOIN ${providers} p ON p.id = r.provider_id
          WHERE rg.master_game_id = ${masterGames.id} AND p.slug = ${providerSlug}
        )`,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Total count
    const [{ count: total }] = await db.select({ count: count() }).from(masterGames).where(whereClause);

    // Determine sort
    let orderByClause;
    switch (sortBy) {
      case "year":
        orderByClause = order === "desc" ? desc(masterGames.firstReleaseYear) : asc(masterGames.firstReleaseYear);
        break;
      default: // "name"
        orderByClause = order === "desc" ? desc(masterGames.title) : asc(masterGames.title);
    }

    // Fetch paginated games with series name
    const gameRows = await db
      .select({
        id: masterGames.id,
        title: masterGames.title,
        slug: masterGames.slug,
        firstReleaseYear: masterGames.firstReleaseYear,
        description: masterGames.description,
        coverImageUrl: masterGames.coverImageUrl,
        seriesId: masterGames.seriesId,
        seriesName: series.name,
        alternativeTitles: masterGames.alternativeTitles,
        criticScore: masterGames.criticScore,
        createdAt: masterGames.createdAt,
      })
      .from(masterGames)
      .leftJoin(series, eq(masterGames.seriesId, series.id))
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);

    const gameIds = gameRows.map((g) => g.id);

    // Batch fetch genres for all returned games
    const genreMap: Record<number, { id: number; name: string; slug: string }[]> = {};

    if (gameIds.length > 0) {
      const genreRows = await db
        .select({
          gameId: masterGameGenres.gameId,
          id: genres.id,
          name: genres.name,
          slug: genres.slug,
        })
        .from(masterGameGenres)
        .innerJoin(genres, eq(masterGameGenres.genreId, genres.id))
        .where(inArray(masterGameGenres.gameId, gameIds))
        .orderBy(asc(genres.name));

      for (const row of genreRows) {
        if (!genreMap[row.gameId]) {
          genreMap[row.gameId] = [];
        }
        genreMap[row.gameId].push({ id: row.id, name: row.name, slug: row.slug });
      }
    }

    // Batch fetch release group counts
    const rgCountMap: Record<number, number> = {};

    if (gameIds.length > 0) {
      const rgCounts = await db
        .select({
          gameId: releaseGroups.masterGameId,
          count: count(),
        })
        .from(releaseGroups)
        .where(inArray(releaseGroups.masterGameId, gameIds))
        .groupBy(releaseGroups.masterGameId);

      for (const row of rgCounts) {
        rgCountMap[row.gameId] = Number(row.count);
      }
    }

    // Batch fetch owned release summaries (when user is authenticated)
    const ownedMap: Record<number, { platforms: string[]; formats: string[] }[]> = {};

    if (req.user && gameIds.length > 0) {
      // Get all release IDs that belong to games in this page
      const pageReleaseIds: { id: number; gameId: number }[] = await db
        .select({ id: releases.id, gameId: releaseGroups.masterGameId })
        .from(releases)
        .innerJoin(releaseGroups, eq(releases.releaseGroupId, releaseGroups.id))
        .where(inArray(releaseGroups.masterGameId, gameIds));

      const releaseToGame = new Map(pageReleaseIds.map((r) => [r.id, r.gameId]));
      const allReleaseIds = [...releaseToGame.keys()];

      if (allReleaseIds.length > 0) {
        // Get owned instances for current user
        const owned = await db
          .select({
            releaseId: ownedInstances.releaseId,
          })
          .from(ownedInstances)
          .where(and(eq(ownedInstances.userId, req.user!.userId), inArray(ownedInstances.releaseId, allReleaseIds)));

        const ownedReleaseIds = new Set(owned.map((o) => o.releaseId!).filter(Boolean));

        if (ownedReleaseIds.size > 0) {
          // Fetch release details (platforms, format) for owned releases
          const ownedReleases = await db
            .select({
              id: releases.id,
              playableOn: releases.playableOn,
              mediaFormatName: mediaFormats.name,
            })
            .from(releases)
            .leftJoin(mediaFormats, eq(releases.mediaFormatId, mediaFormats.id))
            .where(inArray(releases.id, [...ownedReleaseIds]));

          for (const rel of ownedReleases) {
            const gameId = releaseToGame.get(rel.id);
            if (!gameId) continue;
            if (!ownedMap[gameId]) ownedMap[gameId] = [];
            ownedMap[gameId].push({
              platforms: (rel.playableOn as string[]) ?? [],
              formats: rel.mediaFormatName ? [rel.mediaFormatName] : [],
            });
          }
        }
      }
    }

    // Assemble response
    const data = gameRows.map((g) => ({
      id: g.id,
      title: g.title,
      slug: g.slug,
      firstReleaseYear: g.firstReleaseYear,
      description: g.description,
      coverImageUrl: g.coverImageUrl,
      series: g.seriesId ? { id: g.seriesId, name: g.seriesName } : null,
      alternativeTitles: g.alternativeTitles,
      criticScore: g.criticScore,
      genres: genreMap[g.id] || [],
      releaseGroupsCount: rgCountMap[g.id] || 0,
      ownedReleases: ownedMap[g.id] || [],
      createdAt: g.createdAt,
    }));

    res.json({
      data,
      meta: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
      },
      error: null,
    });
  } catch (error) {
    console.error("List games error:", error);
    res.status(500).json({
      data: null,
      error: { code: "INTERNAL_ERROR", message: "Failed to fetch games" },
    });
  }
});

// GET /:slug — Get master game by slug with full detail. Auth optional; when
// present, each release includes whether the user owns it.
router.get("/:slug", optionalAuth, async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string;

    const game = await db.query.masterGames.findFirst({
      where: eq(masterGames.slug, slug),
      with: {
        series: true,
        genres: {
          with: {
            genre: true,
          },
        },
        releaseGroups: {
          with: {
            editionType: true,
            releases: {
              with: {
                provider: true,
                mediaFormat: true,
              },
            },
          },
        },
        dlcs: {
          with: {
            dlcReleases: {
              with: {
                provider: true,
                mediaFormat: true,
                compatibility: {
                  with: {
                    release: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!game) {
      res.status(404).json({
        data: null,
        error: { code: "NOT_FOUND", message: "Game not found" },
      });
      return;
    }

    // Collect all release IDs + DLC release IDs from this game
    const allReleaseIds: number[] = [];
    const allDlcReleaseIds: number[] = [];
    for (const rg of game.releaseGroups) {
      for (const r of rg.releases) {
        allReleaseIds.push(r.id);
      }
    }
    for (const dlc of game.dlcs) {
      for (const dr of dlc.dlcReleases) {
        allDlcReleaseIds.push(dr.id);
      }
    }

    // If user is authenticated, fetch owned instance details
    const ownedReleaseMap = new Map<
      number,
      {
        id: number;
        condition: string | null;
        location: string | null;
        purchasePrice: string | null;
        acquiredDate: string | null;
      }
    >();
    const ownedDlcReleaseMap = new Map<
      number,
      {
        id: number;
        condition: string | null;
        location: string | null;
        purchasePrice: string | null;
        acquiredDate: string | null;
      }
    >();
    if (req.user) {
      if (allReleaseIds.length > 0) {
        const owned = await db
          .select({
            id: ownedInstances.id,
            releaseId: ownedInstances.releaseId,
            condition: ownedInstances.condition,
            location: ownedInstances.location,
            purchasePrice: ownedInstances.purchasePrice,
            acquiredDate: ownedInstances.acquiredDate,
          })
          .from(ownedInstances)
          .where(and(eq(ownedInstances.userId, req.user.userId), inArray(ownedInstances.releaseId, allReleaseIds)));
        for (const o of owned) {
          if (o.releaseId)
            ownedReleaseMap.set(o.releaseId, {
              id: o.id,
              condition: o.condition,
              location: o.location,
              purchasePrice: o.purchasePrice,
              acquiredDate: o.acquiredDate,
            });
        }
      }
      if (allDlcReleaseIds.length > 0) {
        const ownedDlc = await db
          .select({
            id: ownedInstances.id,
            dlcReleaseId: ownedInstances.dlcReleaseId,
            condition: ownedInstances.condition,
            location: ownedInstances.location,
            purchasePrice: ownedInstances.purchasePrice,
            acquiredDate: ownedInstances.acquiredDate,
          })
          .from(ownedInstances)
          .where(
            and(eq(ownedInstances.userId, req.user.userId), inArray(ownedInstances.dlcReleaseId, allDlcReleaseIds)),
          );
        for (const o of ownedDlc) {
          if (o.dlcReleaseId)
            ownedDlcReleaseMap.set(o.dlcReleaseId, {
              id: o.id,
              condition: o.condition,
              location: o.location,
              purchasePrice: o.purchasePrice,
              acquiredDate: o.acquiredDate,
            });
        }
      }
    }

    // Shape the response: flatten genres, ensure sort orders
    const data = {
      id: game.id,
      title: game.title,
      slug: game.slug,
      firstReleaseYear: game.firstReleaseYear,
      description: game.description,
      coverImageUrl: game.coverImageUrl,
      alternativeTitles: game.alternativeTitles,
      series: game.series ?? null,
      genres: game.genres.map((g) => g.genre).sort((a, b) => a.name.localeCompare(b.name)),
      igdbId: game.igdbId ?? null,
      opencriticId: game.opencriticId ?? null,
      hltbId: game.hltbId ?? null,
      hltbTime: game.hltbTime ?? null,
      criticScore: game.criticScore ?? null,
      summary: game.summary ?? null,
      developer: game.developer ?? null,
      publisher: game.publisher ?? null,
      currentLow: game.currentLow ?? null,
      historicalLow: game.historicalLow ?? null,
      priceCurrency: game.priceCurrency ?? null,
      screenshots: game.screenshots ?? [],
      releaseGroups: game.releaseGroups
        .sort((a, b) => (a.releaseYear ?? 0) - (b.releaseYear ?? 0))
        .map((rg) => ({
          id: rg.id,
          editionName: rg.editionName,
          releaseYear: rg.releaseYear,
          editionType: rg.editionType ?? null,
          createdAt: rg.createdAt,
          releases: rg.releases
            .sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""))
            .map((r) => ({
              id: r.id,
              title: r.title,
              barcode: r.barcode,
              catalogNumber: r.catalogNumber,
              publisher: r.publisher,
              region: r.region,
              releaseDate: r.releaseDate,
              controllerSupport: r.controllerSupport,
              localMultiplayer: r.localMultiplayer,
              onlineMultiplayer: r.onlineMultiplayer,
              intendedFor: r.intendedFor,
              playableOn: r.playableOn,
              versionImageUrl: r.versionImageUrl,
              provider: r.provider ?? null,
              mediaFormat: r.mediaFormat ?? null,
              userOwns: ownedReleaseMap.get(r.id) ?? null,
            })),
        })),
      dlcs: game.dlcs.map((dlc) => ({
        id: dlc.id,
        title: dlc.title,
        firstReleaseYear: dlc.firstReleaseYear,
        dlcType: dlc.dlcType,
        createdAt: dlc.createdAt,
        releases: dlc.dlcReleases.map((dr) => ({
          id: dr.id,
          releaseDate: dr.releaseDate,
          onDiscForConsoleOnly: dr.onDiscForConsoleOnly,
          provider: dr.provider ?? null,
          mediaFormat: dr.mediaFormat ?? null,
          userOwns: ownedDlcReleaseMap.get(dr.id) ?? null,
          compatibleWith: dr.compatibility.map((c) => ({
            releaseId: c.release?.id,
            releaseTitle: c.release?.title,
          })),
        })),
      })),
      createdAt: game.createdAt,
    };

    res.json({ data, error: null });
  } catch (error) {
    console.error("Get game error:", error);
    res.status(500).json({
      data: null,
      error: { code: "INTERNAL_ERROR", message: "Failed to fetch game" },
    });
  }
});

// POST / — Create master game (auth required)
router.post("/", authenticate, validate(createGameSchema), async (req: Request, res: Response) => {
  try {
    const { title, firstReleaseYear, description, coverImageUrl, seriesId, alternativeTitles, genreIds } = req.body;
    const slug = slugify(title);

    // Check slug uniqueness
    const [existing] = await db
      .select({ id: masterGames.id })
      .from(masterGames)
      .where(eq(masterGames.slug, slug))
      .limit(1);

    if (existing) {
      res.status(409).json({
        data: null,
        error: { code: "SLUG_TAKEN", message: `A game with the slug "${slug}" already exists` },
      });
      return;
    }

    const [created] = await db
      .insert(masterGames)
      .values({
        title,
        slug,
        firstReleaseYear,
        description: description ?? null,
        coverImageUrl: coverImageUrl ?? null,
        seriesId: seriesId ?? null,
        alternativeTitles: alternativeTitles ?? [],
      })
      .returning();

    // Insert genre associations
    if (genreIds && genreIds.length > 0) {
      await db.insert(masterGameGenres).values(
        genreIds.map((genreId: number) => ({
          gameId: created.id,
          genreId,
        })),
      );
    }

    // Fetch the full created game with relations
    const game = await db.query.masterGames.findFirst({
      where: eq(masterGames.id, created.id),
      with: {
        series: true,
        genres: { with: { genre: true } },
      },
    });

    const data = game
      ? {
          ...game,
          genres: game.genres.map((g) => g.genre),
        }
      : created;

    res.status(201).json({ data, error: null });

    // Fire-and-forget enrichment
    enrichGame(title)
      .then((enrichment) => {
        if (enrichment.igdbId || enrichment.opencriticId || enrichment.hltbId) {
          const setData: Record<string, unknown> = {
            igdbId: enrichment.igdbId ?? undefined,
            opencriticId: enrichment.opencriticId ?? undefined,
            hltbId: enrichment.hltbId ?? undefined,
            hltbTime: enrichment.hltbTime ?? undefined,
            criticScore: enrichment.opencriticScore ?? undefined,
            summary: enrichment.igdbSummary ?? undefined,
            screenshots: enrichment.igdbScreenshots?.length ? enrichment.igdbScreenshots : undefined,
            updatedAt: new Date(),
          };
          if (enrichment.igdbCoverUrl && !enrichment.igdbCoverUrl.includes("nocover")) {
            setData["coverImageUrl"] = enrichment.igdbCoverUrl;
          }
          db.update(masterGames)
            .set(setData as any)
            .where(eq(masterGames.id, created.id))
            .execute()
            .catch((e) => console.error("Auto-enrich update failed:", e));
        }
      })
      .catch((e) => console.error("Auto-enrich search failed:", e));
  } catch (error) {
    console.error("Create game error:", error);
    res.status(500).json({
      data: null,
      error: { code: "INTERNAL_ERROR", message: "Failed to create game" },
    });
  }
});

// PUT /:id — Update master game (auth required)
router.put("/:id", authenticate, validate(updateGameSchema), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({
        data: null,
        error: { code: "INVALID_ID", message: "Invalid game ID" },
      });
      return;
    }

    const [existing] = await db.select({ id: masterGames.id }).from(masterGames).where(eq(masterGames.id, id)).limit(1);

    if (!existing) {
      res.status(404).json({
        data: null,
        error: { code: "NOT_FOUND", message: "Game not found" },
      });
      return;
    }

    const { title, firstReleaseYear, description, coverImageUrl, seriesId, alternativeTitles, genreIds } = req.body;
    const updateData: Record<string, unknown> = {};

    if (title !== undefined) {
      const slug = slugify(title);

      const [slugConflict] = await db
        .select({ id: masterGames.id })
        .from(masterGames)
        .where(and(eq(masterGames.slug, slug), sql`${masterGames.id} != ${id}`))
        .limit(1);

      if (slugConflict) {
        res.status(409).json({
          data: null,
          error: { code: "SLUG_TAKEN", message: `A game with the slug "${slug}" already exists` },
        });
        return;
      }

      updateData.title = title;
      updateData.slug = slug;
    }

    if (firstReleaseYear !== undefined) updateData.firstReleaseYear = firstReleaseYear;
    if (description !== undefined) updateData.description = description ?? null;
    if (coverImageUrl !== undefined) updateData.coverImageUrl = coverImageUrl ?? null;
    if (seriesId !== undefined) updateData.seriesId = seriesId ?? null;
    if (alternativeTitles !== undefined) updateData.alternativeTitles = alternativeTitles;

    if (Object.keys(updateData).length > 0) {
      await db.update(masterGames).set(updateData).where(eq(masterGames.id, id));
    }

    // Update genre associations if provided
    if (genreIds !== undefined) {
      // Remove existing genre associations
      await db.delete(masterGameGenres).where(eq(masterGameGenres.gameId, id));

      // Insert new genre associations
      if (genreIds.length > 0) {
        await db.insert(masterGameGenres).values(
          genreIds.map((genreId: number) => ({
            gameId: id,
            genreId,
          })),
        );
      }
    }

    // Fetch updated game with relations
    const game = await db.query.masterGames.findFirst({
      where: eq(masterGames.id, id),
      with: {
        series: true,
        genres: { with: { genre: true } },
      },
    });

    const data = game
      ? {
          ...game,
          genres: game.genres.map((g) => g.genre),
        }
      : null;

    res.json({ data, error: null });
  } catch (error) {
    console.error("Update game error:", error);
    res.status(500).json({
      data: null,
      error: { code: "INTERNAL_ERROR", message: "Failed to update game" },
    });
  }
});

// DELETE /:id — Delete master game (auth required)
router.delete("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({
        data: null,
        error: { code: "INVALID_ID", message: "Invalid game ID" },
      });
      return;
    }

    const [existing] = await db.select({ id: masterGames.id }).from(masterGames).where(eq(masterGames.id, id)).limit(1);

    if (!existing) {
      res.status(404).json({
        data: null,
        error: { code: "NOT_FOUND", message: "Game not found" },
      });
      return;
    }

    // Cascade delete is handled by DB foreign keys (ON DELETE CASCADE)
    await db.delete(masterGames).where(eq(masterGames.id, id));

    res.json({ data: { message: "Game deleted successfully" }, error: null });
  } catch (error) {
    console.error("Delete game error:", error);
    res.status(500).json({
      data: null,
      error: { code: "INTERNAL_ERROR", message: "Failed to delete game" },
    });
  }
});

// POST /:id/cover — Fetch cover art from SteamGridDB (auth required)
router.post("/:id/cover", authenticate, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ data: null, error: { code: "INVALID_ID", message: "Invalid game ID" } });
      return;
    }

    const [game] = await db
      .select({ id: masterGames.id, title: masterGames.title })
      .from(masterGames)
      .where(eq(masterGames.id, id))
      .limit(1);

    if (!game) {
      res.status(404).json({ data: null, error: { code: "NOT_FOUND", message: "Game not found" } });
      return;
    }

    // Dynamic import so the route file works even without SGDB
    const { fetchCoverUrl } = await import("../services/steamgriddb.js");
    const coverUrl = await fetchCoverUrl(game.title);

    if (!coverUrl) {
      res.status(404).json({
        data: null,
        error: { code: "COVER_NOT_FOUND", message: `No cover found for "${game.title}"` },
      });
      return;
    }

    // Store in DB
    await db.update(masterGames).set({ coverImageUrl: coverUrl, updatedAt: new Date() }).where(eq(masterGames.id, id));

    res.json({ data: { id, coverImageUrl: coverUrl }, error: null });
  } catch (error) {
    console.error("Cover fetch error:", error);
    res.status(500).json({ data: null, error: { code: "INTERNAL_ERROR", message: "Failed to fetch cover" } });
  }
});

// POST /bulk-cover — Fetch covers for games without one (batch, auth required)
router.post("/bulk-cover", authenticate, async (req: Request, res: Response) => {
  try {
    const { limit } = req.body as { limit?: number };
    const batchLimit = Math.min(limit ?? 10, 25);

    // Find games without cover art
    const gamesNeedingCovers = await db
      .select({ id: masterGames.id, title: masterGames.title })
      .from(masterGames)
      .where(or(sql`${masterGames.coverImageUrl} IS NULL`, eq(masterGames.coverImageUrl, "")))
      .orderBy(sql`RANDOM()`)
      .limit(batchLimit);

    if (gamesNeedingCovers.length === 0) {
      res.json({ data: { fetched: 0, message: "All games already have covers" }, error: null });
      return;
    }

    const { fetchCoverUrl } = await import("../services/steamgriddb.js");

    const results: Array<{ id: number; title: string; coverImageUrl: string | null }> = [];
    for (const game of gamesNeedingCovers) {
      // Small delay to respect SGDB rate limits
      await new Promise((r) => setTimeout(r, 200));
      const coverUrl = await fetchCoverUrl(game.title);
      if (coverUrl) {
        await db
          .update(masterGames)
          .set({ coverImageUrl: coverUrl, updatedAt: new Date() })
          .where(eq(masterGames.id, game.id));
      }
      results.push({ id: game.id, title: game.title, coverImageUrl: coverUrl });
    }

    const found = results.filter((r) => r.coverImageUrl).length;
    res.json({ data: { fetched: found, total: gamesNeedingCovers.length, results }, error: null });
  } catch (error) {
    console.error("Bulk cover fetch error:", error);
    res.status(500).json({ data: null, error: { code: "INTERNAL_ERROR", message: "Failed to fetch covers" } });
  }
});

export default router;
