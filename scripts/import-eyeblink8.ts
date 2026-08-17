import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { VideoAnnotationDocument } from '../src/domain/testLabTypes';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.output) {
    throw new Error('Usage: npm run import:eyeblink8 -- --input annotations.txt --output fixture.json --video-id eyeblink8-01 [--fps 30]');
  }
  const fps = Number(args.fps ?? 30);
  const groups = new Map<string, { firstFrame: number; lastFrame: number; leftFullyClosed: boolean; rightFullyClosed: boolean }>();
  const lines = (await readFile(path.resolve(args.input), 'utf8')).split(/\r?\n/);
  for (const line of lines) {
    const parts = line.split(':').map((part) => part.trim());
    if (parts.length < 7 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) continue;
    const frame = Number(parts[0]);
    const blinkId = parts[1];
    const current = groups.get(blinkId) ?? { firstFrame: frame, lastFrame: frame, leftFullyClosed: false, rightFullyClosed: false };
    current.firstFrame = Math.min(current.firstFrame, frame);
    current.lastFrame = Math.max(current.lastFrame, frame);
    current.leftFullyClosed ||= parts[3] === 'C';
    current.rightFullyClosed ||= parts[5] === 'C';
    groups.set(blinkId, current);
  }
  const videoId = args['video-id'] ?? path.basename(args.input, path.extname(args.input));
  const document: VideoAnnotationDocument = {
    version: 1,
    videoId,
    videoName: args['video-name'],
    durationMs: Number(args.duration ?? 0),
    temporalToleranceMs: Number(args.tolerance ?? 350),
    metadata: {
      glasses: args.glasses === 'true',
      lighting: 'unknown',
      angle: 'front',
      behavior: 'mixed',
      split: args.split === 'tuning' ? 'tuning' : 'validation',
      source: 'EyeBlink8 annotation adapter; obtain the dataset under its published terms.',
    },
    events: [...groups.entries()].sort((a, b) => a[1].firstFrame - b[1].firstFrame).map(([blinkId, group]) => ({
      id: `${videoId}-${blinkId}`,
      timeMs: ((group.firstFrame + group.lastFrame) / 2 / fps) * 1000,
      type: group.leftFullyClosed && group.rightFullyClosed ? 'blink' : 'incompleteBlink',
      note: `EyeBlink8 blink id ${blinkId}; source frame ${group.firstFrame}-${group.lastFrame}.`,
    })),
  };
  await writeFile(path.resolve(args.output), JSON.stringify(document, null, 2), 'utf8');
  console.log(`Imported ${document.events.length} EyeBlink8 blink annotations to ${path.resolve(args.output)}`);
  console.log('The source video and dataset annotations remain subject to the dataset licence; do not commit them to this repository.');
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

function parseArgs(values: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) continue;
    const [key, inlineValue] = value.slice(2).split('=', 2);
    result[key] = inlineValue ?? values[++index] ?? 'true';
  }
  return result;
}
