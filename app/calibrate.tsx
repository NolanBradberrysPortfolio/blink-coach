import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatDecimal } from '../src/domain/math';
import { useBlinkCoach } from '../src/hooks/useBlinkCoach';
import { CameraPreview } from '../src/ui/CameraPreview';
import { Card, Header, Page, PrimaryButton, SecondaryButton, SectionTitle } from '../src/ui/Ui';
import { colors } from '../src/ui/theme';

export default function CalibrationScreen(): React.ReactElement {
  const router = useRouter();
  const coach = useBlinkCoach();
  const state = coach.calibration;
  const phase = state.phase;
  const openSeconds = phase === 'open' && state.phaseStartedAtMs !== null ? Math.max(0, (coach.nowMs() - state.phaseStartedAtMs) / 1000) : 0;
  const active = phase !== 'idle' && phase !== 'complete';

  return (
    <Page>
      <Header title="Calibration" subtitle="Tune Blink Coach to your natural eye signal." onBack={() => router.back()} />
      <Card style={styles.introCard}>
        <Text style={styles.introTitle}>A quick personal baseline</Text>
        <Text style={styles.introText}>Blink Coach uses your recorded eye signal to choose more useful thresholds. This is a usability calibration, not a medical test.</Text>
        <View style={styles.steps}><Step label="Open" active={phase === 'open'} done={['natural', 'deliberate', 'complete'].includes(phase)} /><Step label="Natural ×5" active={phase === 'natural'} done={['deliberate', 'complete'].includes(phase)} /><Step label="Deliberate ×3" active={phase === 'deliberate'} done={phase === 'complete'} /></View>
      </Card>

      <Card style={styles.cameraCard}>
        <CameraPreview
          key={coach.cameraRetryKey}
          active={coach.isMonitoring}
          hidden={false}
          retryKey={coach.cameraRetryKey}
          onReady={coach.handleCameraReady}
          onError={coach.handleCameraError}
          onStreamLost={coach.handleCameraStreamLost}
        />
        <View style={styles.cameraStatus}><View style={[styles.statusDot, { backgroundColor: state.faceReady ? colors.teal : colors.amber }]} /><Text style={styles.cameraStatusText}>{state.faceReady ? 'Face signal looks ready' : 'Position your face in the preview'}</Text></View>
        {coach.cameraError ? <Text style={styles.errorText}>{coach.cameraError}</Text> : null}
      </Card>

      <SectionTitle>What to do</SectionTitle>
      <Card>
        {phase === 'idle' ? <Instruction title="1 · Natural open" body="Sit naturally, keep both eyes comfortably open, and look toward the screen for a few seconds." /> : null}
        {phase === 'open' ? <Instruction title="Keep your eyes naturally open" body={`Collecting a baseline · ${Math.min(3, Math.floor(openSeconds))} / 3 seconds`} /> : null}
        {phase === 'natural' ? <Instruction title="Blink naturally five times" body={`Detected ${state.naturalBlinkCount} of 5 natural blinks. Take your time.`} /> : null}
        {phase === 'deliberate' ? <Instruction title="Perform three deliberate complete blinks" body={`Detected ${state.deliberateBlinkCount} of 3. Close fully, then reopen naturally.`} /> : null}
        {phase === 'complete' ? <Instruction title="Calibration saved" body="Your personalized thresholds are now active for future sessions." /> : null}
      </Card>

      {phase === 'idle' ? <PrimaryButton label="Begin Calibration" onPress={coach.beginCalibration} /> : null}
      {phase === 'complete' ? (
        <View style={styles.buttonStack}>
          <PrimaryButton label="Back to Home" onPress={() => router.replace('/')} />
          <SecondaryButton label="Calibrate again" onPress={coach.resetCalibration} />
        </View>
      ) : null}
      {active ? <Text style={styles.keepOpenNote}>Keep Blink Coach in the foreground while the camera is active.</Text> : null}

      {coach.calibrationProfile && phase === 'complete' ? (
        <Card style={styles.profileCard}>
          <Text style={styles.profileTitle}>Saved baseline</Text>
          <View style={styles.profileRow}><ProfileValue label="Open" value={`${formatDecimal(coach.calibrationProfile.openLeft, 2)} / ${formatDecimal(coach.calibrationProfile.openRight, 2)}`} /><ProfileValue label="Closed" value={`${formatDecimal(coach.calibrationProfile.closedLeft, 2)} / ${formatDecimal(coach.calibrationProfile.closedRight, 2)}`} /><ProfileValue label="Samples" value={String(coach.calibrationProfile.sampleCount)} /></View>
        </Card>
      ) : null}
    </Page>
  );
}

function Step({ label, active, done }: { label: string; active: boolean; done: boolean }): React.ReactElement {
  return <View style={styles.step}><View style={[styles.stepDot, active && styles.stepActive, done && styles.stepDone]}><Text style={[styles.stepDotText, (active || done) && styles.stepLight]}>{done ? '✓' : '•'}</Text></View><Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{label}</Text></View>;
}

function Instruction({ title, body }: { title: string; body: string }): React.ReactElement {
  return <View><Text style={styles.instructionTitle}>{title}</Text><Text style={styles.instructionBody}>{body}</Text></View>;
}

function ProfileValue({ label, value }: { label: string; value: string }): React.ReactElement {
  return <View style={styles.profileValue}><Text style={styles.profileLabel}>{label}</Text><Text style={styles.profileNumber}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  introCard: { padding: 20 },
  introTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  introText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7 },
  steps: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  step: { alignItems: 'center', flex: 1 },
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EEF1F5', alignItems: 'center', justifyContent: 'center' },
  stepActive: { backgroundColor: colors.navy },
  stepDone: { backgroundColor: colors.teal },
  stepDotText: { color: colors.softMuted, fontSize: 16, fontWeight: '900' },
  stepLight: { color: '#FFFFFF', fontSize: 13 },
  stepLabel: { color: colors.muted, fontSize: 10, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  stepLabelActive: { color: colors.ink },
  cameraCard: { padding: 14 },
  cameraStatus: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 3 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 7 },
  cameraStatusText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  errorText: { color: colors.red, fontSize: 12, lineHeight: 17, marginTop: 9 },
  instructionTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  instructionBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  buttonStack: { gap: 10 },
  keepOpenNote: { color: colors.softMuted, fontSize: 11, textAlign: 'center', marginTop: 11 },
  profileCard: { marginTop: 18, backgroundColor: colors.tealPale, shadowOpacity: 0 },
  profileTitle: { color: colors.teal, fontSize: 13, fontWeight: '800', marginBottom: 13 },
  profileRow: { flexDirection: 'row', gap: 12 },
  profileValue: { flex: 1 },
  profileLabel: { color: colors.muted, fontSize: 11 },
  profileNumber: { color: colors.ink, fontSize: 15, fontWeight: '800', marginTop: 4 },
});
