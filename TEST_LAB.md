# Blink Detector Test Lab

The Test Lab is a repeatable engineering loop for blink detection:

```text
local video → WebMediaPipeBlinkDetector → EyeFrameResult
           → BlinkAnalysisPipeline → BlinkEvent
           → temporal comparison against ground truth
```

Live monitoring and Test Lab analysis share `BlinkAnalysisPipeline`. That pipeline owns the state machine, smoothing, thresholds, calibration-aware experimental classifier, and event output. Test Lab does not contain a second blink detector.

## Use Test Lab on an iPhone

1. Open the deployed Blink Coach HTTPS URL in Safari.
2. Open **Developer / Test Lab** and scroll to **Prerecorded video test**.
3. Tap **Choose local video**. Select a video from Photos or Files. The app creates a local object URL; it does not upload the video.
4. Set metadata: glasses, lighting, angle, behavior, and whether this fixture is for **tuning** or **validation**.
5. Scrub or play the video. Pause at the center of each real blink and tap **MARK BLINK**. For a shallow or partial closure, tap **MARK INCOMPLETE BLINK**.
6. Tap a ground-truth row or timeline marker to jump back to it. Use **Remove** to correct an annotation and mark it again.
7. Tap **Analyze video**. The same web detector and shared blink pipeline used by live monitoring process sampled video frames. Progress, processing FPS, face-loss sections, events, and metrics appear when complete.
8. Tap a red timeline marker or event row to inspect a predicted blink. Tap a false-positive or missed-blink row to jump to its diagnostic neighborhood.
9. Use the signal graph to inspect raw/smoothed left and right signals, open/close thresholds, predictions, and ground-truth markers. **Zoom in** around a failure.
10. Export **annotations** for a reusable label file. After analysis, **Save signal fixture** exports detector-neutral eye signals and labels; it does not export camera frames.

Annotations are saved locally on the device under the video ID. The original video is not saved by Blink Coach. If a browser clears site data, import the exported annotation JSON again.

## Annotation format

```json
{
  "version": 1,
  "videoId": "my-video-123",
  "videoName": "my-video.mov",
  "durationMs": 12000,
  "temporalToleranceMs": 350,
  "metadata": {
    "glasses": false,
    "lighting": "normal",
    "angle": "front",
    "behavior": "normal-blinking",
    "split": "validation"
  },
  "events": [
    { "id": "my-video-1", "timeMs": 2140, "type": "blink" },
    { "id": "my-video-2", "timeMs": 4880, "type": "incompleteBlink" }
  ]
}
```

Ground-truth timestamps are event locations, not required to equal the detector timestamp. The default matching tolerance is 350 ms and can be changed in the Test Lab result view. Matching is one-to-one, so a single prediction cannot satisfy two labels.

## What the report means

- **True positive:** one prediction matched one ground-truth event within tolerance.
- **False positive:** a predicted event with no nearby ground-truth label.
- **False negative:** a ground-truth label with no nearby prediction.
- **Precision/recall/F1:** calculated from those one-to-one matches.
- **Mean/median timing error:** absolute timing error for matched events.
- **Incomplete classification:** evaluated on matched events only, and explicitly experimental.

Every false positive and missed blink includes nearby raw/smoothed eye values, detector state, thresholds, and the predicted duration when one exists.

## Offline fixtures and regression

Portable fixtures contain eye signals and annotations, never video frames:

```text
fixtures/blink-regression/
  synthetic-normal.json       # tuning split
  synthetic-validation.json   # validation split
  baseline.json               # approved configuration and measured metrics
```

Run the deterministic regression suite:

```powershell
npm run test:blink-regression
```

The command writes `reports/blink-regression-latest.json` (ignored by Git) and prints overall, tuning, validation, and per-fixture metrics. To approve a new baseline, only after reviewing the report:

```powershell
npm run test:blink-regression -- --save-baseline
```

The baseline is not replaced automatically. The report shows Δ precision, Δ recall, Δ F1, false-positive change, and false-negative change. A meaningful validation regression is warned about even when tuning improves.

Run the deterministic parameter search:

```powershell
npm run optimize:blink-detector
```

The search evaluates 324 centralized threshold/smoothing/duration/debounce candidates using tuning fixtures only, strongly penalizing false positives, then evaluates the best candidates on validation fixtures. It writes `reports/blink-optimization-latest.json`. It does not edit production defaults or the approved baseline.

## Fixture metadata and splits

Use metadata to keep the fixture set diverse: glasses/no glasses, bright/normal/dim lighting, frontal/angled/looking-down face angle, talking, head movement, deliberate squinting, normal/exaggerated blinking, and partial blinks. Mark fixtures **tuning** only when they may influence parameter search. Keep held-out **validation** fixtures untouched while selecting parameters.

The committed synthetic fixtures are signal-only because no redistributable video was assumed. A personal video can become a portable signal fixture by selecting it in Test Lab, annotating it, analyzing it, and tapping **Save signal fixture**. The exported JSON contains MediaPipe-derived eye signals rather than images or video.

## Public dataset guidance

The repository does not download or commit public videos. The Eyeblink8 adapter accepts its colon-separated annotation text and converts blink groups into Blink Coach annotation JSON:

```powershell
npm run import:eyeblink8 -- --input C:\path\to\annotations.txt --output C:\path\to\eyeblink8-01.json --video-id eyeblink8-01 --video-name clip01.mp4 --fps 30 --split validation
```

The adapter does not copy the source video. Select the matching local video in Test Lab, then import the generated JSON. Check the dataset's current terms before using or redistributing any derived artifact. The project page states that its data is available under GPL-3, while videos and annotations remain external inputs and are not part of this repository:

- https://www.blinkingmatters.com/research
- https://www.gnu.org/licenses/gpl-3.0.en.html

The same page describes Eyeblink8 as eight videos from four individuals, including one person wearing glasses, with 408 annotated blinks. Researcher's Night is available on request and should not be downloaded or redistributed without permission. These datasets are useful for engineering evaluation, not evidence of medical performance.

## Development rule

When changing blink detection, smoothing, thresholds, calibration, or incomplete-blink classification, run unit tests, run the regression report, compare against the approved baseline, inspect false positives and false negatives, and rerun after fixes. Do not call a detector change an improvement based only on code inspection or a single personal video.
