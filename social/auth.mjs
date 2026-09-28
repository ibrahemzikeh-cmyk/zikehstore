#!/usr/bin/env node
// One-time helper that obtains the refresh tokens stored as GitHub secrets.
// Run it on your own computer:
//   node social/auth.mjs youtube
//   node social/auth.mjs tiktok
import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q, envName) => process.env[envName] || (await rl.question(q)).trim();

function codeFrom(pasted) {
  try {
    return new URL(pasted).searchParams.get('code') || pasted;
  } catch {
    return pasted;
  }
}

async function youtube() {
  const clientId = await ask('YouTube OAuth client ID: ', 'YT_CLIENT_ID');
  const clientSecret = await ask('YouTube OAuth client secret: ', 'YT_CLIENT_SECRET');
  const redirect = 'http://localhost';
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/youtube.upload',
    access_type: 'offline',
    prompt: 'consent',
  });
  console.log(`\n1) Open this link and allow access:\n${url}\n`);
  console.log('2) The browser ends on a localhost page that fails to load; that is expected.');
  const code = codeFrom(await rl.question('3) Paste the full address from the browser bar: '));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirect,
      grant_type: 'authorization_code',
    }),
  });
  const body = await res.json();
  if (!body.refresh_token) throw new Error(JSON.stringify(body));
  console.log(`\nYT_REFRESH_TOKEN = ${body.refresh_token}`);
}

async function tiktok() {
  const clientKey = await ask('TikTok client key: ', 'TIKTOK_CLIENT_KEY');
  const clientSecret = await ask('TikTok client secret: ', 'TIKTOK_CLIENT_SECRET');
  const redirect = await ask('Redirect URI registered in the TikTok app: ', 'TIKTOK_REDIRECT_URI');
  const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
  url.search = new URLSearchParams({
    client_key: clientKey,
    scope: 'user.info.basic,video.publish',
    response_type: 'code',
    redirect_uri: redirect,
    state: randomBytes(8).toString('hex'),
  });
  console.log(`\n1) Open this link and allow access:\n${url}\n`);
  const code = codeFrom(await rl.question('2) Paste the full address you were sent back to: '));
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirect,
    }),
  });
  const body = await res.json();
  if (!body.refresh_token) throw new Error(JSON.stringify(body));
  console.log(`\nTIKTOK_REFRESH_TOKEN = ${body.refresh_token}`);
}

const which = process.argv[2];
const flows = { youtube, tiktok };
if (!flows[which]) {
  console.error('usage: node social/auth.mjs youtube|tiktok');
  process.exit(2);
}
flows[which]()
  .catch((err) => {
    console.error(`\nFailed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
