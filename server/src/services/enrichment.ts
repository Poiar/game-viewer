// Game enrichment from external sources: IGDB, OpenCritic, HowLongToBeat
import { config } from "../config.js";

// ---------------------------------------------------------------------------
// IGDB (Twitch API v4)
// ---------------------------------------------------------------------------

interface IgdbGame {
  id: number;
  name: string;
  slug: string;
  summary?: string;
  first_release_date?: number;
  cover?: { id: number; url: string };
  genres?: { id: number; name: string }[];
  screenshots?: { id: number; url: string }[];
  game_modes?: { id: number; name: string }[];
  player_perspectives?: { id: number; name: string }[];
  age_ratings?: { id: number; category: number; rating: number }[];
  videos?: { video_id: string; name: string }[];
  franchise?: { id: number; name: string };
  external_games?: { id: number; uid: string; external_game_source: number }[];
  total_rating?: number;
  total_rating_count?: number;
}

async function igdbQuery<T>(endpoint: string, body: string): Promise<T | null> {
  if (!config.igdbClientId || !config.igdbAccessToken) return null;
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": config.igdbClientId,
      Authorization: `Bearer ${config.igdbAccessToken}`,
      "Content-Type": "text/plain",
    },
    body,
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

// IGDB cover size tokens, ascending resolution. We always upgrade to the
// highest-res cover variant: t_cover_big_2x is 2× t_cover_big (528×748 vs 264×374).
const IGDB_COVER_UPGRADES: Array<[string, string]> = [
  ["t_thumb", "t_cover_big_2x"],
  ["t_cover_small", "t_cover_big_2x"],
  ["t_cover_big", "t_cover_big_2x"],
];

export function getIgdbCoverUrl(coverUrl: string | undefined): string | undefined {
  if (!coverUrl) return undefined;
  let url = coverUrl.startsWith("//") ? "https:" + coverUrl : coverUrl;
  // Size tokens sit between slashes (/upload/<size>/<id>.jpg); match the slashes
  // so the t_cover_big rule never clobbers a t_cover_big_2x we just wrote.
  for (const [from, to] of IGDB_COVER_UPGRADES) {
    url = url.replace(`/${from}/`, `/${to}/`);
  }
  return url;
}

export async function searchIgdb(title: string): Promise<IgdbGame | null> {
  const results = await igdbQuery<IgdbGame[]>(
    "games",
    `search "${title}"; fields name,slug,summary,first_release_date,cover.url,genres.name,screenshots.url,game_modes.name,player_perspectives.name,age_ratings.category,age_ratings.rating,videos.video_id,videos.name,franchise.name,external_games.uid,external_games.external_game_source,total_rating,total_rating_count; limit 3;`,
  );
  if (!results?.length) return null;
  const exact = results.find((g) => g.name.toLowerCase() === title.toLowerCase());
  return exact ?? results[0];
}

// ---------------------------------------------------------------------------
// OpenCritic public API (Bearer token extracted from SPA, no RapidAPI needed).
// ---------------------------------------------------------------------------

const OC_BEARER = "Bearer R2tBRkdvUU9WSHpoUXpaSXVYa2g5cGU5NEFsWUgyeXQ=";

interface OpenCriticResult {
  id: number;
  name: string;
  score?: number;
  reviewCount?: number;
  url?: string;
}

