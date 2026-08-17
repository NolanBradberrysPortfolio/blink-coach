import { BlinkDetectionConfig, CalibrationProfile } from './types';
import { BlinkTestFixture } from './testLabTypes';
import { RegressionRun, runRegression, scoreRegressionRun } from './regression';

export interface ParameterSearchOptions {
  closeThresholds?: number[];
  openThresholds?: number[];
  smoothingAlphas?: number[];
  minBlinkDurationsMs?: number[];
  debounceMsValues?: number[];
  toleranceMs?: number;
  topK?: number;
}

export interface ParameterSearchCandidate {
  rank: number;
  score: number;
  config: BlinkDetectionConfig;
  tuning: RegressionRun;
}

export interface ParameterSearchResult {
  candidates: ParameterSearchCandidate[];
  evaluatedCount: number;
}

export function searchBlinkParameters(
  fixtures: BlinkTestFixture[],
  baseConfig: BlinkDetectionConfig,
  calibration: CalibrationProfile | null = null,
  options: ParameterSearchOptions = {},
): ParameterSearchResult {
  const tuningFixtures = fixtures.filter((fixture) => fixture.metadata.split === 'tuning');
  const configs = buildCandidateConfigs(baseConfig, options);
  const candidates = configs.map((config) => {
    const tuning = runRegression(tuningFixtures, config, options.toleranceMs ?? 350, calibration);
    return { rank: 0, score: scoreRegressionRun(tuning), config, tuning };
  }).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.tuning.tuning.metrics.f1 - a.tuning.tuning.metrics.f1;
  });
  const topK = Math.max(1, options.topK ?? 10);
  return {
    evaluatedCount: candidates.length,
    candidates: candidates.slice(0, topK).map((candidate, index) => ({ ...candidate, rank: index + 1 })),
  };
}

export function buildCandidateConfigs(
  baseConfig: BlinkDetectionConfig,
  options: ParameterSearchOptions = {},
): BlinkDetectionConfig[] {
  const closeThresholds = options.closeThresholds ?? [0.3, 0.34, 0.38, 0.42];
  const openThresholds = options.openThresholds ?? [0.58, 0.62, 0.66];
  const smoothingAlphas = options.smoothingAlphas ?? [0.32, 0.42, 0.55];
  const minBlinkDurationsMs = options.minBlinkDurationsMs ?? [60, 80, 110];
  const debounceMsValues = options.debounceMsValues ?? [200, 280, 360];
  const configs: BlinkDetectionConfig[] = [];
  for (const closeThreshold of closeThresholds) {
    for (const openThreshold of openThresholds) {
      if (openThreshold <= closeThreshold + 0.08) continue;
      for (const smoothingAlpha of smoothingAlphas) {
        for (const minBlinkDurationMs of minBlinkDurationsMs) {
          for (const debounceMs of debounceMsValues) {
            configs.push({
              ...baseConfig,
              closeThreshold,
              openThreshold,
              reopenThreshold: Math.max(closeThreshold + 0.05, openThreshold - 0.03),
              smoothingAlpha,
              minBlinkDurationMs,
              debounceMs,
            });
          }
        }
      }
    }
  }
  return configs;
}
