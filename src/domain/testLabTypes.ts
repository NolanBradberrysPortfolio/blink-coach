import {
  BlinkDetectionConfig,
  BlinkEvent,
  BlinkState,
  CalibrationProfile,
  EyeFrameResult,
  GroundTruthBlinkType,
  SignalSample,
} from './types';

export type FixtureSplit = 'tuning' | 'validation';
export type FixtureLighting = 'bright' | 'normal' | 'dim' | 'unknown';
export type FixtureAngle = 'front' | 'angled' | 'looking-down' | 'unknown';
export type FixtureBehavior =
  | 'normal-blinking'
  | 'exaggerated-blinking'
  | 'partial-blinks'
  | 'head-movement'
  | 'talking'
  | 'deliberate-squinting'
  | 'mixed'
  | 'unknown';

export interface TestFixtureMetadata {
  glasses: boolean;
  lighting: FixtureLighting;
  angle: FixtureAngle;
  behavior: FixtureBehavior;
  split: FixtureSplit;
  source?: string;
  notes?: string;
}

export interface GroundTruthEvent {
  id: string;
  timeMs: number;
  type: GroundTruthBlinkType;
  note?: string;
}

/** A portable signal fixture. It contains eye signals, never camera frames. */
export interface BlinkTestFixture {
  version: 1;
  videoId: string;
  videoName?: string;
  durationMs: number;
  metadata: TestFixtureMetadata;
  eyeFrames: EyeFrameResult[];
  events: GroundTruthEvent[];
}

/** Annotation JSON exported from Test Lab; the original video remains local. */
export interface VideoAnnotationDocument {
  version: 1;
  videoId: string;
  videoName?: string;
  durationMs: number;
  metadata: TestFixtureMetadata;
  temporalToleranceMs: number;
  events: GroundTruthEvent[];
}

export interface TestSignalSample extends SignalSample {
  state: BlinkState;
}

export interface FaceNotDetectedSection {
  startMs: number;
  endMs: number;
  durationMs: number;
}

export interface BlinkTestRun {
  videoId?: string;
  durationMs: number;
  processedFrames: number;
  processingElapsedMs: number;
  processingFps: number;
  samples: TestSignalSample[];
  predictedEvents: BlinkEvent[];
  faceNotDetectedSections: FaceNotDetectedSection[];
  config: BlinkDetectionConfig;
  calibration: CalibrationProfile | null;
}
