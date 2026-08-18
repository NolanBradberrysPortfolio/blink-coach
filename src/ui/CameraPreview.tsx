import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

interface CameraPreviewProps {
  active: boolean;
  hidden?: boolean;
  retryKey?: number;
  onReady: (video: HTMLVideoElement | null) => void;
  onError: (message: string) => void;
  onStreamLost?: () => void;
}

export function CameraPreview({
  active,
  hidden = false,
  retryKey = 0,
  onReady,
  onError,
  onStreamLost,
}: CameraPreviewProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cleanupVideoListenersRef = useRef<(() => void) | null>(null);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const stopStream = () => {
      cleanupVideoListenersRef.current?.();
      cleanupVideoListenersRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const video = videoRef.current;
      if (video) {
        video.pause();
        video.srcObject = null;
      }
      setVideoReady(false);
      onReady(null);
    };

    if (!active) {
      stopStream();
      return () => {
        cancelled = true;
      };
    }

    if (Platform.OS !== 'web') {
      onError('The web camera flow is ready. Native iOS detector wiring is reserved for the future native build.');
      return () => {
        cancelled = true;
      };
    }

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        onError('This browser does not expose camera access. Open the HTTPS site in current iPhone Safari.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 20, max: 30 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        stream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            if (!cancelled) onStreamLost?.();
          };
        });
        const video = videoRef.current;
        if (!video) {
          onError('The camera view could not be initialized. Please try again.');
          return;
        }

        let readyNotified = false;
        let errorNotified = false;
        const reportError = (message: string) => {
          if (cancelled || errorNotified) return;
          errorNotified = true;
          onError(message);
        };
        const notifyReady = () => {
          if (cancelled || readyNotified || video.readyState < 2) return;
          readyNotified = true;
          setVideoReady(true);
          onReady(video);
        };
        const playAndNotify = () => {
          void video.play().then(notifyReady).catch(() => {
            reportError('Safari paused the camera. Tap Try again and keep Blink Coach in the foreground.');
          });
        };

        // iPhone Safari is not consistent about which media event fires first
        // for a MediaStream. Listen to all usable readiness events and attach
        // them before assigning srcObject so the detector cannot miss startup.
        video.addEventListener('loadedmetadata', playAndNotify);
        video.addEventListener('loadeddata', playAndNotify);
        video.addEventListener('canplay', playAndNotify);
        video.addEventListener('playing', notifyReady);
        video.srcObject = stream;
        playAndNotify();

        const readyTimeout = window.setTimeout(() => {
          if (!cancelled && !readyNotified) {
            reportError('The camera opened but Safari did not provide video frames. Tap Try again and keep Blink Coach in the foreground.');
          }
        }, 8000);

        const cleanupVideoListeners = () => {
          window.clearTimeout(readyTimeout);
          video.removeEventListener('loadedmetadata', playAndNotify);
          video.removeEventListener('loadeddata', playAndNotify);
          video.removeEventListener('canplay', playAndNotify);
          video.removeEventListener('playing', notifyReady);
        };
        // The effect cleanup owns the stream; keep the event cleanup alongside
        // it so a retry cannot leave an old video element notifying the coach.
        cleanupVideoListenersRef.current = cleanupVideoListeners;
      } catch (error) {
        if (!cancelled) onError(cameraErrorMessage(error));
      }
    };

    void start();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && videoRef.current && streamRef.current) {
        void videoRef.current.play().catch(() => onStreamLost?.());
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      stopStream();
    };
  }, [active, onError, onReady, onStreamLost, retryKey]);

  return (
    <View style={[styles.frame, hidden && styles.hiddenFrame]} accessible accessibilityLabel="Camera positioning preview">
      {Platform.OS === 'web' && active ? (
        React.createElement('video', {
          ref: videoRef,
          autoPlay: true,
          muted: true,
          playsInline: true,
          // This is a real DOM element, so it must receive a CSS object.
          // React Native style arrays are valid for <View>, but React DOM
          // throws when an array is passed to an HTML element's style prop.
          style: {
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)',
            backgroundColor: '#121A2D',
            ...(hidden ? { opacity: 0.02 } : {}),
          } as React.CSSProperties,
          'aria-hidden': hidden,
        })
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderIcon}>◉</Text>
          <Text style={styles.placeholderText}>{active ? 'Camera preview' : 'Ready when you are'}</Text>
        </View>
      )}
      {active && !videoReady && !hidden ? (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>Starting camera…</Text>
        </View>
      ) : null}
      {hidden ? (
        <View style={styles.hiddenLabel}>
          <Text style={styles.hiddenLabelText}>Preview hidden · camera still running</Text>
        </View>
      ) : null}
    </View>
  );
}

function cameraErrorMessage(error: unknown): string {
  const name = typeof error === 'object' && error && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera permission was denied. In iPhone Settings → Safari → Camera, allow access for this site, then try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No front-facing camera was found on this device.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The camera is temporarily busy. Close other camera apps, then try again.';
  }
  if (name === 'SecurityError') {
    return 'Camera access was blocked by the browser. Blink Coach must be opened over HTTPS.';
  }
  return 'Safari could not start the camera. Check permission and try again.';
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    height: 214,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#121A2D',
    position: 'relative',
  },
  hiddenFrame: {
    height: 54,
    backgroundColor: '#EAF0F7',
    borderRadius: 16,
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: [{ scaleX: -1 }],
    backgroundColor: '#121A2D',
  },
  hiddenVideo: {
    opacity: 0.02,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  placeholderIcon: {
    color: '#83E3D2',
    fontSize: 28,
  },
  placeholderText: {
    color: '#D8E0EE',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 26, 45, 0.55)',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  hiddenLabel: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenLabelText: {
    color: '#425466',
    fontSize: 12,
    fontWeight: '700',
  },
});
