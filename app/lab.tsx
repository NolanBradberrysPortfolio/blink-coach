import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DeveloperOverlay } from '../src/ui/DeveloperOverlay';
import { useBlinkCoach } from '../src/hooks/useBlinkCoach';
import { Card, Header, NumberField, Page, SectionTitle, SecondaryButton, ToggleRow } from '../src/ui/Ui';
import { colors } from '../src/ui/theme';

export default function LabScreen(): React.ReactElement {
  const router = useRouter();
  const coach = useBlinkCoach();
  const thresholds = coach.settings.manualThresholds;
  return (
    <Page>
      <Header title="Developer / Test Lab" subtitle="Make missed and duplicate blinks diagnosable." onBack={() => router.back()} />
      <Card>
        <ToggleRow title="Developer Mode" description="Show live raw signals, smoothed signals, state, thresholds, and the graph on Home." value={coach.settings.developerMode} onValueChange={(value) => coach.updateSettings({ developerMode: value })} />
        <Text style={styles.note}>This overlay is intentionally detailed. Use it when a blink was missed or counted twice, then report the signal, state, and threshold values.</Text>
      </Card>

      <SectionTitle>Live diagnostic overlay</SectionTitle>
      <DeveloperOverlay />

      <SectionTitle>Manual thresholds</SectionTitle>
      <Card>
        <ToggleRow title="Use manual thresholds" description="Overrides calibration/default thresholds for experiments. This is not recommended for ordinary use." value={coach.settings.manualThresholdsEnabled} onValueChange={(value) => coach.updateSettings({ manualThresholdsEnabled: value })} />
        <View style={styles.fieldRow}><Field label="Open" value={String(thresholds.openThreshold)} onChange={(value) => coach.updateManualThresholds({ openThreshold: numberValue(value, 0.35, 0.95) })} suffix="0–1" /><Field label="Close" value={String(thresholds.closeThreshold)} onChange={(value) => coach.updateManualThresholds({ closeThreshold: numberValue(value, 0.05, 0.7) })} suffix="0–1" /></View>
        <View style={styles.fieldRow}><Field label="Min duration" value={String(thresholds.minBlinkDurationMs)} onChange={(value) => coach.updateManualThresholds({ minBlinkDurationMs: numberValue(value, 30, 300) })} suffix="ms" /><Field label="Max duration" value={String(thresholds.maxBlinkDurationMs)} onChange={(value) => coach.updateManualThresholds({ maxBlinkDurationMs: numberValue(value, 300, 2000) })} suffix="ms" /></View>
      </Card>

      <SectionTitle>Detector boundary</SectionTitle>
      <Card style={styles.architectureCard}>
        <Text style={styles.architectureTitle}>Reusable core → replaceable detector</Text>
        <Text style={styles.architectureText}>The UI, calibration, blink state machine, statistics, reminder gate, and local history use only the BlinkDetector interface. The current web implementation is WebMediaPipeBlinkDetector. A future native build connects IOSNativeBlinkDetector at the same boundary using Apple Vision and/or ARKit.</Text>
        <Text style={styles.architectureFootnote}>No native Apple computer-vision code is bundled in this MVP.</Text>
      </Card>

      <SecondaryButton label="Back to Home" onPress={() => router.replace('/')} />
    </Page>
  );
}

function Field({ label, value, onChange, suffix }: { label: string; value: string; onChange: (value: string) => void; suffix: string }): React.ReactElement {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><NumberField value={value} onChangeText={onChange} suffix={suffix} accessibilityLabel={`${label} threshold`} /></View>;
}

function numberValue(value: string, min: number, max: number): number {
  const parsed = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min;
}

const styles = StyleSheet.create({
  note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 13 },
  fieldRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  field: { flex: 1 },
  fieldLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', marginBottom: 5 },
  architectureCard: { backgroundColor: colors.navy, shadowOpacity: 0 },
  architectureTitle: { color: colors.tealBright, fontSize: 15, fontWeight: '800' },
  architectureText: { color: '#C3CEE0', fontSize: 13, lineHeight: 20, marginTop: 8 },
  architectureFootnote: { color: '#98A9C4', fontSize: 11, lineHeight: 16, marginTop: 12 },
});
