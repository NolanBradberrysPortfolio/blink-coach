import { BlinkDetectionConfig, AppSettings, CalibrationProfile, DEFAULT_BLINK_CONFIG } from './types';
import { clamp } from './math';

export function effectiveReminderIntervalSeconds(settings: AppSettings): number {
  if (settings.reminderIntervalSeconds === -1) {
    return clamp(settings.customReminderIntervalSeconds, 3, 120);
  }
  return settings.reminderIntervalSeconds;
}

export function getEffectiveBlinkConfig(
  settings: AppSettings,
  calibration: CalibrationProfile | null,
): BlinkDetectionConfig {
  const base: BlinkDetectionConfig = {
    ...DEFAULT_BLINK_CONFIG,
    ...(calibration
      ? {
          openThreshold: calibration.recommendedOpenThreshold,
          closeThreshold: calibration.recommendedCloseThreshold,
          reopenThreshold: clamp(calibration.recommendedOpenThreshold - 0.03, 0.48, 0.78),
        }
      : {}),
  };
  if (!settings.manualThresholdsEnabled) return base;
  return {
    ...base,
    openThreshold: clamp(settings.manualThresholds.openThreshold, 0.35, 0.95),
    closeThreshold: clamp(settings.manualThresholds.closeThreshold, 0.05, 0.7),
    reopenThreshold: clamp(settings.manualThresholds.openThreshold - 0.03, 0.3, 0.9),
    minBlinkDurationMs: clamp(settings.manualThresholds.minBlinkDurationMs, 30, 300),
    maxBlinkDurationMs: clamp(settings.manualThresholds.maxBlinkDurationMs, 300, 2000),
  };
}
