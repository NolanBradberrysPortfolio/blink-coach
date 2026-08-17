# Blink Coach

Blink Coach is a mobile-first wellness app that helps you notice blinking during screen use. It watches the front-facing camera in the browser, turns local eye-openness signals into blink events, and gives a gentle reminder when the selected interval passes without a valid blink.

This is not a medical device. It does not diagnose, treat, cure, or prevent dry eye disease or any other condition. The complete/incomplete blink percentage is explicitly experimental and not medically validated.

## How to test on an iPhone

1. Open the deployed HTTPS URL in current iPhone Safari. Camera access will not work from a `file://` URL or an ordinary insecure HTTP page.
2. Tap **Start Monitoring**. Safari will ask for camera permission; choose **Allow**. If permission was denied, use iPhone **Settings → Safari → Camera**, allow the site, then return to Safari and tap **Try again**.
3. To install it like an app, tap Safari’s **Share** button, choose **Add to Home Screen**, then open **Blink Coach** from the Home Screen. The PWA uses standalone display mode and portrait layout.
4. Put the iPhone on a stand facing you, keep your eyes inside the small preview, and wait for **Face detected**. Tap **Hide preview** in Settings if the screen is beside your monitor.
5. Tap **Start Monitoring** and let the app run. The home screen shows the actual blink count in the rolling last 60 seconds, time since the last blink, session duration, face status, and reminder state.
6. For diagnostics, open **Developer / Test Lab**, turn on **Developer Mode**, then return Home. The overlay shows MediaPipe inference FPS, raw and smoothed left/right signals, state, thresholds, calibration values, blink duration, and a recent signal graph.
7. To report a missed or false blink, note whether **Face detected** was on, the inference FPS, the blink state at the moment, the raw/smoothed signals, and the current thresholds. A screenshot of Developer Mode is useful. Do not send camera images or video.

Before relying on it for a longer session, test once with the default 5-second reminder, then test calibration: **Calibrate → Begin Calibration → naturally open eyes → five natural blinks → three deliberate complete blinks**.

## How deployment works

The repository contains a GitHub Actions workflow at `.github/workflows/deploy.yml`:

`push or merge to main → install → typecheck → lint → unit tests → Expo web export → GitHub Pages`

This workspace did not contain a GitHub remote or repository credentials, so there is no live URL yet. One owner setup is required:

1. Create an empty GitHub repository, for example `blink-coach`.
2. From this folder, run:

```powershell
git remote add origin https://github.com/YOUR-GITHUB-NAME/blink-coach.git
git branch -M main
git add .
git commit -m "Build Blink Coach MVP"
git push -u origin main
```

3. In GitHub, open **Settings → Pages → Build and deployment**, choose **GitHub Actions**, and wait for the workflow to finish.
4. The URL will be `https://YOUR-GITHUB-NAME.github.io/blink-coach/`.

After that one-time setup, a Codex change committed and pushed to `main` automatically rebuilds and deploys the newest version. The iPhone only needs a refresh, or a close/reopen from the Home Screen.

## Project architecture

The reusable product logic does not know about MediaPipe:

```text
Expo Router UI + session/business logic
        ↓
BlinkDetector interface → EyeFrameResult
        ↓
WebMediaPipeBlinkDetector (MediaPipe Face Landmarker, VIDEO mode)
        ↓ future replacement
IOSNativeBlinkDetector (Apple Vision and/or ARKit)
```

The blink state machine, calibration model, rolling statistics, reminder engine, experimental classifier, local history, and settings are platform-independent. The detector is the only substantial platform-specific boundary.

See `ARCHITECTURE.md` for the detector boundary and future native connection point.

The browser loads the `@mediapipe/tasks-vision` browser bundle, its WASM runtime, and the face-landmarker model when monitoring starts. These are code/model downloads only; camera frames are processed locally in the browser and are never uploaded or saved. There is no backend, account, cloud database, analytics, tracking, or advertising.

## Useful commands

```powershell
npm install
npm run web          # local Expo web development server
npm run typecheck
npm run lint
npm test
npm run build:web   # static output in dist/
```

## Future native iOS path

The current deliverable is the web/PWA version because it can be tested on an iPhone without a Mac. A future Expo native build should add an `IOSNativeBlinkDetector` implementation and return the same `EyeFrameResult` (`faceDetected`, left/right openness, confidence, timestamp). It can use Apple Vision and/or ARKit. The React Native UI, settings, history, calibration model, state machine, reminder rules, statistics, and session management should remain reusable.

## Known limitations and physical-device checks

- No native Apple detector is bundled yet; the supported first version is the HTTPS web/PWA flow in iPhone Safari.
- The first monitoring start needs network access to fetch the MediaPipe browser runtime and model. After loading, inference and all session logic run locally.
- Camera permission, Safari’s background/stand behavior, iPhone rotation, battery impact, and real-world blink accuracy still need physical iPhone testing. Desktop export and deterministic logic tests cannot prove those device behaviors.
- Lighting, glasses, strong head turns, face occlusion, looking away, and unusual expressions can reduce face/eye signal quality. Face loss resets the state machine so a missing face is not counted as a blink.
- The reminder is a wellness cue, not medical advice. Sound can be disabled; future native builds can add haptics at the reminder boundary.
