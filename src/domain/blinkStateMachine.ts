import { clamp } from './math';
import {
  BlinkDetectionConfig,
  BlinkEvent,
  BlinkState,
  EyeFrameResult,
} from './types';

export interface BlinkProcessOutput {
  state: BlinkState;
  event: BlinkEvent | null;
  leftSmoothed: number | null;
  rightSmoothed: number | null;
}

/**
 * Converts a stream of eye openness samples into one-shot blink events.
 * This class contains no camera or MediaPipe knowledge and is deterministic
 * enough to test with synthetic signals.
 */
export class BlinkStateMachine {
  private config: BlinkDetectionConfig;
  private state: BlinkState = 'OPEN';
  private leftSmoothed: number | null = null;
  private rightSmoothed: number | null = null;
  private hasEstablishedOpen = false;
  private closedFrameCount = 0;
  private openFrameCount = 0;
  private closureStartMs: number | null = null;
  private cooldownUntilMs = 0;
  private leftMaxClosureDepth = 0;
  private rightMaxClosureDepth = 0;
  private symmetryAtMax = 1;
  private lastValidTimestampMs: number | null = null;

  constructor(config: BlinkDetectionConfig) {
    this.config = { ...config };
  }

  setConfig(config: BlinkDetectionConfig): void {
    this.config = { ...config };
  }

  getState(): BlinkState {
    return this.state;
  }

  reset(): void {
    this.state = 'OPEN';
    this.leftSmoothed = null;
    this.rightSmoothed = null;
    this.hasEstablishedOpen = false;
    this.closedFrameCount = 0;
    this.openFrameCount = 0;
    this.closureStartMs = null;
    this.cooldownUntilMs = 0;
    this.leftMaxClosureDepth = 0;
    this.rightMaxClosureDepth = 0;
    this.symmetryAtMax = 1;
    this.lastValidTimestampMs = null;
  }

