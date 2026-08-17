import { BlinkStateMachine } from './blinkStateMachine';
import { classifyBlink } from './classifier';
import {
  BlinkDetectionConfig,
  BlinkEvent,
  BlinkState,
  BlinkClassificationResult,
  CalibrationProfile,
  EyeFrameResult,
  SignalSample,
} from './types';

export interface BlinkAnalysisFrame {
  result: EyeFrameResult;
  state: BlinkState;
  event: BlinkEvent | null;
  classification: BlinkClassificationResult | null;
  signalSample: SignalSample;
}

/**
 * The shared eye-signal-to-event pipeline. Live camera monitoring, browser
 * video analysis, and offline signal fixtures all pass through this class.
 */
export class BlinkAnalysisPipeline {
  private readonly machine: BlinkStateMachine;
  private config: BlinkDetectionConfig;
  private calibration: CalibrationProfile | null;

  constructor(config: BlinkDetectionConfig, calibration: CalibrationProfile | null = null) {
    this.config = { ...config };
    this.calibration = calibration;
    this.machine = new BlinkStateMachine(this.config);
  }

  setConfig(config: BlinkDetectionConfig): void {
    this.config = { ...config };
    this.machine.setConfig(this.config);
  }

  setCalibration(calibration: CalibrationProfile | null): void {
    this.calibration = calibration;
  }

  getConfig(): BlinkDetectionConfig {
    return { ...this.config };
  }

  getState(): BlinkState {
    return this.machine.getState();
  }

  reset(): void {
    this.machine.reset();
  }

  process(result: EyeFrameResult): BlinkAnalysisFrame {
    const machineOutput = this.machine.process(result);
    const classification = machineOutput.event
      ? classifyBlink(machineOutput.event, this.calibration, this.config)
      : null;
    const event = machineOutput.event && classification
      ? { ...machineOutput.event, classification: classification.classification }
      : null;
    const signalSample: SignalSample = {
      timestampMs: result.timestampMs,
      left: result.leftEyeScore,
      right: result.rightEyeScore,
      smoothedLeft: machineOutput.leftSmoothed,
      smoothedRight: machineOutput.rightSmoothed,
      faceDetected: result.faceDetected,
      state: machineOutput.state,
      confidence: result.confidence,
      signalSource: result.signalSource,
    };
    return {
      result,
      state: machineOutput.state,
      event,
      classification,
      signalSample,
    };
  }
}
