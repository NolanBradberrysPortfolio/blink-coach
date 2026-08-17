import { compareBlinkEvents } from '../testComparison';
import { DEFAULT_BLINK_CONFIG, BlinkEvent } from '../types';
import { GroundTruthEvent, TestSignalSample } from '../testLabTypes';

function event(timeMs: number, classification: 'complete' | 'incomplete' = 'complete'): BlinkEvent {
  return {
    startTimestampMs: timeMs - 80,
    endTimestampMs: timeMs + 80,
    durationMs: 160,
    maxClosureDepth: 0.8,
    leftMaxClosureDepth: 0.8,
    rightMaxClosureDepth: 0.8,
    symmetryAtMax: 0.05,
    classification,
  };
}

function truth(timeMs: number, type: GroundTruthEvent['type'] = 'blink'): GroundTruthEvent {
  return { id: `gt-${timeMs}`, timeMs, type };
}

const samples: TestSignalSample[] = [
  { timestampMs: 0, left: 0.9, right: 0.9, smoothedLeft: 0.9, smoothedRight: 0.9, faceDetected: true, state: 'OPEN' },
  { timestampMs: 100, left: 0.2, right: 0.2, smoothedLeft: 0.4, smoothedRight: 0.4, faceDetected: true, state: 'CLOSING' },
  { timestampMs: 200, left: 0.9, right: 0.9, smoothedLeft: 0.8, smoothedRight: 0.8, faceDetected: true, state: 'OPEN' },
];

describe('blink test comparison', () => {
  it('matches within temporal tolerance and keeps matching one-to-one', () => {
    const result = compareBlinkEvents(
      [event(100), event(900)],
      [truth(120), truth(940), truth(970)],
      samples,
      DEFAULT_BLINK_CONFIG,
      60,
    );
    expect(result.metrics.truePositives).toBe(2);
    expect(result.metrics.falsePositives).toBe(0);
    expect(result.metrics.falseNegatives).toBe(1);
    expect(result.matches).toHaveLength(2);
  });

  it('calculates precision, recall, F1, count error, and timing error', () => {
    const result = compareBlinkEvents(
      [event(100), event(600), event(1300)],
      [truth(120), truth(1320)],
      samples,
      DEFAULT_BLINK_CONFIG,
      50,
    );
    expect(result.metrics.truePositives).toBe(2);
    expect(result.metrics.falsePositives).toBe(1);
    expect(result.metrics.falseNegatives).toBe(0);
    expect(result.metrics.precision).toBeCloseTo(2 / 3);
    expect(result.metrics.recall).toBe(1);
    expect(result.metrics.f1).toBeCloseTo(0.8);
    expect(result.metrics.blinkCountError).toBe(1);
    expect(result.metrics.meanTimingErrorMs).toBe(20);
    expect(result.metrics.medianTimingErrorMs).toBe(20);
  });

  it('reports incomplete classification only on matched events', () => {
    const result = compareBlinkEvents(
      [event(100, 'incomplete'), event(500, 'complete')],
      [truth(100, 'incompleteBlink'), truth(500, 'blink')],
      samples,
      DEFAULT_BLINK_CONFIG,
      50,
    );
    expect(result.incompleteClassification.supported).toBe(true);
    expect(result.incompleteClassification.truePositives).toBe(1);
    expect(result.incompleteClassification.falsePositives).toBe(0);
    expect(result.incompleteClassification.falseNegatives).toBe(0);
    expect(result.incompleteClassification.f1).toBe(1);
  });

  it('includes diagnostic samples and thresholds for a false positive', () => {
    const result = compareBlinkEvents([event(100)], [], samples, DEFAULT_BLINK_CONFIG, 50);
    expect(result.falsePositives[0].detectorState).toBe('OPEN');
    expect(result.falsePositives[0].thresholds.closeThreshold).toBe(DEFAULT_BLINK_CONFIG.closeThreshold);
    expect(result.falsePositives[0].nearbySamples.length).toBeGreaterThan(0);
    expect(result.falsePositives[0].blinkDurationMs).toBe(160);
  });
});
