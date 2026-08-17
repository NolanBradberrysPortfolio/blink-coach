import { classifyBlink } from '../classifier';
import { DEFAULT_BLINK_CONFIG, BlinkEvent, CalibrationProfile } from '../types';

const calibration: CalibrationProfile = {
  createdAt: '2026-01-01T00:00:00.000Z',
  openLeft: 0.9,
  openRight: 0.9,
  closedLeft: 0.14,
  closedRight: 0.15,
  recommendedOpenThreshold: 0.72,
  recommendedCloseThreshold: 0.35,
  completeClosureThreshold: 0.62,
  sampleCount: 30,
};

function event(overrides: Partial<BlinkEvent>): BlinkEvent {
  return {
    startTimestampMs: 0,
    endTimestampMs: 220,
    durationMs: 220,
    maxClosureDepth: 0.82,
    leftMaxClosureDepth: 0.81,
    rightMaxClosureDepth: 0.82,
    symmetryAtMax: 0.05,
    ...overrides,
  };
}

describe('experimental complete-blink classifier', () => {
  it('classifies deep, plausible, symmetric closure as complete', () => {
    expect(classifyBlink(event({}), calibration, DEFAULT_BLINK_CONFIG).classification).toBe('complete');
  });

  it('classifies shallow closure as incomplete', () => {
    const result = classifyBlink(event({ maxClosureDepth: 0.34 }), calibration, DEFAULT_BLINK_CONFIG);
    expect(result.classification).toBe('incomplete');
    expect(result.reason).toContain('experimental');
  });
});
