import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { BlinkCoachProvider } from '../src/hooks/useBlinkCoach';
import { AppErrorBoundary } from '../src/ui/AppErrorBoundary';

export default function RootLayout(): React.ReactElement {
  return (
    <AppErrorBoundary>
      <BlinkCoachProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
      </BlinkCoachProvider>
    </AppErrorBoundary>
  );
}
