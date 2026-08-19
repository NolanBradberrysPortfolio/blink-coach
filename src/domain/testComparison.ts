import { median } from './math';
import { BlinkDetectionConfig, BlinkEvent } from './types';
import { GroundTruthEvent, TestSignalSample } from './testLabTypes';

export interface EventMatch {
  predictedIndex: number;
  groundTruthIndex: number;
  predicted: BlinkEvent;
  groundTruth: GroundTruthEvent;
  timingErrorMs: number;
  signedTimingErrorMs: number;
}

export interface BlinkMetrics {
  actualCount: number;
  predictedCount: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  blinkCountError: number;
  meanTimingErrorMs: number;
  medianTimingErrorMs: number;
}

export interface IncompleteClassificationMetrics {
  supported: boolean;
  matchedEvents: number;
  actualIncomplete: number;
  predictedIncomplete: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface DiagnosticIssue {
  kind: 'falsePositive' | 'falseNegative';
  timestampMs: number;
  predictedEvent?: BlinkEvent;
  groundTruthEvent?: GroundTruthEvent;
  nearbySamples: TestSignalSample[];
  detectorState: string;
  thresholds: Pick<
    BlinkDetectionConfig,
    | 'openThreshold'
    | 'closeThreshold'
    | 'reopenThreshold'
    | 'minBlinkDurationMs'
    | 'maxBlinkDurationMs'
    | 'debounceMs'
    | 'smoothingAlpha'
  >;
  blinkDurationMs: number | null;
}

export interface BlinkComparison {
  toleranceMs: number;
  metrics: BlinkMetrics;
  matches: EventMatch[];
  falsePositives: DiagnosticIssue[];
  falseNegatives: DiagnosticIssue[];
  incompleteClassification: IncompleteClassificationMetrics;
}

interface MatchScore {
  count: number;
  error: number;
  pairs: [number, number][];
}

export function blinkEventTimeMs(event: BlinkEvent): number {
  return (event.startTimestampMs + event.endTimestampMs) / 2;
}

export function compareBlinkEvents(
  predictedEvents: BlinkEvent[],
  groundTruthEvents: GroundTruthEvent[],
  samples: TestSignalSample[],
  config: BlinkDetectionConfig,
  toleranceMs = 350,
): BlinkComparison {
  const predicted = [...predictedEvents].sort((a, b) => blinkEventTimeMs(a) - blinkEventTimeMs(b));
  const groundTruth = [...groundTruthEvents].sort((a, b) => a.timeMs - b.timeMs);
  const score = bestOneToOneMatch(predicted, groundTruth, toleranceMs);
  const matches: EventMatch[] = score.pairs.map(([predictedIndex, groundTruthIndex]) => {
    const predictedEvent = predicted[predictedIndex];
    const groundTruthEvent = groundTruth[groundTruthIndex];
    const signedTimingErrorMs = blinkEventTimeMs(predictedEvent) - groundTruthEvent.timeMs;
    return {
      predictedIndex,
      groundTruthIndex,
      predicted: predictedEvent,
      groundTruth: groundTruthEvent,
      timingErrorMs: Math.abs(signedTimingErrorMs),
      signedTimingErrorMs,
    };
  });
  const matchedPredicted = new Set(matches.map((match) => match.predictedIndex));
  const matchedGroundTruth = new Set(matches.map((match) => match.groundTruthIndex));
  const metrics = calculateBlinkMetrics(predicted.length, groundTruth.length, matches);
  const falsePositives = predicted
    .map((event, index) => ({ event, index }))
    .filter(({ index }) => !matchedPredicted.has(index))
    .map(({ event }) => {
      const timestampMs = blinkEventTimeMs(event);
      return createDiagnosticIssue('falsePositive', timestampMs, samples, selectThresholds(config, samples, timestampMs), event);
    });
  const falseNegatives = groundTruth
    .map((event, index) => ({ event, index }))
    .filter(({ index }) => !matchedGroundTruth.has(index))
    .map(({ event }) => createDiagnosticIssue('falseNegative', event.timeMs, samples, selectThresholds(config, samples, event.timeMs), undefined, event));

  return {
    toleranceMs,
    metrics,
    matches,
    falsePositives,
    falseNegatives,
    incompleteClassification: calculateIncompleteClassification(matches),
  };
}

export function calculateBlinkMetrics(
  predictedCount: number,
  actualCount: number,
  matches: Pick<EventMatch, 'timingErrorMs'>[],
): BlinkMetrics {
  const truePositives = matches.length;
  const falsePositives = Math.max(0, predictedCount - truePositives);
  const falseNegatives = Math.max(0, actualCount - truePositives);
  const precision = safeRatio(truePositives, truePositives + falsePositives);
  const recall = safeRatio(truePositives, truePositives + falseNegatives);
  return {
    actualCount,
    predictedCount,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1: f1Score(precision, recall),
    blinkCountError: predictedCount - actualCount,
    meanTimingErrorMs: matches.length === 0 ? 0 : matches.reduce((sum, match) => sum + match.timingErrorMs, 0) / matches.length,
    medianTimingErrorMs: median(matches.map((match) => match.timingErrorMs)),
  };
}

export function calculateIncompleteClassification(matches: EventMatch[]): IncompleteClassificationMetrics {
  const actualIncomplete = matches.filter((match) => match.groundTruth.type === 'incompleteBlink').length;
  const predictedIncomplete = matches.filter((match) => match.predicted.classification === 'incomplete').length;
  const truePositives = matches.filter(
    (match) => match.groundTruth.type === 'incompleteBlink' && match.predicted.classification === 'incomplete',
  ).length;
  const falsePositives = matches.filter(
    (match) => match.groundTruth.type !== 'incompleteBlink' && match.predicted.classification === 'incomplete',
  ).length;
  const falseNegatives = matches.filter(
    (match) => match.groundTruth.type === 'incompleteBlink' && match.predicted.classification !== 'incomplete',
  ).length;
  const precision = safeRatio(truePositives, truePositives + falsePositives);
  const recall = safeRatio(truePositives, truePositives + falseNegatives);
  return {
    supported: matches.length > 0 && (actualIncomplete > 0 || predictedIncomplete > 0),
    matchedEvents: matches.length,
    actualIncomplete,
    predictedIncomplete,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1: f1Score(precision, recall),
  };
}

export function aggregateComparisons(comparisons: BlinkComparison[]): BlinkComparison {
  const allMatches = comparisons.flatMap((comparison) => comparison.matches);
  const predictedCount = comparisons.reduce((sum, comparison) => sum + comparison.metrics.predictedCount, 0);
  const actualCount = comparisons.reduce((sum, comparison) => sum + comparison.metrics.actualCount, 0);
  const metrics = calculateBlinkMetrics(predictedCount, actualCount, allMatches);
  const allClassificationMatches = allMatches;
  return {
    toleranceMs: comparisons[0]?.toleranceMs ?? 350,
    metrics,
    matches: allMatches,
    falsePositives: comparisons.flatMap((comparison) => comparison.falsePositives),
    falseNegatives: comparisons.flatMap((comparison) => comparison.falseNegatives),
    incompleteClassification: calculateIncompleteClassification(allClassificationMatches),
  };
}

function bestOneToOneMatch(
  predicted: BlinkEvent[],
  groundTruth: GroundTruthEvent[],
  toleranceMs: number,
): MatchScore {
  const table: MatchScore[][] = Array.from({ length: predicted.length + 1 }, () =>
    Array.from({ length: groundTruth.length + 1 }, () => ({ count: 0, error: 0, pairs: [] })),
  );
  for (let predictedIndex = predicted.length - 1; predictedIndex >= 0; predictedIndex -= 1) {
    for (let groundTruthIndex = groundTruth.length - 1; groundTruthIndex >= 0; groundTruthIndex -= 1) {
      const choices = [table[predictedIndex + 1][groundTruthIndex], table[predictedIndex][groundTruthIndex + 1]];
      const error = Math.abs(blinkEventTimeMs(predicted[predictedIndex]) - groundTruth[groundTruthIndex].timeMs);
      if (error <= toleranceMs) {
        choices.push({
          count: table[predictedIndex + 1][groundTruthIndex + 1].count + 1,
          error: table[predictedIndex + 1][groundTruthIndex + 1].error + error,
          pairs: [[predictedIndex, groundTruthIndex], ...table[predictedIndex + 1][groundTruthIndex + 1].pairs],
        });
      }
      table[predictedIndex][groundTruthIndex] = choices.reduce(selectBetterMatch);
    }
  }
  return table[0][0];
}

function selectBetterMatch(first: MatchScore, second: MatchScore): MatchScore {
  if (second.count > first.count) return second;
  if (second.count < first.count) return first;
  return second.error < first.error ? second : first;
}

function createDiagnosticIssue(
  kind: DiagnosticIssue['kind'],
  timestampMs: number,
  samples: TestSignalSample[],
  thresholds: DiagnosticIssue['thresholds'],
  predictedEvent?: BlinkEvent,
  groundTruthEvent?: GroundTruthEvent,
): DiagnosticIssue {
  const nearbySamples = samples.filter((sample) => Math.abs(sample.timestampMs - timestampMs) <= 500);
  const fallback = nearbySamples.length > 0 ? nearbySamples : samples.slice().sort((a, b) => Math.abs(a.timestampMs - timestampMs) - Math.abs(b.timestampMs - timestampMs)).slice(0, 5);
  const nearest = fallback[0];
  return {
    kind,
    timestampMs,
    predictedEvent,
    groundTruthEvent,
    nearbySamples: fallback,
    detectorState: nearest?.state ?? 'unknown',
    thresholds,
    blinkDurationMs: predictedEvent?.durationMs ?? null,
  };
}

function selectThresholds(config: BlinkDetectionConfig, samples: TestSignalSample[], timestampMs: number): DiagnosticIssue['thresholds'] {
  const nearest = samples
    .filter((sample) => Math.abs(sample.timestampMs - timestampMs) <= 500)
    .sort((a, b) => Math.abs(a.timestampMs - timestampMs) - Math.abs(b.timestampMs - timestampMs))[0];
  return {
    openThreshold: nearest?.activeOpenThreshold ?? config.openThreshold,
    closeThreshold: nearest?.activeCloseThreshold ?? config.closeThreshold,
    reopenThreshold: nearest?.activeReopenThreshold ?? config.reopenThreshold,
    minBlinkDurationMs: config.minBlinkDurationMs,
    maxBlinkDurationMs: config.maxBlinkDurationMs,
    debounceMs: config.debounceMs,
    smoothingAlpha: config.smoothingAlpha,
  };
}

function safeRatio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function f1Score(precision: number, recall: number): number {
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}
