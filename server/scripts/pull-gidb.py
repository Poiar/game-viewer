#!/usr/bin/env python3
"""Pull covers + metadata from the GIDB canonical store into game-viewer.

Read-only against GIDB's SQLite store; writes only into game-viewer's Postgres.
Reuses GIDB's own `normalize` for slug/alias resolution (no matching logic
reimplemented here). Re-runnable: safe to run repeatedly; each run refreshes
whatever GIDB has newly enriched.

Run (from the game-viewer/server dir):
    uv run --with "psycopg[binary]" scripts/pull-gidb.py

Env overrides: GIDB_DIR, GIDB_DB, DATABASE_URL (else parsed from ../.env).
"""
import os
import sys
import json
from collections import defaultdict

# --- paths / env -----------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.dirname(HERE)  # game-viewer/server

GIDB_DIR = os.environ.get("GIDB_DIR", r"C:\projects\gidb")
GIDB_DB = os.environ.get("GIDB_DB", os.path.join(GIDB_DIR, "data", "games.db"))
sys.path.insert(0, GIDB_DIR)
from normalize import slug as make_slug  # noqa: E402

import psycopg  # noqa: E402
import sqlite3  # noqa: E402


def read_database_url():
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    env_path = os.path.join(SERVER_DIR, ".env")
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1]
    raise RuntimeError("DATABASE_URL not found in env or server/.env")


# ---------------------------------------------------------------------------
# GIDB genre name -> game-viewer genre name. Conservative: only names with an
# unambiguous match. Ambiguous IGDB names (Strategy, Simulator, Action,
# Adventure, Indie, ...) are deliberately skipped so we never inject a wrong
# genre into the user's curated taxonomy.
# ---------------------------------------------------------------------------
GENRE_MAP = {
    "role-playing (rpg)": "RPG",
    "rpg": "RPG",
    "shooter": "FPS",
    "puzzle": "Puzzle",
    "platform": "2D Platformer",
    "racing": "Driving",
    "sport": "Sport",
    "sports": "Sport",
    "fighting": "Fighting",
    "hack and slash/beat 'em up": "Hack 'n' Slash",
    "sandbox": "Sandbox",
    "open world": "Open world",
    "turn-based strategy (tbs)": "Turn-based strategy",
    "real time strategy (rts)": "RTS",
    "point-and-click": "Point and click",
    "shoot 'em up": "Shoot 'em up",
    "metroidvania": "Metroidvania",
    "roguelike": "Roguelike",
    "pinball": "Pinball",
    "quiz/trivia": "Quiz",
    "stealth": "Stealth",
}

# GIDB's own canonical score priority (metacritic beats opencritic beats
# criticdb beats igdb). Mirrors gameinfo.SCORE_PRIORITY.
SCORE_PRIORITY = {"metacritic": 4, "opencritic": 3, "criticdb": 2, "igdb": 1}


