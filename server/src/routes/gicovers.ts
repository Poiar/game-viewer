import { Router } from "express";
import { existsSync } from "fs";
import path from "path";
import { config } from "../config.js";

// Serves GIDB's cover-art tree at /gicovers/<local_path> where <local_path>
// is GIDB's `art.local_path` (e.g. "covers/68816.png", relative to static/).
// The images stay in the GIDB store — never copied into game-viewer.
const router = Router();

const STATIC_ROOT = path.resolve(config.gidbStaticDir);

router.get("*", (req, res) => {
  // req.path is relative to the mount point ("/gicovers") — e.g. "/covers/68816.png".
  const rel = String(req.path ?? "").replace(/^\/+/, "");
  const abs = path.resolve(STATIC_ROOT, rel);

  // Path-traversal guard: the resolved path must stay inside STATIC_ROOT.
  // Encoded ".." (%2e%2e) stays a literal filename here (no decode), so it can
  // only 404, never escape.
  if (abs !== STATIC_ROOT && !abs.startsWith(STATIC_ROOT + path.sep)) {
    res.status(403).send("Forbidden");
    return;
  }
  if (!existsSync(abs)) {
    res.status(404).send("Not found");
    return;
  }
  res.sendFile(abs);
});

export default router;
