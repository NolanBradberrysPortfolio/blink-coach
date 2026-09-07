// Local research only: no download, upload, or redistribution of dataset video.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const [ffmpeg, video, labels, outputStem, startText = '900', countText = '900'] = process.argv.slice(2);
if (!outputStem) throw new Error('Pass ffmpeg source.avi labels.json outputStem [startFrame] [frameCount]');
const start = Number(startText), count = Number(countText), fps = 30;
if (!Number.isInteger(start) || start < 0 || !Number.isInteger(count) || count < 1) throw new Error('Invalid window');
execFileSync(ffmpeg, ['-v', 'error', '-n', '-i', video, '-vf', `select=between(n\\,${start}\\,${start + count - 1}),setpts=N/(30*TB)`, '-frames:v', String(count), '-an', '-map_metadata', '-1', '-c:v', 'libx264', `${outputStem}.mp4`]);
const document = JSON.parse(await readFile(labels, 'utf8'));
document.videoId += `-frames-${start}-${start + count - 1}`;
document.durationMs = (count - 1) * 1000 / fps;
document.metadata.split = 'validation';
document.events = document.events.filter(event => {
  const bounds = /source frame (\d+)-(\d+)/.exec(event.note ?? '');
  if (!bounds) throw new Error('Expected EyeBlink8 frame bounds');
  return Number(bounds[1]) >= start && Number(bounds[2]) < start + count;
}).map(event => ({ ...event, timeMs: event.timeMs - start * 1000 / fps }));
await writeFile(`${outputStem}.json`, JSON.stringify(document, null, 2));
console.log(`${document.videoId}: ${document.events.length} fully contained labels`);
