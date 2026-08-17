import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SignalSample } from '../domain/types';
import { colors } from './theme';

export function SignalGraph({ samples, dark = false }: { samples: SignalSample[]; dark?: boolean }): React.ReactElement {
  const visible = samples.slice(-48);
  return (
    <View>
      <View style={[styles.graph, dark && styles.darkGraph]}>
        <View style={[styles.midline, dark && styles.darkLine]} />
        {visible.map((sample, index) => {
          const left = sample.smoothedLeft ?? sample.left;
          const right = sample.smoothedRight ?? sample.right;
          return (
            <View key={`${sample.timestampMs}-${index}`} style={styles.column}>
              <View style={[styles.barTrack, dark && styles.darkBarTrack]}>
                <View style={[styles.bar, styles.leftBar, { height: `${Math.max(3, (left ?? 0) * 100)}%` }]} />
              </View>
              <View style={[styles.barTrack, dark && styles.darkBarTrack]}>
                <View style={[styles.bar, styles.rightBar, { height: `${Math.max(3, (right ?? 0) * 100)}%` }]} />
              </View>
            </View>
          );
        })}
        {visible.length === 0 ? <Text style={[styles.empty, dark && styles.darkText]}>Signal samples appear after monitoring starts.</Text> : null}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.teal }]} /><Text style={[styles.legendText, dark && styles.darkText]}>left eye</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.blue }]} /><Text style={[styles.legendText, dark && styles.darkText]}>right eye</Text></View>
        <Text style={[styles.graphHint, dark && styles.darkMuted]}>newest →</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  graph: { height: 138, borderRadius: 16, backgroundColor: '#F7F9FC', borderWidth: 1, borderColor: colors.line, padding: 8, flexDirection: 'row', alignItems: 'flex-end', overflow: 'hidden', position: 'relative' },
  darkGraph: { backgroundColor: '#0B1120', borderColor: '#263650' },
  midline: { position: 'absolute', top: '50%', left: 8, right: 8, borderTopWidth: 1, borderTopColor: '#DCE3EF' },
  darkLine: { borderTopColor: '#25344D' },
  column: { flex: 1, height: '100%', flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  barTrack: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  darkBarTrack: { backgroundColor: 'rgba(255,255,255,0.01)' },
  bar: { width: '100%', minHeight: 2, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  leftBar: { backgroundColor: colors.teal },
  rightBar: { backgroundColor: colors.blue },
  empty: { position: 'absolute', alignSelf: 'center', top: 56, color: colors.muted, fontSize: 12 },
  legend: { flexDirection: 'row', alignItems: 'center', marginTop: 9 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 14 },
  legendDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  legendText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  graphHint: { color: colors.softMuted, fontSize: 11, marginLeft: 'auto' },
  darkText: { color: colors.darkText },
  darkMuted: { color: '#98A9C4' },
});
