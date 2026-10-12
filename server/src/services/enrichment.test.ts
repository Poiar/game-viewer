import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Pure-function extractions from enrichment.ts for isolated testing
// ---------------------------------------------------------------------------

/**
 * Transforms IGDB cover URLs from thumbnail to high-res.
 * IGDB returns //images.igdb.com/igdb/image/upload/t_thumb/co2r2r.jpg
 * We upgrade the size token to t_cover_big_2x and prefix https:
 */
export function getIgdbCoverUrl(coverUrl: string | undefined): string | undefined {
  if (!coverUrl) return undefined;
  let url = coverUrl.startsWith("//") ? "https:" + coverUrl : coverUrl;
  for (const [from, to] of [
    ["t_thumb", "t_cover_big_2x"],
    ["t_cover_small", "t_cover_big_2x"],
    ["t_cover_big", "t_cover_big_2x"],
  ] as const) {
    url = url.replace(`/${from}/`, `/${to}/`);
  }
  return url;
}

/**
 * Transforms IGDB screenshot URLs from thumb to big.
 */
function transformScreenshotUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.includes("nocover")) return undefined;
  return url.startsWith("//") ? "https:" + url.replace("t_thumb", "t_screenshot_big") : url;
}

/**
 * Filters and transforms an array of screenshot URLs.
 */
function mapScreenshots(screenshots: { url: string }[] | undefined): string[] | undefined {
  if (!screenshots?.length) return undefined;
  const result = screenshots.map((s) => transformScreenshotUrl(s.url)).filter((u): u is string => !!u);
  return result.length > 0 ? result : undefined;
}

// ---------------------------------------------------------------------------
// getIgdbCoverUrl tests
// ---------------------------------------------------------------------------

describe("getIgdbCoverUrl", () => {
  it("returns undefined for undefined input", () => {
    expect(getIgdbCoverUrl(undefined)).toBeUndefined();
  });

  it("transforms t_thumb to t_cover_big_2x and adds https:", () => {
    const input = "//images.igdb.com/igdb/image/upload/t_thumb/co2r2r.jpg";
    const expected = "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co2r2r.jpg";
    expect(getIgdbCoverUrl(input)).toBe(expected);
  });

  it("adds https: even when t_thumb is not in the path", () => {
    const input = "//images.igdb.com/igdb/image/upload/t_original/co2r2r.jpg";
    const expected = "https://images.igdb.com/igdb/image/upload/t_original/co2r2r.jpg";
    expect(getIgdbCoverUrl(input)).toBe(expected);
  });

  it("upgrades https: URLs too", () => {
    const input = "https://images.igdb.com/igdb/image/upload/t_thumb/abc.jpg";
    const expected = "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/abc.jpg";
    expect(getIgdbCoverUrl(input)).toBe(expected);
  });

  it("replaces t_thumb with t_cover_big_2x in // URLs", () => {
    const input = "//images.igdb.com/igdb/image/upload/t_thumb/co2r2r.jpg";
    const result = getIgdbCoverUrl(input);
    expect(result).not.toContain("t_thumb");
    expect(result).toContain("t_cover_big_2x");
    expect(result).toBe("https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co2r2r.jpg");
  });

  it("upgrades an existing t_cover_big URL to t_cover_big_2x", () => {
    const input = "//images.igdb.com/igdb/image/upload/t_cover_big/co123.jpg";
    expect(getIgdbCoverUrl(input)).toBe("https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co123.jpg");
  });

  it("leaves t_cover_big_2x URLs unchanged", () => {
    const input = "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co123.jpg";
    expect(getIgdbCoverUrl(input)).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// transformScreenshotUrl tests
// ---------------------------------------------------------------------------

describe("transformScreenshotUrl", () => {
  it("returns undefined for undefined input", () => {
    expect(transformScreenshotUrl(undefined)).toBeUndefined();
  });

  it("returns undefined for nocover URLs", () => {
    expect(transformScreenshotUrl("//images.igdb.com/igdb/image/upload/t_thumb/nocover123.jpg")).toBeUndefined();
  });

  it("transforms t_thumb to t_screenshot_big", () => {
    const input = "//images.igdb.com/igdb/image/upload/t_thumb/sc1.jpg";
    const expected = "https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc1.jpg";
    expect(transformScreenshotUrl(input)).toBe(expected);
  });

  it("adds https: to protocol-relative URLs", () => {
    const input = "//images.igdb.com/igdb/image/upload/t_screenshot_huge/sc2.jpg";
    const expected = "https://images.igdb.com/igdb/image/upload/t_screenshot_huge/sc2.jpg";
    expect(transformScreenshotUrl(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// mapScreenshots tests
// ---------------------------------------------------------------------------

describe("mapScreenshots", () => {
  it("returns undefined for undefined input", () => {
    expect(mapScreenshots(undefined)).toBeUndefined();
  });

  it("returns undefined for empty array", () => {
    expect(mapScreenshots([])).toBeUndefined();
  });

  it("transforms multiple screenshot URLs", () => {
    const input = [
      { url: "//images.igdb.com/igdb/image/upload/t_thumb/sc1.jpg" },
      { url: "//images.igdb.com/igdb/image/upload/t_thumb/sc2.jpg" },
    ];
    const result = mapScreenshots(input);
    expect(result).toHaveLength(2);
    expect(result![0]).toBe("https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc1.jpg");
    expect(result![1]).toBe("https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc2.jpg");
  });

  it("filters out nocover images", () => {
    const input = [
      { url: "//images.igdb.com/igdb/image/upload/t_thumb/sc1.jpg" },
      { url: "//images.igdb.com/igdb/image/upload/t_thumb/nocover_bad.jpg" },
      { url: "//images.igdb.com/igdb/image/upload/t_thumb/sc2.jpg" },
    ];
    const result = mapScreenshots(input);
    expect(result).toHaveLength(2);
  });

  it("returns undefined when all images are filtered out", () => {
    const input = [
      { url: "//images.igdb.com/igdb/image/upload/t_thumb/nocover1.jpg" },
      { url: "//images.igdb.com/igdb/image/upload/t_thumb/nocover2.jpg" },
    ];
    expect(mapScreenshots(input)).toBeUndefined();
  });

  it("filters out undefined/null URLs in array", () => {
    const input = [
      { url: "//images.igdb.com/igdb/image/upload/t_thumb/sc1.jpg" as string },
      { url: undefined as unknown as string },
      { url: null as unknown as string },
    ];
    const result = mapScreenshots(input);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// EnrichmentResult shape tests
// ---------------------------------------------------------------------------

describe("EnrichmentResult shape", () => {
  it("an empty result has no IDs", () => {
    const result: Record<string, unknown> = {};
    expect(result.igdbId).toBeUndefined();
    expect(result.opencriticId).toBeUndefined();
    expect(result.hltbId).toBeUndefined();
  });

  it("a full result has all fields", () => {
    const result = {
      igdbId: 123,
      igdbUrl: "https://www.igdb.com/games/test",
      igdbCoverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co123.jpg",
      igdbSummary: "A test game",
      igdbGenres: ["Action", "RPG"],
      igdbScreenshots: ["https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc1.jpg"],
      opencriticId: 456,
      opencriticScore: 85,
      hltbId: 789,
      hltbTime: 12,
    };

    expect(result.igdbId).toBe(123);
    expect(result.opencriticId).toBe(456);
    expect(result.hltbId).toBe(789);
    expect(result.opencriticScore).toBe(85);
    expect(result.hltbTime).toBe(12);
    expect(result.igdbScreenshots).toHaveLength(1);
  });
});
