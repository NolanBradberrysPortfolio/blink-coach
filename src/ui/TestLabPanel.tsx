import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { compareBlinkEvents, DiagnosticIssue } from '../domain/testComparison';
import { BlinkTestRunAccumulator } from '../domain/testRunner';
import {
  BlinkTestRun,
  FixtureAngle,
  FixtureBehavior,
  FixtureLighting,
  GroundTruthEvent,
  TestFixtureMetadata,
  VideoAnnotationDocument,
} from '../domain/testLabTypes';
import { GroundTruthBlinkType } from '../domain/types';
import { createBlinkDetector } from '../detectors/createBlinkDetector';
import { loadTestAnnotations, saveTestAnnotation } from '../storage/localStore';
import { Card, Chip, LabeledValue, NumberField, PrimaryButton, SecondaryButton, ToggleRow } from './Ui';
import { VideoSignalGraph } from './VideoSignalGraph';
import { colors } from './theme';
import { useBlinkCoach } from '../hooks/useBlinkCoach';

type AnalysisStatus = 'idle' | 'running' | 'complete' | 'error';

const DEFAULT_METADATA: TestFixtureMetadata = {
  glasses: false,
  lighting: 'normal',
  angle: 'front',
  behavior: 'normal-blinking',
  split: 'tuning',
};

const MAX_VIDEO_ANALYSIS_FPS = 30;

