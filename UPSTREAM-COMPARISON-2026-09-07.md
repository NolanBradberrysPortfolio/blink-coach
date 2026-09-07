# Existing blink-detector comparison — September 7, 2026

## Result

This is the historical comparison against revision `0d07723`, before the
geometric integration. For the subsequent implementation and release decision,
see `GEOMETRY-EVALUATION-2026-09-07.md`. Re-running `compare-upstream.ts` on a newer
checkout uses that checkout's defaults; use `compare-revision.ts 0d07723` with
the original hybrid signals to reproduce the pinned before result.

On the same three 30-second EyeBlink8 excerpts previously used for Blink Coach,
the fixed-EAR and the upstream "3DEAR" script each matched all 14 fully contained
blinks, with no extra events. Current Blink Coach matched 8, with no extra events.
This is a small end-to-end desktop-video comparison, not proof of iPhone accuracy.
The recovered goggles video remains a failure case for the uncalibrated methods.
No production configuration, application code, approved baseline or deployed site
was changed during this comparison.

| Method | True positives | Extra events (FP) | Missed (FN) | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Current Blink Coach defaults | 8 | 0 | 6 | 100% | 57.1% | 72.7% |
| QuangPham fixed EAR, explicitly configured at 0.2 | 14 | 0 | 0 | 100% | 100% | 100% |
| QuangPham "3DEAR", separately calibrated | 14 | 0 | 0 | 100% | 100% | 100% |
| QuangPham adaptive EAR, no filter | 0 | 0 | 14 | N/A | 0% | 0% |
| QuangPham adaptive EAR, filtered | 0 | 0 | 14 | N/A | 0% | 0% |
| Shakir Sadiq simple blink detector | 5 | 48 | 9 | 9.4% | 35.7% | 14.9% |

The JSON calculator convention reports precision as zero when there are no
predictions; the table uses N/A because precision is undefined in that case.

### Per excerpt: TP / FP / FN

| Method | Recording 1: 3 blinks | Recording 3: 6 blinks | Recording 8: 5 blinks |
| --- | --- | --- | --- |
| Current | 3 / 0 / 0 | 4 / 0 / 2 | 1 / 0 / 4 |
| Fixed EAR | 3 / 0 / 0 | 6 / 0 / 0 | 5 / 0 / 0 |
| "3DEAR" | 3 / 0 / 0 | 6 / 0 / 0 | 5 / 0 / 0 |
| Adaptive (each version) | 0 / 0 / 3 | 0 / 0 / 6 | 0 / 0 / 5 |
| Simple | 3 / 15 / 0 | 2 / 23 / 4 | 0 / 10 / 5 |

## Goggles recording

Recovered the earlier IMG_0902.mov upload locally: approximately 12 seconds.
Normalized to 30 FPS, 720 x 1280, H.264, without audio for equal video inputs.
The original was not altered. The user reported 10 blinks; independently verified
timestamp labels are not available. Therefore these are **counts, not accuracy**:

| Method | Detected count | User-reported count |
| --- | ---: | ---: |
| Current defaults, no saved personal calibration | 0 | 10 |
| Fixed EAR 0.2 | 1 | 10 |
| Simple upstream | 0 | 10 |

All three detected a face in all 360 frames. Face loss is not the explanation
for this clip. Current left-eye openness never exceeded 0.536; right-eye maximum
was 0.615. These values differ substantially from the default open threshold
0.62. Further work should inspect open-state arming and personal-baseline behavior,
not just lower the blink-duration minimum. This diagnostic does not establish
that every visible eyelid motion was extracted correctly through the goggles.

The calibration-dependent upstream variants were not scored on this personal
clip: there is no separate labeled same-person goggles calibration recording.
Using its claimed 10 blinks to calibrate and then calling those same blinks a
validation set would be misleading. Earlier IMG_0883 derived signal fixtures
were found, but those do not contain the raw landmarks these alternatives need;
the original corresponding video was not located in the checked locations.

## Method and reproducibility

