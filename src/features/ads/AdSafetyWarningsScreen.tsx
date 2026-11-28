import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText as Text } from '@/components/app-text';
import { strings } from '@/constants/strings';
import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function AdSafetyWarningsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityLabel={strings.tabs.adSafetyClose}
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'arrow_forward', web: 'arrow_forward' }}
            size={22}
            tintColor={colors.text}
          />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {strings.tabs.adSafetyPageTitle}
        </Text>

      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.guideTitle, { color: colors.text }]}>
          {strings.tabs.adSafetyGuideTitle}
        </Text>
        <WarningSection
          colors={colors}
          items={strings.tabs.adSafetyCommonScams}
          title={strings.tabs.adSafetyCommonScamsTitle}
        />
        <WarningSection
          colors={colors}
          items={strings.tabs.adSafetyWarningSigns}
          title={strings.tabs.adSafetyWarningSignsTitle}
        />
        <View style={[styles.reportCard, { backgroundColor: colors.backgroundElement }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {strings.tabs.adSafetyReportTitle}
          </Text>
          <Text style={[styles.itemText, { color: colors.textSecondary }]}>
            {strings.tabs.adSafetyReportDescription}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function WarningSection({
  colors,
  items,
  title,
}: {
  colors: (typeof Colors)[keyof typeof Colors];
  items: readonly string[];
  title: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      <View style={[styles.itemsCard, { backgroundColor: colors.backgroundElement }]}>
        {items.map((item) => (
          <View key={item} style={styles.item}>
            <SymbolView
              name={{ ios: 'exclamationmark.circle.fill', android: 'error', web: 'error' }}
              size={17}
              tintColor={colors.primary}
              style={{ marginTop: 3 }}
            />
            <Text style={[styles.itemText, { color: colors.textSecondary }]}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start',
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontWeight: '600', textAlign: 'right' },
  backButton: { alignItems: 'center', minHeight: 56, justifyContent: 'flex-start', width: 44, display: 'flex', flexDirection: 'row-reverse', paddingHorizontal: Spacing.two },
  content: { flexGrow: 1, gap: Spacing.four, padding: Spacing.four },
  guideTitle: { fontSize: 14, fontWeight: '600', lineHeight: 30, textAlign: 'right' },
  section: { gap: Spacing.two },
  sectionTitle: { fontSize: 14, fontWeight: '500', lineHeight: 26, textAlign: 'right' },
  itemsCard: { borderRadius: 12, gap: Spacing.three, padding: Spacing.three },
  item: { alignItems: 'flex-start', flexDirection: 'row-reverse', gap: Spacing.two },
  itemText: { flex: 1, fontSize: 13, lineHeight: 24, textAlign: 'right' },
  reportCard: { borderRadius: 12, gap: Spacing.two, padding: Spacing.three },
  pressed: { opacity: 0.7 },
});
