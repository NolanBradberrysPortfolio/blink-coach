export type BlinkState = 'OPEN' | 'CLOSING' | 'CLOSED' | 'OPENING' | 'INVALID';

export type EyeSignalSource = 'blendshape' | 'landmark' | 'none';

export type EyeCombinationRule = 'average' | 'minimum';

export interface EyeFrameResult {
  timestampMs: number;
  faceDetected: boolean;
  leftEyeScore: number | null;
  rightEyeScore: number | null;
  confidence?: number;
  signalSource?: EyeSignalSource;
}

export interface BlinkDetector {
  initialize(): Promise<void>;
  processFrame(frame: unknown, timestampMs: number): Promise<EyeFrameResult>;
  dispose(): Promise<void>;
}

export interface BlinkDetectionConfig {
  openThreshold: number;
  closeThreshold: number;
  reopenThreshold: number;
  minBlinkDurationMs: number;
  maxBlinkDurationMs: number;
  debounceMs: number;
  closeFramesRequired: number;
  openFramesRequired: number;
  maxEyeAsymmetry: number;
  smoothingAlpha: number;
  eyeCombination: EyeCombinationRule;
  confidenceMinimum: number;
  missingFrameToleranceMs: number;
  incompleteClosureThreshold: number;
  completeBlinkMaxDurationMs: number;
  /**
   * Some eyewear (including dark eye-protection goggles) shifts MediaPipe's
   * eye-openness scores downward without removing the useful blink pattern.
   * The state machine can learn a conservative local open-eye baseline for
   * that case instead of requiring a new detector or a person-specific model.
   */
  adaptiveBaselineEnabled?: boolean;
  adaptiveBaselineWarmupMs?: number;
  adaptiveOpenRatio?: number;
  adaptiveCloseRatio?: number;
  adaptiveReopenRatio?: number;
}

export interface ActiveBlinkThresholds {
  openThreshold: number;
  closeThreshold: number;
  reopenThreshold: number;
  adaptive: boolean;
  baselineLeft: number | null;
  baselineRight: number | null;
}

export const DEFAULT_BLINK_CONFIG: BlinkDetectionConfig = {
  openThreshold: 0.62,
  closeThreshold: 0.38,
  reopenThreshold: 0.58,
  minBlinkDurationMs: 80,
  maxBlinkDurationMs: 900,
  debounceMs: 280,
  closeFramesRequired: 2,
  openFramesRequired: 2,
  maxEyeAsymmetry: 0.38,
  smoothingAlpha: 0.42,
  eyeCombination: 'average',
  confidenceMinimum: 0.45,
  missingFrameToleranceMs: 0,
  incompleteClosureThreshold: 0.58,
  completeBlinkMaxDurationMs: 550,
  adaptiveBaselineEnabled: true,
  adaptiveBaselineWarmupMs: 1800,
  adaptiveOpenRatio: 0.84,
  adaptiveCloseRatio: 0.64,
  adaptiveReopenRatio: 0.80,
};

export interface BlinkEvent {
  startTimestampMs: number;
  endTimestampMs: number;
  durationMs: number;
  maxClosureDepth: number;
  leftMaxClosureDepth: number;
  rightMaxClosureDepth: number;
  symmetryAtMax: number;
  classification?: BlinkClassification;
}

export type BlinkClassification = 'complete' | 'incomplete';

export type GroundTruthBlinkType = 'blink' | 'incompleteBlink';

export interface BlinkClassificationResult {
  classification: BlinkClassification;
  confidence: number;
  reason: string;
}

export interface CalibrationProfile {
  createdAt: string;
  openLeft: number;
  openRight: number;
  closedLeft: number;
  closedRight: number;
  recommendedOpenThreshold: number;
  recommendedCloseThreshold: number;
  completeClosureThreshold: number;
  sampleCount: number;
}

export type CalibrationPhase = 'idle' | 'open' | 'natural' | 'deliberate' | 'complete';

export interface CalibrationSnapshot {
  phase: CalibrationPhase;
  phaseStartedAtMs: number | null;
  openSampleCount: number;
  closedSampleCount: number;
  naturalBlinkCount: number;
  deliberateBlinkCount: number;
  faceReady: boolean;
}

export interface ManualThresholds {
  openThreshold: number;
  closeThreshold: number;
  minBlinkDurationMs: number;
  maxBlinkDurationMs: number;
}

export interface AppSettings {
  reminderIntervalSeconds: number;
  customReminderIntervalSeconds: number;
  soundEnabled: boolean;
  lowDistractionMode: boolean;
  cameraPreviewVisible: boolean;
  developerMode: boolean;
  inferenceFps: 10 | 15 | 20;
  manualThresholdsEnabled: boolean;
  manualThresholds: ManualThresholds;
}

export const DEFAULT_SETTINGS: AppSettings = {
  reminderIntervalSeconds: 5,
  customReminderIntervalSeconds: 12,
  soundEnabled: true,
  lowDistractionMode: false,
  cameraPreviewVisible: true,
  developerMode: false,
  inferenceFps: 15,
  manualThresholdsEnabled: false,
  manualThresholds: {
    openThreshold: DEFAULT_BLINK_CONFIG.openThreshold,
    closeThreshold: DEFAULT_BLINK_CONFIG.closeThreshold,
    minBlinkDurationMs: DEFAULT_BLINK_CONFIG.minBlinkDurationMs,
    maxBlinkDurationMs: DEFAULT_BLINK_CONFIG.maxBlinkDurationMs,
  },
};

export interface SessionSummary {
  id: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  totalBlinks: number;
  averageBlinkRate: number;
  longestIntervalMs: number;
  reminderCount: number;
  completeBlinkPercentage: number | null;
}

export interface ReminderSnapshot {
  armed: boolean;
  cooldownUntilMs: number | null;
  lastBlinkTimestampMs: number | null;
  intervalMs: number;
  lastTriggeredAtMs: number | null;
}

export interface SignalSample {
  timestampMs: number;
  left: number | null;
  right: number | null;
  smoothedLeft: number | null;
  smoothedRight: number | null;
  faceDetected: boolean;
  state?: BlinkState;
  confidence?: number;
  signalSource?: EyeSignalSource;
  activeOpenThreshold?: number;
  activeCloseThreshold?: number;
  activeReopenThreshold?: number;
  adaptiveThresholds?: boolean;
  openBaselineLeft?: number | null;
  openBaselineRight?: number | null;
}

export interface CoachMetrics {
  rollingBlinksPerMinute: number;
  timeSinceLastBlinkMs: number;
  sessionDurationMs: number;
  totalBlinks: number;
  longestIntervalMs: number;
}
