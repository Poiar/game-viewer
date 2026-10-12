// One-shot migration: upgrade existing IGDB cover art to high-res.
// Rewrites cover_image_url values from t_thumb / t_cover_small / t_cover_big
// to t_cover_big_2x (2× resolution) so already-enriched games get sharper
// covers without re-running the scraper. SteamGridDB and other non-IGDB URLs
// are left untouched.
//
// Run: npx tsx src/db/upgrade-covers.ts  (from server/ directory)

import "dotenv/config";
import { db } from "./index.js";
import { masterGames } from "./schema.js";
import { eq } from "drizzle-orm";

const UPGRADES: Array<[string, string]> = [
  ["t_thumb", "t_cover_big_2x"],
  ["t_cover_small", "t_cover_big_2x"],
  ["t_cover_big", "t_cover_big_2x"],
];

function upgradeCoverUrl(url: string | null): string | null {
  if (!url) return url;
  let next = url;
  // Size tokens sit between slashes (/upload/<size>/<id>.jpg); matching the
  // slashes prevents the t_cover_big rule from re-writing t_cover_big_2x.
  for (const [from, to] of UPGRADES) {
    next = next.replace(`/${from}/`, `/${to}/`);
  }
  return next;
}

async function main() {
  console.log("[upgrade-covers] Loading games...");
  const games = await db.select({ id: masterGames.id, coverImageUrl: masterGames.coverImageUrl }).from(masterGames);

  let upgraded = 0;
  let skipped = 0;
  for (const game of games) {
    const next = upgradeCoverUrl(game.coverImageUrl);
    if (!next || next === game.coverImageUrl) {
      skipped++;
      continue;
    }
    await db.update(masterGames).set({ coverImageUrl: next, updatedAt: new Date() }).where(eq(masterGames.id, game.id));
    upgraded++;
    if (upgraded % 50 === 0) console.log(`[upgrade-covers] Progress: ${upgraded}`);
  }

  console.log(`[upgrade-covers] Done — upgraded ${upgraded}, skipped ${skipped}, total ${games.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[upgrade-covers] Error:", err);
  process.exit(1);
});
