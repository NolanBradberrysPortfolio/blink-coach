import { BlinkEvent, SessionSummary } from './types';

export function rollingBlinksPerMinute(blinkTimestampsMs: number[], nowMs: number): number {
  const windowStart = nowMs - 60000;
  return blinkTimestampsMs.filter((timestamp) => timestamp >= windowStart && timestamp <= nowMs).length;
}

export function longestNoBlinkInterval(
  sessionStartMs: number,
  sessionEndMs: number,
  blinkTimestampsMs: number[],
): number {
  if (sessionEndMs <= sessionStartMs) return 0;
  const inSession = blinkTimestampsMs
    .filter((timestamp) => timestamp >= sessionStartMs && timestamp <= sessionEndMs)
    .sort((a, b) => a - b);
  let longest = inSession.length > 0 ? inSession[0] - sessionStartMs : sessionEndMs - sessionStartMs;
  for (let index = 1; index < inSession.length; index += 1) {
    longest = Math.max(longest, inSession[index] - inSession[index - 1]);
  }
  if (inSession.length > 0) longest = Math.max(longest, sessionEndMs - inSession[inSession.length - 1]);
  return Math.max(0, longest);
}

export function averageBlinkRate(blinkTimestampsMs: number[], durationMs: number): number {
  if (durationMs <= 0) return 0;
  return (blinkTimestampsMs.length / durationMs) * 60000;
}

export function createSessionSummary(args: {
  id: string;
  startedAt: string;
  endedAt: string;
  startTimestampMs: number;
  endTimestampMs: number;
  blinkEvents: BlinkEvent[];
  reminderCount: number;
}): SessionSummary {
  const durationMs = Math.max(0, args.endTimestampMs - args.startTimestampMs);
  const complete = args.blinkEvents.filter((event) => event.classification === 'complete').length;
  return {
    id: args.id,
    startedAt: args.startedAt,
    endedAt: args.endedAt,
    durationMs,
    totalBlinks: args.blinkEvents.length,
    averageBlinkRate: averageBlinkRate(
      args.blinkEvents.map((event) => event.endTimestampMs),
      durationMs,
    ),
    longestIntervalMs: longestNoBlinkInterval(
      args.startTimestampMs,
      args.endTimestampMs,
      args.blinkEvents.map((event) => event.endTimestampMs),
    ),
    reminderCount: args.reminderCount,
    completeBlinkPercentage:
      args.blinkEvents.length > 0 ? (complete / args.blinkEvents.length) * 100 : null,
  };
}
