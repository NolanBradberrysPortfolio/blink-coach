import { FrameGate } from '../frameGate';
describe('camera scheduling', () => {
  it('accepts jittering 30 FPS frames instead of dropping every other frame', () => {
    const gate = new FrameGate();
    let count = 0;
    for (let n = 0; n < 300; n++) {
      if (gate.shouldProcess(n * 1000 / 30 + (n % 2 ? 0.4 : 0), n / 30, 30)) count++;
    }
    expect(count).toBe(300);
  });
  it('does not count a repeated camera frame or exceed a 15 FPS target', () => {
    const gate = new FrameGate();
    let count = 0;
    for (let n = 0; n < 60; n++) {
      if (gate.shouldProcess(n * 1000 / 60, n / 60, 15)) count++;
    }
    expect(count).toBe(15);
    expect(gate.shouldProcess(2000, 56 / 60, 15)).toBe(false);
  });
});
