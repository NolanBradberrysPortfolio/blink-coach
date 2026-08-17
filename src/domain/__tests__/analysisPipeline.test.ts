import { BlinkAnalysisPipeline } from '../analysisPipeline';
import { DEFAULT_BLINK_CONFIG, EyeFrameResult } from '../types';

function frame(timestampMs: number, openness: number): EyeFrameResult {
  return { timestampMs, faceDetected: true, leftEyeScore: openness, rightEyeScore: openness, confidence: 0.9, signalSource: 'blendshape' };
}

describe('BlinkAnalysisPipeline', () => {
  it('returns the same one-shot classified event shape used by live monitoring', () => {
    const pipeline = new BlinkAnalysisPipeline(DEFAULT_BLINK_CONFIG);
    const frames = [
      frame(0, 0.9), frame(66, 0.9), frame(132, 0.9),
      frame(198, 0.1), frame(264, 0.1), frame(330, 0.1), frame(396, 0.1), frame(462, 0.1),
      frame(528, 0.95), frame(594, 0.95), frame(660, 0.95),
    ];
    const outputs = frames.map((item) => pipeline.process(item));
    const events = outputs.filter((output) => output.event !== null);
    expect(events).toHaveLength(1);
    expect(events[0].event?.classification).toBe('complete');
    expect(events[0].signalSample.state).toBe('OPEN');
    expect(events[0].signalSample.smoothedLeft).not.toBeNull();
  });
});
