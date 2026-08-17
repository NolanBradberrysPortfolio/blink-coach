import { BlinkAnalysisPipeline } from './analysisPipeline';
import { BlinkDetectionConfig, BlinkEvent, CalibrationProfile, EyeFrameResult } from './types';
import { BlinkTestFixture, BlinkTestRun, FaceNotDetectedSection, TestSignalSample } from './testLabTypes';

export class BlinkTestRunAccumulator {
  private readonly pipeline: BlinkAnalysisPipeline;
  private readonly samples: TestSignalSample[] = [];
  private readonly predictedEvents: BlinkEvent[] = [];
  private readonly videoId?: string;
  private readonly calibration: CalibrationProfile | null;

  constructor(config: BlinkDetectionConfig, calibration: CalibrationProfile | null = null, videoId?: string) {
    this.pipeline = new BlinkAnalysisPipeline(config, calibration);
    this.videoId = videoId;
    this.calibration = calibration;
  }

  processFrame(result: EyeFrameResult): ReturnType<BlinkAnalysisPipeline['process']> {
    const output = this.pipeline.process(result);
    this.samples.push(output.signalSample as TestSignalSample);
    if (output.event) this.predictedEvents.push(output.event);
    return output;
  }

  reset(): void {
    this.pipeline.reset();
    this.samples.length = 0;
    this.predictedEvents.length = 0;
  }

  finalize(durationMs: number, processingElapsedMs: number): BlinkTestRun {
    const safeElapsed = Math.max(0, processingElapsedMs);
    return {
      videoId: this.videoId,
      durationMs,
      processedFrames: this.samples.length,
      processingElapsedMs: safeElapsed,
      processingFps: safeElapsed > 0 ? this.samples.length / (safeElapsed / 1000) : 0,
      samples: [...this.samples],
      predictedEvents: [...this.predictedEvents],
      faceNotDetectedSections: findFaceNotDetectedSections(this.samples),
      config: this.pipeline.getConfig(),
      calibration: this.calibration,
    };
  }
}

export function runEyeFrameFixture(
  fixture: BlinkTestFixture,
  config: BlinkDetectionConfig,
  calibration: CalibrationProfile | null = null,
): BlinkTestRun {
  const accumulator = new BlinkTestRunAccumulator(config, calibration, fixture.videoId);
  for (const frame of fixture.eyeFrames) accumulator.processFrame(frame);
  const run = accumulator.finalize(fixture.durationMs, 0);
  return { ...run, calibration };
}

export function findFaceNotDetectedSections(samples: TestSignalSample[]): FaceNotDetectedSection[] {
  const sections: FaceNotDetectedSection[] = [];
  let startMs: number | null = null;
  let lastMs: number | null = null;
  for (const sample of samples) {
    if (!sample.faceDetected) {
      if (startMs === null) startMs = sample.timestampMs;
      lastMs = sample.timestampMs;
      continue;
    }
    if (startMs !== null && lastMs !== null) {
      sections.push({ startMs, endMs: lastMs, durationMs: Math.max(0, lastMs - startMs) });
      startMs = null;
      lastMs = null;
    }
  }
  if (startMs !== null && lastMs !== null) {
    sections.push({ startMs, endMs: lastMs, durationMs: Math.max(0, lastMs - startMs) });
  }
  return sections;
}