export function TestLabPanel(): React.ReactElement {
  const coach = useBlinkCoach();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const annotationInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const cancelAnalysisRef = useRef(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [selectedTimeMs, setSelectedTimeMs] = useState(0);
  const [metadata, setMetadata] = useState<TestFixtureMetadata>(DEFAULT_METADATA);
  const [events, setEvents] = useState<GroundTruthEvent[]>([]);
  const [savedAnnotations, setSavedAnnotations] = useState<Record<string, VideoAnnotationDocument>>({});
  const [run, setRun] = useState<BlinkTestRun | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [processedFrames, setProcessedFrames] = useState(0);
  const [analysisFps, setAnalysisFps] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [toleranceMs, setToleranceMs] = useState(350);
  const [selectedIssue, setSelectedIssue] = useState<DiagnosticIssue | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadTestAnnotations().then((stored) => {
      if (!cancelled) setSavedAnnotations(stored);
    });
    return () => {
      cancelled = true;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (!videoId) return;
    const stored = savedAnnotations[videoId] ?? Object.values(savedAnnotations).find((item) => item.videoName && item.videoName.toLowerCase() === videoName?.toLowerCase());
    if (!stored) return;
    const timer = setTimeout(() => {
      setEvents(stored.events.map((event, index) => normalizeEvent(event, index)).sort((a, b) => a.timeMs - b.timeMs));
      setMetadata({ ...DEFAULT_METADATA, ...stored.metadata });
      setToleranceMs(stored.temporalToleranceMs || 350);
    }, 0);
    return () => clearTimeout(timer);
  }, [savedAnnotations, videoId, videoName]);

  const persistDocument = useCallback((nextEvents: GroundTruthEvent[], nextMetadata: TestFixtureMetadata, nextTolerance = toleranceMs) => {
    if (!videoId) return;
    const document: VideoAnnotationDocument = {
      version: 1,
      videoId,
      videoName: videoName ?? undefined,
      durationMs,
      metadata: nextMetadata,
      temporalToleranceMs: nextTolerance,
      events: nextEvents,
    };
    setSavedAnnotations((current) => ({ ...current, [videoId]: document }));
    void saveTestAnnotation(document);
  }, [durationMs, toleranceMs, videoId, videoName]);

  const comparison = useMemo(() => {
    if (!run) return null;
    return compareBlinkEvents(run.predictedEvents, events, run.samples, run.config, toleranceMs);
  }, [events, run, toleranceMs]);

  const handleVideoSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const nextUrl = URL.createObjectURL(file);
    const nextId = makeVideoId(file);
    objectUrlRef.current = nextUrl;
    setVideoUrl(nextUrl);
    setVideoId(nextId);
    setVideoName(file.name);
    setDurationMs(0);
    setCurrentTimeMs(0);
    setSelectedTimeMs(0);
    setRun(null);
    setAnalysisStatus('idle');
    setProgress(0);
    setError(null);
    const stored = savedAnnotations[nextId] ?? Object.values(savedAnnotations).find((item) => item.videoName && item.videoName.toLowerCase() === file.name.toLowerCase());
    setEvents(stored?.events.map((event, index) => normalizeEvent(event, index)).sort((a, b) => a.timeMs - b.timeMs) ?? []);
    setMetadata(stored ? { ...DEFAULT_METADATA, ...stored.metadata } : DEFAULT_METADATA);
    setToleranceMs(stored?.temporalToleranceMs ?? 350);
  };

  const handleAnnotationImported = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as VideoAnnotationDocument;
      if (parsed.version !== 1 || !parsed.videoId || !Array.isArray(parsed.events)) throw new Error('This annotation file is not a Blink Coach v1 document.');
      const document: VideoAnnotationDocument = {
        ...parsed,
        metadata: { ...DEFAULT_METADATA, ...parsed.metadata },
        temporalToleranceMs: parsed.temporalToleranceMs || 350,
        events: parsed.events.map((event, index) => normalizeEvent(event, index)).sort((a, b) => a.timeMs - b.timeMs),
      };
      setSavedAnnotations((current) => ({ ...current, [document.videoId]: document }));
      await saveTestAnnotation(document);
      if (document.videoId === videoId || (document.videoName && document.videoName.toLowerCase() === videoName?.toLowerCase())) {
        setEvents(document.events);
        setMetadata(document.metadata);
        setToleranceMs(document.temporalToleranceMs);
        setError(null);
      } else {
        setError(`Imported annotations for ${document.videoId}. Select the matching video to apply them.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The annotation JSON could not be imported.');
    }
  };

  const updateMetadata = (patch: Partial<TestFixtureMetadata>) => {
    const next = { ...metadata, ...patch };
    setMetadata(next);
    persistDocument(events, next);
  };

  const markEvent = (type: GroundTruthBlinkType) => {
    if (!videoId) {
      setError('Choose a local video before marking a blink.');
      return;
    }
    const nextEvent: GroundTruthEvent = {
      id: `${videoId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timeMs: Math.round(currentTimeMs),
      type,
    };
    const nextEvents = [...events.filter((item) => Math.abs(item.timeMs - nextEvent.timeMs) > 120), nextEvent].sort((a, b) => a.timeMs - b.timeMs);
    setEvents(nextEvents);
    setSelectedTimeMs(nextEvent.timeMs);
    persistDocument(nextEvents, metadata);
  };

  const removeEvent = (id: string) => {
    const nextEvents = events.filter((item) => item.id !== id);
    setEvents(nextEvents);
    persistDocument(nextEvents, metadata);
  };

  const seekTo = useCallback((timeMs: number) => {
    const nextTime = Math.max(0, Math.min(durationMs, timeMs));
    setSelectedTimeMs(nextTime);
    setCurrentTimeMs(nextTime);
    if (videoRef.current) videoRef.current.currentTime = nextTime / 1000;
  }, [durationMs]);

  const cancelAnalysis = () => {
    cancelAnalysisRef.current = true;
  };

  const analyzeVideo = async () => {
    if (Platform.OS !== 'web') {
      setError('Video Test Lab is currently available in the web/PWA build.');
      return;
    }
    const video = videoRef.current;
    if (!video || !videoUrl || !durationMs) {
      setError('Choose a video and wait for its duration to load before analyzing.');
      return;
    }
    cancelAnalysisRef.current = false;
    setAnalysisStatus('running');
    setProgress(0);
    setProcessedFrames(0);
    setAnalysisFps(0);
    setError(null);
    setSelectedIssue(null);
    const originalTime = video.currentTime;
    const accumulator = new BlinkTestRunAccumulator(coach.effectiveConfig, coach.calibrationProfile, videoId ?? undefined);
    // Offline replay can sample more densely than live monitoring. This keeps
    // short blinks from falling between live camera samples without
    // increasing the phone's live inference workload.
    const targetFps = Math.max(10, Math.min(MAX_VIDEO_ANALYSIS_FPS, coach.settings.inferenceFps * 2));
    const stepMs = 1000 / targetFps;
    const totalFrames = Math.max(1, Math.ceil(durationMs / stepMs) + 1);
    let processed = 0;
    const startedAt = performance.now();
    let detector: Awaited<ReturnType<typeof createBlinkDetector>> | null = null;
    try {
      detector = await createBlinkDetector();
      video.pause();
      await detector.initialize();
      for (let timeMs = 0; timeMs <= durationMs; timeMs += stepMs) {
        if (cancelAnalysisRef.current) break;
        await seekVideoFrame(video, timeMs / 1000);
        const result = await detector.processFrame(video, timeMs);
        accumulator.processFrame(result);
        processed += 1;
        const elapsed = performance.now() - startedAt;
        if (processed % 2 === 0 || processed === totalFrames) {
          setProcessedFrames(processed);
          setProgress(Math.min(1, processed / totalFrames));
          setAnalysisFps(elapsed > 0 ? processed / (elapsed / 1000) : 0);
          await yieldToUi();
        }
      }
      if (cancelAnalysisRef.current) {
        setAnalysisStatus('idle');
        setError('Video analysis cancelled.');
        return;
      }
      const elapsed = performance.now() - startedAt;
      const completedRun = accumulator.finalize(durationMs, elapsed);
      setRun(completedRun);
      setProcessedFrames(processed);
      setProgress(1);
      setAnalysisFps(completedRun.processingFps);
      setAnalysisStatus('complete');
      setCurrentTimeMs(originalTime * 1000);
      setSelectedTimeMs(originalTime * 1000);
      video.currentTime = originalTime;
    } catch (caught) {
      setAnalysisStatus('error');
      setError(caught instanceof Error ? `Video analysis failed: ${caught.message}` : 'Video analysis failed.');
    } finally {
      if (detector) await detector.dispose();
    }
  };

  const exportAnnotations = () => {
    if (!videoId || Platform.OS !== 'web') return;
    const document: VideoAnnotationDocument = {
      version: 1,
      videoId,
      videoName: videoName ?? undefined,
      durationMs,
      metadata,
      temporalToleranceMs: toleranceMs,
      events,
    };
    downloadJson(`${videoId}-annotations.json`, document);
  };

  const exportFixture = () => {
    if (!videoId || !run || Platform.OS !== 'web') return;
    downloadJson(`${videoId}-signal-fixture.json`, {
      version: 1,
      videoId,
      videoName,
      durationMs,
      metadata,
      eyeFrames: run.samples.map((sample) => ({
        timestampMs: sample.timestampMs,
        faceDetected: sample.faceDetected,
        leftEyeScore: sample.left,
        rightEyeScore: sample.right,
        confidence: sample.confidence,
        signalSource: sample.signalSource,
      })),
      events,
    });
  };

  const onVideoTimeUpdate = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const nextTime = event.currentTarget.currentTime * 1000;
    setCurrentTimeMs(nextTime);
    setSelectedTimeMs(nextTime);
  };

  return (
    <View>
      <Card>
        <Text style={styles.intro}>Run the same MediaPipe eye detector, blink state machine, calibration-aware classifier, and thresholds against a local video. The video is never uploaded or saved.</Text>
        <View style={styles.buttonRow}>
          <PrimaryButton label="Choose local video" onPress={() => videoInputRef.current?.click()} />
          <SecondaryButton label="Import annotations" onPress={() => annotationInputRef.current?.click()} />
        </View>
        {Platform.OS === 'web' ? (
          <>
            {React.createElement('input', { ref: videoInputRef, type: 'file', accept: 'video/*', onChange: handleVideoSelected, style: { display: 'none' } as React.CSSProperties })}
            {React.createElement('input', { ref: annotationInputRef, type: 'file', accept: 'application/json,.json', onChange: handleAnnotationImported, style: { display: 'none' } as React.CSSProperties })}
          </>
        ) : null}
        <Text style={styles.fileName}>{videoName ?? 'No video selected'}</Text>
        {videoUrl ? (
          <View style={styles.videoShell}>
            {React.createElement('video', {
              ref: videoRef,
              src: videoUrl,
              controls: true,
              playsInline: true,
              onLoadedMetadata: (event: React.SyntheticEvent<HTMLVideoElement>) => setDurationMs(event.currentTarget.duration * 1000),
              onTimeUpdate: onVideoTimeUpdate,
              style: { width: '100%', maxHeight: 300, backgroundColor: '#0B1120', borderRadius: 18, display: 'block' } as React.CSSProperties,
            })}
            <RangeScrubber durationMs={durationMs} valueMs={currentTimeMs} onChange={seekTo} />
            <Timeline durationMs={durationMs} currentTimeMs={currentTimeMs} predictedEvents={run?.predictedEvents ?? []} groundTruthEvents={events} comparison={comparison} onSelect={seekTo} />
            <Text style={styles.timeText}>{formatTime(currentTimeMs)} / {formatTime(durationMs)}</Text>
          </View>
        ) : (
          <View style={styles.emptyVideo}><Text style={styles.emptyVideoTitle}>Select a video from Photos or Files</Text><Text style={styles.emptyVideoText}>On iPhone Safari, the picker stays on-device. No upload occurs.</Text></View>
        )}
        {videoId ? <Text style={styles.videoId}>Fixture id: {videoId}</Text> : null}
      </Card>

      {videoId ? (
        <>
          <Card>
            <Text style={styles.cardTitle}>Fixture metadata</Text>
            <ToggleRow title="Glasses" description="Record whether glasses are present for later comparison." value={metadata.glasses} onValueChange={(value) => updateMetadata({ glasses: value })} />
            <Text style={styles.fieldLabel}>Lighting</Text>
            <ChoiceRow values={['bright', 'normal', 'dim', 'unknown'] as FixtureLighting[]} selected={metadata.lighting} onSelect={(value) => updateMetadata({ lighting: value })} />
            <Text style={styles.fieldLabel}>Face angle</Text>
            <ChoiceRow values={['front', 'angled', 'looking-down', 'unknown'] as FixtureAngle[]} selected={metadata.angle} onSelect={(value) => updateMetadata({ angle: value })} />
            <Text style={styles.fieldLabel}>Behavior</Text>
            <ChoiceRow values={['normal-blinking', 'exaggerated-blinking', 'partial-blinks', 'head-movement', 'talking', 'deliberate-squinting', 'mixed', 'unknown'] as FixtureBehavior[]} selected={metadata.behavior} onSelect={(value) => updateMetadata({ behavior: value })} />
            <Text style={styles.fieldLabel}>Regression split</Text>
            <ChoiceRow values={['tuning', 'validation']} selected={metadata.split} onSelect={(value) => updateMetadata({ split: value })} />
          </Card>

          <Card>
            <Text style={styles.cardTitle}>Ground truth annotation</Text>
            <Text style={styles.helpText}>Pause or scrub to the blink moment, then mark the label. Tapping a marker jumps to that moment. Existing labels within 120 ms are replaced.</Text>
            <View style={styles.buttonRow}>
              <PrimaryButton label="MARK BLINK" onPress={() => markEvent('blink')} />
              <SecondaryButton label="MARK INCOMPLETE BLINK" onPress={() => markEvent('incompleteBlink')} />
            </View>
            <View style={styles.annotationList}>
              {events.length === 0 ? <Text style={styles.emptyText}>No ground-truth labels yet.</Text> : events.map((event) => (
                <View key={event.id} style={styles.annotationRow}>
                  <Pressable onPress={() => seekTo(event.timeMs)} style={styles.annotationCopy} accessibilityRole="button">
                    <Text style={styles.annotationTime}>{formatTime(event.timeMs)}</Text>
                    <Text style={styles.annotationType}>{event.type === 'incompleteBlink' ? 'Incomplete blink' : 'Blink'}</Text>
                  </Pressable>
                  <Pressable onPress={() => removeEvent(event.id)} style={styles.removeButton} accessibilityRole="button"><Text style={styles.removeText}>Remove</Text></Pressable>
                </View>
              ))}
            </View>
            <View style={styles.buttonRow}>
              <SecondaryButton label="Export annotations" onPress={exportAnnotations} disabled={events.length === 0} />
              <SecondaryButton label="Save signal fixture" onPress={exportFixture} disabled={!run} />
            </View>
          </Card>

          <Card>
            <Text style={styles.cardTitle}>Run detector analysis</Text>
            <Text style={styles.helpText}>The video is replayed at up to {MAX_VIDEO_ANALYSIS_FPS} samples per second for accuracy and may process faster than playback. Live monitoring keeps its separate configured rate. Face loss resets the shared blink state machine.</Text>
            <View style={styles.buttonRow}>
              {analysisStatus === 'running' ? <SecondaryButton label="Cancel analysis" onPress={cancelAnalysis} /> : <PrimaryButton label="Analyze video" onPress={() => void analyzeVideo()} />}
            </View>
            {analysisStatus === 'running' ? <ProgressBar progress={progress} processedFrames={processedFrames} fps={analysisFps} /> : null}
            {analysisStatus === 'complete' ? <Text style={styles.successText}>Analysis complete: {run?.processedFrames ?? 0} frames at {run?.processingFps.toFixed(1)} processing FPS.</Text> : null}
          </Card>

          {run && comparison ? <AnalysisResults run={run} comparison={comparison} selectedIssue={selectedIssue} onSelectIssue={(issue) => { setSelectedIssue(issue); seekTo(issue.timestampMs); }} selectedTimeMs={selectedTimeMs} onSelectTime={seekTo} events={events} toleranceMs={toleranceMs} onToleranceChange={(value) => { setToleranceMs(value); persistDocument(events, metadata, value); }} /> : null}
        </>
      ) : null}

      {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
    </View>
  );
}

