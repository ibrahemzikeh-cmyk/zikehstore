// Facebook Page + Instagram Business publishing via the Meta Graph API.
import { env, fileBlob, fileSize, poll, readJson, withLink } from './util.mjs';
import { readFile } from 'node:fs/promises';

const version = () => env('META_GRAPH_VERSION', 'v23.0');
const graph = (p) => `https://graph.facebook.com/${version()}/${p}`;
const token = () => env('FB_PAGE_TOKEN');

async function postForm(url, fields, label) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) form.append(k, v);
  }
  form.append('access_token', token());
  return readJson(await fetch(url, { method: 'POST', body: form }), label);
}

async function getJson(url, label) {
  const u = new URL(url);
  u.searchParams.set('access_token', token());
  return readJson(await fetch(u), label);
}

export const facebook = {
  name: 'facebook',
  secrets: ['FB_PAGE_ID', 'FB_PAGE_TOKEN'],
  supports: () => true,

  async publish(post) {
    const pageId = env('FB_PAGE_ID');
    // A text-only post carries the link as a preview card; media posts put it in the caption.
    const text = post.video || post.images.length ? withLink(post) : post.text;

    if (post.video) {
      const url = `https://graph-video.facebook.com/${version()}/${pageId}/videos`;
      const res = await postForm(
        url,
        { source: await fileBlob(post.video), description: text, title: post.opts.title },
        'facebook video',
      );
      return { id: res.id, url: `https://www.facebook.com/${res.id}` };
    }

    if (post.images.length === 1) {
      const res = await postForm(
        graph(`${pageId}/photos`),
        { source: await fileBlob(post.images[0]), caption: text },
        'facebook photo',
      );
      const id = res.post_id || res.id;
      return { id, url: `https://www.facebook.com/${id}` };
    }

    const fields = { message: text, link: post.images.length ? undefined : post.link };
    if (post.images.length > 1) {
      for (const [i, img] of post.images.entries()) {
        const photo = await postForm(
          graph(`${pageId}/photos`),
          { source: await fileBlob(img), published: 'false' },
          `facebook photo ${i + 1}`,
        );
        fields[`attached_media[${i}]`] = JSON.stringify({ media_fbid: photo.id });
      }
    }
    const res = await postForm(graph(`${pageId}/feed`), fields, 'facebook post');
    return { id: res.id, url: `https://www.facebook.com/${res.id}` };
  },
};

async function waitForContainer(id) {
  await poll(
    async () => {
      const s = await getJson(graph(`${id}?fields=status_code,status`), 'instagram status');
      if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') {
        throw new Error(`instagram processing failed: ${s.status || s.status_code}`);
      }
      return s.status_code === 'FINISHED' || s.status_code === 'PUBLISHED';
    },
    { intervalMs: 5000, timeoutMs: 600000, label: 'instagram processing' },
  );
}

export const instagram = {
  name: 'instagram',
  secrets: ['IG_USER_ID', 'FB_PAGE_TOKEN'],
  // Instagram has no text-only posts.
  supports: (post) => Boolean(post.video || post.images.length),

  async publish(post) {
    const igId = env('IG_USER_ID');
    const caption = withLink(post);
    let creationId;

    if (post.video) {
      // Resumable upload sends the bytes directly, so the video needs no public URL.
      const container = await postForm(
        graph(`${igId}/media`),
        {
          media_type: 'REELS',
          upload_type: 'resumable',
          caption,
          share_to_feed: String(post.opts.share_to_feed ?? true),
        },
        'instagram reel container',
      );
      const size = await fileSize(post.video);
      const up = await fetch(`https://rupload.facebook.com/ig-api-upload/${version()}/${container.id}`, {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${token()}`,
          offset: '0',
          file_size: String(size),
        },
        body: await readFile(post.video),
      });
      await readJson(up, 'instagram reel upload');
      creationId = container.id;
    } else if (post.images.length === 1) {
      const c = await postForm(
        graph(`${igId}/media`),
        { image_url: post.mediaUrl(post.images[0]), caption },
        'instagram image container',
      );
      creationId = c.id;
    } else {
      const children = [];
      for (const [i, img] of post.images.entries()) {
        const c = await postForm(
          graph(`${igId}/media`),
          { image_url: post.mediaUrl(img), is_carousel_item: 'true' },
          `instagram carousel item ${i + 1}`,
        );
        children.push(c.id);
      }
      for (const id of children) await waitForContainer(id);
      const c = await postForm(
        graph(`${igId}/media`),
        { media_type: 'CAROUSEL', children: children.join(','), caption },
        'instagram carousel container',
      );
      creationId = c.id;
    }

    await waitForContainer(creationId);
    const res = await postForm(graph(`${igId}/media_publish`), { creation_id: creationId }, 'instagram publish');
    let url;
    try {
      url = (await getJson(graph(`${res.id}?fields=permalink`), 'instagram permalink')).permalink;
    } catch {
      // Permalink lookup is best-effort; the post is already published.
    }
    return { id: res.id, url };
  },
};
