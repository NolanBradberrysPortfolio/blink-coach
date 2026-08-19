import type { FaceLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { BlinkDetector, EyeFrameResult } from '../domain/types';

type MediaPipeVisionModule = typeof import('@mediapipe/tasks-vision');
const VISION_BUNDLE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.js';
let visionModulePromise: Promise<MediaPipeVisionModule> | null = null;

const MODEL_ASSET_PATH =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';

const LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380];

export interface WebMediaPipeBlinkDetectorOptions {
  modelAssetPath?: string;
  wasmRoot?: string;
  useGpu?: boolean;
}

/**
 * Browser-only detector. It accepts an HTMLVideoElement at runtime but does
 * not expose MediaPipe types to the session or UI layers.
 */
export class WebMediaPipeBlinkDetector implements BlinkDetector {
  private landmarker: import('@mediapipe/tasks-vision').FaceLandmarker | null = null;
  private options: Required<WebMediaPipeBlinkDetectorOptions>;

  constructor(options: WebMediaPipeBlinkDetectorOptions = {}) {
    this.options = {
      modelAssetPath: options.modelAssetPath ?? MODEL_ASSET_PATH,
      wasmRoot: options.wasmRoot ?? WASM_ROOT,
      useGpu: options.useGpu ?? true,
    };
  }

  async initialize(): Promise<void> {
    const { FaceLandmarker, FilesetResolver } = await loadVisionBundle();
    const vision = await FilesetResolver.forVisionTasks(this.options.wasmRoot);
    const createLandmarker = (delegate: 'GPU' | 'CPU') => FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: this.options.modelAssetPath,
        delegate,
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.55,
      minFacePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    });

    if (this.options.useGpu) {
      try {
        this.landmarker = await createLandmarker('GPU');
        return;
      } catch {
        // Some iPhone Safari/PWA combinations expose the camera but reject
        // MediaPipe's WebGL delegate. CPU inference is slower, but keeps the
        // same detector functional instead of leaving the session at 0 FPS.
      }
    }
    this.landmarker = await createLandmarker('CPU');
  }

  async processFrame(frame: unknown, timestampMs: number): Promise<EyeFrameResult> {
    if (!this.landmarker) throw new Error('MediaPipe has not been initialized.');
    const result = this.landmarker.detectForVideo(frame as HTMLVideoElement, timestampMs);
    return toEyeFrameResult(result, timestampMs);
  }

  async dispose(): Promise<void> {
    this.landmarker?.close();
    this.landmarker = null;
  }
}

function loadVisionBundle(): Promise<MediaPipeVisionModule> {
  if (visionModulePromise) return visionModulePromise;
  visionModulePromise = new Promise<MediaPipeVisionModule>((resolve, reject) => {
    const existing = (globalThis as typeof globalThis & { Vision?: MediaPipeVisionModule }).Vision;
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement('script');
    script.src = VISION_BUNDLE_URL;
    script.async = true;
    script.onload = () => {
      const vision = (globalThis as typeof globalThis & { Vision?: MediaPipeVisionModule }).Vision;
      if (vision) resolve(vision);
      else reject(new Error('The MediaPipe browser bundle loaded without its Vision API.'));
    };
    script.onerror = () => reject(new Error('The MediaPipe browser bundle could not be downloaded. Check the network connection.'));
    document.head.appendChild(script);
  });
  return visionModulePromise;
}

function toEyeFrameResult(result: FaceLandmarkerResult, timestampMs: number): EyeFrameResult {
  const landmarks = result.faceLandmarks[0];
  if (!landmarks) {
    return {
      timestampMs,
      faceDetected: false,
      leftEyeScore: null,
      rightEyeScore: null,
      signalSource: 'none',
    };
  }

  const blendshapeScores = result.faceBlendshapes[0]?.categories ?? [];
  const leftBlink = findBlendshapeScore(blendshapeScores, ['eyeblinkleft', 'eyeblink_l']);
  const rightBlink = findBlendshapeScore(blendshapeScores, ['eyeblinkright', 'eyeblink_r']);

  const leftEar = eyeAspectRatio(landmarks, LEFT_EYE_INDICES);
  const rightEar = eyeAspectRatio(landmarks, RIGHT_EYE_INDICES);
  if (leftBlink !== null && rightBlink !== null) {
    const leftBlendshapeOpenness = 1 - leftBlink;
    const rightBlendshapeOpenness = 1 - rightBlink;
    const hasUsableLandmarks = leftEar !== null && rightEar !== null;
    return {
      timestampMs,
      faceDetected: true,
      leftEyeScore: hasUsableLandmarks
        ? fuseEyeSignals(leftBlendshapeOpenness, earToOpenness(leftEar))
        : leftBlendshapeOpenness,
      rightEyeScore: hasUsableLandmarks
        ? fuseEyeSignals(rightBlendshapeOpenness, earToOpenness(rightEar))
        : rightBlendshapeOpenness,
      confidence: 0.9,
      signalSource: hasUsableLandmarks ? 'blendshape+landmark' : 'blendshape',
    };
  }

  if (leftEar === null || rightEar === null) {
    return {
      timestampMs,
      faceDetected: true,
      leftEyeScore: null,
      rightEyeScore: null,
      confidence: 0.35,
      signalSource: 'none',
    };
  }

  return {
    timestampMs,
    faceDetected: true,
    leftEyeScore: earToOpenness(leftEar),
    rightEyeScore: earToOpenness(rightEar),
    confidence: 0.65,
    signalSource: 'landmark',
  };
}

function findBlendshapeScore(categories: { categoryName: string; score: number }[], names: string[]): number | null {
  const category = categories.find((item) => {
    const normalized = item.categoryName.toLowerCase().replace(/[^a-z0-9_]/g, '');
    return names.some((name) => normalized === name || normalized.includes(name));
  });
  return category && Number.isFinite(category.score) ? Math.max(0, Math.min(1, category.score)) : null;
}

function eyeAspectRatio(landmarks: NormalizedLandmark[], indices: number[]): number | null {
  const points = indices.map((index) => landmarks[index]);
  if (points.some((point) => !point)) return null;
  const [leftCorner, upperOuter, upperInner, rightCorner, lowerInner, lowerOuter] = points as NormalizedLandmark[];
  const horizontal = distance(leftCorner, rightCorner);
  if (horizontal < 0.0001) return null;
  return (distance(upperOuter, lowerOuter) + distance(upperInner, lowerInner)) / (2 * horizontal);
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

function earToOpenness(ear: number): number {
  // Normalized Face Mesh EAR is roughly 0.08 when closed and 0.25 when open,
  // but calibration remains the authoritative source for blink thresholds.
  return Math.max(0, Math.min(1, (ear - 0.075) / 0.17));
}

/**
 * Blendshape coefficients are the primary signal. When the landmark EAR
 * agrees with them, a modest geometric contribution makes the detector less
 * sensitive to eyewear and short eyelid closures. Strong disagreement leaves
 * the learned blendshape signal in charge instead of allowing one unstable
 * landmark frame to create a blink.
 */
function fuseEyeSignals(blendshapeOpenness: number, landmarkOpenness: number): number {
  const difference = Math.abs(blendshapeOpenness - landmarkOpenness);
  const geometricWeight = difference <= 0.38 ? 0.28 : 0;
  return Math.max(
    0,
    Math.min(1, blendshapeOpenness * (1 - geometricWeight) + landmarkOpenness * geometricWeight),
  );
}
