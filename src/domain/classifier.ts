import { clamp } from './math';
import { BlinkDetectionConfig, BlinkEvent, BlinkClassificationResult, CalibrationProfile } from './types';

/**
 * Experimental, wellness-only heuristic. It is intentionally isolated so a
 * future validated classifier can replace it without touching session logic.
 */
export function classifyBlink(
  event: BlinkEvent,
  calibration: CalibrationProfile | null,
  config: BlinkDetectionConfig,
): BlinkClassificationResult {
  const depthThreshold = calibration?.completeClosureThreshold ?? config.incompleteClosureThreshold;
  const durationGood = event.durationMs >= config.minBlinkDurationMs && event.durationMs <= config.completeBlinkMaxDurationMs;
  const symmetryGood = event.symmetryAtMax <= config.maxEyeAsymmetry;
  const depthGood = event.maxClosureDepth >= depthThreshold;
  const score =
    (depthGood ? 0.5 : 0) +
    (durationGood ? 0.3 : 0) +
    (symmetryGood ? 0.2 : 0);
  const complete = score >= 0.75;
  return {
    classification: complete ? 'complete' : 'incomplete',
    confidence: clamp(score, 0, 1),
    reason: complete
      ? 'Good closure depth, duration, and left/right symmetry.'
      : 'Closure depth, duration, or eye symmetry was below the experimental heuristic.',
  };
}
