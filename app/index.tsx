import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDecimal, formatDuration } from '../src/domain/math';
import { DeveloperOverlay } from '../src/ui/DeveloperOverlay';
import { CameraPreview } from '../src/ui/CameraPreview';
import { colors } from '../src/ui/theme';
import { Card, Header, Page, PrimaryButton, SecondaryButton, SectionTitle, StatusDot } from '../src/ui/Ui';
import { useBlinkCoach } from '../src/hooks/useBlinkCoach';

export default function HomeScreen(): React.ReactElement {
  const router = useRouter();
  const coach = useBlinkCoach();
  if (coach.settings.lowDistractionMode) return <LowDistractionHome />;

  const statusColor = !coach.isMonitoring ? colors.softMuted : coach.cameraState === 'ready' ? colors.teal : colors.amber;
  const statusText = !coach.isMonitoring
    ? 'Ready to begin'
    : coach.cameraState === 'ready'
      ? 'Monitoring'
      : coach.cameraState === 'error' || coach.cameraState === 'lost'
        ? 'Needs attention'
        : 'Starting camera';

  return (
    <Page>
      <Header title="Blink Coach" subtitle="A calmer way to notice your screen-time blinking." />

      <View style={styles.statusRow}>
        <StatusDot color={statusColor} />
        <Text style={styles.statusText}>{statusText}</Text>
        {coach.isMonitoring ? <Text style={styles.statusDetail}>{coach.faceDetected ? 'Face detected' : 'Find your face in the frame'}</Text> : null}
      </View>

      <Card style={styles.heroCard}>
        <Text style={styles.eyebrow}>LIVE BLINK RATE</Text>
        <View style={styles.heroMetricRow}>
          <Text style={styles.heroMetric}>{Math.round(coach.metrics.rollingBlinksPerMinute)}</Text>
          <Text style={styles.heroUnit}>blinks/min</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.secondaryMetrics}>
          <Metric label="Since last blink" value={`${formatDecimal(coach.metrics.timeSinceLastBlinkMs / 1000, 1)} sec`} />
          <Metric label="This session" value={String(coach.metrics.totalBlinks)} />
          <Metric label="Session time" value={formatDuration(coach.metrics.sessionDurationMs)} />
        </View>
        <View style={styles.reminderStatusRow}><Text style={styles.reminderStatusLabel}>Reminder</Text><Text style={styles.reminderStatusValue}>{!coach.isMonitoring ? 'off' : coach.reminder.armed ? 'armed' : 'cooldown'}</Text></View>
        <View style={styles.experimentalRow}><Text style={styles.experimentalLabel}>Experimental blink quality</Text><Text style={styles.experimentalValue}>{coach.completeBlinkPercentage === null ? 'appears after a blink' : `${Math.round(coach.completeBlinkPercentage)}% complete · ${coach.incompleteBlinkCount} incomplete`}</Text></View>
      </Card>

      <Card style={styles.cameraCard}>
        <View style={styles.cardHeadingRow}>
          <View style={styles.headingCopy}>
            <Text style={styles.cardTitle}>Camera positioning</Text>
            <Text style={styles.cardDescription}>{coach.isMonitoring ? 'Keep your eyes and eyebrows inside the frame.' : 'Your front camera stays off until you start.'}</Text>
          </View>
          {coach.isMonitoring ? <Text style={[styles.faceBadge, coach.faceDetected && styles.faceBadgeGood]}>{coach.faceDetected ? 'FACE FOUND' : 'LOOK HERE'}</Text> : null}
        </View>
        <CameraPreview
          key={coach.cameraRetryKey}
          active={coach.isMonitoring}
          hidden={!coach.settings.cameraPreviewVisible}
          retryKey={coach.cameraRetryKey}
          onReady={coach.handleCameraReady}
          onError={coach.handleCameraError}
          onStreamLost={coach.handleCameraStreamLost}
        />
        {coach.cameraError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{coach.cameraError}</Text>
            <Pressable onPress={coach.retryCamera} style={styles.tryAgain} accessibilityRole="button"><Text style={styles.tryAgainText}>Try again</Text></Pressable>
          </View>
        ) : null}
        {coach.isMonitoring ? <Pressable onPress={() => coach.updateSettings({ cameraPreviewVisible: !coach.settings.cameraPreviewVisible })} style={styles.previewToggle} accessibilityRole="button"><Text style={styles.previewToggleText}>{coach.settings.cameraPreviewVisible ? 'Hide preview' : 'Show preview'}</Text></Pressable> : null}
        <Text style={styles.cameraHint}>Local only · no video or camera frames are saved.</Text>
      </Card>

      {coach.reminderPulse ? (
        <View style={styles.reminderBanner} accessibilityLiveRegion="polite">
          <Text style={styles.reminderIcon}>✦</Text>
          <View style={styles.reminderCopy}><Text style={styles.reminderTitle}>Time for a gentle blink</Text><Text style={styles.reminderText}>Let your eyes close naturally, then reopen.</Text></View>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        {coach.isMonitoring ? <PrimaryButton label="Stop Monitoring" onPress={coach.stopMonitoring} /> : <PrimaryButton label="Start Monitoring" onPress={coach.startMonitoring} />}
        <SecondaryButton label="Calibrate" onPress={() => router.push('/calibrate')} />
      </View>

      <SectionTitle>Explore</SectionTitle>
      <View style={styles.actionGrid}>
        <ActionTile icon="⚙" title="Settings" description="Reminder & display" onPress={() => router.push('/settings')} />
        <ActionTile icon="◷" title="History" description="Your local sessions" onPress={() => router.push('/history')} />
        <ActionTile icon="⌁" title="Developer / Test Lab" description="Signals & thresholds" onPress={() => router.push('/lab')} />
        <ActionTile icon="◌" title="Low-distraction" description="Stand beside your monitor" onPress={() => coach.updateSettings({ lowDistractionMode: true })} />
      </View>

      {coach.settings.developerMode ? <DeveloperOverlay embedded /> : null}

      <View style={styles.privacyNote}>
        <Text style={styles.privacyTitle}>Private by design</Text>
        <Text style={styles.privacyText}>Blink Coach processes your camera locally in this browser. No account, upload, tracking, ads, analytics, or saved camera frames.</Text>
      </View>
    </Page>
  );
}

