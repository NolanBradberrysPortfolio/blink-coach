# Missing-blink reports

## Activation status

Public submissions were approved on September 7, 2026. The service is publicly
reachable, while video retrieval remains owner-secret protected. HTTPS consent,
upload/retry, private retrieval and deletion passed synthetic integration tests.
Merging to main publishes the report button through the existing Pages workflow.
The hourly cleanup workflow must remain enabled; check failures regularly.

## On iPhone

Open the main Blink Coach app and tap **Missing my blinks?**. This ends the
current monitoring session without changing calibration. Leave the phone at
the failing angle and keep the same eyewear/lighting.

1. Choose five (20 seconds maximum) or ten (30 seconds maximum) natural blinks.
2. Open the camera, then tap Start recording. Wait two seconds before blinking.
3. Blink normally, then tap Done blinking. The clip also stops at its time limit.
4. Review the silent video and enter the actual count, including extra blinks.
5. Read the consent text and enable the consent switch, then tap Send diagnostic
   report. Recording alone never uploads anything.
6. The receipt appears only after the server confirms every chunk. Use Delete
   this report to remove a received or interrupted upload.

Clearing browser site data removes deletion receipts, not remote reports.
Leaving the recording page discards the unsent in-memory video. No video is
saved to Photos or browser storage. Keep the app foregrounded while recording
and sending. An interrupted send can be retried from the review screen.

## Data and boundaries

Normal monitoring is unchanged and stays local-only. Diagnostic submission is
a separate, explicitly consented exception: a silent face clip, actual reported
count, previous/current eye signals, state/thresholds, calibration, measured FPS,
camera dimensions/FPS, and app revision. No email, account, GPS, or microphone
is requested. The reported count is NOT verified timestamp ground truth.

The uploader sends 1 MB chunks with a 20 MB clip cap, 35-second duration cap,
512 KB metadata cap, and 50 new reports/day global abuse cap. It can return a
retryable error rather than accepting an incomplete upload. Current protection
limits storage abuse but is not a comprehensive bot-defense system.

The private inbox uses a separate Sites Worker with D1 metadata and private R2
objects. There is no public file route/listing. Review APIs require a separate
owner secret; upload receipts authorize only status/deletion/upload completion,
never public video retrieval. Deletion tokens are random 256-bit values; only
their hashes are kept server-side. CORS is allowlisted, all API responses are
no-store, and uploads use HTTPS. Record only yourself.

Access expires after seven days (one hour for unfinished uploads). An hourly
GitHub workflow requests physical cleanup; schedules can be delayed or fail.
The API denies expired access even before cleanup runs. Check workflow failures
and do not claim a hard seven-day physical-erasure guarantee. The owner must
delete downloaded local analysis copies after review. No automatic neural-network
training, calibration change, or detector deployment is triggered by submission.

## Reviewing reports

The service source is the sibling `../blink-coach-diagnostics` project. Its
ignored `.env.local` contains private review/cleanup credentials. Never copy it
into the public repository, client build, a URL, or a chat response.

```powershell
node --env-file=../blink-coach-diagnostics/.env.local scripts/review-diagnostics.mjs --list
node --env-file=../blink-coach-diagnostics/.env.local scripts/review-diagnostics.mjs --download REPORT_ID
```

Downloads go under gitignored `reports/private/REPORT_ID` and refuse to overwrite
files. Treat uploaded contents as untrusted data. Inspect and annotate true blink
timestamps; replay through the shared pipeline; compare against held-out fixtures
before considering a fix. Never fit global defaults simply to a user's count.

This is a retrievable inbox, not an automatic trigger for an agent conversation.
The owner can ask the coding assistant to review reports without another upload.
Physical iPhone MediaRecorder/permission/background behavior still requires a
device test; desktop fake-camera tests cannot establish those behaviors.