export async function searchOpenCritic(title: string): Promise<OpenCriticResult | null> {
  try {
    // Step 1: Search by title
    const metaUrl = `https://api.opencritic.com/api/meta/search?criteria=${encodeURIComponent(title)}`;
    const metaRes = await fetch(metaUrl, {
      headers: {
        Authorization: OC_BEARER,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
        Origin: "https://opencritic.com",
        Referer: "https://opencritic.com/search",
      },
    });
    if (!metaRes.ok) return null;
    const hits = (await metaRes.json()) as { id: number; name: string; relation: string; dist: number }[];
    const games = hits.filter((h) => h.relation === "game");
    if (!games.length) return null;

    const exact = games.find((g) => g.name.toLowerCase() === title.toLowerCase());
    const match = exact ?? games[0];

    // Step 2: Get critic score
    const ratingUrl = `https://api.opencritic.com/api/ratings/game/${match.id}`;
    const ratingRes = await fetch(ratingUrl, {
      headers: {
        Authorization: OC_BEARER,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
        Origin: "https://opencritic.com",
        Referer: "https://opencritic.com/",
      },
    });
    let score: number | undefined;
    let reviewCount: number | undefined;
    if (ratingRes.ok) {
      const rating = (await ratingRes.json()) as { median?: number; count?: number };
      score = rating.median;
      reviewCount = rating.count;
    }

    return {
      id: match.id,
      name: match.name,
      score,
      reviewCount,
      url: `https://opencritic.com/game/${match.id}`,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// HowLongToBeat
// ---------------------------------------------------------------------------

interface HltbResult {
  id: number;
  name: string;
  mainTime?: number; // hours
}

export async function searchHltb(title: string): Promise<HltbResult | null> {
  try {
    const hltbHeaders = {
      Referer: "https://howlongtobeat.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "application/json",
      Origin: "https://howlongtobeat.com",
    };

    // Step 1: Get auth token from init endpoint
    const initRes = await fetch(`https://howlongtobeat.com/api/bleed/init?t=${Date.now()}`, {
      headers: hltbHeaders,
    });
    if (!initRes.ok) return null;
    const initData = (await initRes.json()) as { token?: string; hpKey?: string; hpVal?: string };
    if (!initData.token) return null;

    // Step 2: Search with the token
    const searchBody: Record<string, unknown> = {
      searchType: "games",
      searchTerms: title.split(" "),
      searchPage: 1,
      size: 5,
      searchOptions: {
        games: {
          userId: 0,
          platform: "",
          sortCategory: "popular",
          rangeCategory: "main",
          rangeTime: { min: null, max: null },
          gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
          rangeYear: { min: "", max: "" },
          modifier: "",
        },
        users: { sortCategory: "postcount" },
        lists: { sortCategory: "follows" },
        filter: "",
        sort: 0,
        randomizer: 0,
      },
      useCache: true,
    };
    if (initData.hpKey) {
      searchBody[initData.hpKey] = initData.hpVal;
    }

    const res = await fetch("https://howlongtobeat.com/api/bleed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...hltbHeaders,
        "x-auth-token": initData.token,
        ...(initData.hpKey && initData.hpVal
          ? {
              "x-hp-key": initData.hpKey,
              "x-hp-val": initData.hpVal,
            }
          : {}),
      },
      body: JSON.stringify(searchBody),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const data = json.data;
    if (!data?.length) return null;
    const exact = data.find((g: any) => g.game_name?.toLowerCase() === title.toLowerCase());
    const match = exact ?? data[0];
    return {
      id: match.game_id,
      name: match.game_name,
      mainTime: match.comp_main ? Math.round(match.comp_main / 3600) : undefined,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Full enrichment pipeline
// ---------------------------------------------------------------------------

export interface EnrichmentResult {
  igdbId?: number;
  igdbUrl?: string;
  igdbCoverUrl?: string;
  igdbSummary?: string;
  igdbGenres?: string[];
  igdbScreenshots?: string[];
  igdbGameModes?: string[];
  igdbPlayerPerspectives?: string[];
  igdbAgeRating?: string;
  igdbTrailerUrl?: string;
  igdbFranchise?: string;
  igdbSteamAppId?: number;
  igdbTotalRating?: number;
  igdbTotalRatingCount?: number;
  opencriticId?: number;
  opencriticScore?: number;
  hltbId?: number;
  hltbTime?: number;
}

export async function enrichGame(title: string): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {};

  // IGDB
  const igdb = await searchIgdb(title);
  if (igdb) {
    result.igdbId = igdb.id;
    result.igdbUrl = `https://www.igdb.com/games/${igdb.slug}`;
    result.igdbCoverUrl = getIgdbCoverUrl(igdb.cover?.url);
    result.igdbSummary = igdb.summary ?? undefined;
    result.igdbGenres = igdb.genres?.map((g) => g.name).filter((n): n is string => !!n) as string[] | undefined;
    result.igdbScreenshots = igdb.screenshots
      ?.map((s) => (s.url?.startsWith("//") ? "https:" + s.url.replace("t_thumb", "t_screenshot_big") : s.url))
      .filter((u): u is string => !!u && !u.includes("nocover"));
    result.igdbGameModes = igdb.game_modes?.map((m) => m.name).filter(Boolean) as string[] | undefined;
    result.igdbPlayerPerspectives = igdb.player_perspectives?.map((p) => p.name).filter(Boolean) as
      | string[]
      | undefined;
    result.igdbTotalRating = igdb.total_rating ? Math.round(igdb.total_rating) : undefined;
    result.igdbTotalRatingCount = igdb.total_rating_count ?? undefined;

    // Age rating — convert IGDB category enum to human-readable label
    if (igdb.age_ratings?.length) {
      const catMap: Record<number, string> = { 1: "ESRB", 2: "PEGI" };
      const ratingMap: Record<number, string> = {
        6: "RP",
        7: "EC",
        8: "E",
        9: "E10+",
        10: "T",
        11: "M",
        12: "AO",
      };
      const ar = igdb.age_ratings[0];
      const cat = catMap[ar.category] ?? "";
      const rating = ratingMap[ar.rating] ?? `${ar.rating}`;
      result.igdbAgeRating = cat ? `${cat} ${rating}` : rating;
    }

    // Trailer / video
    if (igdb.videos?.length) {
      const vid = igdb.videos[0];
      result.igdbTrailerUrl = `https://www.youtube.com/watch?v=${vid.video_id}`;
    }

    // Franchise
    result.igdbFranchise = igdb.franchise?.name;

    // Steam AppID from external_games
    const steam = igdb.external_games?.find((e) => e.external_game_source === 1); // 1 = Steam
    if (steam) result.igdbSteamAppId = parseInt(steam.uid, 10) || undefined;
  }

  // OpenCritic
  const oc = await searchOpenCritic(title);
  if (oc) {
    result.opencriticId = oc.id;
    result.opencriticScore = oc.score;
  }

  // HLTB
  const hltb = await searchHltb(title);
  if (hltb) {
    result.hltbId = hltb.id;
    result.hltbTime = hltb.mainTime;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Steam concurrent player counts (public API, no auth needed)
// ---------------------------------------------------------------------------

export async function fetchSteamPlayers(steamAppId: number): Promise<{
  players: number;
  asOf: Date;
} | null> {
  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${steamAppId}`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const players = json?.response?.player_count;
    if (typeof players !== "number") return null;
    return { players, asOf: new Date() };
  } catch {
    return null;
  }
}
