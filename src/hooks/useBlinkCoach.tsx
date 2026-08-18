import React, { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BlinkAnalysisPipeline } from '../domain/analysisPipeline';
import { CalibrationCollector } from '../domain/calibration';
import { getEffectiveBlinkConfig, effectiveReminderIntervalSeconds } from '../domain/settings';
import { ReminderEngine } from '../domain/reminderEngine';
import { createSessionSummary, longestNoBlinkInterval, rollingBlinksPerMinute } from '../domain/statistics';
import {
  AppSettings,
  BlinkDetectionConfig,
  BlinkEvent,
  BlinkState,
  CalibrationProfile,
  CalibrationSnapshot,
  CoachMetrics,
  DEFAULT_SETTINGS,
  EyeFrameResult,
  ReminderSnapshot,
  SessionSummary,
  SignalSample,
} from '../domain/types';
import { createBlinkDetector } from '../detectors/createBlinkDetector';
import {
  clearHistory,
  loadCalibration,
  loadHistory,
  loadSettings,
  saveCalibration,
  saveHistory,
  saveSettings,
} from '../storage/localStore';

type CameraState = 'idle' | 'requesting' | 'initializing' | 'ready' | 'lost' | 'error';

interface RuntimeSession {
  id: string;
  startedAtMs: number;
  startedAtWallMs: number;
  saveToHistory: boolean;
  blinkEvents: BlinkEvent[];
  reminderCount: number;
}

export interface BlinkCoachContextValue {
  settings: AppSettings;
  calibrationProfile: CalibrationProfile | null;
  history: SessionSummary[];
  isMonitoring: boolean;
  cameraState: CameraState;
  cameraError: string | null;
  cameraRetryKey: number;
  faceDetected: boolean;
  latestResult: EyeFrameResult | null;
  blinkState: BlinkState;
  inferenceFps: number;
  signalHistory: SignalSample[];
  effectiveConfig: BlinkDetectionConfig;
  metrics: CoachMetrics;
  reminder: ReminderSnapshot;
  reminderPulse: boolean;
  lastBlinkTimestampMs: number | null;
  lastBlinkDurationMs: number | null;
  lastClassification: BlinkEvent['classification'] | null;
  completeBlinkPercentage: number | null;
  incompleteBlinkCount: number;
  reminderCount: number;
  calibration: CalibrationSnapshot;
  updateSettings: (patch: Partial<AppSettings>) => void;
  updateManualThresholds: (patch: Partial<AppSettings['manualThresholds']>) => void;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  retryCamera: () => void;
  handleCameraReady: (video: HTMLVideoElement | null) => void;
  handleCameraError: (message: string) => void;
  handleCameraStreamLost: () => void;
  beginCalibration: () => void;
  resetCalibration: () => void;
  clearSessionHistory: () => void;
  nowMs: () => number;
}

const BlinkCoachContext = createContext<BlinkCoachContextValue | null>(null);

function clockNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function BlinkCoachProvider({ children }: PropsWithChildren): React.ReactElement {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [calibrationProfile, setCalibrationProfile] = useState<CalibrationProfile | null>(null);
  const [history, setHistory] = useState<SessionSummary[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraRetryKey, setCameraRetryKey] = useState(0);
  const [faceDetected, setFaceDetected] = useState(false);
  const [latestResult, setLatestResult] = useState<EyeFrameResult | null>(null);
  const [blinkState, setBlinkState] = useState<BlinkState>('OPEN');
  const [inferenceFps, setInferenceFps] = useState(0);
  const [signalHistory, setSignalHistory] = useState<SignalSample[]>([]);
  const [metrics, setMetrics] = useState<CoachMetrics>({
    rollingBlinksPerMinute: 0,
    timeSinceLastBlinkMs: 0,
    sessionDurationMs: 0,
    totalBlinks: 0,
    longestIntervalMs: 0,
  });
  const [reminder, setReminder] = useState<ReminderSnapshot>({
    armed: true,
    cooldownUntilMs: null,
    lastBlinkTimestampMs: null,
    intervalMs: DEFAULT_SETTINGS.reminderIntervalSeconds * 1000,
    lastTriggeredAtMs: null,
  });
  const [reminderPulse, setReminderPulse] = useState(false);
  const [lastBlinkTimestampMs, setLastBlinkTimestampMs] = useState<number | null>(null);
  const [lastBlinkDurationMs, setLastBlinkDurationMs] = useState<number | null>(null);
  const [lastClassification, setLastClassification] = useState<BlinkEvent['classification'] | null>(null);
  const [completeBlinkPercentage, setCompleteBlinkPercentage] = useState<number | null>(null);
  const [incompleteBlinkCount, setIncompleteBlinkCount] = useState(0);
  const [reminderCount, setReminderCount] = useState(0);
  const [calibration, setCalibration] = useState<CalibrationSnapshot>({
    phase: 'idle',
    phaseStartedAtMs: null,
    openSampleCount: 0,
    closedSampleCount: 0,
    naturalBlinkCount: 0,
    deliberateBlinkCount: 0,
    faceReady: false,
  });

  const settingsRef = useRef(settings);
  const calibrationProfileRef = useRef(calibrationProfile);
  const historyRef = useRef(history);
  const activeRef = useRef(false);
  const faceDetectedRef = useRef(false);
  const lastBlinkTimestampRef = useRef<number | null>(null);
  const runtimeSessionRef = useRef<RuntimeSession | null>(null);
  const pipelineRef = useRef(new BlinkAnalysisPipeline(getEffectiveBlinkConfig(DEFAULT_SETTINGS, null), null));
  const reminderEngineRef = useRef(new ReminderEngine(DEFAULT_SETTINGS.reminderIntervalSeconds * 1000));
  const detectorRef = useRef<Awaited<ReturnType<typeof createBlinkDetector>> | null>(null);
  const processingGenerationRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const videoFrameCallbackRef = useRef<number | null>(null);
  const processingVideoRef = useRef<HTMLVideoElement | null>(null);
  const inferenceTimesRef = useRef<number[]>([]);
  const signalHistoryRef = useRef<SignalSample[]>([]);
  const calibrationRef = useRef<CalibrationCollector | null>(null);
  const reminderPulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);
  const calibrationOnlySessionRef = useRef(false);
  const calibrationProfileSavedRef = useRef(false);

  const effectiveConfig = useMemo(
    () => getEffectiveBlinkConfig(settings, calibrationProfile),
    [settings, calibrationProfile],
  );

  useEffect(() => {
    settingsRef.current = settings;
    reminderEngineRef.current.setInterval(effectiveReminderIntervalSeconds(settings) * 1000);
    if (hydratedRef.current) void saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    calibrationProfileRef.current = calibrationProfile;
    pipelineRef.current.setConfig(effectiveConfig);
    pipelineRef.current.setCalibration(calibrationProfile);
    if (calibrationProfile) void saveCalibration(calibrationProfile);
  }, [calibrationProfile, effectiveConfig]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadSettings(), loadCalibration(), loadHistory()]).then(([storedSettings, storedCalibration, storedHistory]) => {
      if (cancelled) return;
      settingsRef.current = storedSettings;
      setSettings(storedSettings);
      calibrationProfileRef.current = storedCalibration;
      setCalibrationProfile(storedCalibration);
      historyRef.current = storedHistory;
      setHistory(storedHistory);
      pipelineRef.current.setConfig(getEffectiveBlinkConfig(storedSettings, storedCalibration));
      pipelineRef.current.setCalibration(storedCalibration);
      reminderEngineRef.current.setInterval(effectiveReminderIntervalSeconds(storedSettings) * 1000);
      hydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const stopProcessing = useCallback(() => {
    processingGenerationRef.current += 1;
    if (animationFrameRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(animationFrameRef.current);
    }
    if (videoFrameCallbackRef.current !== null && processingVideoRef.current?.cancelVideoFrameCallback) {
      processingVideoRef.current.cancelVideoFrameCallback(videoFrameCallbackRef.current);
    }
    animationFrameRef.current = null;
    videoFrameCallbackRef.current = null;
    processingVideoRef.current = null;
    const detector = detectorRef.current;
    detectorRef.current = null;
    if (detector) void detector.dispose();
  }, []);

  const playReminderSound = useCallback(() => {
    if (!settingsRef.current.soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioContextConstructor =
        window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;
      const context = new AudioContextConstructor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(660, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(520, context.currentTime + 0.18);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.24);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.25);
      oscillator.addEventListener('ended', () => void context.close());
    } catch {
      // Sound is a convenience; a browser audio restriction should not break monitoring.
    }
  }, []);

  const triggerReminder = useCallback(() => {
    setReminderPulse(true);
    if (reminderPulseTimeoutRef.current) clearTimeout(reminderPulseTimeoutRef.current);
    reminderPulseTimeoutRef.current = setTimeout(() => setReminderPulse(false), 1800);
    setReminderCount((value) => value + 1);
    if (runtimeSessionRef.current) runtimeSessionRef.current.reminderCount += 1;
    playReminderSound();
  }, [playReminderSound]);

  const handleFrame = useCallback((result: EyeFrameResult) => {
    if (!activeRef.current) return;
    faceDetectedRef.current = result.faceDetected;
    setFaceDetected(result.faceDetected);
    setLatestResult(result);

    const output = pipelineRef.current.process(result);
    setBlinkState(output.state);
    const sample: SignalSample = output.signalSample;
    signalHistoryRef.current = [...signalHistoryRef.current, sample].slice(-150);
    setSignalHistory(signalHistoryRef.current);

    const collector = calibrationRef.current;
    if (collector) {
      collector.recordFrame(result);
      collector.tick(result.timestampMs);
      if (output.event) collector.recordBlink(output.event);
      const snapshot = collector.snapshot();
      setCalibration(snapshot);
      if (snapshot.phase === 'complete' && !calibrationProfileSavedRef.current) {
        const profile = collector.buildProfile();
        if (profile) {
          calibrationProfileRef.current = profile;
          calibrationProfileSavedRef.current = true;
          setCalibrationProfile(profile);
        }
      }
    }

    if (output.event) {
      const event: BlinkEvent = output.event;
      if (runtimeSessionRef.current) runtimeSessionRef.current.blinkEvents.push(event);
      const sessionEvents = runtimeSessionRef.current?.blinkEvents ?? [];
      const completeCount = sessionEvents.filter((item) => item.classification === 'complete').length;
      setCompleteBlinkPercentage(sessionEvents.length > 0 ? (completeCount / sessionEvents.length) * 100 : null);
      setIncompleteBlinkCount(sessionEvents.filter((item) => item.classification === 'incomplete').length);
      lastBlinkTimestampRef.current = result.timestampMs;
      setLastBlinkTimestampMs(result.timestampMs);
      setLastBlinkDurationMs(output.event.durationMs);
      setLastClassification(event.classification ?? null);
      reminderEngineRef.current.recordBlink(result.timestampMs);
      setReminder(reminderEngineRef.current.snapshot());
    }
  }, []);

  const startProcessing = useCallback((video: HTMLVideoElement) => {
    stopProcessing();
    processingVideoRef.current = video;
    const generation = processingGenerationRef.current;
    setCameraState('initializing');
    void (async () => {
      try {
        const detector = await createBlinkDetector();
        if (!activeRef.current || generation !== processingGenerationRef.current) {
          await detector.dispose();
          return;
        }
        detectorRef.current = detector;
        await detector.initialize();
        if (!activeRef.current || generation !== processingGenerationRef.current) return;
        setCameraState('ready');
        let lastInferenceAt = 0;
        let inferenceBusy = false;
        const scheduleNextFrame = () => {
          if (!activeRef.current || generation !== processingGenerationRef.current || typeof window === 'undefined') return;
          if (typeof video.requestVideoFrameCallback === 'function') {
            videoFrameCallbackRef.current = video.requestVideoFrameCallback(() => {
              videoFrameCallbackRef.current = null;
              tick(clockNow());
            });
          } else {
            animationFrameRef.current = window.requestAnimationFrame((frameTime) => {
              animationFrameRef.current = null;
              tick(frameTime);
            });
          }
        };
        const tick = (frameTime: number) => {
          if (!activeRef.current || generation !== processingGenerationRef.current) return;
          const targetInterval = 1000 / settingsRef.current.inferenceFps;
          if (!inferenceBusy && frameTime - lastInferenceAt >= targetInterval && video.readyState >= 2) {
            lastInferenceAt = frameTime;
            inferenceBusy = true;
            const timestampMs = clockNow();
            void detector.processFrame(video, timestampMs)
              .then((result) => {
                if (!activeRef.current || generation !== processingGenerationRef.current) return;
                inferenceTimesRef.current = [...inferenceTimesRef.current.filter((value) => timestampMs - value < 1000), timestampMs];
                setInferenceFps(inferenceTimesRef.current.length);
                handleFrame(result);
              })
              .catch(() => {
                if (activeRef.current && generation === processingGenerationRef.current) {
                  setCameraState('error');
                  setCameraError('MediaPipe stopped responding. Tap Try again to reload the local detector.');
                }
              })
              .finally(() => {
                inferenceBusy = false;
              });
          }
          scheduleNextFrame();
        };
        scheduleNextFrame();
      } catch (error) {
        if (activeRef.current && generation === processingGenerationRef.current) {
          const message = error instanceof Error ? error.message : 'MediaPipe could not be loaded.';
          setCameraState('error');
          setCameraError(`The local blink detector could not start. ${message}`);
        }
      }
    })();
  }, [handleFrame, stopProcessing]);

  const handleCameraReady = useCallback((video: HTMLVideoElement | null) => {
    if (!video) {
      stopProcessing();
      if (activeRef.current) setCameraState('requesting');
      return;
    }
    if (activeRef.current) startProcessing(video);
  }, [startProcessing, stopProcessing]);

  const handleCameraError = useCallback((message: string) => {
    if (!activeRef.current) return;
    stopProcessing();
    setCameraState('error');
    setCameraError(message);
  }, [stopProcessing]);

  const handleCameraStreamLost = useCallback(() => {
    if (!activeRef.current) return;
    stopProcessing();
    faceDetectedRef.current = false;
    setFaceDetected(false);
    setCameraState('lost');
    setCameraError('The camera temporarily disappeared. Keep Blink Coach in the foreground and tap Try again.');
  }, [stopProcessing]);

  const startMonitoring = useCallback(() => {
    if (activeRef.current) return;
    const startTimestampMs = clockNow();
    const session: RuntimeSession = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startedAtMs: startTimestampMs,
      startedAtWallMs: Date.now(),
      saveToHistory: !calibrationOnlySessionRef.current,
      blinkEvents: [],
      reminderCount: 0,
    };
    activeRef.current = true;
    calibrationOnlySessionRef.current = false;
    runtimeSessionRef.current = session;
    pipelineRef.current.reset();
    pipelineRef.current.setConfig(effectiveConfig);
    pipelineRef.current.setCalibration(calibrationProfileRef.current);
    reminderEngineRef.current.reset(startTimestampMs);
    lastBlinkTimestampRef.current = startTimestampMs;
    signalHistoryRef.current = [];
    inferenceTimesRef.current = [];
    setSignalHistory([]);
    setLastBlinkTimestampMs(startTimestampMs);
    setLastBlinkDurationMs(null);
    setLastClassification(null);
    setCompleteBlinkPercentage(null);
    setIncompleteBlinkCount(0);
    setReminderCount(0);
    setMetrics({
      rollingBlinksPerMinute: 0,
      timeSinceLastBlinkMs: 0,
      sessionDurationMs: 0,
      totalBlinks: 0,
      longestIntervalMs: 0,
    });
    setReminder(reminderEngineRef.current.snapshot());
    setFaceDetected(false);
    setLatestResult(null);
    setBlinkState('OPEN');
    setInferenceFps(0);
    setCameraError(null);
    setCameraState('requesting');
    setIsMonitoring(true);
  }, [effectiveConfig]);

  const stopMonitoring = useCallback(() => {
    if (!activeRef.current) return;
    const session = runtimeSessionRef.current;
    const endTimestampMs = clockNow();
    activeRef.current = false;
    stopProcessing();
    runtimeSessionRef.current = null;
    setIsMonitoring(false);
    setCameraState('idle');
    setFaceDetected(false);
    faceDetectedRef.current = false;
    setLatestResult(null);
    setBlinkState('OPEN');
    setInferenceFps(0);
    if (session && session.saveToHistory && endTimestampMs - session.startedAtMs >= 1000) {
      const summary = createSessionSummary({
        id: session.id,
        startedAt: new Date(session.startedAtWallMs).toISOString(),
        endedAt: new Date().toISOString(),
        startTimestampMs: session.startedAtMs,
        endTimestampMs,
        blinkEvents: session.blinkEvents,
        reminderCount: session.reminderCount,
      });
      const nextHistory = [summary, ...historyRef.current].slice(0, 50);
      historyRef.current = nextHistory;
      setHistory(nextHistory);
      void saveHistory(nextHistory);
    }
  }, [stopProcessing]);

  const retryCamera = useCallback(() => {
    if (!activeRef.current) return;
    stopProcessing();
    setCameraError(null);
    setCameraState('requesting');
    setCameraRetryKey((value) => value + 1);
  }, [stopProcessing]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      settingsRef.current = next;
      return next;
    });
  }, []);

  const updateManualThresholds = useCallback((patch: Partial<AppSettings['manualThresholds']>) => {
    setSettings((current) => {
      const next = { ...current, manualThresholds: { ...current.manualThresholds, ...patch } };
      settingsRef.current = next;
      return next;
    });
  }, []);

  const beginCalibration = useCallback(() => {
    const collector = new CalibrationCollector();
    collector.start(clockNow());
    calibrationProfileSavedRef.current = false;
    calibrationRef.current = collector;
    setCalibration(collector.snapshot());
    if (!activeRef.current) {
      calibrationOnlySessionRef.current = true;
      startMonitoring();
    }
  }, [startMonitoring]);

  const resetCalibration = useCallback(() => {
    calibrationRef.current = null;
    calibrationProfileRef.current = null;
    setCalibrationProfile(null);
    setCalibration({
      phase: 'idle',
      phaseStartedAtMs: null,
      openSampleCount: 0,
      closedSampleCount: 0,
      naturalBlinkCount: 0,
      deliberateBlinkCount: 0,
      faceReady: false,
    });
  }, []);

  const clearSessionHistory = useCallback(() => {
    historyRef.current = [];
    setHistory([]);
    void clearHistory();
  }, []);

  useEffect(() => {
    if (!isMonitoring) return undefined;
    const timer = setInterval(() => {
      const now = clockNow();
      const session = runtimeSessionRef.current;
      const lastBlink = lastBlinkTimestampRef.current;
      const blinkTimestamps = session?.blinkEvents.map((event) => event.endTimestampMs) ?? [];
      const sessionStart = session?.startedAtMs ?? now;
      const duration = Math.max(0, now - sessionStart);
      const reminderResult = reminderEngineRef.current.evaluate(now, activeRef.current, faceDetectedRef.current);
      setReminder(reminderResult);
      if (reminderResult.shouldTrigger) triggerReminder();
      setMetrics({
        rollingBlinksPerMinute: rollingBlinksPerMinute(blinkTimestamps, now),
        timeSinceLastBlinkMs: lastBlink === null ? 0 : Math.max(0, now - lastBlink),
        sessionDurationMs: duration,
        totalBlinks: blinkTimestamps.length,
        longestIntervalMs: longestNoBlinkInterval(sessionStart, now, blinkTimestamps),
      });
      if (calibrationRef.current) {
        calibrationRef.current.tick(now);
        setCalibration(calibrationRef.current.snapshot());
      }
    }, 250);
    return () => clearInterval(timer);
  }, [isMonitoring, triggerReminder]);

  useEffect(() => () => {
    activeRef.current = false;
    stopProcessing();
    if (reminderPulseTimeoutRef.current) clearTimeout(reminderPulseTimeoutRef.current);
  }, [stopProcessing]);

  const value = useMemo<BlinkCoachContextValue>(() => ({
    settings,
    calibrationProfile,
    history,
    isMonitoring,
    cameraState,
    cameraError,
    cameraRetryKey,
    faceDetected,
    latestResult,
    blinkState,
    inferenceFps,
    signalHistory,
    effectiveConfig,
    metrics,
    reminder,
    reminderPulse,
    lastBlinkTimestampMs,
    lastBlinkDurationMs,
    lastClassification,
    completeBlinkPercentage,
    incompleteBlinkCount,
    reminderCount,
    calibration,
    updateSettings,
    updateManualThresholds,
    startMonitoring,
    stopMonitoring,
    retryCamera,
    handleCameraReady,
    handleCameraError,
    handleCameraStreamLost,
    beginCalibration,
    resetCalibration,
    clearSessionHistory,
    nowMs: clockNow,
  }), [
    settings,
    calibrationProfile,
    history,
    isMonitoring,
    cameraState,
    cameraError,
    cameraRetryKey,
    faceDetected,
    latestResult,
    blinkState,
    inferenceFps,
    signalHistory,
    effectiveConfig,
    metrics,
    reminder,
    reminderPulse,
    lastBlinkTimestampMs,
    lastBlinkDurationMs,
    lastClassification,
    completeBlinkPercentage,
    incompleteBlinkCount,
    reminderCount,
    calibration,
    updateSettings,
    updateManualThresholds,
    startMonitoring,
    stopMonitoring,
    retryCamera,
    handleCameraReady,
    handleCameraError,
    handleCameraStreamLost,
    beginCalibration,
    resetCalibration,
    clearSessionHistory,
  ]);

  return <BlinkCoachContext.Provider value={value}>{children}</BlinkCoachContext.Provider>;
}

export function useBlinkCoach(): BlinkCoachContextValue {
  const value = useContext(BlinkCoachContext);
  if (!value) throw new Error('useBlinkCoach must be used inside BlinkCoachProvider.');
  return value;
}
