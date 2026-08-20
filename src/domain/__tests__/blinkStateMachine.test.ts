import { BlinkStateMachine } from '../blinkStateMachine';
import { DEFAULT_BLINK_CONFIG, EyeFrameResult } from '../types';

function frame(timestampMs: number, openness: number, faceDetected = true): EyeFrameResult {
  return { timestampMs, faceDetected, leftEyeScore: faceDetected ? openness : null, rightEyeScore: faceDetected ? openness : null };
}

function pairFrame(timestampMs: number, left: number, right: number): EyeFrameResult {
  return { timestampMs, faceDetected: true, leftEyeScore: left, rightEyeScore: right };
}

function run(machine: BlinkStateMachine, samples: [number, number, boolean?][]): number {
  return samples.reduce((events, [timestamp, openness, face]) => events + (machine.process(frame(timestamp, openness, face)).event ? 1 : 0), 0);
}

function runPairs(machine: BlinkStateMachine, samples: [number, number, number][]): number {
  return samples.reduce((events, [timestamp, left, right]) => events + (machine.process(pairFrame(timestamp, left, right)).event ? 1 : 0), 0);
}

function validBlinkSamples(start = 0): [number, number, boolean?][] {
  return [
    [start, 0.9], [start + 66, 0.9], [start + 132, 0.9],
    [start + 198, 0.1], [start + 264, 0.1], [start + 330, 0.1], [start + 396, 0.1],
    [start + 462, 0.1], [start + 528, 0.1],
    [start + 594, 0.95], [start + 660, 0.95], [start + 726, 0.95],
  ];
}

describe('BlinkStateMachine', () => {
  it('counts one physical blink exactly once', () => {
    const machine = new BlinkStateMachine(DEFAULT_BLINK_CONFIG);
    expect(run(machine, validBlinkSamples())).toBe(1);
    expect(machine.getState()).toBe('OPEN');
  });

  it('counts a sustained blink in either eye exactly once', () => {
    const machine = new BlinkStateMachine(DEFAULT_BLINK_CONFIG);
    const leftEyeBlink: [number, number, number][] = [
      [0, 0.9, 0.9], [66, 0.9, 0.9], [132, 0.9, 0.9],
      [198, 0.1, 0.9], [264, 0.1, 0.9], [330, 0.1, 0.9], [396, 0.1, 0.9], [462, 0.1, 0.9], [528, 0.1, 0.9],
      [594, 0.95, 0.9], [660, 0.95, 0.9], [726, 0.95, 0.9],
    ];
    expect(runPairs(machine, leftEyeBlink)).toBe(1);
    expect(machine.getState()).toBe('OPEN');
  });

  it('rejects a closure that is too short', () => {
    const machine = new BlinkStateMachine(DEFAULT_BLINK_CONFIG);
    const samples: [number, number, boolean?][] = [
      [0, 0.9], [66, 0.9], [132, 0.9],
      [198, 0.1], [264, 0.1], [330, 0.95], [396, 0.95], [462, 0.95],
    ];
    expect(run(machine, samples)).toBe(0);
  });

  it('rejects an excessively long eye closure', () => {
    const machine = new BlinkStateMachine(DEFAULT_BLINK_CONFIG);
    const samples: [number, number, boolean?][] = [
      [0, 0.9], [66, 0.9], [132, 0.9],
      [198, 0.1], [264, 0.1], [330, 0.1], [396, 0.1], [462, 0.1], [528, 0.1],
      [660, 0.1], [792, 0.1], [924, 0.1], [1056, 0.1], [1188, 0.1], [1320, 0.1],
      [1452, 0.1], [1584, 0.1], [1650, 0.95], [1716, 0.95], [1782, 0.95],
    ];
    expect(run(machine, samples)).toBe(0);
  });

  it('resets on face loss and does not bridge a missing face', () => {
    const machine = new BlinkStateMachine(DEFAULT_BLINK_CONFIG);
    const interrupted: [number, number, boolean?][] = [
      [0, 0.9], [66, 0.9], [132, 0.9], [198, 0.1], [264, 0.1], [330, 0.1],
      [396, 0.1, false], [462, 0.9], [528, 0.9], [594, 0.9],
    ];
    expect(run(machine, interrupted)).toBe(0);
    expect(run(machine, validBlinkSamples(700))).toBe(1);
  });

  it('learns a lower open-eye baseline for goggles without changing normal signals', () => {
    const machine = new BlinkStateMachine(DEFAULT_BLINK_CONFIG);
    const lowSignalBlink: [number, number, boolean?][] = [
      [0, 0.3], [100, 0.55], [200, 0.58], [300, 0.58], [400, 0.58],
      [500, 0.18], [600, 0.18], [700, 0.18], [800, 0.18],
      [900, 0.55], [1000, 0.58], [1100, 0.58], [1200, 0.58],
    ];
    expect(run(machine, lowSignalBlink)).toBe(1);
    expect(machine.getActiveThresholds().adaptive).toBe(true);
    expect(machine.getActiveThresholds().openThreshold).toBeLessThan(DEFAULT_BLINK_CONFIG.openThreshold);
  });
});
