/** Deadline-based throttle: camera jitter must not halve a 30 FPS target. */
export class FrameGate {
  private deadline = 0;
  private mediaTime = -1;
  shouldProcess(nowMs: number, mediaTime: number, fps: number): boolean {
    if (!Number.isFinite(nowMs) || !Number.isFinite(mediaTime) || mediaTime === this.mediaTime) return false;
    const interval = 1000 / Math.max(1, fps);
    if (nowMs < this.deadline - 2) return false;
    this.deadline = Math.max(this.deadline + interval, nowMs);
    this.mediaTime = mediaTime;
    return true;
  }
}
