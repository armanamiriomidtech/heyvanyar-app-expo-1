import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/app-text';
import { strings } from '@/constants/strings';
import { Colors, Spacing } from '@/constants/theme';
import type { Ad } from '@/features/ads/api';

export function AdCard({
  ad,
  colors,
  onPress,
}: {
  ad: Ad;
  colors: (typeof Colors)[keyof typeof Colors];
  onPress: () => void;
}) {
  const price = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(
    Number(ad.price),
  );

  return (
    <Pressable
      accessibilityLabel={`${ad.title}, ${price} ${strings.tabs.priceUnit}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.adCard,
        { backgroundColor: colors.background, borderBottomColor: colors.backgroundElement },
        pressed ? styles.pressed : null,
      ]}>
      {ad.mainImage?.url ? (
        <Image
          accessibilityLabel={ad.title}
          contentFit="cover"
          source={{ uri: ad.mainImage.url }}
          style={styles.image}
        />
      ) : (
        <View
          style={[
            styles.image,
            styles.imagePlaceholder,
            { backgroundColor: colors.backgroundElement },
          ]}>
          <Text style={[styles.imagePlaceholderText, { color: colors.textSecondary }]}>
            {strings.tabs.adImageUnavailable}
          </Text>
        </View>
      )}
      <View style={styles.adDetails}>
        <Text numberOfLines={2} style={[styles.adTitle, { color: colors.text }]}>
          {ad.title}
        </Text>
        {ad.category ? (
          <Text numberOfLines={1} style={[styles.category, { color: colors.textSecondary }]}>
            {ad.category.parent?.title
              ? `${ad.category.parent.title}/${ad.category.title}`
              : ad.category.title}
          </Text>
        ) : null}
        <Text style={[styles.price, { color: colors.textSecondary }]}>
          {price} {strings.tabs.priceUnit}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  adCard: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.three,
    minHeight: 124,
    paddingVertical: Spacing.three,
  },
  image: { borderRadius: 10, height: 100, width: 112 },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center', padding: Spacing.two },
  imagePlaceholderText: { fontSize: 12, textAlign: 'center' },
  adDetails: { alignItems: 'flex-end', flex: 1, gap: Spacing.two },
  category: { fontSize: 10, textAlign: 'right' },
  adTitle: { fontSize: 14, fontWeight: '500', textAlign: 'right' },
  price: { fontSize: 12, fontWeight: '500', textAlign: 'right' },
  pressed: { opacity: 0.7 },
});
