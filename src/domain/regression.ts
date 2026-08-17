import { BlinkDetectionConfig, CalibrationProfile } from './types';
import { aggregateComparisons, BlinkComparison, BlinkMetrics, compareBlinkEvents } from './testComparison';
import { BlinkTestFixture, FixtureSplit } from './testLabTypes';
import { runEyeFrameFixture } from './testRunner';

export interface FixtureRegressionResult {
  videoId: string;
  split: FixtureSplit;
  metadata: BlinkTestFixture['metadata'];
  run: ReturnType<typeof runEyeFrameFixture>;
  comparison: BlinkComparison;
}

export interface RegressionRun {
  toleranceMs: number;
  config: BlinkDetectionConfig;
  fixtures: FixtureRegressionResult[];
  overall: BlinkComparison;
  tuning: BlinkComparison;
  validation: BlinkComparison;
}

export interface MetricDelta {
  precision: number;
  recall: number;
  f1: number;
  falsePositives: number;
  falseNegatives: number;
}

export interface BaselineComparison {
  baseline: BlinkMetrics;
  current: BlinkMetrics;
  delta: MetricDelta;
  validationRegressed: boolean;
  warnings: string[];
}

export function runRegression(
  fixtures: BlinkTestFixture[],
  config: BlinkDetectionConfig,
  toleranceMs = 350,
  calibration: CalibrationProfile | null = null,
): RegressionRun {
  const results = fixtures.map((fixture) => {
    const run = runEyeFrameFixture(fixture, config, calibration);
    const comparison = compareBlinkEvents(run.predictedEvents, fixture.events, run.samples, config, toleranceMs);
    return {
      videoId: fixture.videoId,
      split: fixture.metadata.split,
      metadata: fixture.metadata,
      run,
      comparison,
    };
  });
  const tuning = aggregateComparisons(results.filter((result) => result.split === 'tuning').map((result) => result.comparison));
  const validation = aggregateComparisons(results.filter((result) => result.split === 'validation').map((result) => result.comparison));
  return {
    toleranceMs,
    config: { ...config },
    fixtures: results,
    overall: aggregateComparisons(results.map((result) => result.comparison)),
    tuning,
    validation,
  };
}

export function compareAgainstBaseline(
  current: RegressionRun,
  baseline: BlinkMetrics,
  baselineValidation: BlinkMetrics | null = null,
): BaselineComparison {
  const currentMetrics = current.overall.metrics;
  const delta: MetricDelta = {
    precision: currentMetrics.precision - baseline.precision,
    recall: currentMetrics.recall - baseline.recall,
    f1: currentMetrics.f1 - baseline.f1,
    falsePositives: currentMetrics.falsePositives - baseline.falsePositives,
    falseNegatives: currentMetrics.falseNegatives - baseline.falseNegatives,
  };
  const warnings: string[] = [];
  const validationRegressed = Boolean(
    baselineValidation && current.validation.metrics.f1 + 0.05 < baselineValidation.f1,
  );
  if (currentMetrics.falsePositives > baseline.falsePositives) warnings.push('False positives increased versus the approved baseline.');
  if (currentMetrics.f1 + 0.01 < baseline.f1) warnings.push('Overall F1 decreased versus the approved baseline.');
  if (validationRegressed) warnings.push('Validation F1 meaningfully decreased versus the approved validation baseline.');
  return { baseline, current: currentMetrics, delta, validationRegressed, warnings };
}

export function scoreRegressionRun(run: RegressionRun): number {
  const metrics = run.tuning.metrics;
  // False positives are deliberately expensive: a reminder caused by an
  // invented blink is more damaging to this wellness loop than a missed cue.
  return metrics.truePositives - metrics.falsePositives * 4 - metrics.falseNegatives;
}
