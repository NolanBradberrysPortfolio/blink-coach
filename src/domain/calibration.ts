import { clamp, mean, median } from './math';
import {
  BlinkEvent,
  CalibrationPhase,
  CalibrationProfile,
  CalibrationSnapshot,
  EyeFrameResult,
} from './types';

const OPEN_PHASE_MS = 3000;

interface Sample {
  left: number;
  right: number;
  timestampMs: number;
}

export class CalibrationCollector {
  private phase: CalibrationPhase = 'idle';
  private phaseStartedAtMs: number | null = null;
  private openSamples: Sample[] = [];
  private closedSamples: Sample[] = [];
  private naturalBlinkCount = 0;
  private deliberateBlinkCount = 0;
  private faceReady = false;

  start(timestampMs: number): void {
    this.phase = 'open';
    this.phaseStartedAtMs = timestampMs;
    this.openSamples = [];
    this.closedSamples = [];
    this.naturalBlinkCount = 0;
    this.deliberateBlinkCount = 0;
    this.faceReady = false;
  }

  isActive(): boolean {
    return this.phase !== 'idle' && this.phase !== 'complete';
  }

  getPhase(): CalibrationPhase {
    return this.phase;
  }

  recordFrame(result: EyeFrameResult): void {
    this.faceReady = result.faceDetected && result.leftEyeScore !== null && result.rightEyeScore !== null;
    if (!this.faceReady || result.leftEyeScore === null || result.rightEyeScore === null) return;
    const sample = {
      left: clamp(result.leftEyeScore, 0, 1),
      right: clamp(result.rightEyeScore, 0, 1),
      timestampMs: result.timestampMs,
    };
    if (this.phase === 'open') {
      this.openSamples.push(sample);
    } else if (this.phase === 'natural' || this.phase === 'deliberate') {
      const combined = (sample.left + sample.right) / 2;
      // Use the recorded open-eye baseline rather than a fixed 0.62 gate.
      // Tinted goggles and some camera/lighting combinations can put a
      // naturally open eye below that value while preserving blink motion.
      const openBaseline = this.openBaseline();
      const closedGate = openBaseline === null ? 0.62 : Math.max(0.22, openBaseline * 0.72);
      if (combined < closedGate) this.closedSamples.push(sample);
    }
  }

  recordBlink(_event: BlinkEvent): void {
    if (this.phase === 'natural') {
      this.naturalBlinkCount += 1;
      if (this.naturalBlinkCount >= 5) {
        this.phase = 'deliberate';
        this.phaseStartedAtMs = _event.endTimestampMs;
      }
    } else if (this.phase === 'deliberate') {
      this.deliberateBlinkCount += 1;
      if (this.deliberateBlinkCount >= 3) this.phase = 'complete';
    }
  }

  tick(timestampMs: number): void {
    if (this.phase === 'open' && this.phaseStartedAtMs !== null && timestampMs - this.phaseStartedAtMs >= OPEN_PHASE_MS) {
      if (this.openSamples.length >= 8) {
        this.phase = 'natural';
        this.phaseStartedAtMs = timestampMs;
      }
    }
  }

  snapshot(): CalibrationSnapshot {
    return {
      phase: this.phase,
      phaseStartedAtMs: this.phaseStartedAtMs,
      openSampleCount: this.openSamples.length,
      closedSampleCount: this.closedSamples.length,
      naturalBlinkCount: this.naturalBlinkCount,
      deliberateBlinkCount: this.deliberateBlinkCount,
      faceReady: this.faceReady,
    };
  }

  buildProfile(createdAt = new Date().toISOString()): CalibrationProfile | null {
    if (this.phase !== 'complete' || this.openSamples.length < 8 || this.closedSamples.length < 3) return null;
    const openLeft = mean(this.openSamples.map((sample) => sample.left));
    const openRight = mean(this.openSamples.map((sample) => sample.right));
    const closedLeft = median(this.closedSamples.map((sample) => sample.left));
    const closedRight = median(this.closedSamples.map((sample) => sample.right));
    const gap = Math.max(0.08, ((openLeft - closedLeft) + (openRight - closedRight)) / 2);
    return {
      createdAt,
      openLeft,
      openRight,
      closedLeft,
      closedRight,
      recommendedOpenThreshold: clamp(Math.min(openLeft, openRight) - gap * 0.22, 0.5, 0.82),
      recommendedCloseThreshold: clamp(Math.max(closedLeft, closedRight) + gap * 0.44, 0.22, 0.52),
      completeClosureThreshold: clamp(1 - Math.max(closedLeft, closedRight) - gap * 0.12, 0.45, 0.8),
      sampleCount: this.openSamples.length + this.closedSamples.length,
    };
  }

  private openBaseline(): number | null {
    if (this.openSamples.length === 0) return null;
    return mean(this.openSamples.map((sample) => (sample.left + sample.right) / 2));
  }
}
