# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Blink detection development loop

The live camera and prerecorded Test Lab must use the shared `BlinkAnalysisPipeline`. Do not create a second blink detector for tests.

Whenever making a material change to blink detection, eye-signal smoothing, thresholds, calibration, or incomplete-blink classification:

1. Run `npm test -- --coverage=false`.
2. Run `npm run test:blink-regression`.
3. Compare precision, recall, F1, false positives, and false negatives against `fixtures/blink-regression/baseline.json`.
4. Inspect diagnostic false-positive/missed-blink samples and validation-split results.
5. Fix regressions where possible and rerun the checks.

Never claim blink detection improved solely because code changed. Use measured regression results, and never promote a tuning-only improvement that meaningfully harms validation.