function AnalysisResults({
  run,
  comparison,
  selectedIssue,
  onSelectIssue,
  selectedTimeMs,
  onSelectTime,
  events,
  toleranceMs,
  onToleranceChange,
}: {
  run: BlinkTestRun;
  comparison: ReturnType<typeof compareBlinkEvents>;
  selectedIssue: DiagnosticIssue | null;
  onSelectIssue: (issue: DiagnosticIssue) => void;
  selectedTimeMs: number;
  onSelectTime: (timeMs: number) => void;
  events: GroundTruthEvent[];
  toleranceMs: number;
  onToleranceChange: (value: number) => void;
}): React.ReactElement {
  return (
    <>
      <Card>
        <Text style={styles.cardTitle}>Comparison results</Text>
        <View style={styles.metricsGrid}>
          <LabeledValue style={styles.metricItem} label="True positives" value={String(comparison.metrics.truePositives)} />
          <LabeledValue style={styles.metricItem} label="False positives" value={String(comparison.metrics.falsePositives)} />
          <LabeledValue style={styles.metricItem} label="False negatives" value={String(comparison.metrics.falseNegatives)} />
          <LabeledValue style={styles.metricItem} label="Precision" value={formatPercent(comparison.metrics.precision)} />
          <LabeledValue style={styles.metricItem} label="Recall" value={formatPercent(comparison.metrics.recall)} />
          <LabeledValue style={styles.metricItem} label="F1" value={formatPercent(comparison.metrics.f1)} />
          <LabeledValue style={styles.metricItem} label="Count error" value={signedNumber(comparison.metrics.blinkCountError)} />
          <LabeledValue style={styles.metricItem} label="Mean timing" value={`${comparison.metrics.meanTimingErrorMs.toFixed(0)} ms`} />
          <LabeledValue style={styles.metricItem} label="Median timing" value={`${comparison.metrics.medianTimingErrorMs.toFixed(0)} ms`} />
          <LabeledValue style={styles.metricItem} label="Processing FPS" value={run.processingFps.toFixed(1)} />
          <LabeledValue style={styles.metricItem} label="Face-loss sections" value={String(run.faceNotDetectedSections.length)} />
        </View>
        <View style={styles.toleranceRow}><Text style={styles.fieldLabel}>Matching tolerance</Text><NumberField value={String(toleranceMs)} onChangeText={(value) => onToleranceChange(numberValue(value, 50, 1000))} suffix="ms" accessibilityLabel="Ground-truth matching tolerance" /></View>
        <Text style={styles.experimentalLabel}>Incomplete-blink classification (matched events only)</Text>
        <Text style={styles.classificationText}>{comparison.incompleteClassification.supported ? `F1 ${formatPercent(comparison.incompleteClassification.f1)} · ${comparison.incompleteClassification.truePositives} correct incomplete labels` : 'Not enough matched incomplete-blink labels yet.'}</Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Eye-signal graph</Text>
        <Text style={styles.helpText}>Tap the graph to inspect a time. Solid lines are smoothed; dashed lines are raw eye scores. The timeline distinguishes confirmed matches, false-positive predictions, and missed ground-truth labels.</Text>
        <VideoSignalGraph samples={run.samples} durationMs={run.durationMs} config={run.config} predictedEvents={run.predictedEvents} groundTruthEvents={events} selectedTimeMs={selectedTimeMs} onSelectTime={onSelectTime} />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Detected blink events</Text>
        {run.predictedEvents.length === 0 ? <Text style={styles.emptyText}>No predicted events.</Text> : run.predictedEvents.map((event, index) => (
          <Pressable key={`${event.startTimestampMs}-${index}`} onPress={() => onSelectTime((event.startTimestampMs + event.endTimestampMs) / 2)} style={styles.eventRow} accessibilityRole="button">
            <View style={styles.eventMarkerPredicted} />
            <View style={styles.eventCopy}><Text style={styles.eventTitle}>Predicted {index + 1} · {formatTime((event.startTimestampMs + event.endTimestampMs) / 2)}</Text><Text style={styles.eventDetail}>{Math.round(event.durationMs)} ms · max closure {event.maxClosureDepth.toFixed(2)} · L/R {event.leftMaxClosureDepth.toFixed(2)} / {event.rightMaxClosureDepth.toFixed(2)} · {event.classification ?? 'unclassified'}</Text></View>
          </Pressable>
        ))}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Face-not-detected sections</Text>
        {run.faceNotDetectedSections.length === 0 ? <Text style={styles.emptyText}>No face-loss section in the analyzed samples.</Text> : run.faceNotDetectedSections.map((section) => <Text key={`${section.startMs}-${section.endMs}`} style={styles.sectionRow}>{formatTime(section.startMs)}–{formatTime(section.endMs)} · {Math.round(section.durationMs)} ms</Text>)}
      </Card>

      <IssueCard title="FALSE POSITIVES" issues={comparison.falsePositives} selectedIssue={selectedIssue} onSelect={onSelectIssue} empty="No false positives." />
      <IssueCard title="FALSE NEGATIVES / MISSED BLINKS" issues={comparison.falseNegatives} selectedIssue={selectedIssue} onSelect={onSelectIssue} empty="No missed blinks." />
    </>
  );
}

