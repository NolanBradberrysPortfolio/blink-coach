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
3. The web detector loads the `@mediapipe/tasks-vision` browser bundle and creates `FaceLandmarker` in `VIDEO` mode with `outputFaceBlendshapes: true`.
4. Pixel-space 2D Eye Aspect Ratio supplies eye openness. Width/height correction prevents portrait video from distorting geometric distances. Optional detector-neutral `closureEvidence` supplies independent confirmation from the maximum left/right blink blendshape coefficient during a candidate event. Geometry controls timing; weak confirmation rejects a candidate. A missing coefficient allows geometry-only fallback. The legacy `hybrid` extraction option exists for reproducible historical comparisons, not as a separate event counter.
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

Closure timing begins at the first qualifying closed sample, before the
confirmation frame. CLOSING can transition directly to OPENING if reopening
occurs after the minimum duration; requiring a separate sampled CLOSED state
would discard fast blinks. FrameGate throttles inference by deadlines and
media timestamps so minor scheduling jitter does not halve the intended rate.

The state machine smooths each eye independently, normally combines both eyes with an asymmetry guard, and also accepts a sustained single-eye closure when the other eye remains open. Both paths require the same clean sequence:

```text
OPEN → CLOSING → CLOSED → OPENING → OPEN
```

Face loss resets the state by default. Minimum/maximum closure duration, close/open frame counts, smoothing, eye-combination rule, single-eye open ratio, confidence minimum, missing-frame tolerance, incomplete closure threshold, and debounce are centralized configuration values. Events carry closure depth, duration, and symmetry so the experimental classifier can be replaced without changing session logic.

The state machine also has a conservative low-signal baseline mode. During the
first part of a session it records a rolling upper quantile for each eye. After
1.8 seconds of settling, if the
observed open-eye signal is materially below the global threshold (as can
happen with tinted goggles), it derives active thresholds from that local
baseline. Each eye is normalized against its own baseline so a naturally
narrower eye is not mistaken for a sustained wink. Thresholds stay fixed during
a candidate blink. Normal higher-valued signals continue using the global or saved
calibration thresholds. The active thresholds are included in diagnostic
samples so the Developer overlay and Test Lab graph show what was actually
used. This is signal normalization, not training a person-specific model.

Calibration is versioned by eye-signal scale (`pixel-ear-v1`). Legacy profiles
remain stored under their old key but are not applied to new geometric signals.
Legacy manual thresholds are disabled once; unrelated preferences/history are
preserved. Recalibration is optional, and no user's video is embedded in global
defaults. Detecting a face does not guarantee usable eyelid landmarks, especially
through goggles. Home and diagnostics explicitly show when open eyes have not
yet armed detection.

## Test Lab data boundary

The browser Test Lab uses `URL.createObjectURL(file)` for a selected local video. It never uploads or persists video bytes. Local annotations are stored through AsyncStorage by a stable video ID. An exported signal fixture contains detector-neutral eye scores and labels, not camera frames. `testComparison.ts` performs one-to-one temporal matching and includes diagnostic nearby samples for false positives and missed events.

## Future native iOS path

Add an Expo native module or platform file containing `IOSNativeBlinkDetector`. It should convert Apple Vision and/or ARKit face/eye output into the same `EyeFrameResult`. Register that implementation in `createBlinkDetector()` for `Platform.OS === 'ios'`.

The following should remain unchanged: React Native screens, settings, AsyncStorage model, calibration profile format, blink state machine, reminder arming/cooldown, rolling statistics, session summaries, and UI metrics. Only camera acquisition and eye-signal extraction should be platform-specific.

## Privacy boundary

Normal monitoring remains local-only. `/report` is an explicit opt-in exception:
the user starts a silent MediaRecorder clip, reviews it, confirms a count, and
consents before `src/diagnostics/upload.ts` sends it to the separate private
diagnostics service. The report uses `createBlinkDetector`, `FrameGate`, and
`BlinkAnalysisPipeline`, not another blink algorithm. Ordinary session state,
settings/history, reminder rules, and the detector defaults are unchanged.
See `DIAGNOSTIC_REPORTS.md` for the server boundary, deletion and review policy.

During ordinary monitoring, the only vision network requests are browser code/WASM/model downloads; camera frames stay on the device. Session summaries, settings, and calibration are stored locally through AsyncStorage. There are no accounts, analytics, ads, or cloud synchronization. The optional diagnostic service described above is the sole video-upload exception.
