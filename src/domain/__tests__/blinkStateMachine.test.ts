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
  it.each([0.2, 0.8, undefined])('uses optional independent closure evidence (%s)', (evidence) => {
    const machine = new BlinkStateMachine(DEFAULT_BLINK_CONFIG);
    let count = 0;
    for (let index = 0; index < 40; index++) {
      const closed = index >= 10 && index < 13;
      const sample = frame(index * 1000 / 30, closed ? 0.1 : 0.9);
      sample.closureEvidence = evidence === undefined ? undefined : closed ? evidence : 0;
      if (machine.process(sample).event) count++;
    }
    expect(count).toBe(evidence === 0.2 ? 0 : 1);
  });

  it('uses separate eye baselines rather than treating a narrow eye as a wink', () => {
    const machine = new BlinkStateMachine(DEFAULT_BLINK_CONFIG);
    let count = 0;
    for (let index = 0; index < 150; index++) {
      const closed = index >= 100 && index < 104;
      if (machine.process(pairFrame(index * 1000 / 30, closed ? 0.02 : 0.3, 0.8)).event) count++;
    }
    expect(count).toBe(1);
    const output = machine.process(pairFrame(5100, 0.3, 0.8));
    expect(output.leftSmoothed).toBeCloseTo(output.rightSmoothed!, 2);
  });
  it('does not arm from a single open-looking acquisition frame', () => {
    const machine = new BlinkStateMachine(DEFAULT_BLINK_CONFIG);
    expect(machine.process(frame(0, 0.9)).eyeSignalReady).toBe(false);
    let count = 0;
    for (let index = 1; index < 20; index++) {
      if (machine.process(frame(index * 1000 / 30, index < 10 ? 0.05 : 0.9)).event) count++;
    }
    expect(count).toBe(0);
  });

  it('does not activate low-signal calibration during startup occlusion', () => {
    const machine = new BlinkStateMachine(DEFAULT_BLINK_CONFIG);
    for (let index = 0; index < 45; index++) machine.process(frame(index * 1000 / 30, 0.35));
    expect(machine.getActiveThresholds().adaptive).toBe(false);
  });
  it('arms below the global close gate after a useful low open baseline', () => {
    const machine = new BlinkStateMachine(DEFAULT_BLINK_CONFIG);
    let count = 0;
    for (let index = 0; index < 90; index++) {
      const closed = index >= 65 && index < 71;
      if (machine.process(frame(index * 1000 / 30, closed ? 0.01 : 0.35)).event) count++;
    }
    expect(machine.getActiveThresholds().adaptive).toBe(true);
    expect(count).toBe(1);
  });

  it('does not turn constant low/closed signals into repeated blinks', () => {
    const machine = new BlinkStateMachine(DEFAULT_BLINK_CONFIG);
    let count = 0;
    for (let index = 0; index < 300; index++) {
      if (machine.process(frame(index * 1000 / 30, 0.1 + (index % 2) * 0.02)).event) count++;
    }
    expect(count).toBe(0);
    expect(machine.getActiveThresholds().adaptive).toBe(false);
  });
  it.each(['both', 'left', 'right'])('counts a 100 ms closure at 30 FPS (%s)', (eye) => {
    const machine = new BlinkStateMachine(DEFAULT_BLINK_CONFIG);
    let count = 0;
    for (let index = 0; index < 40; index++) {
      const closed = index >= 10 && index < 13;
      const left = closed && eye !== 'right' ? 0.1 : 0.9;
      const right = closed && eye !== 'left' ? 0.1 : 0.9;
      if (machine.process(pairFrame(index * 1000 / 30, left, right)).event) count++;
    }
    expect(count).toBe(1);
  });

  it('rejects a single bad frame at 30 FPS', () => {
    const machine = new BlinkStateMachine(DEFAULT_BLINK_CONFIG);
    let count = 0;
    for (let index = 0; index < 40; index++) {
      if (machine.process(frame(index * 1000 / 30, index === 10 ? 0 : 0.9)).event) count++;
    }
    expect(count).toBe(0);
  });

  it('recovers from nonfinite eye signals', () => {
    const machine = new BlinkStateMachine(DEFAULT_BLINK_CONFIG);
    machine.process(pairFrame(0, NaN, 0.9));
    expect(run(machine, validBlinkSamples(100))).toBe(1);
  });
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
    const machine = new BlinkStateMachine({ ...DEFAULT_BLINK_CONFIG, smoothingAlpha: 1 });
    const samples: [number, number, boolean?][] = [
      [0, 0.9], [66, 0.9], [132, 0.9],
      [198, 0.1], [218, 0.1], [238, 0.95], [258, 0.95], [278, 0.95],
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

  it.each([0.58, 0.48])('handles an open baseline of %s without changing normal signals', (open) => {
    const machine = new BlinkStateMachine(DEFAULT_BLINK_CONFIG);
    const lowSignalBlink: [number, number, boolean?][] = [
      [0, 0.3], [100, open - 0.03], [200, open], [300, open], [400, open],
      [1800, open], [1900, open], [2000, open],
      [2500, 0.18], [2600, 0.18], [2700, 0.18], [2800, 0.18],
      [2900, open - 0.03], [3000, open], [3100, open], [3200, open],
    ];
    expect(run(machine, lowSignalBlink)).toBe(1);
    expect(machine.getActiveThresholds().adaptive).toBe(open < DEFAULT_BLINK_CONFIG.openThreshold);
    expect(machine.getActiveThresholds().openThreshold).toBeLessThanOrEqual(DEFAULT_BLINK_CONFIG.openThreshold);
  });
});
