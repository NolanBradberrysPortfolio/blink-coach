import { CalibrationCollector } from '../calibration';
import { EyeFrameResult } from '../types';

function frame(timestampMs: number, value: number): EyeFrameResult {
  return { timestampMs, faceDetected: true, leftEyeScore: value, rightEyeScore: value, confidence: 0.9 };
}

describe('CalibrationCollector', () => {
  it('does not mistake low-valued open goggles signals for closed samples', () => {
    const collector = new CalibrationCollector();
    collector.start(0);
    for (let timestamp = 0; timestamp <= 3000; timestamp += 100) collector.recordFrame(frame(timestamp, 0.56));
    collector.tick(3000);

    collector.recordFrame(frame(3100, 0.55));
    collector.recordFrame(frame(3200, 0.24));
    expect(collector.snapshot().phase).toBe('natural');
    expect(collector.snapshot().closedSampleCount).toBe(1);
  });
});
