// Source the base model transiently — Walrus is the only persistent store, so the raw
// GGUF is streamed to an OS temp file just long enough to encrypt + upload, then deleted.
import { createWriteStream, existsSync, unlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const DEFAULT_MODEL = {
  name: 'SmolLM2-135M-Instruct',
  format: 'gguf',
  url: 'https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q8_0.gguf',
  filename: 'SmolLM2-135M-Instruct-Q8_0.gguf',
};

// Download `url` to a temp path and return it. Caller MUST delete it when done.
export async function fetchModelToTemp(url = DEFAULT_MODEL.url, filename = DEFAULT_MODEL.filename) {
  const dest = join(tmpdir(), `walnut-src-${process.pid}-${Date.now()}-${filename}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`model download failed: ${res.status} ${res.statusText}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  return dest;
}

// Resolve a model source: if an explicit local path is given, use it (and don't delete);
// otherwise download to a temp file the caller should delete. Returns { path, temp }.
export async function resolveModelSource(explicitPath) {
  if (explicitPath && existsSync(explicitPath) && statSync(explicitPath).size > 0) {
    return { path: explicitPath, temp: false };
  }
  const path = await fetchModelToTemp();
  return { path, temp: true };
}

export function cleanupTemp(path, temp) {
  if (temp && path) {
    try { unlinkSync(path); } catch { /* best-effort */ }
  }
}