def load_gidb():
    con = sqlite3.connect(f"file:{GIDB_DB}?mode=ro", uri=True, timeout=30)
    con.execute("PRAGMA busy_timeout=30000")

    # title-level slug -> game_id; lower(alias) -> game_id (first wins)
    slug_to_gid = {r[0]: r[1] for r in con.execute("SELECT slug, game_id FROM game")}
    alias_to_gid = {}
    for name, gid in con.execute("SELECT name, game_id FROM game_alias"):
        alias_to_gid.setdefault(name.lower(), gid)

    # game_id -> primary edition_id (the 'original' incarnation, else lowest
    # edition_id). gidb split its old `kind` into incarnation / contents /
    # packaging; the version axis that says "original" here is incarnation.
    by_gid = defaultdict(list)
    for eid, gid, incarnation in con.execute(
            "SELECT edition_id, game_id, incarnation FROM edition"):
        by_gid[gid].append((eid, incarnation))
    gid_to_eid = {}
    for gid, eds in by_gid.items():
        originals = [e for e in eds if e[1] == "original"]
        pool = originals if originals else eds
        gid_to_eid[gid] = min(eid for eid, _ in pool)

    # edition_id -> record
    ed = {}
    for eid, summary, is_dlc, is_slop in con.execute(
        "SELECT edition_id, summary, is_dlc, is_slop FROM edition"
    ):
        ed[eid] = {
            "summary": (summary or "").strip() or None,
            "is_dlc": bool(is_dlc),
            "is_slop": bool(is_slop),
            "cover": None,
            "scores": [],
            "genres": [],
            "devs": [],
            "pubs": [],
            "steam": None,
            "igdb": None,
            "opencritic": None,
            "hltb": None,
            "hltb_time": None,
            "current_low": None,
            "historical_low": None,
            "price_currency": None,
            "shots": [],
        }

    # covers: primary first, then any
    for eid, local_path in con.execute(
        "SELECT edition_id, local_path FROM art WHERE kind='cover' AND is_primary=1"
    ):
        if eid in ed and ed[eid]["cover"] is None:
            ed[eid]["cover"] = local_path
    for eid, local_path in con.execute(
        "SELECT edition_id, local_path FROM art WHERE kind='cover'"
    ):
        if eid in ed and ed[eid]["cover"] is None:
            ed[eid]["cover"] = local_path

    # genres (IGDB-sourced only, to avoid the localized noise from other sources)
    for eid, name in con.execute(
        "SELECT gg.edition_id, g.name FROM game_genre gg "
        "JOIN genre g ON g.genre_id=gg.genre_id "
        "JOIN source s ON s.source_id=gg.source_id WHERE s.key='igdb'"
    ):
        if eid in ed:
            mapped = GENRE_MAP.get((name or "").lower())
            if mapped and mapped not in ed[eid]["genres"]:
                ed[eid]["genres"].append(mapped)

    # scores
    for eid, key, score in con.execute(
        "SELECT gs.edition_id, s.key, gs.score FROM game_score gs "
        "JOIN source s ON s.source_id=gs.source_id"
    ):
        if eid in ed:
            ed[eid]["scores"].append((key, score))

    # companies
    for eid, role, name in con.execute(
        "SELECT gc.edition_id, gc.role, c.name FROM game_company gc "
        "JOIN company c ON c.company_id=gc.company_id"
    ):
        if eid not in ed or not name:
            continue
        (ed[eid]["devs"] if role == "developer" else ed[eid]["pubs"]).append(name)

    # external IDs (steam / igdb / opencritic / hltb)
    for eid, key, ext in con.execute(
        "SELECT x.edition_id, s.key, x.external_id FROM external_id x "
        "JOIN source s ON s.source_id=x.source_id "
        "WHERE s.key IN ('steam','igdb','opencritic','hltb')"
    ):
        if eid in ed and key in ("steam", "igdb", "opencritic", "hltb"):
            ed[eid][key] = ext

    # HLTB completion times (main story hours)
    for eid, hours in con.execute(
        "SELECT edition_id, hours FROM game_time WHERE kind='main'"
    ):
        if eid in ed:
            ed[eid]["hltb_time"] = hours

    # Best current + historical low across ALL price sources (itad / aks /
    # ggdeals): the cheapest current offer and lowest all-time price win,
    # keyshop or retail. ggdeals keyshop rows are ref=<appid> (no ':retail'),
    # so their lower prices naturally beat retail rows here.
    best = {}  # eid -> [currency, current_low, historical_low]
    for eid, currency, cur, hist in con.execute(
        "SELECT edition_id, currency, current_low, historical_low FROM game_price"
    ):
        if eid not in ed:
            continue
        b = best.get(eid)
        if b is None:
            best[eid] = [currency, cur, hist]
            continue
        if cur is not None and (b[1] is None or cur < b[1]):
            b[1] = cur
            b[0] = currency
        if hist is not None and (b[2] is None or hist < b[2]):
            b[2] = hist
    for eid, (currency, cur, hist) in best.items():
        ed[eid]["price_currency"] = currency
        ed[eid]["current_low"] = cur
        ed[eid]["historical_low"] = hist

    # screenshots (IGDB CDN URLs; upgrade size token, keep first 5)
    for eid, url in con.execute(
        "SELECT edition_id, url FROM art WHERE kind='screenshot' AND url IS NOT NULL "
        "ORDER BY edition_id, art_id"
    ):
        if eid in ed and len(ed[eid]["shots"]) < 5:
            ed[eid]["shots"].append(url.replace("t_screenshot_med", "t_screenshot_big"))

    con.close()
    return slug_to_gid, alias_to_gid, gid_to_eid, ed


def canonical_score(rec):
    if not rec["scores"]:
        return None
    pool = rec["scores"]
    if rec["is_dlc"] or rec["is_slop"]:
        pool = [s for s in pool if s[0] != "igdb"]
    if not pool:
        return None
    best = max(pool, key=lambda s: (SCORE_PRIORITY.get(s[0], 0), s[1] or 0))
    return round(best[1]) if best[1] is not None else None


def _to_int(s):
    if s is None:
        return None
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


