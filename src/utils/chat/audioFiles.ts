import fs from "fs";
import os from "os";
import path from "path";

/**
 * File-system safety helpers for serving synthesized audio: confining paths to the temp dir
 * and /public, and reading back the cached text sidecar of an audio file.
 */

/**
 * Resolves symlinks in a directory path so it can be compared against a realpath()'d
 * file path. On macOS os.tmpdir() is /var/folders/... while realpath() returns
 * /private/var/folders/..., so comparing against the raw root would reject every
 * legitimate file. Falls back to the original path if the directory cannot be resolved.
 */
function realRoot(dir: string): string {
  try {
    return fs.realpathSync(dir);
  } catch {
    return dir;
  }
}

/**
 * True when a realpath()'d file lies outside the given root directory.
 * An empty path means "no such file", which is not an escape.
 */
export function escapesRoot(resolved: string, root: string): boolean {
  if (!resolved) return false;
  const real = realRoot(root);
  const within = (base: string) => resolved === base || resolved.startsWith(base + path.sep);
  return !within(real) && !within(root);
}

/** Reads back the cached source text (`.txt` sidecar) for a previously-synthesized audio file. */
export function getOriginalTextForAudio(sanitizedFile: string): string | null {
  const txtFile = sanitizedFile.replace(/\.mp3$/, ".txt");
  const txtPathTmp = path.join(os.tmpdir(), txtFile);
  const txtPathPublic = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", txtFile);
  if (fs.existsSync(txtPathTmp)) {
    return fs.readFileSync(txtPathTmp, "utf8");
  }
  if (fs.existsSync(txtPathPublic)) {
    return fs.readFileSync(txtPathPublic, "utf8");
  }
  return null;
}