- Source checkouts remain outside the app at `../blink-coach-research/`.
- [QuangPham repository](https://github.com/QuangPham2404/Blink-Detection-Using-Adaptive-Eye-Aspect-Ratio),
  revision `3fd1191939d8cfce5aeeee19a2373b8cb1a2ce16`.
- [Shakir Sadiq repository](https://github.com/shakirsadiq6/Blink_Detection_Python),
  revision `4609a19476303ad7fb5f8971612f4457001ff851`.
- [EyeBlink8 source](https://www.blinkingmatters.com/research). Video and labels
  remain outside the repository and deployment.
- `scripts/benchmark-upstream.py` executes the inspected upstream source via AST,
  substituting local video for webcam input and annotations for calibration key
  presses. It disables drawing/windows and observes counter increments. It does
  not copy or replace their signal extraction or blink decisions.
- Used isolated Python 3.12, MediaPipe 0.10.21 legacy FaceMesh and OpenCV 4.11.0.
  Their original face-detector settings, resize/flip, integer pixel coordinates,
  filtering and frame-count rules remain in effect. No footage is uploaded.
- Fixed EAR's shipped file initializes its threshold to **zero**, so the benchmark
  explicitly supplies **0.2**, the value described in the repository README.
  This is not a claim that the zero-config file works out of the box.
- Each calibration-dependent method receives five annotated blinks **after** the
  evaluated 900-frame excerpt, from the same full source recording. These are
  excluded from the score. Each blink window includes three extra frames before
  and after; keyboard toggles emulate the script's five-blink calibration flow.
  This is labeled personalization, not an uncalibrated general default. The
  actual upstream calibration formulas are used without threshold optimization.
- Blink Coach uses its cached production web-detector signals and the actual
  shared `BlinkAnalysisPipeline` with defaults from revision `0d07723`.
  Its task model differs from legacy FaceMesh: results compare **whole systems**,
  not a controlled experiment isolating only the decision rule.
- Each public excerpt is exactly 900 frames at 30 FPS. One additional annotated
  event in recording 3 spans frames 896–903 and cannot reopen before the clip ends;
  its midpoint is beyond the last sample. It is excluded, consistently with the
  previous review. The score contains the same 14 blinks, not 15.
- `scripts/compare-upstream.ts` uses Blink Coach's existing one-to-one event
  matching, with a 350 ms tolerance and event centers. Upstream notification
  timestamps are also retained. The simple script's nonconsecutive counter is
  left unchanged; event centers use the latest contiguous closure episode.
- No new threshold search or neural-network training was done for this comparison.
- Supplied SVM weights were not evaluated. Their author describes training on
  EyeBlink8; these excerpts would not establish independent held-out performance.

Research-directory manifests record exact input paths:

```powershell
& '..\blink-coach-research\.venv\Scripts\python.exe' scripts/benchmark-upstream.py '..\blink-coach-research\upstream-jobs.json'
& '..\blink-coach-research\.venv\Scripts\python.exe' scripts/benchmark-upstream.py '..\blink-coach-research\simple-and-goggles-jobs.json'
npx tsx scripts/compare-upstream.ts '..\blink-coach-research'
```

Per-run JSON contains source SHA-256, extracted eye values, thresholds, face
status and predicted event timestamps. `../blink-coach-research/upstream-comparison.json`
contains aggregate metrics, matched events, and missed/extra-event timestamps.
Run manifests and media-dependent reports are local research artifacts, not
production files. To reproduce on another computer, obtain the sources/data and
update manifest paths. Execute only reviewed upstream code.

## Findings that affect adoption

- The simple script accumulates short closure frames across reopenings instead
  of consistently resetting them. Its defaults generated 53 events for 14 blinks.
- Adaptive scripts select a very low calibration minimum; their apparent
  adaptive threshold update is overwritten with the initial threshold each
  frame. Their zero detections here are not proof that adaptive EAR in general
  is ineffective.
- The script named "3DEAR" casts its normalized depth coordinates to integers
  and uses different left/right denominator factors. Its good result is not
  evidence that correctly scaled 3D geometry was responsible.
- Neither checkout displayed a license file in its root. No upstream source or
  weights have been incorporated into Blink Coach; reuse terms need resolution
  before adopting code. An independently implemented published geometric method
  is a separate engineering option.

**Recommended next experiment:** evaluate pixel-aspect-correct geometric EAR
inside Blink Coach's existing web landmark detector, preserving its shared
pipeline, and separately correct/test goggles open-state calibration. Do not
replace production with either repository unchanged. Expand evaluation beyond
these 14 blinks before claiming general accuracy.

Validation of the evaluation changes: TypeScript, lint, 29 unit tests and the
existing 4-blink synthetic regression all passed. Python harness syntax passed.
No physical iPhone performance test was performed and no site deployment was
necessary for this read-only accuracy evaluation.
