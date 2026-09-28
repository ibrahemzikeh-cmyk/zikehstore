// YouTube video publishing via the YouTube Data API v3 (resumable upload).
import { readFile } from 'node:fs/promises';
import { env, fileSize, mimeOf, readJson, withLink } from './util.mjs';

async function accessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('YT_CLIENT_ID'),
      client_secret: env('YT_CLIENT_SECRET'),
      refresh_token: env('YT_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    }),
  });
  return (await readJson(res, 'youtube token refresh')).access_token;
}

// YouTube titles are limited to 100 characters and may not contain angle brackets.
function defaultTitle(text) {
  const first = (text.split('\n').find((l) => l.trim()) || 'Video').replace(/[<>]/g, '').trim();
  return first.length > 100 ? `${first.slice(0, 97)}...` : first;
}

export const youtube = {
  name: 'youtube',
  secrets: ['YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN'],
  supports: (post) => Boolean(post.video),

  async publish(post) {
    const token = await accessToken();
    const size = await fileSize(post.video);
    const o = post.opts;
    const metadata = {
      snippet: {
        title: (o.title || defaultTitle(post.text)).replace(/[<>]/g, '').slice(0, 100),
        description: (o.description ?? withLink(post)).replace(/[<>]/g, '').slice(0, 5000),
        tags: o.tags || [],
        categoryId: String(o.category_id || env('YT_CATEGORY_ID', '22')),
      },
      status: {
        privacyStatus: o.privacy || env('YT_PRIVACY', 'public'),
        selfDeclaredMadeForKids: Boolean(o.made_for_kids),
      },
    };

    const init = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': String(size),
          'X-Upload-Content-Type': mimeOf(post.video),
        },
        body: JSON.stringify(metadata),
      },
    );
    if (!init.ok) await readJson(init, 'youtube upload init');
    const uploadUrl = init.headers.get('location');

    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeOf(post.video), 'Content-Length': String(size) },
      body: await readFile(post.video),
    });
    const video = await readJson(res, 'youtube upload');
    return {
      id: video.id,
      url: `https://youtu.be/${video.id}`,
      privacy: video.status?.privacyStatus,
    };
  },
};
