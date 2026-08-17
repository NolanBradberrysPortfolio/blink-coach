import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlinkDetectionConfig, BlinkEvent } from '../domain/types';
import { GroundTruthEvent, TestSignalSample } from '../domain/testLabTypes';
import { blinkEventTimeMs } from '../domain/testComparison';
import { colors } from './theme';

interface VideoSignalGraphProps {
  samples: TestSignalSample[];
  durationMs: number;
  config: BlinkDetectionConfig;
  predictedEvents: BlinkEvent[];
  groundTruthEvents: GroundTruthEvent[];
  selectedTimeMs: number;
  onSelectTime: (timeMs: number) => void;
}

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 250;

export function VideoSignalGraph({
  samples,
  durationMs,
  config,
  predictedEvents,
  groundTruthEvents,
  selectedTimeMs,
  onSelectTime,
}: VideoSignalGraphProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewStartMs, setViewStartMs] = useState(0);
  const [viewEndMs, setViewEndMs] = useState(durationMs);

  useEffect(() => {
    const timer = setTimeout(() => {
      setViewStartMs(0);
      setViewEndMs(durationMs);
    }, 0);
    return () => clearTimeout(timer);
  }, [durationMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || Platform.OS !== 'web') return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const start = viewStartMs;
    const end = Math.max(start + 1, viewEndMs);
    const xFor = (timeMs: number) => ((timeMs - start) / (end - start)) * CANVAS_WIDTH;
    const yFor = (value: number) => 20 + (1 - Math.max(0, Math.min(1, value))) * (CANVAS_HEIGHT - 48);

    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    context.fillStyle = '#0B1120';
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    context.strokeStyle = '#25344D';
    context.lineWidth = 1;
    for (const value of [0, 0.25, 0.5, 0.75, 1]) {
      const y = yFor(value);
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(CANVAS_WIDTH, y);
      context.stroke();
    }
    drawThreshold(context, xFor, yFor, config.closeThreshold, '#E6A94A', 'close');
    drawThreshold(context, xFor, yFor, config.openThreshold, '#72D6C6', 'open');
    drawSignal(context, samples, 'left', false, xFor, yFor, start, end, '#45C9B5');
    drawSignal(context, samples, 'right', false, xFor, yFor, start, end, '#7190FF');
    drawSignal(context, samples, 'smoothedLeft', true, xFor, yFor, start, end, '#A8F3E7');
    drawSignal(context, samples, 'smoothedRight', true, xFor, yFor, start, end, '#B2C0FF');
    for (const event of predictedEvents) drawMarker(context, xFor(blinkEventTimeMs(event)), '#F08A8A', 5, 0, CANVAS_HEIGHT - 28);
    for (const event of groundTruthEvents) drawMarker(context, xFor(event.timeMs), event.type === 'incompleteBlink' ? '#F4C86A' : '#FFFFFF', 3, 14, CANVAS_HEIGHT - 28);
    if (selectedTimeMs >= start && selectedTimeMs <= end) drawMarker(context, xFor(selectedTimeMs), '#83E3D2', 2, 0, CANVAS_HEIGHT - 28);
    context.fillStyle = '#98A9C4';
    context.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    context.fillText(formatAxis(start), 8, CANVAS_HEIGHT - 8);
    context.fillText(formatAxis(end), CANVAS_WIDTH - 64, CANVAS_HEIGHT - 8);
  }, [config.closeThreshold, config.openThreshold, groundTruthEvents, predictedEvents, samples, selectedTimeMs, viewEndMs, viewStartMs]);

  const selectFromCanvas = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    const ratio = bounds.width <= 0 ? 0 : (event.clientX - bounds.left) / bounds.width;
    onSelectTime(viewStartMs + Math.max(0, Math.min(1, ratio)) * (viewEndMs - viewStartMs));
  };

  const zoom = (factor: number) => {
    const currentSpan = Math.max(1, viewEndMs - viewStartMs);
    const center = selectedTimeMs >= viewStartMs && selectedTimeMs <= viewEndMs ? selectedTimeMs : viewStartMs + currentSpan / 2;
    const nextSpan = Math.max(1000, Math.min(durationMs || 1000, currentSpan * factor));
    setViewStartMs(Math.max(0, Math.min(Math.max(0, durationMs - nextSpan), center - nextSpan / 2)));
    setViewEndMs(Math.min(durationMs, Math.max(nextSpan, center + nextSpan / 2)));
  };

  return (
    <View>
      {Platform.OS === 'web' ? (
        React.createElement('canvas', {
          ref: canvasRef,
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          onClick: selectFromCanvas,
          style: { width: '100%', height: 220, borderRadius: 16, display: 'block', touchAction: 'manipulation' } as React.CSSProperties,
          'aria-label': 'Blink detector eye signal graph. Tap to inspect time.',
        })
      ) : (
        <View style={styles.nativeFallback}><Text style={styles.nativeFallbackText}>Signal graph is available in the web Test Lab.</Text></View>
      )}
      <View style={styles.controls}>
        <Pressable onPress={() => zoom(0.5)} style={styles.controlButton} accessibilityRole="button"><Text style={styles.controlText}>Zoom in</Text></Pressable>
        <Pressable onPress={() => zoom(2)} style={styles.controlButton} accessibilityRole="button"><Text style={styles.controlText}>Zoom out</Text></Pressable>
        <Pressable onPress={() => { setViewStartMs(0); setViewEndMs(durationMs); }} style={styles.controlButton} accessibilityRole="button"><Text style={styles.controlText}>Reset</Text></Pressable>
      </View>
      <View style={styles.legend}>
        <LegendDot color="#A8F3E7" label="left smoothed" />
        <LegendDot color="#B2C0FF" label="right smoothed" />
        <LegendDot color="#F08A8A" label="predicted" />
        <LegendDot color="#FFFFFF" label="ground truth" />
      </View>
    </View>
  );
}

