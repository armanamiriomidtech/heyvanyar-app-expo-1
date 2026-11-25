import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText as Text } from '@/components/app-text';
import { strings } from '@/constants/strings';
import { Colors, Spacing } from '@/constants/theme';
import { AdCard } from '@/features/ads/AdCard';
import { getBookmarkedAds, type Ad } from '@/features/ads/api';
import { getAuthErrorMessage } from '@/features/auth/api';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '@/store/authStore';

const page = 1;
const limit = 10;

export default function BookmarksScreen() {
  const authStatus = useAuthStore((state) => state.status);
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const bookmarksQuery = useQuery({
    queryKey: ['ad-bookmarks', page, limit],
    queryFn: () => getBookmarkedAds(page, limit),
    enabled: authStatus === 'authenticated',
    retry: false,
  });

  const renderAd = ({ item }: { item: Ad }) => (
    <AdCard
      ad={item}
      colors={colors}
      onPress={() =>
        router.push({ pathname: '/ad/[shortLink]', params: { shortLink: item.shortLink } })
      }
    />
  );

  const renderMessage = () => {
    if (authStatus === 'loading') {
      return (
        <View style={styles.message}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      );
    }

    if (authStatus !== 'authenticated') {
      return (
        <View style={styles.message}>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {strings.tabs.adBookmarksLoginRequired}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/(auth)/login', params: { returnTo: 'bookmarks' } })}
            style={({ pressed }) => pressed && styles.pressed}>
            <Text style={[styles.actionText, { color: colors.primary }]}>
              {strings.tabs.adBookmarksLoginAction}
            </Text>
          </Pressable>
        </View>
      );
    }

    if (bookmarksQuery.isPending) {
      return (
        <View style={styles.message}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      );
    }

    if (bookmarksQuery.isError) {
      return (
        <View style={styles.message}>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {getAuthErrorMessage(bookmarksQuery.error, strings.tabs.adBookmarksLoadingError)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void bookmarksQuery.refetch()}
            style={({ pressed }) => pressed && styles.pressed}>
            <Text style={[styles.actionText, { color: colors.primary }]}>{strings.common.retry}</Text>
          </Pressable>
        </View>
      );
    }

    if (!bookmarksQuery.data?.length) {
      return (
        <View style={styles.message}>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {strings.tabs.adBookmarksEmpty}
          </Text>
        </View>
      );
    }

    return null;
  };

  const isEmpty = authStatus !== 'authenticated' || !bookmarksQuery.data?.length || bookmarksQuery.isError;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{strings.tabs.adBookmarksTitle}</Text>
      </View>
      <FlatList
        contentContainerStyle={[styles.listContent, isEmpty ? styles.emptyList : null]}
        data={bookmarksQuery.data ?? []}
        keyExtractor={(item) => String(item.id)}
        onRefresh={() => void bookmarksQuery.refetch()}
        refreshing={bookmarksQuery.isRefetching}
        renderItem={renderAd}
        ListEmptyComponent={renderMessage}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { minHeight: 52, justifyContent: 'center', paddingHorizontal: Spacing.three },
  title: { fontSize: 17, fontWeight: '600', textAlign: 'right' },
  listContent: { flexGrow: 1, paddingHorizontal: Spacing.three, paddingBottom: Spacing.three },
  emptyList: { justifyContent: 'center' },
  message: { alignItems: 'center', flex: 1, gap: Spacing.three, justifyContent: 'center', padding: Spacing.four },
  description: { fontSize: 14, lineHeight: 26, textAlign: 'center' },
  actionText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
