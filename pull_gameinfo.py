#!/usr/bin/env python3
"""Pull enrichment from gidb's canonical DB into game-viewer (Postgres).

gidb is the single source of truth for game metadata (Steam/SGDB/
IGDB/Wikipedia + CriticDB/IGDB scores). This maps each `master_game` to its
canonical record (by normalized title) and copies: igdb/steam ids, summary,
critic score, franchise/series, release year, genres, screenshots, alternative
titles, and the primary cover.

Idempotent and read-only w.r.t. game-viewer's identity: title/slug and any
existing id/score/year are preserved (COALESCE); store-authoritative text and
relations (summary, genres, franchise, alternative titles, screenshots) are
overwritten. Safe to re-run daily (cron) or after the store's marathon grows.

Run:  DATABASE_URL=postgresql://... python3 pull_gameinfo.py
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, r"C:\projects\gidb")

import gameinfo

COVER_BASE = os.environ.get("COVER_BASE", "http://127.0.0.1:8780/covers/")


def pick_score(rec):
    scores = rec.get("scores") or []
    if not scores:
        return None
    for src in ("criticdb", "igdb"):
        for s in scores:
            if s.get("source") == src:
                return s
    return scores[0]


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def genre_id(cur, name):
    """Lookup a genre by name (case-insensitive), insert if absent. Idempotent."""
    cur.execute("SELECT id FROM genres WHERE lower(name) = lower(%s) LIMIT 1", (name,))
    r = cur.fetchone()
    if r:
        return r[0]
    slug = slugify(name)
    cur.execute("SELECT id FROM genres WHERE slug = %s LIMIT 1", (slug,))
    r = cur.fetchone()
    if r:
        return r[0]
    cur.execute(
        "INSERT INTO genres (name, slug) VALUES (%s, %s) "
        "ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id",
        (name, slug),
    )
    return cur.fetchone()[0]


def main():
    import psycopg2
    from psycopg2.extras import Json

    url = os.environ["DATABASE_URL"]
    con = psycopg2.connect(url)
    cur = con.cursor()

    cur.execute("SELECT id, title FROM master_games")
    rows = cur.fetchall()

    cache = {}
    n_match = n_score = n_cover = n_genre = 0
    for gid, title in rows:
        rec = cache.get(title)
        if rec is None:
            rec = gameinfo.lookup(title)
            cache[title] = rec
        if not rec:
            continue
        n_match += 1

        igdb = rec["external_ids"].get("igdb")
        steam = rec["external_ids"].get("steam")
        score = pick_score(rec)
        summary = rec.get("summary")
        franchise = rec["series"][0] if rec.get("series") else None
        year = rec.get("release_year")
        genres = rec.get("genres") or []
        aliases = rec.get("aliases") or []
        art = rec.get("art") or []
        cover = next((a["local_path"] for a in art
                      if a.get("kind") == "cover" and a.get("primary")), None)
        if not cover:
            cover = next((a["local_path"] for a in art
                          if a.get("kind") == "cover"), None)
        screenshots = [a["url"] for a in art if a.get("kind") == "screenshot"
                       and a.get("url")]

        if score:
            n_score += 1
        if cover:
            n_cover += 1
        if genres:
            n_genre += 1

        cur.execute(
            """UPDATE master_games SET
                 igdb_id = COALESCE(igdb_id, %s),
                 steam_app_id = COALESCE(steam_app_id, %s),
                 critic_score = COALESCE(critic_score, %s),
                 summary = %s,
                 franchise = %s,
                 first_release_year = COALESCE(first_release_year, %s),
                 cover_image_url = COALESCE(cover_image_url, %s),
                 alternative_titles = %s,
                 screenshots = %s,
                 updated_at = now()
               WHERE id = %s""",
            (int(igdb) if igdb else None,
             int(steam) if steam else None,
             int(round(score["score"])) if score else None,
             summary,
             franchise,
             year,
             (COVER_BASE + cover) if cover else None,
             Json(aliases),
             Json(screenshots),
             gid))

        # Genre junction — replace wholesale (store is authoritative), dedup.
        cur.execute("DELETE FROM master_game_genres WHERE game_id = %s", (gid,))
        for name in dict.fromkeys(genres):
            cur.execute(
                "INSERT INTO master_game_genres (game_id, genre_id) VALUES (%s, %s) "
                "ON CONFLICT DO NOTHING",
                (gid, genre_id(cur, name)))

    con.commit()
    print(f"pulled enrichment for {n_match}/{len(rows)} games: "
          f"{n_score} scored, {n_cover} covers, {n_genre} genres")
    con.close()


if __name__ == "__main__":
    main()
