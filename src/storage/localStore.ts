import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppSettings,
  CalibrationProfile,
  DEFAULT_SETTINGS,
  SessionSummary,
} from '../domain/types';
import { VideoAnnotationDocument } from '../domain/testLabTypes';

const SETTINGS_KEY = '@blink-coach/settings/v1';
const CALIBRATION_KEY = '@blink-coach/calibration/v1';
const HISTORY_KEY = '@blink-coach/history/v1';
const TEST_ANNOTATIONS_KEY = '@blink-coach/test-lab/annotations/v1';
const FPS30_MIGRATION_KEY = '@blink-coach/settings/fps30-migrated';

export async function loadSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const migrationComplete = await AsyncStorage.getItem(FPS30_MIGRATION_KEY);
    if (migrationComplete !== '1') {
      // The previous production default was 15 FPS. Promote that untouched
      // default once so existing installations receive the short-blink fix;
      // later manual choices such as 10 or 20 FPS are respected.
      if (parsed.inferenceFps === 15) parsed.inferenceFps = 30;
      await AsyncStorage.setItem(FPS30_MIGRATION_KEY, '1');
    }
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      manualThresholds: {
        ...DEFAULT_SETTINGS.manualThresholds,
        ...(parsed.manualThresholds ?? {}),
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function loadCalibration(): Promise<CalibrationProfile | null> {
  const raw = await AsyncStorage.getItem(CALIBRATION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CalibrationProfile;
  } catch {
    return null;
  }
}

export async function saveCalibration(profile: CalibrationProfile): Promise<void> {
  await AsyncStorage.setItem(CALIBRATION_KEY, JSON.stringify(profile));
}

export async function loadHistory(): Promise<SessionSummary[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SessionSummary[]) : [];
  } catch {
    return [];
  }
}

export async function saveHistory(history: SessionSummary[]): Promise<void> {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.removeItem(HISTORY_KEY);
}

export async function loadTestAnnotations(): Promise<Record<string, VideoAnnotationDocument>> {
  const raw = await AsyncStorage.getItem(TEST_ANNOTATIONS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, VideoAnnotationDocument>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveTestAnnotation(document: VideoAnnotationDocument): Promise<void> {
  const existing = await loadTestAnnotations();
  existing[document.videoId] = document;
  await AsyncStorage.setItem(TEST_ANNOTATIONS_KEY, JSON.stringify(existing));
}