def main():
    slug_to_gid, alias_to_gid, gid_to_eid, ed = load_gidb()

    with psycopg.connect(read_database_url()) as pg:
        games = pg.execute("SELECT id, title FROM master_games ORDER BY id").fetchall()

        # existing game-viewer genres + genre links (to know which games to skip)
        genre_id_by_name = {r[1]: r[0] for r in pg.execute("SELECT id, name FROM genres")}
        games_with_genres = {
            r[0] for r in pg.execute("SELECT DISTINCT game_id FROM master_game_genres")
        }

        stats = {"cover": 0, "summary": 0, "score": 0, "company": 0, "genres": 0, "steam": 0, "igdb": 0, "oc": 0, "hltb": 0, "price": 0, "shots": 0, "matched": 0}
        for gid, title in games:
            gv_id = gid
            eid = gid_to_eid.get(slug_to_gid.get(make_slug(title)))
            if eid is None:
                eid = gid_to_eid.get(alias_to_gid.get(title.lower()))
            if eid is None or eid not in ed:
                continue
            rec = ed[eid]
            stats["matched"] += 1

            cover_url = f"/gicovers/{rec['cover']}" if rec["cover"] else None
            score = canonical_score(rec)
            dev = ", ".join(sorted(set(rec["devs"])))[:255] or None
            pub = ", ".join(sorted(set(rec["pubs"])))[:255] or None
            steam = _to_int(rec["steam"])
            igdb = _to_int(rec["igdb"])
            oc = _to_int(rec["opencritic"])
            hltb = _to_int(rec["hltb"])
            hltb_time = round(rec["hltb_time"]) if rec["hltb_time"] is not None else None
            shots = json.dumps(rec["shots"]) if rec["shots"] else None

            pg.execute(
                "UPDATE master_games SET cover_image_url=COALESCE(%s, cover_image_url), "
                "summary=COALESCE(%s, summary), critic_score=COALESCE(%s, critic_score), "
                "developer=COALESCE(%s, developer), publisher=COALESCE(%s, publisher), "
                "steam_app_id=COALESCE(%s, steam_app_id), igdb_id=COALESCE(%s, igdb_id), "
                "opencritic_id=COALESCE(%s, opencritic_id), "
                "hltb_id=COALESCE(%s, hltb_id), hltb_time=COALESCE(%s, hltb_time), "
                "screenshots=COALESCE(%s::jsonb, screenshots), "
                "current_low=%s, historical_low=%s, price_currency=%s "
                "WHERE id=%s",
                (cover_url, rec["summary"], score, dev, pub, steam, igdb, oc, hltb, hltb_time, shots,
                 rec["current_low"], rec["historical_low"], rec["price_currency"], gv_id),
            )
            if cover_url:
                stats["cover"] += 1
            if rec["summary"]:
                stats["summary"] += 1
            if score is not None:
                stats["score"] += 1
            if dev or pub:
                stats["company"] += 1
            if steam:
                stats["steam"] += 1
            if igdb:
                stats["igdb"] += 1
            if oc:
                stats["oc"] += 1
            if hltb:
                stats["hltb"] += 1
            if rec["current_low"] is not None:
                stats["price"] += 1
            if shots:
                stats["shots"] += 1

            # genres: only fill gaps (never clobber the user's curated genres)
            if gv_id not in games_with_genres and rec["genres"]:
                for name in rec["genres"]:
                    genre_id = genre_id_by_name.get(name)
                    if genre_id is None:
                        cur = pg.execute(
                            "INSERT INTO genres (name, slug) VALUES (%s, %s) "
                            "ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name "
                            "RETURNING id",
                            (name, name.lower().replace(" ", "-").replace("'", "")),
                        )
                        genre_id = cur.fetchone()[0]
                        genre_id_by_name[name] = genre_id
                    pg.execute(
                        "INSERT INTO master_game_genres (game_id, genre_id) VALUES (%s, %s) "
                        "ON CONFLICT DO NOTHING",
                        (gv_id, genre_id),
                    )
                    stats["genres"] += 1

    print(f"games in game-viewer : {len(games)}")
    print(f"matched to GIDB      : {stats['matched']}")
    print(f"  covers written     : {stats['cover']}")
    print(f"  summaries written  : {stats['summary']}")
    print(f"  scores written     : {stats['score']}")
    print(f"  dev/publisher      : {stats['company']}")
    print(f"  genre links added  : {stats['genres']} (gap-fill only)")
    print(f"  steam appids       : {stats['steam']}")
    print(f"  igdb ids           : {stats['igdb']}")
    print(f"  opencritic ids     : {stats['oc']}")
    print(f"  hltb ids           : {stats['hltb']}")
    print(f"  price rows         : {stats['price']}")
    print(f"  screenshot sets    : {stats['shots']}")


if __name__ == "__main__":
    main()
