import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BlinkAnalysisPipeline } from '../src/domain/analysisPipeline';
import { aggregateComparisons, compareBlinkEvents } from '../src/domain/testComparison';
import { BlinkEvent, DEFAULT_BLINK_CONFIG, EyeFrameResult } from '../src/domain/types';
import { VideoAnnotationDocument } from '../src/domain/testLabTypes';

interface UpstreamRun {
  sourceSha256: string;
  error: string | null;
  frames: { timestampMs: number; faceDetected: boolean }[];
  events: { startTimestampMs: number; endTimestampMs: number; emittedAtMs: number }[];
}

async function main(): Promise<void> {
  const root = process.argv[2];
  if (!root) throw new Error('Pass the research directory containing benchmark outputs');
  const read = async <T,>(file: string): Promise<T> => JSON.parse(await readFile(path.join(root, file), 'utf8')) as T;
  const names = ['current', 'simple', 'fixed', 'adaptive', 'filtered', '3d'];
  const results: Record<string, unknown> = {};
  for (const name of names) {
    const clips = [];
    for (const id of [1, 3, 8]) {
      const labels = await read<VideoAnnotationDocument>(`labels${id}.json`);
      // The final clip-3 blink spans frames 896–903 and is cut off by this
      // 900-frame excerpt. Use the same last-sample cutoff as the prior review.
      const truth = labels.events.filter(event => event.timeMs <= 899 * 1000 / 30);
      let events: BlinkEvent[];
      let faceFrames: number;
      let sourceSha256: string | undefined;
      if (name === 'current') {
        const frames = await read<EyeFrameResult[]>(`normalized-signals${id}.json`);
        if (frames.length !== 900) throw new Error('Unexpected current frame count');
        const pipeline = new BlinkAnalysisPipeline(DEFAULT_BLINK_CONFIG);
        events = frames.flatMap(frame => {
          const output = pipeline.process(frame);
          return output.event ? [output.event] : [];
        });
        faceFrames = frames.filter(frame => frame.faceDetected).length;
      } else {
        const run = await read<UpstreamRun>(`${name}-${id}.json`);
        if (run.error || run.frames.length !== 900) throw new Error(`Invalid run: ${name}-${id}`);
        sourceSha256 = run.sourceSha256;
        faceFrames = run.frames.filter(frame => frame.faceDetected).length;
        events = run.events.map(event => ({
          startTimestampMs: event.startTimestampMs,
          endTimestampMs: event.endTimestampMs,
          durationMs: event.endTimestampMs - event.startTimestampMs,
          // These upstream scripts do not classify complete/incomplete blinks.
          maxClosureDepth: 0, leftMaxClosureDepth: 0, rightMaxClosureDepth: 0, symmetryAtMax: 0,
        }));
      }
      const comparison = compareBlinkEvents(events, truth, [], DEFAULT_BLINK_CONFIG, 350);
      clips.push({ id, faceFrames, sourceSha256, comparison });
    }
    const overall = aggregateComparisons(clips.map(clip => clip.comparison)).metrics;
    results[name] = { overall, clips };
    console.log(name, JSON.stringify(overall));
  }
  const personal = await read<EyeFrameResult[]>('goggles-current-signals.json');
  const pipeline = new BlinkAnalysisPipeline(DEFAULT_BLINK_CONFIG);
  const currentEvents = personal.flatMap(frame => {
    const output = pipeline.process(frame);
    return output.event ? [output.event] : [];
  });
  results.gogglesCountOnly = {
    userReportedCount: 10, timestampLabelsAvailable: false,
    current: { count: currentEvents.length, events: currentEvents, faceFrames: personal.filter(f => f.faceDetected).length },
    simple: await read<UpstreamRun>('simple-goggles.json'),
    fixed: await read<UpstreamRun>('fixed-goggles.json'),
  };
  await writeFile(path.join(root, 'upstream-comparison.json'), JSON.stringify(results, null, 2));
  console.log('Goggles current count', currentEvents.length);
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
