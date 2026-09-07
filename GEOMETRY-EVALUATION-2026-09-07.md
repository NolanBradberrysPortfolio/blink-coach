# Geometric detector integration — September 7, 2026

## Release decision

Promote pixel-space EAR with independent closure confirmation to the shared web
detector. This improves the measured research-video results, including sections
not used to adjust this candidate. It **does not solve goggles detection**.
No custom neural network was trained, upstream code/weights copied into the app,
or personal calibration fitted merely to reach a claimed count of ten.

## Before versus after

Before is the actual state machine/defaults from Git revision `0d07723` with its
legacy hybrid extraction. After uses the current web Tasks detector, geometric
signals, and shared state machine. Inputs have identical 30 FPS timelines; a
one-to-one 350 ms matching tolerance uses blink event centers.

| Set | Before TP / FP / FN | After TP / FP / FN | Before F1 | After F1 |
| --- | --- | --- | --- | --- |
| Development: first 900 frames of recordings 1,2,3,4,8,9,10,11 | 38 / 1 / 11 | 45 / 1 / 4 | 86.36% | 94.74% |
| Validation: frames 900–1799 of recordings 2 and 4 | 10 / 0 / 3 | 13 / 0 / 0 | 86.96% | 100% |

Development precision: 97.44% → 97.83%; recall: 77.55% → 91.84%.
Validation precision: 100% → 100%; recall: 76.92% → 100%.

Development mean absolute timing error: 50.44 → 72.96 ms.
Validation mean absolute timing error: 38.33 → 48.72 ms.
Counts improved; timing did not. Do not present this as uniformly better on
every metric or clip. Recording 9 gained one true blink and one false positive.

Machine-readable per-clip results:
[development](GEOMETRY-PUBLIC-2026-09-07.json),
[validation](GEOMETRY-VALIDATION-2026-09-07.json).

The first eight excerpts were inspected during development, including rejection
of a pure-geometry candidate that added false alarms. They are **not held out**.
The two additional windows were evaluated only after the geometry thresholds,
baseline rules, and confirmation gate were fixed. This is temporal holdout from
the same dataset/participants, not person-independent validation. Those windows
were not used to tune this candidate; earlier upstream comparison scripts may
have used later video frames for their own separate personalization routines.
Do not reuse these windows for optimization and still call them untouched.

## What changed

- Independent 2D EAR mathematics, correcting x/y distances by actual video
  width/height. Portrait and landscape inputs use the same geometric scale.
- 30 FPS target retained; less smoothing and a 50 ms minimum preserve short
  sampled closures. Two closed samples and reopening remain required.
- Two open samples arm detection; each eye must have appeared open before a
  single-eye closure can count. Face loss still resets candidate events.
- Rolling upper-quantile, per-eye baselines after 1.8 seconds; thresholds freeze
  during a candidate. This avoids one narrow resting eye looking like a wink.
- Optional independent closure evidence must reach 0.5 during the event. Web
  supplies the larger blink blendshape coefficient. Evidence is carried through
  diagnostics and exported fixtures; live and replay use the same decision.
- Old calibration scale is isolated under its prior storage key, not applied
  to geometric scores. Legacy manual overrides are disabled once. Clear
  calibration now also clears the persisted active profile.
- Home distinguishes detected face from usable open eyes; diagnostic EAR and
  closure confirmation are visible in the existing responsive layout.

Complete/incomplete classification is still experimental. The dataset labels
used here do not establish its accuracy. Closure depth uses the same adjusted
signal scale throughout a candidate.

## Goggles

The recovered approximately 12-second IMG_0902 recording was processed locally
at 30 FPS, without personal calibration. Old detector: 0 events. New detector:
1 event (6.400–7.033 seconds), versus the owner's reported 10 blinks. All 360
frames contained a detected face. No independently verified timestamp labels
exist for this clip, so **these are counts, not precision/recall**. Goggle
reflections/occlusion and unreliable eyelid landmarks remain a blocking accuracy
limitation for that usage. Do not claim ten blinks were recovered or that a
personal profile has been validated. The original video is not in this repo.

## Verification

- 46 unit tests in 10 suites passed, including geometry aspect-ratio invariance,
  acquisition noise, short/single-eye events, per-eye baselines, confirmation,
  settings migration, and evidence retention.
- TypeScript and lint passed. Expo static web export passed.
- Mobile-sized browser smoke: camera permission/start/stop with a fake camera,
  readable diagnostic label widths, no horizontal overflow or page errors.
- Existing synthetic regression: 4 TP / 0 FP / 0 FN, count metrics unchanged.
  Mean timing error is 150 ms versus 12.5 ms in the originally approved baseline
  (100 ms in the previous revision's run). The baseline was NOT overwritten.
- Real iPhone camera permission, thermal/FPS behavior, rotation, and natural
  live blinks have not been physically verified in this environment.

## Reproduction and data

[EyeBlink8 publisher](https://www.blinkingmatters.com/research) identifies the
dataset as GPLv3. Sources and annotations remain in the adjacent local research
directory, not in the production repository or HTTPS deployment. Obtain data
under the publisher's terms; no automatic public/personal video upload occurs.
This work uses MediaPipe Tasks in desktop Chromium CPU mode. Different iPhone
delegates, dropped frames, eyewear, and people can change results.

Run the normal development checks:

```powershell
npm run typecheck
npm run lint
npm test -- --coverage=false
npm run test:blink-regression
npm run build:web
```

Real-video extraction and comparison (replace paths; `chrome.exe` is a local
Chromium executable, and `labels.json` uses the Test Lab annotation schema):

```powershell
node scripts/extract-video-signals.mjs clip.mp4 old-signals.json 30 chrome.exe hybrid
node scripts/extract-video-signals.mjs clip.mp4 new-signals.json 30 chrome.exe geometry
npx tsx scripts/compare-revision.ts 0d07723 old-signals.json labels.json comparison.json new-signals.json
node scripts/summarize-video-comparisons.mjs summary.json comparison.json
```

`scripts/prepare-research-window.mjs` takes an FFmpeg executable, original
EyeBlink8 AVI, converted labels, output stem, starting frame and frame count.
It uses 30 FPS frame-based timing, strips audio/metadata from the derivative,
refuses to overwrite video, and keeps only fully contained annotation intervals.
Use `900 900` for the validation windows above. The first development excerpt of
recording 3 excludes the blink spanning frames 896–903 because it ends outside
the video. Extraction caches and full diagnostic reports remain locally under
`../blink-coach-research/`; the committed JSON contains only aggregate metrics.
