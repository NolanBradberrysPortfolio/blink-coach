import { clamp } from './math';
import {
  ActiveBlinkThresholds,
  BlinkDetectionConfig,
  BlinkEvent,
  BlinkState,
  EyeFrameResult,
} from './types';

export interface BlinkProcessOutput {
  eyeSignalReady: boolean;
  state: BlinkState;
  event: BlinkEvent | null;
  leftSmoothed: number | null;
  rightSmoothed: number | null;
  thresholds: ActiveBlinkThresholds;
}

type ClosureMode = 'both' | 'left' | 'right';

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
  private decisionLeft: number | null = null;
  private decisionRight: number | null = null;
  private hasEstablishedOpen = false;
  private hasEstablishedLeftOpen = false;
  private hasEstablishedRightOpen = false;
  private closedFrameCount = 0;
  private openFrameCount = 0;
  private closureStartMs: number | null = null;
  private firstClosedAtMs: number | null = null;
  private cooldownUntilMs = 0;
  private leftMaxClosureDepth = 0;
  private rightMaxClosureDepth = 0;
  private symmetryAtMax = 1;
  private closureMode: ClosureMode | null = null;
  private lastValidTimestampMs: number | null = null;
  private baselineStartedAtMs: number | null = null;
  private baselineLeft: number | null = null;
  private baselineRight: number | null = null;
  private adaptiveThresholdsActive = false;
  private baselineSamples: { timestampMs: number; left: number; right: number }[] = [];
  private maximumClosureEvidence: number | null = null;

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
    this.decisionLeft = null;
    this.decisionRight = null;
    this.hasEstablishedOpen = false;
    this.hasEstablishedLeftOpen = false;
    this.hasEstablishedRightOpen = false;
    this.closedFrameCount = 0;
    this.openFrameCount = 0;
    this.closureStartMs = null;
    this.firstClosedAtMs = null;
    this.cooldownUntilMs = 0;
    this.leftMaxClosureDepth = 0;
    this.rightMaxClosureDepth = 0;
    this.symmetryAtMax = 1;
    this.closureMode = null;
    this.lastValidTimestampMs = null;
    this.baselineStartedAtMs = null;
    this.baselineLeft = null;
    this.baselineRight = null;
    this.adaptiveThresholdsActive = false;
    this.baselineSamples = [];
    this.maximumClosureEvidence = null;
  }

  getActiveThresholds(): ActiveBlinkThresholds {
    return this.activeThresholds();
  }

  process(result: EyeFrameResult): BlinkProcessOutput {
    const invalidSignal =
      !result.faceDetected ||
      result.leftEyeScore === null ||
      result.rightEyeScore === null ||
      !Number.isFinite(result.leftEyeScore) ||
      !Number.isFinite(result.rightEyeScore) ||
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

    this.updateOpenBaseline(result.timestampMs, this.leftSmoothed ?? left, this.rightSmoothed ?? right);
    const thresholds = this.activeThresholds();
    // In relative mode, compare each eye with its OWN open baseline. One
    // naturally narrower eye must not be treated as a permanently closed wink.
    const averageBaseline = this.baselineAverage();
    const leftSmoothed = thresholds.adaptive
      ? clamp((this.leftSmoothed ?? left) * averageBaseline / Math.max(0.05, this.baselineLeft ?? averageBaseline), 0, 1)
      : this.leftSmoothed ?? left;
    const rightSmoothed = thresholds.adaptive
      ? clamp((this.rightSmoothed ?? right) * averageBaseline / Math.max(0.05, this.baselineRight ?? averageBaseline), 0, 1)
      : this.rightSmoothed ?? right;
    this.decisionLeft = leftSmoothed;
    this.decisionRight = rightSmoothed;
    if (this.state === 'OPEN') {
      this.hasEstablishedLeftOpen ||= leftSmoothed >= thresholds.openThreshold;
      this.hasEstablishedRightOpen ||= rightSmoothed >= thresholds.openThreshold;
    }
    const combined =
      this.config.eyeCombination === 'minimum'
        ? Math.min(leftSmoothed, rightSmoothed)
        : (leftSmoothed + rightSmoothed) / 2;
    const asymmetry = Math.abs(leftSmoothed - rightSmoothed);
    const isOpen = combined >= thresholds.openThreshold;
    const singleEyeOpenThreshold = this.singleEyeOpenThreshold(thresholds);
    const bothEyesClosed = combined <= thresholds.closeThreshold && asymmetry <= this.config.maxEyeAsymmetry;
    const leftEyeClosedAlone =
      this.config.allowSingleEyeBlinks !== false &&
      this.hasEstablishedLeftOpen &&
      leftSmoothed <= thresholds.closeThreshold &&
      rightSmoothed >= singleEyeOpenThreshold;
    const rightEyeClosedAlone =
      this.config.allowSingleEyeBlinks !== false &&
      this.hasEstablishedRightOpen &&
      rightSmoothed <= thresholds.closeThreshold &&
      leftSmoothed >= singleEyeOpenThreshold;
    const closedMode: ClosureMode | null = bothEyesClosed
      ? 'both'
      : leftEyeClosedAlone
        ? 'left'
        : rightEyeClosedAlone
          ? 'right'
          : null;
    const isClosed = closedMode !== null;
    if (this.state === 'OPEN' && !isClosed) this.maximumClosureEvidence = null;
    if ((isClosed || this.state !== 'OPEN') && result.closureEvidence !== undefined && Number.isFinite(result.closureEvidence)) {
      this.maximumClosureEvidence = Math.max(this.maximumClosureEvidence ?? 0, result.closureEvidence);
    }
    const isReopened = this.isReopened(leftSmoothed, rightSmoothed, combined, asymmetry, thresholds, singleEyeOpenThreshold);
    const timestamp = result.timestampMs;

    if (this.state === 'OPEN') {
      this.openFrameCount = isOpen ? this.openFrameCount + 1 : 0;
      if (this.openFrameCount >= this.config.openFramesRequired) this.hasEstablishedOpen = true;
      if (!isClosed) this.firstClosedAtMs = null;
      else if (this.closedFrameCount === 0) this.firstClosedAtMs = timestamp;
      this.closedFrameCount = isClosed ? this.closedFrameCount + 1 : 0;
      if (
        this.hasEstablishedOpen &&
        timestamp >= this.cooldownUntilMs &&
        isClosed &&
        this.closedFrameCount >= this.config.closeFramesRequired
      ) {
        this.state = 'CLOSING';
        this.closureMode = closedMode ?? 'both';
        this.closureStartMs = this.firstClosedAtMs ?? timestamp;
        this.leftMaxClosureDepth = 1 - leftSmoothed;
        this.rightMaxClosureDepth = 1 - rightSmoothed;
        this.symmetryAtMax = asymmetry;
      }
      return this.output(null, thresholds);
    }

    if (this.state === 'CLOSING') {
      this.updateClosureExtrema(asymmetry);
      const closureDuration = timestamp - (this.closureStartMs ?? timestamp);
      if (!isClosed && isReopened) {
        // Validate the whole closure-to-reopen interval. A natural blink can
        // reopen between samples without ever landing in CLOSED.
        if (closureDuration >= this.config.minBlinkDurationMs && closureDuration <= this.config.maxBlinkDurationMs) {
          this.state = 'OPENING';
          this.openFrameCount = 1;
        } else {
          this.state = 'OPEN';
          this.closureMode = null;
          this.closureStartMs = null;
          this.closedFrameCount = 0;
        }
      } else if (closureDuration > this.config.maxBlinkDurationMs) {
        this.state = 'INVALID';
      } else if (isClosed) {
        this.closedFrameCount += 1;
        if (closureDuration >= this.config.minBlinkDurationMs) {
          this.state = 'CLOSED';
        }
      }
      return this.output(null, thresholds);
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
      return this.output(null, thresholds);
    }

    if (this.state === 'OPENING') {
      this.updateClosureExtrema(asymmetry);
      const closureDuration = timestamp - (this.closureStartMs ?? timestamp);
      if (closureDuration > this.config.maxBlinkDurationMs) {
        this.state = 'INVALID';
        return this.output(null, thresholds);
      }
      if (!isReopened) {
        this.openFrameCount = 0;
        if (isClosed) this.state = 'CLOSED';
        return this.output(null, thresholds);
      }
      this.openFrameCount += 1;
      if (this.openFrameCount >= this.config.openFramesRequired) {
        const event: BlinkEvent | null =
          closureDuration >= this.config.minBlinkDurationMs &&
          (this.maximumClosureEvidence === null || this.maximumClosureEvidence >= (this.config.minimumClosureEvidence ?? 0.5))
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
        this.closureMode = null;
        this.closureStartMs = null;
        this.closedFrameCount = 0;
        this.openFrameCount = 0;
        this.leftMaxClosureDepth = 0;
        this.rightMaxClosureDepth = 0;
        this.symmetryAtMax = 1;
        this.maximumClosureEvidence = null;
        if (event) this.hasEstablishedOpen = true;
        return this.output(event, thresholds);
      }
      return this.output(null, thresholds);
    }

    // INVALID waits for a clean open signal before becoming eligible again.
    if (isOpen) {
      this.openFrameCount += 1;
      if (this.openFrameCount >= this.config.openFramesRequired) {
        this.state = 'OPEN';
        this.closureMode = null;
        this.hasEstablishedOpen = true;
        this.closedFrameCount = 0;
        this.closureStartMs = null;
      }
    } else {
      this.openFrameCount = 0;
    }
    return this.output(null, thresholds);
  }

  private isReopened(
    left: number,
    right: number,
    combined: number,
    asymmetry: number,
    thresholds: ActiveBlinkThresholds,
    singleEyeOpenThreshold: number,
  ): boolean {
    if (this.closureMode === 'left') {
      return left >= thresholds.reopenThreshold && right >= singleEyeOpenThreshold;
    }
    if (this.closureMode === 'right') {
      return right >= thresholds.reopenThreshold && left >= singleEyeOpenThreshold;
    }
    return combined >= thresholds.reopenThreshold && asymmetry <= this.config.maxEyeAsymmetry;
  }

  private singleEyeOpenThreshold(thresholds: ActiveBlinkThresholds): number {
    const ratio = clamp(this.config.singleEyeOpenRatio ?? 0.72, 0.5, 0.95);
    return thresholds.openThreshold * ratio;
  }

  private updateClosureExtrema(asymmetry: number): void {
    const leftDepth = 1 - (this.decisionLeft ?? 1);
    const rightDepth = 1 - (this.decisionRight ?? 1);
    if (Math.max(leftDepth, rightDepth) > Math.max(this.leftMaxClosureDepth, this.rightMaxClosureDepth)) {
      this.symmetryAtMax = asymmetry;
    }
    this.leftMaxClosureDepth = Math.max(this.leftMaxClosureDepth, leftDepth);
    this.rightMaxClosureDepth = Math.max(this.rightMaxClosureDepth, rightDepth);
  }

  private updateOpenBaseline(timestampMs: number, left: number, right: number): void {
    if (this.config.adaptiveBaselineEnabled === false) return;
    const windowMs = this.config.adaptiveBaselineWindowMs ?? 3000;
    this.baselineSamples.push({ timestampMs, left, right });
    this.baselineSamples = this.baselineSamples.filter(sample => timestampMs - sample.timestampMs <= windowMs).slice(-180);
    if (this.baselineStartedAtMs === null) {
      this.baselineStartedAtMs = timestampMs;
      this.baselineLeft = left;
      this.baselineRight = right;
      return;
    }

    const minimumUsefulBaseline = this.config.adaptiveMinimumBaseline ?? 0.18;
    if (this.state === 'OPEN' || this.state === 'INVALID') {
      // A single initial wide-eye frame must not lock the reopen threshold
      // above all later natural openings. Use a recent upper quantile instead.
      // Never move thresholds halfway through a candidate blink.
      const quantile = clamp(this.config.adaptiveBaselineQuantile ?? 0.85, 0.6, 0.95);
      const rank = Math.floor((this.baselineSamples.length - 1) * quantile);
      const candidateLeft = this.baselineSamples.map(sample => sample.left).sort((a, b) => a - b)[rank];
      const candidateRight = this.baselineSamples.map(sample => sample.right).sort((a, b) => a - b)[rank];
      if (!this.adaptiveThresholdsActive || (candidateLeft + candidateRight) / 2 >= minimumUsefulBaseline) {
        this.baselineLeft = candidateLeft;
        this.baselineRight = candidateRight;
      }
    }

    if (!this.adaptiveThresholdsActive) {
      const baselineAverage = this.baselineAverage();
      // Eyewear can put BOTH open eyes below the global close threshold.
      // Requiring an open baseline above that gate prevents adaptation entirely.
      if (
        timestampMs - this.baselineStartedAtMs >= (this.config.adaptiveBaselineWarmupMs ?? 1800) &&
        baselineAverage >= minimumUsefulBaseline &&
        Math.min(this.baselineLeft ?? 0, this.baselineRight ?? 0) < this.config.openThreshold
      ) {
        this.adaptiveThresholdsActive = true;
      }
    }
  }

  private baselineAverage(): number {
    if (this.baselineLeft === null || this.baselineRight === null) return 0;
    return (this.baselineLeft + this.baselineRight) / 2;
  }

  private activeThresholds(): ActiveBlinkThresholds {
    const baselineAverage = this.baselineAverage();
    if (!this.adaptiveThresholdsActive || baselineAverage <= 0) {
      return {
        openThreshold: this.config.openThreshold,
        closeThreshold: this.config.closeThreshold,
        reopenThreshold: this.config.reopenThreshold,
        adaptive: false,
        baselineLeft: this.baselineLeft,
        baselineRight: this.baselineRight,
      };
    }

    const closeRatio = clamp(this.config.adaptiveCloseRatio ?? 0.64, 0.35, 0.85);
    const openRatio = clamp(this.config.adaptiveOpenRatio ?? 0.84, 0.65, 1);
    const reopenRatio = clamp(this.config.adaptiveReopenRatio ?? 0.8, 0.6, 1);
    const closeThreshold = clamp(baselineAverage * closeRatio, 0.18, 0.55);
    const openThreshold = clamp(baselineAverage * openRatio, closeThreshold + 0.06, 0.9);
    const reopenThreshold = clamp(baselineAverage * reopenRatio, closeThreshold + 0.04, openThreshold);
    return {
      openThreshold,
      closeThreshold,
      reopenThreshold,
      adaptive: true,
      baselineLeft: this.baselineLeft,
      baselineRight: this.baselineRight,
    };
  }

  private output(event: BlinkEvent | null, thresholds = this.activeThresholds()): BlinkProcessOutput {
    return {
      eyeSignalReady: this.hasEstablishedOpen && this.state !== 'INVALID',
      state: this.state,
      event,
      leftSmoothed: this.decisionLeft,
      rightSmoothed: this.decisionRight,
      thresholds,
    };
  }
}
