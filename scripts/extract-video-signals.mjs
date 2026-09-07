// Local-only browser runner: uses the production WebMediaPipeBlinkDetector.
// Usage: node scripts/extract-video-signals.mjs video.mp4 output.json [seconds] [chrome.exe]
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [videoPath, outputPath, seconds = '60', executablePath] = process.argv.slice(2);
if (!videoPath || !outputPath) throw new Error('Pass video path and output JSON path.');
const size = (await stat(videoPath)).size;
const bundle = await build({
  stdin: { contents: "export { WebMediaPipeBlinkDetector } from './src/detectors/WebMediaPipeBlinkDetector';", resolveDir: process.cwd() },
  bundle: true, write: false, format: 'iife', globalName: 'BlinkVideo', platform: 'browser',
});
const server = createServer((req, res) => {
  if (req.url === '/detector.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return; }
  if (req.url !== '/video') { res.setHeader('Content-Type', 'text/html'); res.end('<video muted playsinline></video><script src="/detector.js"></script>'); return; }
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  res.writeHead(range ? 206 : 200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
  createReadStream(videoPath, { start, end }).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  await page.exposeFunction('progress', n => console.log(`Analyzed ${n} frames`));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const frames = await page.evaluate(async limit => {
    const video = document.querySelector('video');
    video.src = '/video';
    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error('Video decode failed; convert to H.264 MP4 first.')); });
    const detector = new window.BlinkVideo.WebMediaPipeBlinkDetector({ useGpu: false });
    await detector.initialize();
    const frames = [];
    try {
      for (let index = 0; index / 30 < Math.min(limit, video.duration); index++) {
        const time = index / 30;
        if (time > 0) await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Video seek timed out')), 8000);
          video.onseeked = () => { clearTimeout(timeout); resolve(); };
          video.currentTime = time;
        });
        frames.push(await detector.processFrame(video, index * 1000 / 30));
        if (index % 300 === 0) await window.progress(index);
      }
    } finally { await detector.dispose(); }
    return frames;
  }, Number(seconds));
  await writeFile(path.resolve(outputPath), JSON.stringify(frames));
  console.log(`Saved ${frames.length} eye-signal frames to ${outputPath}`);
} finally {
  await browser?.close();
  server.close();
}