function LowDistractionHome(): React.ReactElement {
  const router = useRouter();
  const coach = useBlinkCoach();
  const status = !coach.isMonitoring ? 'Ready' : coach.cameraState === 'ready' ? 'Monitoring' : 'Starting…';
  return (
    <Page dark scroll={false} style={styles.lowPage}>
      <View style={styles.lowContent}>
        <View style={styles.lowTop}><Text style={styles.lowBrand}>BLINK COACH</Text><Pressable onPress={() => coach.updateSettings({ lowDistractionMode: false })} accessibilityRole="button"><Text style={styles.lowExit}>Exit</Text></Pressable></View>
        <View style={styles.lowCenter}>
          <Text style={styles.lowStatus}>{status}</Text>
          <Text style={styles.lowMetric}>{Math.round(coach.metrics.rollingBlinksPerMinute)}</Text>
          <Text style={styles.lowUnit}>blinks / min</Text>
          {coach.isMonitoring ? <Text style={[styles.lowFace, coach.faceDetected && styles.lowFaceGood]}>{coach.faceDetected ? '● face detected' : '○ waiting for face'}</Text> : null}
          {coach.reminderPulse ? <Text style={styles.lowReminder}>✦ blink gently</Text> : null}
        </View>
        <CameraPreview
          key={coach.cameraRetryKey}
          active={coach.isMonitoring}
          hidden
          retryKey={coach.cameraRetryKey}
          onReady={coach.handleCameraReady}
          onError={coach.handleCameraError}
          onStreamLost={coach.handleCameraStreamLost}
        />
        <View style={styles.lowBottom}>
          {coach.isMonitoring ? <SecondaryButton dark label="Stop Monitoring" onPress={coach.stopMonitoring} /> : <PrimaryButton dark label="Start Monitoring" onPress={coach.startMonitoring} />}
          <Pressable onPress={() => router.push('/settings')} style={styles.lowSettings} accessibilityRole="button"><Text style={styles.lowSettingsText}>Settings</Text></Pressable>
        </View>
      </View>
    </Page>
  );
}

