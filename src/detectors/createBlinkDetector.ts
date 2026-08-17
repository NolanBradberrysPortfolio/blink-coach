import { Platform } from 'react-native';
import { BlinkDetector } from '../domain/types';

export async function createBlinkDetector(): Promise<BlinkDetector> {
  if (Platform.OS === 'web') {
    const module = await import('./WebMediaPipeBlinkDetector');
    return new module.WebMediaPipeBlinkDetector();
  }
  throw new Error(
    'The MVP detector is web-only. A future native build should provide IOSNativeBlinkDetector here.',
  );
}
