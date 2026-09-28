import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png']);
export const VIDEO_EXT = new Set(['.mp4', '.mov']);

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
};

export function mimeOf(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

// Reads a JSON response and throws a readable error for non-2xx or API-level errors.
export async function readJson(res, label) {
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  const apiError =
    body.error && typeof body.error === 'object' && body.error.code && body.error.code !== 'ok'
      ? body.error
      : null;
  if (!res.ok || apiError) {
    const msg =
      (apiError && (apiError.message || apiError.code)) ||
      (body.error && body.error.message) ||
      body.error_description ||
      body.raw ||
      text;
    throw new Error(`${label}: HTTP ${res.status} - ${String(msg).slice(0, 500)}`);
  }
  return body;
}

export async function fileBlob(file) {
  const buf = await readFile(file);
  return new Blob([buf], { type: mimeOf(file) });
}

export async function fileSize(file) {
  return (await stat(file)).size;
}

// Polls fn() until it returns a truthy value or the timeout elapses.
export async function poll(fn, { intervalMs = 5000, timeoutMs = 300000, label = 'poll' } = {}) {
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() - start > timeoutMs) throw new Error(`${label}: timed out`);
    await sleep(intervalMs);
  }
}

// Caption text with the post's link appended, for platforms without a separate link field.
export function withLink(post) {
  return post.link ? `${post.text}\n\n${post.link}`.trim() : post.text;
}
