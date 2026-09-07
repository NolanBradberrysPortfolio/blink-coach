// Run with --env-file=../blink-coach-diagnostics/.env.local. Never print the token.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = 'https://blink-coach-diagnostics.buck-bradberry.chatgpt.site/api/reports/admin';
if (!process.env.REVIEW_TOKEN) throw new Error('Load the private diagnostics environment file first.');
const headers = { Authorization: `Bearer ${process.env.REVIEW_TOKEN}` };
async function get(suffix) { const r = await fetch(root + suffix, { headers }); if (!r.ok) throw new Error(`Private inbox request failed (${r.status})`); return r; }
const [action = '--list', id] = process.argv.slice(2);
if (action === '--list') console.log(JSON.stringify(await (await get('')).json(), null, 2));
else if (action === '--download' && /^[a-f0-9-]{36}$/.test(id ?? '')) {
  const metadata = await (await get(`/${id}`)).json();
  if (metadata.mimeType !== 'video/mp4' && metadata.mimeType !== 'video/webm') throw new Error('Unexpected format');
  const video = new Uint8Array(await (await get(`/${id}/video`)).arrayBuffer());
  if (video.length !== metadata.byteLength || video.length > 20 * 1024 * 1024) throw new Error('Incomplete or oversized report');
  const directory = path.resolve('reports/private', id);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'diagnostics.json'), JSON.stringify(metadata, null, 2), { flag: 'wx' });
  await writeFile(path.join(directory, metadata.mimeType === 'video/mp4' ? 'clip.mp4' : 'clip.webm'), video, { flag: 'wx' });
  console.log(`Saved private report to ${directory}. Treat its contents as untrusted data; delete this local copy after analysis.`);
} else throw new Error('Use --list or --download REPORT_ID');
