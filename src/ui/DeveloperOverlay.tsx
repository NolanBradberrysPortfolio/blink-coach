import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatDecimal } from '../domain/math';
import { useBlinkCoach } from '../hooks/useBlinkCoach';
import { Card, LabeledValue, SectionTitle } from './Ui';
import { colors } from './theme';
import { SignalGraph } from './SignalGraph';

export function DeveloperOverlay({ embedded = false }: { embedded?: boolean }): React.ReactElement {
  const coach = useBlinkCoach();
  const calibration = coach.calibrationProfile;
  const result = coach.latestResult;
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
            <LabeledValue style={styles.gridItem} dark={embedded} label="Blink state" value={coach.blinkState} />
            <LabeledValue style={styles.gridItem} dark={embedded} label="Events" value={String(coach.metrics.totalBlinks)} />
          </View>
          <View style={styles.gridRow}>
            <LabeledValue style={styles.gridItem} dark={embedded} label="Last duration" value={coach.lastBlinkDurationMs === null ? '—' : `${Math.round(coach.lastBlinkDurationMs)} ms`} />
            <LabeledValue style={styles.gridItem} dark={embedded} label="Since last" value={`${(coach.metrics.timeSinceLastBlinkMs / 1000).toFixed(1)} s`} />
          </View>
          <View style={styles.gridRow}>
            <LabeledValue style={styles.gridItem} dark={embedded} label="Reminder" value={coach.reminder.armed ? 'armed' : 'cooldown'} />
            <LabeledValue style={styles.gridItem} dark={embedded} label="Classification" value={coach.lastClassification ?? '—'} />
          </View>
          <View style={styles.gridRow}>
            <LabeledValue style={styles.gridItem} dark={embedded} label="Complete % (exp.)" value={coach.completeBlinkPercentage === null ? '—' : `${Math.round(coach.completeBlinkPercentage)}%`} />
            <LabeledValue style={styles.gridItem} dark={embedded} label="Incomplete (exp.)" value={String(coach.incompleteBlinkCount)} />
          </View>
        </View>
        <View style={styles.divider} />
        <Text style={[styles.subheading, embedded && styles.darkText]}>Raw eye signal</Text>
        <View style={styles.signalRow}>
          <LabeledValue style={styles.signalItem} dark={embedded} label="Left" value={formatNullable(result?.leftEyeScore)} />
          <LabeledValue style={styles.signalItem} dark={embedded} label="Right" value={formatNullable(result?.rightEyeScore)} />
          <LabeledValue style={styles.signalItem} dark={embedded} label="Source" value={result?.signalSource ?? '—'} />
        </View>
        <Text style={[styles.subheading, embedded && styles.darkText]}>Smoothed signal</Text>
        <View style={styles.signalRow}>
          <LabeledValue style={styles.signalItem} dark={embedded} label="Left" value={formatNullable(coach.signalHistory.at(-1)?.smoothedLeft)} />
          <LabeledValue style={styles.signalItem} dark={embedded} label="Right" value={formatNullable(coach.signalHistory.at(-1)?.smoothedRight)} />
          <LabeledValue style={styles.signalItem} dark={embedded} label="Confidence" value={result?.confidence ? formatDecimal(result.confidence, 2) : '—'} />
        </View>
        <Text style={[styles.subheading, embedded && styles.darkText]}>Current thresholds</Text>
        <View style={styles.signalRow}>
          <LabeledValue style={styles.signalItem} dark={embedded} label="Open" value={formatDecimal(coach.effectiveConfig.openThreshold, 2)} />
          <LabeledValue style={styles.signalItem} dark={embedded} label="Close" value={formatDecimal(coach.effectiveConfig.closeThreshold, 2)} />
          <LabeledValue style={styles.signalItem} dark={embedded} label="Duration" value={`${coach.effectiveConfig.minBlinkDurationMs}–${coach.effectiveConfig.maxBlinkDurationMs} ms`} />
        </View>
        <Text style={[styles.subheading, embedded && styles.darkText]}>Calibration values</Text>
        <View style={styles.signalRow}>
          <LabeledValue style={styles.calibrationItem} dark={embedded} label="Open baseline" value={calibration ? `${formatDecimal(calibration.openLeft, 2)} / ${formatDecimal(calibration.openRight, 2)}` : 'not set'} />
          <LabeledValue style={styles.calibrationItem} dark={embedded} label="Closed baseline" value={calibration ? `${formatDecimal(calibration.closedLeft, 2)} / ${formatDecimal(calibration.closedRight, 2)}` : 'not set'} />
        </View>
        <Text style={[styles.subheading, embedded && styles.darkText]}>Eye signal · last 5–10 seconds</Text>
        <SignalGraph samples={coach.signalHistory} dark={embedded} />
      </Card>
    </View>
  );
}

function formatNullable(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : formatDecimal(value, 3);
}

const styles = StyleSheet.create({
  grid: { gap: 15 },
  gridRow: { flexDirection: 'row', gap: 14 },
  gridItem: { flex: 1, minWidth: 0 },
  signalRow: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  signalItem: { flex: 1, minWidth: 0 },
  calibrationItem: { flex: 1, minWidth: 0 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 17 },
  subheading: { color: colors.ink, fontSize: 13, fontWeight: '800', marginBottom: 10 },
  darkText: { color: colors.darkText },
});
