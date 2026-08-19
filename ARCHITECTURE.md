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

`src/domain/analysisPipeline.ts` is the shared eye-signal-to-event layer. It feeds results into `BlinkStateMachine` and the experimental classifier and returns smoothed `SignalSample` values plus one-shot classified events. Live monitoring and prerecorded Test Lab analysis both use it. None of those modules import MediaPipe, DOM camera APIs, or React Native camera components.

## Current web path

1. `CameraPreview` requests `navigator.mediaDevices.getUserMedia` with a preferred user-facing camera.
2. `createBlinkDetector()` selects `WebMediaPipeBlinkDetector` on web.
3. The web detector loads the `@mediapipe/tasks-vision` browser bundle, creates `FaceLandmarker` in `VIDEO` mode with `outputFaceBlendshapes: true`, and prefers `eyeBlinkLeft`/`eyeBlinkRight` openness signals.
4. If those blendshapes are unavailable, it derives a normalized openness signal from the standard eye landmarks using Eye Aspect Ratio.
5. The provider schedules inference at the configured 10/15/20/30 FPS target, measures actual inference FPS, and never stores the video element, frame pixels, or detector output beyond the in-memory signal graph for the current session.

## Shared live/video test path

```text
live HTMLVideoElement ─────┐
                           ↓
                  BlinkDetector
                           ↓
                    EyeFrameResult
                           ↓
                BlinkAnalysisPipeline
          smoothing + state + classification
                           ↓
                     BlinkEvent
                           ↑
local prerecorded HTMLVideoElement ───────┘
```

`BlinkTestRunAccumulator` records the same pipeline output for video runs. The Test Lab only changes frame acquisition and adds local ground-truth comparison; it does not duplicate blink logic. Offline signal fixtures use the same accumulator and pipeline, which makes parameter search and regression tests deterministic.

## Blink logic

The state machine smooths each eye independently, combines both eyes with an asymmetry guard, and requires a clean sequence:

```text
OPEN → CLOSING → CLOSED → OPENING → OPEN
```

Face loss resets the state by default. Minimum/maximum closure duration, close/open frame counts, smoothing, eye-combination rule, confidence minimum, missing-frame tolerance, incomplete closure threshold, and debounce are centralized configuration values. Events carry closure depth, duration, and symmetry so the experimental classifier can be replaced without changing session logic.

The state machine also has a conservative low-signal baseline mode. During the
first part of a session it records a high-water mark for each eye. If the
observed open-eye signal is materially below the global threshold (as can
happen with tinted goggles), it derives active thresholds from that local
baseline. Normal higher-valued signals continue using the global or saved
calibration thresholds. The active thresholds are included in diagnostic
samples so the Developer overlay and Test Lab graph show what was actually
used. This is signal normalization, not training a person-specific model.

## Test Lab data boundary

The browser Test Lab uses `URL.createObjectURL(file)` for a selected local video. It never uploads or persists video bytes. Local annotations are stored through AsyncStorage by a stable video ID. An exported signal fixture contains detector-neutral eye scores and labels, not camera frames. `testComparison.ts` performs one-to-one temporal matching and includes diagnostic nearby samples for false positives and missed events.

## Future native iOS path

Add an Expo native module or platform file containing `IOSNativeBlinkDetector`. It should convert Apple Vision and/or ARKit face/eye output into the same `EyeFrameResult`. Register that implementation in `createBlinkDetector()` for `Platform.OS === 'ios'`.

The following should remain unchanged: React Native screens, settings, AsyncStorage model, calibration profile format, blink state machine, reminder arming/cooldown, rolling statistics, session summaries, and UI metrics. Only camera acquisition and eye-signal extraction should be platform-specific.

## Privacy boundary

The only network requests made for vision are browser code/WASM/model downloads. No endpoint accepts camera frames. Session summaries, settings, and calibration are stored locally through AsyncStorage; there is no account, backend, analytics, ad SDK, or cloud sync.
