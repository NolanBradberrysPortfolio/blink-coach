import { migrateDetectorSettings } from '../settings';
import { DEFAULT_SETTINGS, DETECTOR_PROFILE_VERSION } from '../types';

describe('detector profile migration', () => {
  it('preserves preferences but disables incompatible manual thresholds', () => {
    const stored = { ...DEFAULT_SETTINGS, detectorProfileVersion: undefined, soundEnabled: false, manualThresholdsEnabled: true, reminderIntervalSeconds: 7 };
    const migrated = migrateDetectorSettings(stored);
    expect(migrated.soundEnabled).toBe(false);
    expect(migrated.reminderIntervalSeconds).toBe(7);
    expect(migrated.manualThresholds).toEqual(stored.manualThresholds);
    expect(migrated.manualThresholdsEnabled).toBe(false);
    expect(migrated.detectorProfileVersion).toBe(DETECTOR_PROFILE_VERSION);
  });
  it('retains manual controls after migration, including on subsequent reloads', () => {
    const stored = { ...DEFAULT_SETTINGS, manualThresholdsEnabled: true };
    expect(migrateDetectorSettings(stored).manualThresholdsEnabled).toBe(true);
  });
});