function IssueCard({ title, issues, selectedIssue, onSelect, empty }: { title: string; issues: DiagnosticIssue[]; selectedIssue: DiagnosticIssue | null; onSelect: (issue: DiagnosticIssue) => void; empty: string }): React.ReactElement {
  return (
    <Card>
      <Text style={styles.cardTitle}>{title}</Text>
      {issues.length === 0 ? <Text style={styles.emptyText}>{empty}</Text> : issues.map((issue, index) => {
        const selected = selectedIssue === issue;
        const signal = issue.nearbySamples.slice(0, 5).map((sample) => `${Math.round(sample.timestampMs)}:${formatSignal(sample.smoothedLeft)}/${formatSignal(sample.smoothedRight)}`).join(' · ');
        return <Pressable key={`${issue.kind}-${issue.timestampMs}-${index}`} onPress={() => onSelect(issue)} style={[styles.issueRow, selected && styles.issueSelected]} accessibilityRole="button">
          <View style={issue.kind === 'falsePositive' ? styles.issueDotRed : styles.issueDotAmber} />
          <View style={styles.eventCopy}>
            <Text style={styles.eventTitle}>{formatTime(issue.timestampMs)} · state {issue.detectorState}</Text>
            <Text style={styles.eventDetail}>duration {issue.blinkDurationMs === null ? 'n/a' : `${Math.round(issue.blinkDurationMs)} ms`} · thresholds close {issue.thresholds.closeThreshold.toFixed(2)} / open {issue.thresholds.openThreshold.toFixed(2)} / smoothing {issue.thresholds.smoothingAlpha.toFixed(2)}</Text>
            <Text style={styles.signalDetail}>nearby smoothed L/R: {signal || 'no samples'}</Text>
          </View>
        </Pressable>;
      })}
    </Card>
  );
}

