import { DIAGNOSTIC_MAX_BYTES, preferredRecordingMime, validateDiagnosticSubmission } from '../diagnosticReport';
describe('diagnostic report consent and limits', () => {
  it('requires consent, not just a recorded clip', () => expect(validateDiagnosticSubmission(2000, 10000, 5, false)).toMatch(/consent/));
  it('accepts a valid five-blink report', () => expect(validateDiagnosticSubmission(2000, 10000, 5, true)).toBeNull());
  it.each([-1, 1.5, 31, NaN])('rejects unconfirmed/invalid counts: %s', count => expect(validateDiagnosticSubmission(2000, 10000, count, true)).not.toBeNull());
  it('allows a confirmed zero instead of inventing ground truth', () => expect(validateDiagnosticSubmission(2000, 10000, 0, true)).toBeNull());
  it('rejects oversized and overlong clips', () => { expect(validateDiagnosticSubmission(DIAGNOSTIC_MAX_BYTES + 1, 10000, 5, true)).not.toBeNull(); expect(validateDiagnosticSubmission(2000, 36000, 5, true)).not.toBeNull(); });
  it('prefers supported Safari MP4, otherwise WebM', () => { expect(preferredRecordingMime(() => true)).toBe('video/mp4'); expect(preferredRecordingMime(m => m === 'video/webm')).toBe('video/webm'); expect(preferredRecordingMime(() => false)).toBeUndefined(); });
});
