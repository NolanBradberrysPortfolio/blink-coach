import { geometryOpenness, pixelEyeAspectRatio } from '../../detectors/eyeGeometry';

const pixels = [[0, 10], [5, 7], [15, 7], [20, 10], [15, 13], [5, 13]];
const indices = [0, 1, 2, 3, 4, 5];
describe('pixel-space eye geometry', () => {
  it.each([[100, 100], [720, 1280], [1280, 720]])('preserves EAR in a %s x %s video', (width, height) => {
    const normalized = pixels.map(([x, y]) => ({ x: x / width, y: y / height }));
    expect(pixelEyeAspectRatio(normalized, indices, width, height)).toBeCloseTo(0.3, 8);
  });
  it('rejects missing, nonfinite or degenerate eye points', () => {
    expect(pixelEyeAspectRatio([], indices, 720, 1280)).toBeNull();
    expect(pixelEyeAspectRatio(indices.map(() => ({ x: 0, y: 0 })), indices, 720, 1280)).toBeNull();
    expect(pixelEyeAspectRatio(indices.map(() => ({ x: NaN, y: 0 })), indices, 720, 1280)).toBeNull();
  });
  it('uses a bounded openness scale with the close gate near EAR 0.2', () => {
    expect(geometryOpenness(0.075)).toBe(0);
    expect(geometryOpenness(0.345)).toBe(1);
    expect(geometryOpenness(0.1992)).toBeCloseTo(0.46, 6);
    expect(geometryOpenness(0)).toBe(0);
    expect(geometryOpenness(0.8)).toBe(1);
  });
});
