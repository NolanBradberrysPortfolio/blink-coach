import React from 'react';
import { Platform, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Header, Page } from '../src/ui/Ui';
import { DiagnosticReportPanel } from '../src/ui/DiagnosticReportPanel';
export default function ReportScreen(): React.ReactElement {
  const router = useRouter();
  return <Page><Header title="Missing blinks?" subtitle="Help us see what went wrong." onBack={() => router.replace('/')} />
    {Platform.OS === 'web' ? <DiagnosticReportPanel /> : <Text>Diagnostic recording is available in the web app for now.</Text>}
  </Page>;
}
