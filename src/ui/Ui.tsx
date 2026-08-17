import React, { PropsWithChildren } from 'react';
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, shadow } from './theme';

export function Page({
  children,
  dark = false,
  scroll = true,
  style,
}: PropsWithChildren<{ dark?: boolean; scroll?: boolean; style?: StyleProp<ViewStyle> }>): React.ReactElement {
  const content = scroll ? (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={styles.flex}>{children}</View>
  );
  return <SafeAreaView style={[styles.safe, dark && styles.darkSafe, style]} edges={['top', 'bottom']}>{content}</SafeAreaView>;
}

export function Header({
  title,
  subtitle,
  onBack,
  dark = false,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  dark?: boolean;
}): React.ReactElement {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={[styles.backText, dark && styles.darkText]}>‹</Text>
        </Pressable>
      ) : null}
      <View style={styles.headerCopy}>
        <Text style={[styles.headerTitle, dark && styles.darkText]}>{title}</Text>
        {subtitle ? <Text style={[styles.headerSubtitle, dark && styles.darkMuted]}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export function Card({ children, style, dark = false }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; dark?: boolean }>): React.ReactElement {
  return <View style={[styles.card, dark && styles.darkCard, style]}>{children}</View>;
}

export function SectionTitle({ children, dark = false }: PropsWithChildren<{ dark?: boolean }>): React.ReactElement {
  return <Text style={[styles.sectionTitle, dark && styles.darkMuted]}>{children}</Text>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  dark = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  dark?: boolean;
}): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.primaryButton, dark && styles.darkPrimaryButton, pressed && styles.pressed, disabled && styles.disabled]}
      accessibilityRole="button"
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled = false,
  dark = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  dark?: boolean;
}): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.secondaryButton, dark && styles.darkSecondaryButton, pressed && styles.pressed, disabled && styles.disabled]}
      accessibilityRole="button"
    >
      <Text style={[styles.secondaryButtonText, dark && styles.darkText]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }): React.ReactElement {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.selectedChip]} accessibilityRole="button" accessibilityState={{ selected }}>
      <Text style={[styles.chipText, selected && styles.selectedChipText]}>{label}</Text>
    </Pressable>
  );
}

export function ToggleRow({
  title,
  description,
  value,
  onValueChange,
  dark = false,
}: {
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  dark?: boolean;
}): React.ReactElement {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text style={[styles.rowTitle, dark && styles.darkText]}>{title}</Text>
        {description ? <Text style={[styles.rowDescription, dark && styles.darkMuted]}>{description}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#D0D5DD', true: colors.tealBright }} thumbColor={value ? colors.teal : '#F9FAFB'} />
    </View>
  );
}

export function LabeledValue({ label, value, dark = false }: { label: string; value: string; dark?: boolean }): React.ReactElement {
  return (
    <View style={styles.labeledValue}>
      <Text style={[styles.labeledLabel, dark && styles.darkMuted]}>{label}</Text>
      <Text style={[styles.labeledValueText, dark && styles.darkText]}>{value}</Text>
    </View>
  );
}

export function NumberField({
  value,
  onChangeText,
  suffix,
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (value: string) => void;
  suffix?: string;
  accessibilityLabel: string;
}): React.ReactElement {
  return (
    <View style={styles.numberFieldWrap}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        style={styles.numberField}
        accessibilityLabel={accessibilityLabel}
        selectTextOnFocus
      />
      {suffix ? <Text style={styles.fieldSuffix}>{suffix}</Text> : null}
    </View>
  );
}

export function StatusDot({ color = colors.teal }: { color?: string }): React.ReactElement {
  return <View style={[styles.statusDot, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  darkSafe: { backgroundColor: '#070B14' },
  flex: { flex: 1 },
  scrollContent: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 38 },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 70, paddingTop: 6, paddingBottom: 12 },
  backButton: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, marginRight: 10, ...shadow },
  backText: { color: colors.ink, fontSize: 38, fontWeight: '300', lineHeight: 38, marginTop: -4 },
  headerCopy: { flex: 1 },
  headerTitle: { color: colors.ink, fontSize: 28, lineHeight: 33, fontWeight: '800', letterSpacing: -0.4 },
  headerSubtitle: { color: colors.muted, fontSize: 13, marginTop: 3 },
  card: { backgroundColor: colors.card, borderRadius: 24, padding: 18, marginBottom: 14, ...shadow },
  darkCard: { backgroundColor: '#10182A', shadowOpacity: 0 },
  sectionTitle: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 14, marginBottom: 9 },
  primaryButton: { minHeight: 54, borderRadius: 17, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  darkPrimaryButton: { backgroundColor: colors.teal },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  secondaryButton: { minHeight: 50, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  darkSecondaryButton: { backgroundColor: '#10182A', borderColor: '#283652' },
  secondaryButtonText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
  chip: { minHeight: 42, borderRadius: 14, backgroundColor: '#F2F4F7', paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', marginRight: 8, marginBottom: 8 },
  selectedChip: { backgroundColor: colors.navy },
  chipText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  selectedChipText: { color: '#FFFFFF' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', minHeight: 62, borderBottomWidth: 1, borderBottomColor: colors.line },
  toggleCopy: { flex: 1, paddingRight: 12 },
  rowTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  rowDescription: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  labeledValue: { flex: 1, minWidth: 0 },
  labeledLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  labeledValueText: { color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 4 },
  numberFieldWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.card, minHeight: 48, paddingHorizontal: 11 },
  numberField: { minWidth: 55, flex: 1, color: colors.ink, fontSize: 16, fontWeight: '700', paddingVertical: 8 },
  fieldSuffix: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  statusDot: { width: 9, height: 9, borderRadius: 5, marginRight: 8 },
  darkText: { color: colors.darkText },
  darkMuted: { color: '#98A9C4' },
});
