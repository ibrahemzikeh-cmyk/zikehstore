#!/usr/bin/env node
// Publishes every post folder in social/queue/ to its platforms, then moves
// fully handled posts to social/published/. See social/README.md.
//
// Usage: node social/publish.mjs [--dry-run] [--only <folder-name>]
import { readdir, readFile, writeFile, rename, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { facebook, instagram } from './lib/meta.mjs';
import { tiktok } from './lib/tiktok.mjs';
import { youtube } from './lib/youtube.mjs';
import { IMAGE_EXT, VIDEO_EXT, env } from './lib/util.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const QUEUE = path.join(ROOT, 'queue');
const PUBLISHED = path.join(ROOT, 'published');
const PLATFORMS = { facebook, instagram, tiktok, youtube };

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

// Instagram fetches images by URL, so they must be publicly reachable.
function mediaUrl(dir, file) {
  const rel = path.relative(path.dirname(ROOT), path.join(dir, path.basename(file))).split(path.sep).join('/');
  const base = env('MEDIA_BASE_URL');
  if (base) return `${base.replace(/\/$/, '')}/${rel}`;
  const repo = env('GITHUB_REPOSITORY');
  const sha = env('GITHUB_SHA');
  if (!repo || !sha) throw new Error('set MEDIA_BASE_URL (or run in GitHub Actions) so Instagram can fetch images');
  return `https://raw.githubusercontent.com/${repo}/${sha}/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

export async function loadPost(dir) {
  const spec = JSON.parse(await readFile(path.join(dir, 'post.json'), 'utf8'));
  const errors = [];
  const media = (spec.media || []).map((m) => path.join(dir, m));
  for (const m of media) {
    try {
      await stat(m);
    } catch {
      errors.push(`missing media file: ${path.basename(m)}`);
    }
  }
  const images = media.filter((m) => IMAGE_EXT.has(path.extname(m).toLowerCase()));
  const videos = media.filter((m) => VIDEO_EXT.has(path.extname(m).toLowerCase()));
  const other = media.filter((m) => !images.includes(m) && !videos.includes(m));

  if (other.length) errors.push(`unsupported media type: ${other.map((m) => path.basename(m)).join(', ')}`);
  if (videos.length > 1) errors.push('only one video per post is supported');
  if (videos.length && images.length) errors.push('a post can have images or one video, not both');
  if (images.length > 10) errors.push('at most 10 images per post');
  if (!spec.text && !media.length) errors.push('post needs "text" or "media"');
  if (spec.publish_at && Number.isNaN(Date.parse(spec.publish_at))) errors.push('"publish_at" is not a valid date');

  const unknown = (spec.platforms || []).filter((p) => !PLATFORMS[p]);
  if (unknown.length) errors.push(`unknown platforms: ${unknown.join(', ')}`);

  const base = {
    name: path.basename(dir),
    dir,
    text: (spec.text || '').trim(),
    link: spec.link,
    images,
    video: videos[0] || null,
    publishAt: spec.publish_at ? new Date(spec.publish_at) : null,
    mediaUrl: (f) => mediaUrl(dir, f),
  };
  const requested = spec.platforms || Object.keys(PLATFORMS);
  const overrides = spec.overrides || {};
  const targets = requested
    .filter((p) => PLATFORMS[p])
    .map((p) => {
      const o = overrides[p] || {};
      return { platform: PLATFORMS[p], post: { ...base, text: (o.text ?? base.text).trim(), opts: o } };
    });
  return { base, targets, errors, explicitPlatforms: Boolean(spec.platforms) };
}

async function readStatus(dir) {
  try {
    return JSON.parse(await readFile(path.join(dir, 'status.json'), 'utf8'));
  } catch {
    return {};
  }
}

async function processPost(dir) {
  const { base, targets, errors, explicitPlatforms } = await loadPost(dir);
  console.log(`\n== ${base.name}`);
  if (errors.length) {
    for (const e of errors) console.log(`::error::${base.name}: ${e}`);
    return false;
  }
  if (base.publishAt && base.publishAt > new Date()) {
    console.log(`scheduled for ${base.publishAt.toISOString()}, skipping for now`);
    return true;
  }

  const status = await readStatus(dir);
  let ok = true;
  for (const { platform, post } of targets) {
    const name = platform.name;
    if (status[name]?.ok) {
      console.log(`${name}: already published (${status[name].url || status[name].id})`);
      continue;
    }
    if (!platform.supports(post)) {
      const msg = `${name}: skipped, this kind of post is not supported there`;
      if (explicitPlatforms) console.log(`::warning::${base.name}: ${msg}`);
      else console.log(msg);
      status[name] = { skipped: 'unsupported' };
      continue;
    }
    const missing = platform.secrets.filter((s) => !env(s));
    if (missing.length) {
      console.log(`::warning::${base.name}: ${name} skipped, missing secrets ${missing.join(', ')}`);
      status[name] = { skipped: 'not configured' };
      continue;
    }
    if (dryRun) {
      console.log(`${name}: would publish (dry run)`);
      continue;
    }
    try {
      const result = await platform.publish(post);
      status[name] = { ok: true, ...result, at: new Date().toISOString() };
      console.log(`${name}: published ${result.url || result.id}`);
    } catch (err) {
      ok = false;
      status[name] = { ok: false, error: err.message, at: new Date().toISOString() };
      console.log(`::error::${base.name}: ${name} failed: ${err.message}`);
    }
  }

  if (dryRun) return ok;
  await writeFile(path.join(dir, 'status.json'), `${JSON.stringify(status, null, 2)}\n`);
  const published = Object.values(status).some((r) => r.ok);
  if (ok && !published) {
    console.log('::warning::nothing was published (no platform configured); kept in queue');
    return true;
  }
  if (ok) {
    await mkdir(PUBLISHED, { recursive: true });
    await rename(dir, path.join(PUBLISHED, base.name));
    console.log(`moved to social/published/${base.name}`);
  } else {
    console.log('kept in queue; the next run retries only the failed platforms');
  }
  return ok;
}

async function main() {
  const entries = (await readdir(QUEUE, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && (!only || e.name === only))
    .map((e) => e.name)
    .sort();
  if (!entries.length) {
    console.log('queue is empty');
    return;
  }
  let allOk = true;
  for (const name of entries) {
    if (!(await processPost(path.join(QUEUE, name)))) allOk = false;
  }
  if (!allOk) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