function drawSignal(
  context: CanvasRenderingContext2D,
  samples: TestSignalSample[],
  key: 'left' | 'right' | 'smoothedLeft' | 'smoothedRight',
  solid: boolean,
  xFor: (timeMs: number) => number,
  yFor: (value: number) => number,
  start: number,
  end: number,
  color: string,
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = solid ? 2.5 : 1;
  context.globalAlpha = solid ? 0.95 : 0.4;
  context.setLineDash(solid ? [] : [4, 4]);
  context.beginPath();
  let started = false;
  for (const sample of samples) {
    if (sample.timestampMs < start || sample.timestampMs > end) continue;
    const value = sample[key];
    if (value === null || value === undefined) {
      started = false;
      continue;
    }
    const x = xFor(sample.timestampMs);
    const y = yFor(value);
    if (!started) context.moveTo(x, y);
    else context.lineTo(x, y);
    started = true;
  }
  context.stroke();
  context.restore();
}

function drawThreshold(
  context: CanvasRenderingContext2D,
  xFor: (timeMs: number) => number,
  yFor: (value: number) => number,
  value: number,
  color: string,
  label: string,
): void {
  context.save();
  context.strokeStyle = color;
  context.setLineDash([7, 5]);
  context.beginPath();
  context.moveTo(xFor(0), yFor(value));
  context.lineTo(CANVAS_WIDTH, yFor(value));
  context.stroke();
  context.setLineDash([]);
  context.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
  context.fillStyle = color;
  context.fillText(label, 8, yFor(value) - 5);
  context.restore();
}

function drawMarker(context: CanvasRenderingContext2D, x: number, color: string, width: number, top: number, bottom: number): void {
  if (x < 0 || x > CANVAS_WIDTH) return;
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(x, top);
  context.lineTo(x, bottom);
  context.stroke();
  context.restore();
}

function formatAxis(timeMs: number): string {
  return `${(Math.max(0, timeMs) / 1000).toFixed(1)}s`;
}

function LegendDot({ color, label }: { color: string; label: string }): React.ReactElement {
  return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  nativeFallback: { minHeight: 180, borderRadius: 16, backgroundColor: '#0B1120', alignItems: 'center', justifyContent: 'center', padding: 20 },
  nativeFallbackText: { color: '#D8E0EE', fontSize: 13 },
  controls: { flexDirection: 'row', gap: 8, marginTop: 9 },
  controlButton: { minHeight: 38, borderRadius: 12, backgroundColor: '#F2F4F7', paddingHorizontal: 12, justifyContent: 'center' },
  controlText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  legendText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
});