  process(result: EyeFrameResult): BlinkProcessOutput {
    const invalidSignal =
      !result.faceDetected ||
      result.leftEyeScore === null ||
      result.rightEyeScore === null ||
      !Number.isFinite(result.timestampMs) ||
      (result.confidence !== undefined && result.confidence < this.config.confidenceMinimum);
    if (invalidSignal) {
      const canTolerateMissingFrame =
        this.state === 'OPEN' &&
        this.config.missingFrameToleranceMs > 0 &&
        this.lastValidTimestampMs !== null &&
        Number.isFinite(result.timestampMs) &&
        result.timestampMs - this.lastValidTimestampMs <= this.config.missingFrameToleranceMs;
      if (canTolerateMissingFrame) return this.output(null);
      // A blink may not start before the face disappears and resume after it
      // returns. This avoids counting camera movement as a blink.
      this.reset();
      return this.output(null);
    }

    const left = clamp(result.leftEyeScore ?? 0, 0, 1);
    const right = clamp(result.rightEyeScore ?? 0, 0, 1);
    this.lastValidTimestampMs = result.timestampMs;
    const alpha = clamp(this.config.smoothingAlpha, 0.05, 1);
    this.leftSmoothed = this.leftSmoothed === null ? left : this.leftSmoothed + alpha * (left - this.leftSmoothed);
    this.rightSmoothed = this.rightSmoothed === null ? right : this.rightSmoothed + alpha * (right - this.rightSmoothed);

    const leftSmoothed = this.leftSmoothed ?? left;
    const rightSmoothed = this.rightSmoothed ?? right;
    const combined =
      this.config.eyeCombination === 'minimum'
        ? Math.min(leftSmoothed, rightSmoothed)
        : (leftSmoothed + rightSmoothed) / 2;
    const asymmetry = Math.abs(leftSmoothed - rightSmoothed);
    const isOpen = combined >= this.config.openThreshold;
    const isReopened = combined >= this.config.reopenThreshold && asymmetry <= this.config.maxEyeAsymmetry;
    const isClosed =
      combined <= this.config.closeThreshold && asymmetry <= this.config.maxEyeAsymmetry;
    const timestamp = result.timestampMs;

    if (isOpen && this.state === 'OPEN') {
      this.hasEstablishedOpen = true;
    }

    if (this.state === 'OPEN') {
      this.openFrameCount = isOpen ? this.openFrameCount + 1 : 0;
      this.closedFrameCount = isClosed ? this.closedFrameCount + 1 : 0;
      if (
        this.hasEstablishedOpen &&
        timestamp >= this.cooldownUntilMs &&
        isClosed &&
        this.closedFrameCount >= this.config.closeFramesRequired
      ) {
        this.state = 'CLOSING';
        this.closureStartMs = timestamp;
        this.leftMaxClosureDepth = 1 - leftSmoothed;
        this.rightMaxClosureDepth = 1 - rightSmoothed;
        this.symmetryAtMax = asymmetry;
      }
      return this.output(null);
    }

    if (this.state === 'CLOSING') {
      this.updateClosureExtrema(asymmetry);
      const closureDuration = timestamp - (this.closureStartMs ?? timestamp);
      if (!isClosed && isReopened) {
        // A close that immediately bounces open is not a valid blink.
        this.state = 'OPEN';
        this.closureStartMs = null;
        this.closedFrameCount = 0;
      } else if (closureDuration > this.config.maxBlinkDurationMs) {
        this.state = 'INVALID';
      } else if (isClosed) {
        this.closedFrameCount += 1;
        if (closureDuration >= this.config.minBlinkDurationMs) {
          this.state = 'CLOSED';
        }
      }
      return this.output(null);
    }

    if (this.state === 'CLOSED') {
      this.updateClosureExtrema(asymmetry);
      const closureDuration = timestamp - (this.closureStartMs ?? timestamp);
      if (closureDuration > this.config.maxBlinkDurationMs) {
        this.state = 'INVALID';
      } else if (isReopened) {
        this.state = 'OPENING';
        this.openFrameCount = 1;
      }
      return this.output(null);
    }

    if (this.state === 'OPENING') {
      this.updateClosureExtrema(asymmetry);
      const closureDuration = timestamp - (this.closureStartMs ?? timestamp);
      if (closureDuration > this.config.maxBlinkDurationMs) {
        this.state = 'INVALID';
        return this.output(null);
      }
      if (!isReopened) {
        this.openFrameCount = 0;
        if (isClosed) this.state = 'CLOSED';
        return this.output(null);
      }
      this.openFrameCount += 1;
      if (this.openFrameCount >= this.config.openFramesRequired) {
        const event: BlinkEvent | null =
          closureDuration >= this.config.minBlinkDurationMs
            ? {
                startTimestampMs: this.closureStartMs ?? timestamp - closureDuration,
                endTimestampMs: timestamp,
                durationMs: closureDuration,
                maxClosureDepth: Math.max(this.leftMaxClosureDepth, this.rightMaxClosureDepth),
                leftMaxClosureDepth: clamp(this.leftMaxClosureDepth, 0, 1),
                rightMaxClosureDepth: clamp(this.rightMaxClosureDepth, 0, 1),
                symmetryAtMax: this.symmetryAtMax,
              }
            : null;
        this.cooldownUntilMs = timestamp + this.config.debounceMs;
        this.state = 'OPEN';
        this.closureStartMs = null;
        this.closedFrameCount = 0;
        this.openFrameCount = 0;
        this.leftMaxClosureDepth = 0;
        this.rightMaxClosureDepth = 0;
        this.symmetryAtMax = 1;
        if (event) this.hasEstablishedOpen = true;
        return this.output(event);
      }
      return this.output(null);
    }

    // INVALID waits for a clean open signal before becoming eligible again.
    if (isOpen) {
      this.openFrameCount += 1;
      if (this.openFrameCount >= this.config.openFramesRequired) {
        this.state = 'OPEN';
        this.hasEstablishedOpen = true;
        this.closedFrameCount = 0;
        this.closureStartMs = null;
      }
    } else {
      this.openFrameCount = 0;
    }
    return this.output(null);
  }

  private updateClosureExtrema(asymmetry: number): void {
    const leftDepth = 1 - (this.leftSmoothed ?? 1);
    const rightDepth = 1 - (this.rightSmoothed ?? 1);
    if (Math.max(leftDepth, rightDepth) > Math.max(this.leftMaxClosureDepth, this.rightMaxClosureDepth)) {
      this.symmetryAtMax = asymmetry;
    }
    this.leftMaxClosureDepth = Math.max(this.leftMaxClosureDepth, leftDepth);
    this.rightMaxClosureDepth = Math.max(this.rightMaxClosureDepth, rightDepth);
  }

  private output(event: BlinkEvent | null): BlinkProcessOutput {
    return {
      state: this.state,
      event,
      leftSmoothed: this.leftSmoothed,
      rightSmoothed: this.rightSmoothed,
    };
  }
}
