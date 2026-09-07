import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useBlinkCoach } from '../hooks/useBlinkCoach';
import { CameraPreview } from './CameraPreview';
import { Card, Chip, NumberField, PrimaryButton, SecondaryButton, ToggleRow } from './Ui';
import { createBlinkDetector } from '../detectors/createBlinkDetector';
import { BlinkAnalysisPipeline } from '../domain/analysisPipeline';
import { FrameGate } from '../domain/frameGate';
import { BlinkDetector, BlinkEvent, DETECTOR_PROFILE_VERSION, SignalSample } from '../domain/types';
import { DIAGNOSTIC_CONSENT_VERSION, DIAGNOSTIC_MAX_BYTES, DiagnosticReceipt, preferredRecordingMime, validateDiagnosticSubmission } from '../domain/diagnosticReport';
import { createReceipt, deleteDiagnostic, readReceipts, sendDiagnostic } from '../diagnostics/upload';
import { colors } from './theme';

type Phase = 'intro' | 'camera' | 'recording' | 'review' | 'sending' | 'sent';
export function DiagnosticReportPanel(): React.ReactElement {
  const coach = useBlinkCoach();
  const [phase, setPhase] = useState<Phase>('intro');
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [target, setTarget] = useState<5 | 10>(5);
  const [actual, setActual] = useState(-1);
  const [consent, setConsent] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [detectorWarning, setDetectorWarning] = useState('');
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<DiagnosticReceipt[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [detected, setDetected] = useState(0);
  const video = useRef<HTMLVideoElement | null>(null);
  const detector = useRef<BlinkDetector | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const blob = useRef<Blob | null>(null);
  const duration = useRef(0);
  const mounted = useRef(true);
  const recording = useRef(false);
  const raf = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const frames = useRef<SignalSample[]>([]);
  const events = useRef<BlinkEvent[]>([]);
  const receipt = useRef<DiagnosticReceipt | null>(null);
  const upload = useRef<AbortController | null>(null);
  const captureSettings = useRef<Record<string, unknown>>({});
  const initial = useRef({ detectorVersion: DETECTOR_PROFILE_VERSION,
    appRevision: process.env.EXPO_PUBLIC_APP_REVISION ?? 'development', config: coach.effectiveConfig,
    calibration: coach.calibrationProfile, targetFps: coach.settings.inferenceFps,
    previousFps: coach.inferenceFps, previousCameraState: coach.cameraState,
    previousSamples: coach.signalHistory.slice(-60) });
  const clearTimers = useCallback(() => { cancelAnimationFrame(raf.current); if (timer.current) clearInterval(timer.current); timer.current = null; }, []);
  useEffect(() => {
    mounted.current = true;
    coach.stopMonitoring(); queueMicrotask(() => { if (mounted.current) setReceipts(readReceipts()); });
    return () => {
      mounted.current = false; recording.current = false; clearTimers(); upload.current?.abort();
      if (recorder.current?.state === 'recording') recorder.current.stop();
      void detector.current?.dispose(); detector.current = null;
    };
  // Preserve the failure snapshot captured on entry; do not restart when coach state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const onReady = useCallback((element: HTMLVideoElement | null) => { video.current = element; setReady(Boolean(element)); }, []);
  const stop = useCallback(() => {
    if (!recording.current) return;
    recording.current = false; clearTimers();
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, [clearTimers]);
  const cameraError = useCallback((message: string) => { setError(message); stop(); setActive(false); }, [stop]);
  const lost = useCallback(() => { cameraError('Camera interrupted. Review the partial clip or record again.'); }, [cameraError]);
  useEffect(() => { const hidden = () => { if (document.visibilityState !== 'visible') { if (recording.current) cameraError('Recording stopped because the app went into the background.'); setActive(false); } }; document.addEventListener('visibilitychange', hidden); return () => document.removeEventListener('visibilitychange', hidden); }, [cameraError]);

  const openCamera = () => {
    if (typeof MediaRecorder === 'undefined') { setError('This browser cannot record diagnostic clips. Please open Blink Coach in current iPhone Safari.'); return; }
    setError(''); setPreview(null); blob.current = null; receipt.current = null; setConsent(false); setActual(-1); setElapsed(0); setDetected(0); setPhase('camera'); setActive(true);
  };
  const start = async () => {
    const element = video.current; const stream = element?.srcObject as MediaStream | null;
    if (!element || !stream || recording.current) return;
    setReady(false); setError(''); setDetectorWarning('');
    try {
      if (!detector.current) {
        const next = await createBlinkDetector();
        try { await next.initialize(); if (!mounted.current) { await next.dispose(); return; } detector.current = next; }
        catch { await next.dispose(); setDetectorWarning('Eye analysis could not start. The video can still be sent to diagnose this failure.'); }
      }
      if (!mounted.current || !video.current || stream.getVideoTracks().every(t => t.readyState === 'ended')) return;
      const mimeType = preferredRecordingMime(type => MediaRecorder.isTypeSupported(type));
      const media = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 1800000 });
      recorder.current = media;
      const chunks: Blob[] = []; let bytes = 0;
      frames.current = []; events.current = []; duration.current = 0;
      const pipeline = new BlinkAnalysisPipeline(initial.current.config, initial.current.calibration);
      const gate = new FrameGate(); const started = performance.now();
      captureSettings.current = { width: element.videoWidth, height: element.videoHeight, cameraFps: stream.getVideoTracks()[0]?.getSettings().frameRate ?? null, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
      media.ondataavailable = event => { if (event.data.size) { chunks.push(event.data); bytes += event.data.size; if (bytes > DIAGNOSTIC_MAX_BYTES) { setError('The clip reached the size limit. Record a shorter clip.'); stop(); } } };
      media.onerror = () => { setError('Recording failed. Please record again.'); stop(); };
      media.onstop = () => {
        if (!mounted.current) return;
        duration.current = Math.min(35000, performance.now() - started);
        const recordingBlob = new Blob(chunks, { type: (media.mimeType || mimeType || 'video/mp4').split(';')[0] });
        blob.current = recordingBlob; setPreview(URL.createObjectURL(recordingBlob)); setElapsed(duration.current); setPhase('review'); setActive(false); setDetected(events.current.length);
      };
      recording.current = true; setPhase('recording'); media.start(500);
      const tick = async () => {
        if (!recording.current || !mounted.current) return;
        const now = performance.now(), timestampMs = now - started;
        if (detector.current && element.readyState >= 2 && gate.shouldProcess(now, element.currentTime, initial.current.targetFps)) {
          try {
            const result = await detector.current.processFrame(element, now);
            if (recording.current) {
              const output = pipeline.process({ ...result, timestampMs }); frames.current.push(output.signalSample);
              if (output.event) { events.current.push(output.event); setDetected(events.current.length); }
            }
          } catch { setDetectorWarning('Eye analysis failed during recording. The partial diagnostics and video are retained.'); }
        }
        if (recording.current) raf.current = requestAnimationFrame(() => { void tick(); });
      };
      void tick();
      timer.current = setInterval(() => { const value = performance.now() - started; setElapsed(value); if (value >= (target === 5 ? 20000 : 30000)) stop(); }, 150);
    } catch { setError('The recording could not start. Please retry in Safari.'); recording.current = false; clearTimers(); setPhase('camera'); setReady(true); }
  };
  const send = async () => {
    if (!blob.current) return;
    const invalid = validateDiagnosticSubmission(blob.current.size, duration.current, actual, consent);
    if (invalid) { setError(invalid); return; }
    setError(''); setPhase('sending'); setProgress(0); upload.current = new AbortController();
    try {
      receipt.current ??= createReceipt();
      const sent = await sendDiagnostic(blob.current, { version: 1, consent: true, consentVersion: DIAGNOSTIC_CONSENT_VERSION,
        expectedBlinks: target, actualBlinks: actual, byteLength: blob.current.size, durationMs: duration.current, mimeType: blob.current.type,
        diagnostics: { ...initial.current, capture: captureSettings.current, inferenceFps: frames.current.length / (duration.current / 1000),
          samples: frames.current, predictedEvents: events.current, detectorWarning, userReportedCountNotTimestampLabels: true } }, receipt.current, upload.current.signal, setProgress);
      if (!mounted.current) return;
      receipt.current = sent; setReceipts(readReceipts()); setPhase('sent'); blob.current = null; setPreview(null);
    } catch (e) {
      if (!mounted.current) return;
      setError(upload.current.signal.aborted ? 'Sending stopped. Your clip is still here. You can retry or delete the pending report below.' : e instanceof Error ? e.message : 'Sending failed. Please retry.');
      setReceipts(readReceipts()); setPhase('review');
    }
  };
  const remove = async (item: DiagnosticReceipt) => {
    setDeleting(item.id); setError('');
    try { await deleteDiagnostic(item); setReceipts(readReceipts()); if (receipt.current?.id === item.id) receipt.current = null; }
    catch (e) { setError((e as Error).message); } finally { setDeleting(null); }
  };
  return <View style={styles.stack}>
    <Card>
      <Text style={styles.title}>{phase === 'sent' ? 'Report received' : phase === 'recording' ? 'Blink naturally' : 'Keep the same angle'}</Text>
      <Text style={styles.copy}>{phase === 'sent' ? 'Your private report is available for the app owner and coding assistant to review. Sending does not start an automatic fix or change your calibration.' : 'Leave the phone where detection fails, with the same eyewear and lighting. This ends your monitoring session. Record only yourself; no microphone is used.'}</Text>
      {phase === 'intro' || phase === 'camera' ? <>
        <View style={styles.row}><Chip label="5 blinks · up to 20 sec" selected={target === 5} onPress={() => setTarget(5)} /><Chip label="10 blinks · up to 30 sec" selected={target === 10} onPress={() => setTarget(10)} /></View>
        <Text style={styles.copy}>After recording begins, wait two seconds, then blink {target} times normally. Do not exaggerate or move closer just to make it count.</Text>
      </> : null}
      {active ? <CameraPreview active={active} onReady={onReady} onError={cameraError} onStreamLost={lost} /> : null}
      {phase === 'intro' || (phase === 'camera' && !active) ? <PrimaryButton label="Open camera" onPress={openCamera} /> : null}
      {phase === 'camera' && active ? <PrimaryButton label={ready ? 'Start recording' : 'Preparing camera…'} disabled={!ready} onPress={() => { void start(); }} /> : null}
      {phase === 'recording' ? <><Text style={styles.timer}>{elapsed < 2000 ? 'Settle in…' : `Blink ${target} times naturally`} · {(elapsed / 1000).toFixed(1)} sec</Text><Text style={styles.copy}>Detector counted {detected}. This may be wrong—that is why we are recording.</Text><PrimaryButton label="Done blinking · stop recording" onPress={stop} /></> : null}
      {preview ? React.createElement('video', { src: preview, controls: true, playsInline: true, style: { width: '100%', maxHeight: 320, borderRadius: 16, background: '#111' }, 'aria-label': 'Review your diagnostic recording' }) : null}
      {phase === 'review' ? <>
        <Text style={styles.copy}>Review your {(elapsed / 1000).toFixed(1)}-second clip. Detector counted {detected}. Enter your actual count, including any extra blinks; leave unknown rather than guessing.</Text>
        <Text style={styles.copy}>Actual blinks you made (0–30)</Text>
        <NumberField accessibilityLabel="Actual blinks you made (0–30)" value={actual < 0 ? '' : String(actual)} onChangeText={(value) => setActual(value.trim() === '' ? -1 : Number(value))} />
        <ToggleRow title="I agree to send this diagnostic recording" description="Send my face video, blink count, and detector diagnostics to the private Blink Coach inbox for the owner and coding assistant to troubleshoot. No advertising or public sharing. Access expires after 7 days; scheduled deletion may be delayed. I can delete it using my receipt below." value={consent} onValueChange={setConsent} />
        <PrimaryButton label="Send diagnostic report" disabled={!consent || actual < 0} onPress={() => { void send(); }} />
        <SecondaryButton label="Discard clip and record again" onPress={openCamera} />
      </> : null}
      {phase === 'sending' ? <><Text accessibilityLiveRegion="polite" style={styles.copy}>Sending securely · {progress}%</Text><SecondaryButton label="Cancel sending" onPress={() => upload.current?.abort()} /></> : null}
      {phase === 'sent' ? <Text style={styles.copy}>Your report ID and deletion control are in Your report receipts below.</Text> : null}
      {detectorWarning ? <Text style={styles.warning}>{detectorWarning}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.warning}>{error}</Text> : null}
    </Card>
    <Card><Text style={styles.title}>You control what is shared</Text><Text style={styles.copy}>Until you tap Send, the clip stays only in memory on this device. Leaving this page discards it. Normal monitoring never records or uploads video. Reports are not used to identify you or diagnose an eye condition.</Text><Text style={styles.copy}>Keep this browser’s site data to retain your deletion receipts. No recording is stored in those receipts.</Text></Card>
    {receipts.length ? <Card><Text style={styles.title}>Your report receipts</Text>{receipts.map(item => <View key={item.id} style={styles.receipt}><Text selectable style={styles.copy}>{item.id}</Text><Text style={styles.copy}>{item.status === 'ready' ? `Received · access expires ${new Date(item.expires ?? 0).toLocaleDateString()}` : 'Pending or interrupted upload · expires after one hour'}</Text><SecondaryButton label={deleting === item.id ? 'Deleting…' : 'Delete this report'} disabled={deleting !== null || phase === 'sending'} onPress={() => { void remove(item); }} /></View>)}</Card> : null}
  </View>;
}
const styles = StyleSheet.create({ stack: { gap: 16 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 }, title: { color: colors.ink, fontSize: 22, fontWeight: '700', marginBottom: 12 }, copy: { color: colors.muted, fontSize: 16, lineHeight: 24, marginVertical: 8 }, timer: { fontSize: 20, color: colors.ink, marginVertical: 14 }, warning: { fontSize: 16, color: '#9b3e12', lineHeight: 24, marginTop: 12 }, receipt: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#dde2eb' } });