function Metric({ label, value }: { label: string; value: string }): React.ReactElement {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function ActionTile({ icon, title, description, onPress }: { icon: string; title: string; description: string; onPress: () => void }): React.ReactElement {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionTile, pressed && styles.actionPressed]} accessibilityRole="button">
      <Text style={styles.actionIcon}>{icon}</Text><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionDescription}>{description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, marginBottom: 12 },
  statusText: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  statusDetail: { color: colors.muted, fontSize: 12, marginLeft: 'auto' },
  heroCard: { padding: 22 },
  eyebrow: { color: colors.teal, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  heroMetricRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 7 },
  heroMetric: { color: colors.ink, fontSize: 64, lineHeight: 70, fontWeight: '900', letterSpacing: -2 },
  heroUnit: { color: colors.muted, fontSize: 16, fontWeight: '700', marginLeft: 9 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 17 },
  secondaryMetrics: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1 },
  metricLabel: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  metricValue: { color: colors.ink, fontSize: 16, fontWeight: '800', marginTop: 4 },
  reminderStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  reminderStatusLabel: { color: colors.muted, fontSize: 12 },
  reminderStatusValue: { color: colors.teal, fontSize: 12, fontWeight: '800' },
  experimentalRow: { marginTop: 11 },
  experimentalLabel: { color: colors.softMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  experimentalValue: { color: colors.muted, fontSize: 11, marginTop: 3 },
  cameraCard: { padding: 14 },
  cardHeadingRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 4, marginBottom: 10 },
  headingCopy: { flex: 1, paddingRight: 10 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  cardDescription: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  faceBadge: { color: colors.amber, backgroundColor: colors.amberPale, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  faceBadgeGood: { color: colors.teal, backgroundColor: colors.tealPale },
  errorBox: { backgroundColor: colors.redPale, borderRadius: 14, padding: 12, marginTop: 10, flexDirection: 'row', alignItems: 'center' },
  errorText: { flex: 1, color: colors.red, fontSize: 12, lineHeight: 17, paddingRight: 8 },
  tryAgain: { minHeight: 38, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#FFFFFF', justifyContent: 'center' },
  tryAgainText: { color: colors.red, fontSize: 12, fontWeight: '800' },
  cameraHint: { color: colors.softMuted, fontSize: 11, textAlign: 'center', marginTop: 9 },
  previewToggle: { alignSelf: 'center', minHeight: 42, justifyContent: 'center', paddingHorizontal: 12 },
  previewToggleText: { color: colors.blue, fontSize: 12, fontWeight: '800' },
  reminderBanner: { backgroundColor: colors.tealPale, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 14, borderWidth: 1, borderColor: '#C8EEE7' },
  reminderIcon: { color: colors.teal, fontSize: 24, marginRight: 11 },
  reminderCopy: { flex: 1 },
  reminderTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  reminderText: { color: colors.muted, fontSize: 12, marginTop: 3 },
  actionsRow: { gap: 10 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionTile: { width: '48%', minHeight: 114, backgroundColor: colors.card, borderRadius: 18, padding: 15, borderWidth: 1, borderColor: colors.line },
  actionPressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  actionIcon: { color: colors.teal, fontSize: 22, marginBottom: 8 },
  actionTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  actionDescription: { color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: 4 },
  privacyNote: { paddingHorizontal: 4, paddingTop: 20, paddingBottom: 8 },
  privacyTitle: { color: colors.ink, fontSize: 13, fontWeight: '800', marginBottom: 4 },
  privacyText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  lowPage: { backgroundColor: '#070B14' },
  lowContent: { flex: 1, maxWidth: 560, width: '100%', alignSelf: 'center', paddingHorizontal: 22, paddingTop: 8, paddingBottom: 18 },
  lowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lowBrand: { color: '#83E3D2', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  lowExit: { color: '#98A9C4', fontSize: 13, fontWeight: '700', padding: 10 },
  lowCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lowStatus: { color: '#98A9C4', fontSize: 18, fontWeight: '700' },
  lowMetric: { color: '#F4F7FB', fontSize: 100, lineHeight: 112, fontWeight: '900', letterSpacing: -4, marginTop: 8 },
  lowUnit: { color: '#98A9C4', fontSize: 16, fontWeight: '700' },
  lowFace: { color: '#98A9C4', fontSize: 14, marginTop: 26 },
  lowFaceGood: { color: '#83E3D2' },
  lowReminder: { color: '#83E3D2', fontSize: 16, fontWeight: '800', marginTop: 24 },
  lowBottom: { gap: 10 },
  lowSettings: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  lowSettingsText: { color: '#98A9C4', fontSize: 13, fontWeight: '700' },
});
