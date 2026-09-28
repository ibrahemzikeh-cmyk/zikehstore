// TikTok video publishing via the Content Posting API (direct post, file upload).
import { open } from 'node:fs/promises';
import { env, fileSize, mimeOf, poll, readJson, withLink } from './util.mjs';

const API = 'https://open.tiktokapis.com/v2';
const MAX_SINGLE_CHUNK = 64 * 1024 * 1024;
const CHUNK = 10 * 1024 * 1024;

async function accessToken() {
  const body = new URLSearchParams({
    client_key: env('TIKTOK_CLIENT_KEY'),
    client_secret: env('TIKTOK_CLIENT_SECRET'),
    grant_type: 'refresh_token',
    refresh_token: env('TIKTOK_REFRESH_TOKEN'),
  });
  const res = await readJson(
    await fetch(`${API}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }),
    'tiktok token refresh',
  );
  if (res.refresh_token && res.refresh_token !== env('TIKTOK_REFRESH_TOKEN')) {
    console.warn('::warning::TikTok returned a new refresh token; update the TIKTOK_REFRESH_TOKEN secret with `node social/auth.mjs tiktok`.');
  }
  return res.access_token;
}

async function api(token, p, payload, label) {
  const res = await fetch(`${API}/${p}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(payload ?? {}),
  });
  return (await readJson(res, label)).data;
}

export const tiktok = {
  name: 'tiktok',
  secrets: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REFRESH_TOKEN'],
  // Photo posts require a verified pull-from-URL domain, so only videos are supported.
  supports: (post) => Boolean(post.video),

  async publish(post) {
    const token = await accessToken();
    const creator = await api(token, 'post/publish/creator_info/query/', {}, 'tiktok creator info');

    const privacy = post.opts.privacy || env('TIKTOK_PRIVACY', 'SELF_ONLY');
    const allowed = creator.privacy_level_options || [];
    if (allowed.length && !allowed.includes(privacy)) {
      throw new Error(`tiktok privacy "${privacy}" not allowed for this account; options: ${allowed.join(', ')}`);
    }

    const size = await fileSize(post.video);
    const chunkSize = size <= MAX_SINGLE_CHUNK ? size : CHUNK;
    // The last chunk absorbs the remainder, per TikTok's chunking rules.
    const chunkCount = size <= MAX_SINGLE_CHUNK ? 1 : Math.floor(size / CHUNK);

    const init = await api(
      token,
      'post/publish/video/init/',
      {
        post_info: {
          title: withLink(post).slice(0, 2200),
          privacy_level: privacy,
          disable_comment: Boolean(post.opts.disable_comment),
          disable_duet: Boolean(post.opts.disable_duet),
          disable_stitch: Boolean(post.opts.disable_stitch),
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: size,
          chunk_size: chunkSize,
          total_chunk_count: chunkCount,
        },
      },
      'tiktok init',
    );

    const fh = await open(post.video, 'r');
    try {
      for (let i = 0; i < chunkCount; i++) {
        const start = i * chunkSize;
        const end = i === chunkCount - 1 ? size : start + chunkSize;
        const buf = Buffer.alloc(end - start);
        await fh.read(buf, 0, buf.length, start);
        const res = await fetch(init.upload_url, {
          method: 'PUT',
          headers: {
            'Content-Type': mimeOf(post.video),
            'Content-Length': String(buf.length),
            'Content-Range': `bytes ${start}-${end - 1}/${size}`,
          },
          body: buf,
        });
        if (!res.ok) throw new Error(`tiktok upload chunk ${i + 1}/${chunkCount}: HTTP ${res.status} ${await res.text()}`);
      }
    } finally {
      await fh.close();
    }

    const status = await poll(
      async () => {
        const s = await api(token, 'post/publish/status/fetch/', { publish_id: init.publish_id }, 'tiktok status');
        if (s.status === 'FAILED') throw new Error(`tiktok publish failed: ${s.fail_reason}`);
        return s.status === 'PUBLISH_COMPLETE' ? s : null;
      },
      { intervalMs: 5000, timeoutMs: 600000, label: 'tiktok processing' },
    );
    const postId = (status.publicaly_available_post_id || status.publicly_available_post_id || [])[0];
    return {
      id: postId || init.publish_id,
      url: postId && creator.creator_username ? `https://www.tiktok.com/@${creator.creator_username}/video/${postId}` : undefined,
      privacy,
    };
  },
};
