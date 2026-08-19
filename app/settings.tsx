import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { effectiveReminderIntervalSeconds } from '../src/domain/settings';
import { useBlinkCoach } from '../src/hooks/useBlinkCoach';
import { Card, Chip, Header, NumberField, Page, SectionTitle, ToggleRow, PrimaryButton, SecondaryButton } from '../src/ui/Ui';
import { colors } from '../src/ui/theme';

const INTERVALS = [3, 5, 7, 10];

export default function SettingsScreen(): React.ReactElement {
  const router = useRouter();
  const coach = useBlinkCoach();
  const currentInterval = coach.settings.reminderIntervalSeconds;
  return (
    <Page>
      <Header title="Settings" subtitle="Personalize the gentle nudge." onBack={() => router.back()} />

      <SectionTitle>Reminder interval</SectionTitle>
      <Card>
        <Text style={styles.cardIntro}>Remind me after I have gone this long without a valid blink.</Text>
        <View style={styles.chips}>
          {INTERVALS.map((seconds) => <Chip key={seconds} label={`${seconds}s`} selected={currentInterval === seconds} onPress={() => coach.updateSettings({ reminderIntervalSeconds: seconds })} />)}
          <Chip label="Custom" selected={currentInterval === -1} onPress={() => coach.updateSettings({ reminderIntervalSeconds: -1 })} />
        </View>
        {currentInterval === -1 ? (
          <View style={styles.customRow}>
            <Text style={styles.customLabel}>Custom interval</Text>
            <NumberField value={String(coach.settings.customReminderIntervalSeconds)} onChangeText={(value) => coach.updateSettings({ customReminderIntervalSeconds: safeNumber(value, 3, 120) })} suffix="sec" accessibilityLabel="Custom reminder interval in seconds" />
          </View>
        ) : null}
        <Text style={styles.currentInterval}>Current: {effectiveReminderIntervalSeconds(coach.settings)} seconds · default for testing is 5 seconds.</Text>
      </Card>

      <SectionTitle>Monitoring</SectionTitle>
      <Card>
        <ToggleRow title="Reminder sound" description="A quiet two-tone cue when the reminder fires." value={coach.settings.soundEnabled} onValueChange={(value) => coach.updateSettings({ soundEnabled: value })} />
        <ToggleRow title="Hide camera preview" description="The camera keeps running after positioning, but the preview becomes unobtrusive." value={!coach.settings.cameraPreviewVisible} onValueChange={(value) => coach.updateSettings({ cameraPreviewVisible: !value })} />
        <ToggleRow title="Low-distraction mode" description="Nearly black screen with only the essential monitoring view." value={coach.settings.lowDistractionMode} onValueChange={(value) => coach.updateSettings({ lowDistractionMode: value })} />
        <View style={styles.fpsRow}><View style={styles.fpsCopy}><Text style={styles.rowTitle}>Inference rate</Text><Text style={styles.rowDescription}>Lower rates use less battery. Actual FPS appears in Developer Mode.</Text></View><View style={styles.fpsChips}>{([10, 15, 20] as const).map((fps) => <Chip key={fps} label={`${fps}`} selected={coach.settings.inferenceFps === fps} onPress={() => coach.updateSettings({ inferenceFps: fps })} />)}</View></View>
      </Card>

      <SectionTitle>Calibration</SectionTitle>
      <Card>
        <Text style={styles.cardIntro}>{coach.calibrationProfile ? `Saved ${new Date(coach.calibrationProfile.createdAt).toLocaleDateString()} · ${coach.calibrationProfile.sampleCount} eye samples` : 'No personal calibration yet. The detector learns a conservative local open-eye baseline at the start of a session, which helps with goggles and tinted eye protection.'}</Text>
        <PrimaryButton label={coach.calibrationProfile ? 'Recalibrate' : 'Calibrate now'} onPress={() => router.push('/calibrate')} />
      </Card>

      <SectionTitle>Privacy</SectionTitle>
      <Card style={styles.privacyCard}>
        <Text style={styles.privacyTitle}>Everything stays on this device</Text>
        <Text style={styles.privacyText}>Blink Coach does not create an account, upload camera frames, save video, run analytics, track you, or show ads. Session summaries and settings are stored locally in this browser.</Text>
      </Card>

      <SecondaryButton label="Open Developer / Test Lab" onPress={() => router.push('/lab')} />
    </Page>
  );
}

function safeNumber(value: string, min: number, max: number): number {
  const parsed = Number(value.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

const styles = StyleSheet.create({
  cardIntro: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  customRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5, paddingTop: 15, borderTopWidth: 1, borderTopColor: colors.line },
  customLabel: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  currentInterval: { color: colors.softMuted, fontSize: 11, lineHeight: 16, marginTop: 9 },
  fpsRow: { minHeight: 77, flexDirection: 'row', alignItems: 'center' },
  fpsCopy: { flex: 1, paddingRight: 8 },
  fpsChips: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  rowDescription: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  privacyCard: { backgroundColor: colors.navy },
  privacyTitle: { color: colors.tealBright, fontSize: 15, fontWeight: '800', marginBottom: 7 },
  privacyText: { color: '#C3CEE0', fontSize: 13, lineHeight: 19 },
});
