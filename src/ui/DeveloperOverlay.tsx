import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatDecimal } from '../domain/math';
import { useBlinkCoach } from '../hooks/useBlinkCoach';
import { Card, LabeledValue, SectionTitle } from './Ui';
import { colors } from './theme';
import { SignalGraph } from './SignalGraph';

const DASH = '\u2014';

export function DeveloperOverlay({ embedded = false }: { embedded?: boolean }): React.ReactElement {
  const coach = useBlinkCoach();
  const calibration = coach.calibrationProfile;
  const result = coach.latestResult;
  const latestSample = coach.signalHistory.at(-1);
  return (
    <View>
      <SectionTitle dark={embedded}>Developer / Test Lab</SectionTitle>
      <Card dark={embedded}>
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <LabeledValue style={styles.gridItem} dark={embedded} label="Face" value={coach.faceDetected ? 'detected' : 'not detected'} />
            <LabeledValue style={styles.gridItem} dark={embedded} label="Inference FPS" value={formatDecimal(coach.inferenceFps, 1)} />
          </View>
          <View style={styles.gridRow}>
            <LabeledValue style={styles.gridItem} dark={embedded} label="Camera" value={coach.cameraState} />
            <LabeledValue style={styles.gridItem} dark={embedded} label="Target FPS" value={String(coach.settings.inferenceFps)} />
          </View>
          {coach.cameraError ? <LabeledValue style={styles.fullWidth} dark={embedded} label="Camera error" value={coach.cameraError} /> : null}
          <View style={styles.gridRow}>
            <LabeledValue style={styles.gridItem} dark={embedded} label="Blink state" value={coach.blinkState} />
            <LabeledValue style={styles.gridItem} dark={embedded} label="Events" value={String(coach.metrics.totalBlinks)} />
          </View>
          <View style={styles.gridRow}>
            <LabeledValue style={styles.gridItem} dark={embedded} label="Last duration" value={coach.lastBlinkDurationMs === null ? DASH : `${Math.round(coach.lastBlinkDurationMs)} ms`} />
            <LabeledValue style={styles.gridItem} dark={embedded} label="Since last" value={`${(coach.metrics.timeSinceLastBlinkMs / 1000).toFixed(1)} s`} />
          </View>
          <View style={styles.gridRow}>
            <LabeledValue style={styles.gridItem} dark={embedded} label="Reminder" value={coach.reminder.armed ? 'armed' : 'cooldown'} />
            <LabeledValue style={styles.gridItem} dark={embedded} label="Classification" value={coach.lastClassification ?? DASH} />
          </View>
          <View style={styles.gridRow}>
            <LabeledValue style={styles.gridItem} dark={embedded} label="Complete % (exp.)" value={coach.completeBlinkPercentage === null ? DASH : `${Math.round(coach.completeBlinkPercentage)}%`} />
            <LabeledValue style={styles.gridItem} dark={embedded} label="Incomplete (exp.)" value={String(coach.incompleteBlinkCount)} />
          </View>
        </View>
        <View style={styles.divider} />
        <Text style={[styles.subheading, embedded && styles.darkText]}>Raw eye signal</Text>
        <View style={styles.signalRow}>
          <LabeledValue style={styles.signalItem} dark={embedded} label="Left" value={formatNullable(result?.leftEyeScore)} />
          <LabeledValue style={styles.signalItem} dark={embedded} label="Right" value={formatNullable(result?.rightEyeScore)} />
          <LabeledValue style={styles.signalItem} dark={embedded} label="Source" value={result?.signalSource ?? DASH} />
        </View>
        <Text style={[styles.subheading, embedded && styles.darkText]}>Smoothed signal</Text>
        <View style={styles.signalRow}>
          <LabeledValue style={styles.signalItem} dark={embedded} label="Left" value={formatNullable(coach.signalHistory.at(-1)?.smoothedLeft)} />
          <LabeledValue style={styles.signalItem} dark={embedded} label="Right" value={formatNullable(coach.signalHistory.at(-1)?.smoothedRight)} />
          <LabeledValue style={styles.signalItem} dark={embedded} label="Confidence" value={result?.confidence ? formatDecimal(result.confidence, 2) : DASH} />
        </View>
        <Text style={[styles.subheading, embedded && styles.darkText]}>Current thresholds</Text>
        <View style={styles.signalRow}>
          <LabeledValue style={styles.signalItem} dark={embedded} label="Open" value={formatDecimal(latestSample?.activeOpenThreshold ?? coach.effectiveConfig.openThreshold, 2)} />
          <LabeledValue style={styles.signalItem} dark={embedded} label="Close" value={formatDecimal(latestSample?.activeCloseThreshold ?? coach.effectiveConfig.closeThreshold, 2)} />
          <LabeledValue style={styles.signalItem} dark={embedded} label="Duration" value={`${coach.effectiveConfig.minBlinkDurationMs}\u2013${coach.effectiveConfig.maxBlinkDurationMs} ms`} />
        </View>
        <View style={styles.signalRow}>
          <LabeledValue style={styles.signalItem} dark={embedded} label="Reopen" value={formatDecimal(latestSample?.activeReopenThreshold ?? coach.effectiveConfig.reopenThreshold, 2)} />
          <LabeledValue style={styles.signalItem} dark={embedded} label="Mode" value={latestSample?.adaptiveThresholds ? 'relative baseline' : 'global/calibrated'} />
          <LabeledValue style={styles.signalItem} dark={embedded} label="Live baseline" value={formatPair(latestSample?.openBaselineLeft, latestSample?.openBaselineRight)} />
        </View>
        <Text style={[styles.subheading, embedded && styles.darkText]}>Calibration values</Text>
        <View style={styles.signalRow}>
          <LabeledValue style={styles.calibrationItem} dark={embedded} label="Open baseline" value={calibration ? `${formatDecimal(calibration.openLeft, 2)} / ${formatDecimal(calibration.openRight, 2)}` : 'not set'} />
          <LabeledValue style={styles.calibrationItem} dark={embedded} label="Closed baseline" value={calibration ? `${formatDecimal(calibration.closedLeft, 2)} / ${formatDecimal(calibration.closedRight, 2)}` : 'not set'} />
        </View>
        <Text style={[styles.subheading, embedded && styles.darkText]}>Eye signal {'\u00b7'} last 5{'\u2013'}10 seconds</Text>
        <SignalGraph samples={coach.signalHistory} dark={embedded} />
      </Card>
    </View>
  );
}

function formatNullable(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : formatDecimal(value, 3);
}

function formatPair(left: number | null | undefined, right: number | null | undefined): string {
  if (left === null || left === undefined || right === null || right === undefined) return '\u2014';
  return `${formatDecimal(left, 2)} / ${formatDecimal(right, 2)}`;
}

const styles = StyleSheet.create({
  grid: { gap: 15 },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -7 },
  gridItem: { width: '50%', flexBasis: '50%', flexGrow: 0, flexShrink: 0, paddingHorizontal: 7 },
  fullWidth: { width: '100%', flexBasis: '100%', flexGrow: 0, flexShrink: 0, paddingHorizontal: 7 },
  signalRow: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -7, marginBottom: 14 },
  signalItem: { width: '33.3333%', flexBasis: '33.3333%', flexGrow: 0, flexShrink: 0, paddingHorizontal: 7 },
  calibrationItem: { width: '50%', flexBasis: '50%', flexGrow: 0, flexShrink: 0, paddingHorizontal: 7 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 17 },
  subheading: { color: colors.ink, fontSize: 13, fontWeight: '800', marginBottom: 10 },
  darkText: { color: colors.darkText },
});
