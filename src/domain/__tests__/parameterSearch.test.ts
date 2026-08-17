import { buildCandidateConfigs } from '../parameterSearch';
import { compareAgainstBaseline, RegressionRun, scoreRegressionRun } from '../regression';
import { DEFAULT_BLINK_CONFIG } from '../types';

describe('blink parameter search and regression scoring', () => {
  it('builds deterministic candidates and preserves centralized parameters', () => {
    const configs = buildCandidateConfigs(DEFAULT_BLINK_CONFIG, {
      closeThresholds: [0.3, 0.4],
      openThresholds: [0.6],
      smoothingAlphas: [0.4],
      minBlinkDurationsMs: [70],
      debounceMsValues: [250, 300],
    });
    expect(configs).toHaveLength(4);
    expect(configs[0].incompleteClosureThreshold).toBe(DEFAULT_BLINK_CONFIG.incompleteClosureThreshold);
    expect(configs[0].reopenThreshold).toBeGreaterThan(configs[0].closeThreshold);
  });

  it('penalizes false positives more strongly than false negatives', () => {
    const falsePositiveRun = fakeRun({ truePositives: 10, falsePositives: 1, falseNegatives: 0 });
    const falseNegativeRun = fakeRun({ truePositives: 10, falsePositives: 0, falseNegatives: 1 });
    expect(scoreRegressionRun(falsePositiveRun)).toBeLessThan(scoreRegressionRun(falseNegativeRun));
  });

  it('warns when the current validation result regresses', () => {
    const current = fakeRun({ truePositives: 7, falsePositives: 1, falseNegatives: 3 });
    current.validation = { ...current.validation, metrics: metrics(7, 1, 3) };
    const baseline = metrics(9, 0, 1);
    const comparison = compareAgainstBaseline(current, baseline, baseline);
    expect(comparison.validationRegressed).toBe(true);
    expect(comparison.warnings.join(' ')).toContain('Validation');
  });
});

function metrics(truePositives: number, falsePositives: number, falseNegatives: number) {
  const precision = truePositives / (truePositives + falsePositives);
  const recall = truePositives / (truePositives + falseNegatives);
  return {
    actualCount: truePositives + falseNegatives,
    predictedCount: truePositives + falsePositives,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1: (2 * precision * recall) / (precision + recall),
    blinkCountError: falsePositives - falseNegatives,
    meanTimingErrorMs: 0,
    medianTimingErrorMs: 0,
  };
}

function fakeRun(counts: { truePositives: number; falsePositives: number; falseNegatives: number }): RegressionRun {
  const aggregate = { metrics: metrics(counts.truePositives, counts.falsePositives, counts.falseNegatives) } as RegressionRun['overall'];
  return {
    toleranceMs: 350,
    config: DEFAULT_BLINK_CONFIG,
    fixtures: [],
    overall: aggregate,
    tuning: aggregate,
    validation: aggregate,
  };
}
