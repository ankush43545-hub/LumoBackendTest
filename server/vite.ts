import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function log(message: string, source = "server") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

/**
 * Serve static built client files.
 * Expects built client at <repo-root>/client/dist
 * If not present, this function does nothing (API-only mode).
 */
export function serveStatic(app: Express) {
  // production client build directory (common convention)
  const distPath = path.resolve(process.cwd(), "client", "dist");

  if (!fs.existsSync(distPath)) {
    log(`client dist not found at ${distPath} — starting API-only server`, "server");
    return;
  }

  app.use(express.static(distPath, { index: false }));

  // fall through to index.html for SPA routing
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });

  log(`serving static client from ${distPath}`, "server");
}
