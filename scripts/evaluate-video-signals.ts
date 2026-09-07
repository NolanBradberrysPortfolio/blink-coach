import { readFile, writeFile } from 'node:fs/promises';
import { BlinkTestFixture, VideoAnnotationDocument } from '../src/domain/testLabTypes';
import { EyeFrameResult, DEFAULT_BLINK_CONFIG } from '../src/domain/types';
import { runRegression } from '../src/domain/regression';

async function main(): Promise<void> {
  const [signalPath, annotationPath, reportPath] = process.argv.slice(2);
  if (!reportPath) throw new Error('Pass signals.json annotations.json report.json');
  const eyeFrames = JSON.parse(await readFile(signalPath, 'utf8')) as EyeFrameResult[];
  const annotation = JSON.parse(await readFile(annotationPath, 'utf8')) as VideoAnnotationDocument;
  if (!Array.isArray(eyeFrames) || !eyeFrames.length || !Array.isArray(annotation.events)) throw new Error('Invalid input');
  const durationMs = eyeFrames.at(-1)!.timestampMs;
  const fixture: BlinkTestFixture = { ...annotation, eyeFrames, durationMs,
    events: annotation.events.filter(event => event.timeMs >= 0 && event.timeMs <= durationMs) };
  const regression = runRegression([fixture], DEFAULT_BLINK_CONFIG, annotation.temporalToleranceMs ?? 350);
  await writeFile(reportPath, JSON.stringify(regression, null, 2));
  console.log(JSON.stringify(regression.overall.metrics, null, 2));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
