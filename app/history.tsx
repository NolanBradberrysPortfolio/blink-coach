import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatDecimal, formatDuration } from '../src/domain/math';
import { useBlinkCoach } from '../src/hooks/useBlinkCoach';
import { Card, Header, Page, SectionTitle, SecondaryButton } from '../src/ui/Ui';
import { colors } from '../src/ui/theme';

export default function HistoryScreen(): React.ReactElement {
  const router = useRouter();
  const coach = useBlinkCoach();
  return (
    <Page>
      <Header title="History" subtitle="Stored only on this device." onBack={() => router.back()} />
      {coach.history.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>◷</Text>
          <Text style={styles.emptyTitle}>No sessions yet</Text>
          <Text style={styles.emptyText}>Start monitoring, then stop when you are done. Your summary will appear here without leaving your phone.</Text>
        </Card>
      ) : (
        <>
          <SectionTitle>{coach.history.length} recent {coach.history.length === 1 ? 'session' : 'sessions'}</SectionTitle>
          {coach.history.map((session) => <SessionCard key={session.id} session={session} />)}
          <SecondaryButton label="Clear local history" onPress={coach.clearSessionHistory} />
        </>
      )}
      <View style={styles.note}><Text style={styles.noteTitle}>What is experimental?</Text><Text style={styles.noteText}>Complete-blink percentage is a signal heuristic based on closure depth, duration, and eye symmetry. It is not medically validated and is not a diagnosis.</Text></View>
    </Page>
  );
}

function SessionCard({ session }: { session: ReturnType<typeof useBlinkCoach>['history'][number] }): React.ReactElement {
  const start = new Date(session.startedAt);
  const complete = session.completeBlinkPercentage;
  const incompleteCount = complete === null ? null : Math.max(0, Math.round(session.totalBlinks * (1 - complete / 100)));
  return (
    <Card>
      <View style={styles.sessionHeading}><View><Text style={styles.sessionDate}>{start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</Text><Text style={styles.sessionTime}>{start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text></View><Text style={styles.sessionBlinks}>{session.totalBlinks}<Text style={styles.sessionBlinksUnit}> blinks</Text></Text></View>
      <View style={styles.statsRow}><Stat label="Length" value={formatDuration(session.durationMs)} /><Stat label="Avg rate" value={`${formatDecimal(session.averageBlinkRate)} / min`} /><Stat label="Longest gap" value={formatDuration(session.longestIntervalMs)} /></View>
      <View style={styles.secondaryRow}><Text style={styles.secondaryText}>{session.reminderCount} reminder{session.reminderCount === 1 ? '' : 's'}</Text><Text style={styles.secondaryText}>{complete === null ? 'Experimental score unavailable' : `${Math.round(complete)}% complete · ${incompleteCount} incomplete`}</Text></View>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  emptyCard: { alignItems: 'center', paddingVertical: 34 },
  emptyIcon: { color: colors.teal, fontSize: 34, marginBottom: 10 },
  emptyTitle: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8, maxWidth: 300 },
  sessionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  sessionDate: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  sessionTime: { color: colors.muted, fontSize: 12, marginTop: 3 },
  sessionBlinks: { color: colors.teal, fontSize: 25, fontWeight: '900' },
  sessionBlinksUnit: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 10, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: colors.line },
  stat: { flex: 1 },
  statLabel: { color: colors.muted, fontSize: 11 },
  statValue: { color: colors.ink, fontSize: 14, fontWeight: '800', marginTop: 4 },
  secondaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 13 },
  secondaryText: { color: colors.softMuted, fontSize: 11, flexShrink: 1 },
  note: { padding: 4, marginTop: 12 },
  noteTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  noteText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
});
