# Blink Coach architecture

## Boundary

`src/domain/types.ts` owns the `BlinkDetector` contract and the detector-neutral `EyeFrameResult`:

```ts
interface BlinkDetector {
  initialize(): Promise<void>;
  processFrame(frame: unknown, timestampMs: number): Promise<EyeFrameResult>;
  dispose(): Promise<void>;
}
```

The provider in `src/hooks/useBlinkCoach.tsx` is the only orchestration layer. It feeds results into `BlinkStateMachine`, `CalibrationCollector`, `ReminderEngine`, rolling statistics, and the experimental classifier. None of those modules import MediaPipe, DOM camera APIs, or React Native camera components.

## Current web path

1. `CameraPreview` requests `navigator.mediaDevices.getUserMedia` with a preferred user-facing camera.
2. `createBlinkDetector()` selects `WebMediaPipeBlinkDetector` on web.
3. The web detector loads the `@mediapipe/tasks-vision` browser bundle, creates `FaceLandmarker` in `VIDEO` mode with `outputFaceBlendshapes: true`, and prefers `eyeBlinkLeft`/`eyeBlinkRight` openness signals.
4. If those blendshapes are unavailable, it derives a normalized openness signal from the standard eye landmarks using Eye Aspect Ratio.
5. The provider schedules inference at the configured 10/15/20 FPS target, measures actual inference FPS, and never stores the video element, frame pixels, or detector output beyond the in-memory signal graph for the current session.

## Blink logic

The state machine smooths each eye independently, combines both eyes with an asymmetry guard, and requires a clean sequence:

```text
OPEN → CLOSING → CLOSED → OPENING → OPEN
```

Face loss resets the state. Minimum/maximum closure duration, close/open frame counts, smoothing, asymmetry, and debounce are configuration values. Events carry closure depth, duration, and symmetry so the experimental classifier can be replaced without changing session logic.

## Future native iOS path

Add an Expo native module or platform file containing `IOSNativeBlinkDetector`. It should convert Apple Vision and/or ARKit face/eye output into the same `EyeFrameResult`. Register that implementation in `createBlinkDetector()` for `Platform.OS === 'ios'`.

The following should remain unchanged: React Native screens, settings, AsyncStorage model, calibration profile format, blink state machine, reminder arming/cooldown, rolling statistics, session summaries, and UI metrics. Only camera acquisition and eye-signal extraction should be platform-specific.

## Privacy boundary

The only network requests made for vision are browser code/WASM/model downloads. No endpoint accepts camera frames. Session summaries, settings, and calibration are stored locally through AsyncStorage; there is no account, backend, analytics, ad SDK, or cloud sync.