function Timeline({ durationMs, currentTimeMs, predictedEvents, groundTruthEvents, comparison, onSelect }: { durationMs: number; currentTimeMs: number; predictedEvents: BlinkTestRun['predictedEvents']; groundTruthEvents: GroundTruthEvent[]; comparison: ReturnType<typeof compareBlinkEvents> | null; onSelect: (timeMs: number) => void }): React.ReactElement {
  const percentage = (timeMs: number) => `${durationMs <= 0 ? 0 : Math.max(0, Math.min(100, (timeMs / durationMs) * 100))}%` as `${number}%`;
  return <View style={styles.timeline}><View style={[styles.currentTime, { left: percentage(currentTimeMs) }]} />{predictedEvents.map((event, index) => { const confirmed = comparison?.matches.some((match) => match.predicted === event) ?? false; return <Pressable key={`p-${index}`} onPress={() => onSelect((event.startTimestampMs + event.endTimestampMs) / 2)} style={[styles.timelinePredicted, confirmed && styles.timelineConfirmed, { left: percentage((event.startTimestampMs + event.endTimestampMs) / 2) }]} accessibilityRole="button" />; })}{groundTruthEvents.map((event) => { const confirmed = comparison?.matches.some((match) => match.groundTruth === event) ?? false; return <Pressable key={`g-${event.id}`} onPress={() => onSelect(event.timeMs)} style={[styles.timelineTruth, event.type === 'incompleteBlink' && styles.timelineTruthIncomplete, !confirmed && styles.timelineTruthMissed, { left: percentage(event.timeMs) }]} accessibilityRole="button" />; })}</View>;
}

