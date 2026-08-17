import { ReminderSnapshot } from './types';

export interface ReminderEvaluation extends ReminderSnapshot {
  shouldTrigger: boolean;
}

/** Stateful reminder gate. It fires once per interval/cooldown, never per frame. */
export class ReminderEngine {
  private intervalMs: number;
  private cooldownMs: number;
  private armed = true;
  private cooldownUntilMs: number | null = null;
  private lastBlinkTimestampMs: number | null = null;
  private lastTriggeredAtMs: number | null = null;

  constructor(intervalMs: number, cooldownMs = 12000) {
    this.intervalMs = Math.max(1000, intervalMs);
    this.cooldownMs = Math.max(3000, cooldownMs);
  }

  setInterval(intervalMs: number): void {
    this.intervalMs = Math.max(1000, intervalMs);
  }

  reset(startTimestampMs: number | null = null): void {
    this.armed = true;
    this.cooldownUntilMs = null;
    this.lastBlinkTimestampMs = startTimestampMs;
    this.lastTriggeredAtMs = null;
  }

  recordBlink(timestampMs: number): void {
    this.lastBlinkTimestampMs = timestampMs;
    this.armed = true;
    this.cooldownUntilMs = null;
  }

  evaluate(nowMs: number, active: boolean, faceDetected: boolean): ReminderEvaluation {
    let shouldTrigger = false;
    if (this.cooldownUntilMs !== null && nowMs >= this.cooldownUntilMs) {
      this.cooldownUntilMs = null;
      this.armed = true;
    }

    if (
      active &&
      faceDetected &&
      this.armed &&
      this.lastBlinkTimestampMs !== null &&
      nowMs - this.lastBlinkTimestampMs >= this.intervalMs
    ) {
      shouldTrigger = true;
      this.armed = false;
      this.lastTriggeredAtMs = nowMs;
      this.cooldownUntilMs = nowMs + this.cooldownMs;
    }

    return { ...this.snapshot(), shouldTrigger };
  }

  snapshot(): ReminderSnapshot {
    return {
      armed: this.armed,
      cooldownUntilMs: this.cooldownUntilMs,
      lastBlinkTimestampMs: this.lastBlinkTimestampMs,
      intervalMs: this.intervalMs,
      lastTriggeredAtMs: this.lastTriggeredAtMs,
    };
  }
}
