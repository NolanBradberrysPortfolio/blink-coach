import { BlinkStateMachine } from '../blinkStateMachine';
import { DEFAULT_BLINK_CONFIG, EyeFrameResult } from '../types';

function frame(timestampMs: number, openness: number, faceDetected = true): EyeFrameResult {
  return { timestampMs, faceDetected, leftEyeScore: faceDetected ? openness : null, rightEyeScore: faceDetected ? openness : null };
}

function run(machine: BlinkStateMachine, samples: [number, number, boolean?][]): number {
  return samples.reduce((events, [timestamp, openness, face]) => events + (machine.process(frame(timestamp, openness, face)).event ? 1 : 0), 0);
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
});
