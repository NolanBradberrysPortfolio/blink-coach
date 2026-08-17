import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

/** Keeps a browser rendering error actionable instead of showing a blank page. */
export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      error: error instanceof Error ? error : new Error('The app could not display this screen.'),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    if (typeof console !== 'undefined') console.error('Blink Coach rendering error', error, info.componentStack);
  }

  private retry = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.page}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>BLINK COACH</Text>
          <Text style={styles.title}>The app needs to reload</Text>
          <Text style={styles.body}>
            Blink Coach hit a browser display error before it could start the camera. Reload the page and try again.
          </Text>
          <Pressable onPress={this.retry} style={styles.button} accessibilityRole="button">
            <Text style={styles.buttonText}>Reload Blink Coach</Text>
          </Pressable>
          <Text style={styles.detail}>Technical detail: {this.state.error.message}</Text>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F5F7FB',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 24,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  eyebrow: {
    color: '#127B70',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  title: {
    color: '#172033',
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
    marginTop: 10,
  },
  body: {
    color: '#617086',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 20,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#127B70',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  detail: {
    color: '#8B98A9',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 14,
  },
});
