export const DIAGNOSTIC_CONSENT_VERSION = 'diagnostic-v1';
export const DIAGNOSTIC_MAX_BYTES = 20 * 1024 * 1024;
export const DIAGNOSTIC_CHUNK_BYTES = 1024 * 1024;
export const DIAGNOSTIC_ENDPOINT = 'https://blink-coach-diagnostics.buck-bradberry.chatgpt.site/api/reports';
export interface DiagnosticReceipt { id: string; token: string; expires?: number; status: 'pending' | 'ready'; }
export function validateDiagnosticSubmission(bytes: number, durationMs: number, count: number, consent: boolean): string | null {
  if (!consent) return 'Please read and accept the sharing consent.';
  if (!Number.isInteger(count) || count < 0 || count > 30) return 'Confirm the actual number of blinks (0–30).';
  if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 35000) return 'Record between 1 and 35 seconds.';
  if (!Number.isInteger(bytes) || bytes < 16 || bytes > DIAGNOSTIC_MAX_BYTES) return 'The recording must be smaller than 20 MB. Please record a shorter clip.';
  return null;
}
export function preferredRecordingMime(isSupported: (mime: string) => boolean): string | undefined {
  return ['video/mp4', 'video/webm;codecs=vp8', 'video/webm'].find(isSupported);
}
