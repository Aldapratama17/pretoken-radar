/**
 * make.fun board dossier builder.
 * Builds the JSON summary the judge reads from the output directory.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";

export interface DossierOptions {
  text_max_bytes: number;
  screenshots: { max: number; max_bytes: number };
  dashboard: { max_files: number; max_bytes: number };
}

export interface Dossier {
  cover: number;
  images: { base64: string }[];
  texts: { path: string; text: string }[];
}

/**
 * Read a file as base64.
 */
function readBase64(path: string): string {
  return readFileSync(path).toString("base64");
}

/**
 * Read a text file, truncated to maxBytes.
 */
function readTextTruncated(path: string, maxBytes: number): string {
  const buf = readFileSync(path);
  if (buf.length <= maxBytes) return buf.toString("utf8");
  return buf.subarray(0, maxBytes).toString("utf8") + "\n…";
}

/**
 * Build the dossier from an output directory.
 */
export function buildDossier(outputDir: string, opts: DossierOptions): string {
  const texts: { path: string; text: string }[] = [];
  const images: { base64: string }[] = [];

  // 1. board.json (always first, truncated)
  const boardPath = join(outputDir, "board.json");
  if (existsSync(boardPath)) {
    texts.push({ path: "board.json", text: readTextTruncated(boardPath, opts.text_max_bytes) });
  }

  // 2. data.js (truncated)
  const dataPath = join(outputDir, "data.js");
  if (existsSync(dataPath)) {
    texts.push({ path: "data.js", text: readTextTruncated(dataPath, opts.text_max_bytes) });
  }

  // 3. Dashboard files (up to max_files, truncated)
  const dashDir = join(outputDir, "dashboard");
  if (existsSync(dashDir)) {
    const dashFiles = readdirSync(dashDir)
      .filter(f => !f.startsWith(".") && statSync(join(dashDir, f)).isFile())
      .sort();
    for (const f of dashFiles.slice(0, opts.dashboard.max_files)) {
      const fp = join(dashDir, f);
      const st = statSync(fp);
      if (st.size > opts.dashboard.max_bytes) continue;
      texts.push({ path: `dashboard/${f}`, text: readTextTruncated(fp, opts.text_max_bytes) });
    }
  }

  // 4. Screenshots (up to max, truncated)
  const shotsDir = join(outputDir, "screenshots");
  if (existsSync(shotsDir)) {
    const shotFiles = readdirSync(shotsDir)
      .filter(f => !f.startsWith(".") && statSync(join(shotsDir, f)).isFile())
      .sort();
    for (const f of shotFiles.slice(0, opts.screenshots.max)) {
      const fp = join(shotsDir, f);
      const st = statSync(fp);
      if (st.size > opts.screenshots.max_bytes) continue;
      images.push({ base64: readBase64(fp) });
    }
  }

  const dossier: Dossier = {
    cover: images.length > 0 ? 0 : -1,
    images,
    texts
  };

  return JSON.stringify(dossier, null, 2);
}