function RangeScrubber({ durationMs, valueMs, onChange }: { durationMs: number; valueMs: number; onChange: (valueMs: number) => void }): React.ReactElement | null {
  if (Platform.OS !== 'web') return null;
  return React.createElement('input', {
    type: 'range',
    min: 0,
    max: Math.max(1, durationMs),
    step: 10,
    value: valueMs,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(Number(event.currentTarget.value)),
    style: { width: '100%', marginTop: 10, accentColor: colors.teal } as React.CSSProperties,
    'aria-label': 'Video time scrubber',
  });
}

function ChoiceRow<T extends string>({ values, selected, onSelect }: { values: T[]; selected: T; onSelect: (value: T) => void }): React.ReactElement {
  return <View style={styles.choiceRow}>{values.map((value) => <Chip key={value} label={value.replaceAll('-', ' ')} selected={selected === value} onPress={() => onSelect(value)} />)}</View>;
}

function ProgressBar({ progress, processedFrames, fps }: { progress: number; processedFrames: number; fps: number }): React.ReactElement {
  return <View style={styles.progressWrap}><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(2, progress * 100)}%` }]} /></View><Text style={styles.progressText}>{Math.round(progress * 100)}% · {processedFrames} frames · {fps.toFixed(1)} FPS</Text></View>;
}

function normalizeEvent(event: GroundTruthEvent, index = 0): GroundTruthEvent {
  return { ...event, id: event.id || `imported-${event.timeMs}-${index}` };
}

function makeVideoId(file: File): string {
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'video';
  return `${safeName}-${file.size}-${file.lastModified}`;
}

function seekVideo(video: HTMLVideoElement, timeSeconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const target = Math.max(0, Math.min(Number.isFinite(video.duration) ? video.duration : timeSeconds, timeSeconds));
    let settled = false;
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      window.clearTimeout(timeout);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onSeeked = () => finish();
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('The browser took too long to seek this video frame.'));
    }, 8000);
    video.addEventListener('seeked', onSeeked, { once: true });
    video.currentTime = target;
    if (Math.abs(video.currentTime - target) < 0.01) window.setTimeout(finish, 0);
  });
}

/**
 * A seeked event means the media timeline moved, but on some browsers the
 * decoded frame exposed to MediaPipe is updated one compositor tick later.
 * Waiting for requestVideoFrameCallback prevents the video test lab from
 * repeatedly analyzing a stale frame while live monitoring continues to use
 * the current camera frame.
 */
async function seekVideoFrame(video: HTMLVideoElement, timeSeconds: number): Promise<void> {
  await seekVideo(video, timeSeconds);
  if (typeof video.requestVideoFrameCallback === 'function') {
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve();
      };
      const timeout = window.setTimeout(finish, 500);
      video.requestVideoFrameCallback(() => finish());
    });
    return;
  }
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function downloadJson(fileName: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatTime(timeMs: number): string {
  const totalSeconds = Math.max(0, Math.round(timeMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSignal(value: number | null | undefined): string {
  return value === null || value === undefined ? '–' : value.toFixed(2);
}

function signedNumber(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function numberValue(value: string, min: number, max: number): number {
  const parsed = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min;
}

const styles = StyleSheet.create({
  intro: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 14 },
  fileName: { color: colors.ink, fontSize: 14, fontWeight: '800', marginTop: 14 },
  videoShell: { marginTop: 12 },
  emptyVideo: { minHeight: 150, borderRadius: 18, marginTop: 12, padding: 20, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  emptyVideoTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyVideoText: { color: '#C3CEE0', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  videoId: { color: colors.softMuted, fontSize: 10, marginTop: 9 },
  timeText: { color: colors.muted, fontSize: 11, textAlign: 'right', marginTop: 4 },
  timeline: { height: 30, borderRadius: 10, marginTop: 10, backgroundColor: '#EAF0F7', position: 'relative' },
  currentTime: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.teal, zIndex: 3 },
  timelinePredicted: { position: 'absolute', top: 5, width: 6, height: 20, marginLeft: -3, borderRadius: 3, backgroundColor: colors.red, zIndex: 2 },
  timelineConfirmed: { backgroundColor: colors.teal },
  timelineTruth: { position: 'absolute', top: 8, width: 8, height: 14, marginLeft: -4, borderRadius: 4, backgroundColor: colors.blue, zIndex: 4 },
  timelineTruthIncomplete: { backgroundColor: colors.amber },
  timelineTruthMissed: { backgroundColor: colors.red },
  cardTitle: { color: colors.ink, fontSize: 17, fontWeight: '800', marginBottom: 4 },
  fieldLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: 14, marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.5 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap' },
  helpText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  annotationList: { marginTop: 12 },
  annotationRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.line },
  annotationCopy: { flex: 1 },
  annotationTime: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  annotationType: { color: colors.muted, fontSize: 12, marginTop: 2 },
  removeButton: { paddingHorizontal: 10, paddingVertical: 8 },
  removeText: { color: colors.red, fontSize: 12, fontWeight: '800' },
  emptyText: { color: colors.muted, fontSize: 13, marginTop: 8 },
  progressWrap: { marginTop: 14 },
  progressTrack: { height: 9, borderRadius: 6, overflow: 'hidden', backgroundColor: '#EAF0F7' },
  progressFill: { height: '100%', borderRadius: 6, backgroundColor: colors.teal },
  progressText: { color: colors.muted, fontSize: 12, marginTop: 6 },
  successText: { color: colors.teal, fontSize: 13, fontWeight: '800', marginTop: 12 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 15, marginTop: 10 },
  metricItem: { width: '47%', flexGrow: 0, flexShrink: 1 },
  toleranceRow: { maxWidth: 190, marginTop: 10 },
  experimentalLabel: { color: colors.softMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16 },
  classificationText: { color: colors.muted, fontSize: 12, marginTop: 4 },
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  eventMarkerPredicted: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red, marginTop: 5, marginRight: 9 },
  eventCopy: { flex: 1 },
  eventTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  eventDetail: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  sectionRow: { color: colors.muted, fontSize: 12, paddingVertical: 5 },
  issueRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.line },
  issueSelected: { backgroundColor: '#FFF7E6' },
  issueDotRed: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.red, marginTop: 4, marginRight: 9 },
  issueDotAmber: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.amber, marginTop: 4, marginRight: 9 },
  signalDetail: { color: colors.softMuted, fontSize: 10, lineHeight: 14, marginTop: 4 },
  errorBox: { backgroundColor: colors.redPale, borderRadius: 14, padding: 12, marginTop: 10 },
  errorText: { color: colors.red, fontSize: 12, lineHeight: 18 },
});
