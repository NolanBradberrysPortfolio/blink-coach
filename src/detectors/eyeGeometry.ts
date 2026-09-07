/** Independent implementation of the published 2D eye-aspect-ratio formula.
 * Distances must be in pixel space: normalized x/y have different scales in a
 * portrait video. No third-party blink-counter source is copied here.
 */
export interface EyePoint { x: number; y: number }

export const GEOMETRY_SIGNAL_CONFIG = {
  closedEar: 0.075,
  openEar: 0.345,
  minimumEyeWidthPixels: 2,
} as const;

export function pixelEyeAspectRatio(
  points: readonly EyePoint[], indices: readonly number[], width: number, height: number,
): number | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || indices.length !== 6) return null;
  const eye = indices.map(index => points[index]);
  if (eye.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  const distance = (a: EyePoint, b: EyePoint) => Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
  const horizontal = distance(eye[0], eye[3]);
  if (horizontal < GEOMETRY_SIGNAL_CONFIG.minimumEyeWidthPixels) return null;
  return (distance(eye[1], eye[5]) + distance(eye[2], eye[4])) / (2 * horizontal);
}

export function geometryOpenness(ear: number): number {
  const { closedEar, openEar } = GEOMETRY_SIGNAL_CONFIG;
  return Math.max(0, Math.min(1, (ear - closedEar) / (openEar - closedEar)));
}
