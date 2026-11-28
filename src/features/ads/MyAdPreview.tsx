import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText as Text } from '@/components/app-text';
import { strings } from '@/constants/strings';
import { Colors, Spacing } from '@/constants/theme';
import {
  getAdBookmarkStatus,
  getAdDetails,
  getMyAds,
  toggleAdBookmark,
  type AdDetails,
  type AdMedia,
  type MyAd,
} from '@/features/ads/api';
import { formatPersianRelativeTime } from '@/features/ads/relativeTime';
import { registerAdViewOnce } from '@/features/ads/viewTracking';
import { getAuthErrorMessage } from '@/features/auth/api';
import { LoginRequiredModal } from '@/features/auth/LoginRequiredModal';
import { NeshanMap } from '@/features/location/NeshanMap';
import type { MapCoordinates } from '@/features/location/neshanMapUtils';
import { getCurrentUser } from '@/features/profile/api';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '@/store/authStore';

type MediaSlide = { type: 'video' | 'image'; key: string; uri: string };

export default function MyAdPreviewScreen({
  showDisabledContactActions = false,
}: {
  showDisabledContactActions?: boolean;
}) {
  const { shortLink: rawShortLink } = useLocalSearchParams<{ shortLink: string | string[] }>();
  const shortLink = Array.isArray(rawShortLink) ? rawShortLink[0] : rawShortLink;
  const authStatus = useAuthStore((state) => state.status);
  const queryClient = useQueryClient();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width, height } = useWindowDimensions();
  const mediaHeight = Math.round(height * 0.3);
  const adQuery = useQuery({
    queryKey: ['my-ad', shortLink],
    queryFn: () => getAdDetails(shortLink ?? '', !showDisabledContactActions),
    enabled: Boolean(shortLink),
    retry: false,
  });
  const currentUserQuery = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: getCurrentUser,
    enabled: showDisabledContactActions && authStatus === 'authenticated',
    retry: false,
  });
  const [viewTrackingError, setViewTrackingError] = useState('');
  const [mapError, setMapError] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<MediaSlide | null>(null);
  const [loginPrompt, setLoginPrompt] = useState<'bookmark' | 'report' | null>(null);
  const [bookmarkError, setBookmarkError] = useState('');
  const adId = adQuery.data?.id;
  const bookmarkStatusQuery = useQuery({
    queryKey: ['ad-bookmark-status', adId],
    queryFn: () => {
      if (adId == null) throw new Error(strings.auth.invalidResponse);
      return getAdBookmarkStatus(adId);
    },
    enabled: showDisabledContactActions && authStatus === 'authenticated' && adId != null,
    retry: false,
  });
  const toggleBookmarkMutation = useMutation({
    mutationFn: toggleAdBookmark,
    onError: (error) => {
      setBookmarkError(getAuthErrorMessage(error, strings.tabs.adBookmarkToggleError));
    },
    onSuccess: (isBookmarked, id) => {
      setBookmarkError('');
      queryClient.setQueryData(['ad-bookmark-status', id], isBookmarked);
      void queryClient.invalidateQueries({ queryKey: ['ad-bookmarks'] });
    },
  });

  const openChat = () => {
    if (!shortLink) return;
    if (authStatus === 'authenticated') {
      router.push({
        pathname: '/chat/new/[shortLink]',
        params: { shortLink },
      });
      return;
    }
    router.push({
      pathname: '/(auth)/login',
      params: { returnTo: 'chat', adShortLink: shortLink },
    });
  };

  const openReport = () => {
    if (!shortLink) return;
    if (authStatus === 'authenticated') {
      router.push({
        pathname: '/ad/report/[shortLink]',
        params: { shortLink },
      });
      return;
    }
    setLoginPrompt('report');
  };

  const openLoginForPrompt = () => {
    if (!shortLink) return;
    const prompt = loginPrompt;
    setLoginPrompt(null);
    router.push({
      pathname: '/(auth)/login',
      params: {
        returnTo: prompt === 'bookmark' ? 'ad-bookmark' : 'ad-report',
        adShortLink: shortLink,
      },
    });
  };

  const handleBookmarkPress = () => {
    if (authStatus === 'loading') return;
    if (authStatus !== 'authenticated') {
      setLoginPrompt('bookmark');
      return;
    }
    if (adId == null || toggleBookmarkMutation.isPending) return;
    setBookmarkError('');
    toggleBookmarkMutation.mutate(adId);
  };

  useEffect(() => {
    if (adId == null) return;
    let isMounted = true;
    void registerAdViewOnce(adId).catch((error: unknown) => {
      if (isMounted) {
        setViewTrackingError(
          getAuthErrorMessage(error, strings.tabs.adViewTrackingError),
        );
      }
    });
    return () => {
      isMounted = false;
    };
  }, [adId]);

  const needsMediaLookup =
    !showDisabledContactActions && adQuery.isSuccess && hasMissingMediaUrl(adQuery.data);
  const mediaQuery = useQuery({
    queryKey: ['my-ads', 1],
    queryFn: () => getMyAds(1),
    enabled: Boolean(shortLink) && needsMediaLookup,
    retry: false,
    staleTime: 60_000,
  });

  if (!shortLink) {
    return (
      <ScreenMessage
        colors={colors}
        message={strings.tabs.adDetailsLoadingError}
        onBack={() => router.back()}
        title={strings.tabs.myAdDetailsTitle}
      />
    );
  }

  if (adQuery.isPending) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary }}>{strings.common.loading}</Text>
      </SafeAreaView>
    );
  }

  if (adQuery.isError) {
    return (
      <ScreenMessage
        colors={colors}
        message={getAuthErrorMessage(adQuery.error, strings.tabs.adDetailsLoadingError)}
        onBack={() => router.back()}
        onRetry={() => void adQuery.refetch()}
        title={strings.tabs.myAdDetailsTitle}
      />
    );
  }

  const ad = adQuery.data;
  const isAdOwner =
    ad.creatorId != null &&
    currentUserQuery.data != null &&
    String(ad.creatorId) === String(currentUserQuery.data.id);
  const isContactActionsDisabled =
    isAdOwner ||
    (authStatus === 'authenticated' &&
      (currentUserQuery.isPending || currentUserQuery.isError));
  const listAd = mediaQuery.data?.find((item) => item.shortLink === shortLink);
  const slides = getMediaSlides(ad, listAd);
  const price = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(
    Number(ad.price),
  );
  const relativeTime = formatPersianRelativeTime(ad.publishAt);
  const locationLabel = ad.location
    ? [ad.location.parentLocation?.title, ad.location.title].filter(Boolean).join('/')
    : '';
  const coordinate: MapCoordinates | null =
    typeof ad.latitude === 'number' && typeof ad.longitude === 'number'
      ? { latitude: ad.latitude, longitude: ad.longitude }
      : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={strings.common.back}
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'arrow_forward', web: 'arrow_forward' }}
            size={22}
            tintColor={colors.text}
          />
        </Pressable>
        {showDisabledContactActions ? (
          <Pressable
            accessibilityLabel={strings.tabs.adBookmarkAction}
            accessibilityRole="button"
            accessibilityState={{
              disabled: toggleBookmarkMutation.isPending,
              selected: bookmarkStatusQuery.data === true,
            }}
            disabled={toggleBookmarkMutation.isPending}
            onPress={handleBookmarkPress}
            style={({ pressed }) => [styles.bookmarkButton, pressed ? styles.pressed : null]}>
            {bookmarkStatusQuery.data ? (
              <View style={styles.bookmarkFill}>
                <View style={[styles.bookmarkFillBody, { backgroundColor: colors.primary }]}>
                  <View
                    style={[
                      styles.bookmarkCutout,
                      { borderBottomColor: colors.background },
                    ]}
                  />
                </View>
              </View>
            ) : (
              <SymbolView
                name={{ ios: 'bookmark', android: 'bookmark_border', web: 'bookmark_border' }}
                size={22}
                tintColor={colors.text}
              />
            )}
          </Pressable>
        ) : null}
      </View>
      {showDisabledContactActions && (bookmarkError || bookmarkStatusQuery.isError) ? (
        <Text style={[styles.bookmarkError, { color: colors.error }]}>
          {bookmarkError ||
            getAuthErrorMessage(bookmarkStatusQuery.error, strings.tabs.adBookmarkToggleError)}
        </Text>
      ) : null}
      <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scrollView}>
        <View style={[styles.gallery, { height: mediaHeight }]}>
          {slides.length > 0 ? (
            <FlatList
              data={slides}
              getItemLayout={(_, index) => ({
                length: width,
                offset: width * index,
                index,
              })}
              inverted
              horizontal
              initialNumToRender={2}
              keyExtractor={(item) => item.key}
              pagingEnabled
              renderItem={({ item }) => (
                <Pressable
                  accessibilityLabel={strings.tabs.adMediaViewerOpen}
                  accessibilityRole="button"
                  onPress={() => setSelectedMedia(item)}
                  style={[styles.slide, { height: mediaHeight, width }]}>
                  {item.type === 'video' ? (
                    <AdVideoSlide height={mediaHeight} uri={item.uri} />
                  ) : (
                    <Image
                      accessibilityLabel={ad.title}
                      contentFit="cover"
                      source={{ uri: item.uri }}
                      style={{ height: mediaHeight, width }}
                    />
                  )}
                </Pressable>
              )}
              showsHorizontalScrollIndicator={false}
            />
          ) : needsMediaLookup && mediaQuery.isPending ? (
            <View style={[styles.mediaPlaceholder, { height: mediaHeight }]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : needsMediaLookup ? (
            <View style={[styles.mediaPlaceholder, { height: mediaHeight }]}>
              <Text style={[styles.placeholderText, { color: colors.textSubtle }]}>
                {mediaQuery.isError
                  ? getAuthErrorMessage(mediaQuery.error, strings.tabs.adMediaLoadingError)
                  : strings.tabs.adMediaLoadingError}
              </Text>
            </View>
          ) : (
            <View style={[styles.mediaPlaceholder, { height: mediaHeight }]}>
              <Text style={[styles.placeholderText, { color: colors.textSubtle }]}>
                {strings.tabs.adImageUnavailable}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.details}>
          <Text style={[styles.title, { color: colors.text }]}>{ad.title}</Text>
          {relativeTime ? (
            <Text style={[styles.publishedAt, { color: colors.textSecondary }]}>
              {strings.tabs.adPublishedAt(relativeTime)}
              {locationLabel ? ` در ${locationLabel}` : ''}
            </Text>
          ) : null}
          <Pressable
            accessibilityLabel={strings.tabs.adSafetyLink}
            accessibilityRole="button"
            onPress={() => router.push('/ad/safety')}
            style={({ pressed }) => [
              styles.safetyLink,
              { backgroundColor: colors.backgroundElement },
              pressed ? styles.pressed : null,
            ]}>
            <SymbolView
              name={{
                ios: 'exclamationmark.triangle.fill',
                android: 'warning',
                web: 'warning',
              }}
              size={18}
              tintColor={colors.primary}
            />
            <Text style={[styles.safetyLinkText, { color: colors.text }]}>
              {strings.tabs.adSafetyLink}
            </Text>
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              size={18}
              tintColor={colors.textSecondary}
            />
          </Pressable>
          <View style={[{ borderColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <AdDetailRow
              colors={colors}
              divider
              label={strings.tabs.adPriceDisplayLabel}
              value={`${price} ${strings.tabs.priceUnit}`}
            />
            {ad.category?.parent?.title ? (
              <AdDetailRow
                colors={colors}
                divider
                label={strings.tabs.adTypeDisplayLabel}
                value={ad.category.parent.title}
              />
            ) : null}
            {ad.category?.title ? (
              <AdDetailRow
                colors={colors}
                label={strings.tabs.adBreedDisplayLabel}
                value={ad.category.title}
              />
            ) : null}
          </View>
          <Text style={[styles.descriptionTitle, { color: colors.text }]}>{strings.tabs.adReportDescriptionLabel}</Text>
          <Text style={[styles.description, { color: colors.text }]}>{ad.description}</Text>
          <View style={styles.mapSection}>
            {coordinate ? (
              <>
                <NeshanMap
                  backgroundColor={colors.backgroundElement}
                  coordinate={coordinate}
                  editable={false}
                  errorColor={colors.error}
                  height={220}
                  onError={() => setMapError(strings.tabs.neshanMapLoadError)}
                  textColor={colors.text}
                />
              </>
            ) : (
              <Text style={[styles.mapCoordinates, { color: colors.textSecondary }]}>
                {strings.tabs.adCoordinatesUnavailable}
              </Text>
            )}
            {mapError ? (
              <Text accessibilityRole="alert" style={[styles.mapCoordinates, { color: colors.error }]}>
                {mapError}
              </Text>
            ) : null}
            {showDisabledContactActions ? (
              <Pressable
                accessibilityLabel={strings.tabs.adReportButton}
                accessibilityRole="button"
                onPress={openReport}
                style={({ pressed }) => [
                  styles.reportButton,
                  { borderColor: colors.border },
                  pressed ? styles.pressed : null,
                ]}>
                <SymbolView
                  name={{ ios: 'flag', android: 'report', web: 'report' }}
                  size={18}
                  tintColor={colors.textSecondary}
                />
                <Text style={[styles.reportButtonText, { color: colors.text }]}>
                  {strings.tabs.adReportButton}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {viewTrackingError ? (
            <Text accessibilityRole="alert" style={[styles.viewTrackingError, { color: colors.error }]}>
              {viewTrackingError}
            </Text>
          ) : null}
        </View>
      </ScrollView>
      {showDisabledContactActions &&
        authStatus === 'authenticated' &&
        currentUserQuery.isError ? (
        <Text style={[styles.contactIdentityError, { color: colors.error }]}>
          {getAuthErrorMessage(currentUserQuery.error, strings.tabs.profileLoadingError)}
        </Text>
      ) : null}
      {showDisabledContactActions ? (
        <View style={[styles.contactActions, { backgroundColor: colors.background }]}>
          <Pressable
            accessibilityLabel={strings.tabs.chatAction}
            accessibilityRole="button"
            accessibilityState={{ disabled: isContactActionsDisabled }}
            disabled={isContactActionsDisabled}
            onPress={openChat}
            style={({ pressed }) => [
              styles.contactButton,
              {
                backgroundColor: isContactActionsDisabled
                  ? colors.backgroundElement
                  : colors.primary,
              },
              pressed && !isContactActionsDisabled ? styles.pressed : null,
            ]}>
            <SymbolView
              name={{ ios: 'bubble.left.fill', android: 'chat', web: 'chat' }}
              size={20}
              tintColor={isContactActionsDisabled ? colors.textSecondary : colors.onPrimary}
            />
            <Text
              style={[
                styles.contactButtonText,
                {
                  color: isContactActionsDisabled
                    ? colors.textSecondary
                    : colors.onPrimary,
                },
              ]}>
              {strings.tabs.chatAction}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel={strings.tabs.callAction}
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            disabled
            style={[styles.contactButton, { backgroundColor: colors.backgroundElement }]}>
            <SymbolView
              name={{ ios: 'phone.fill', android: 'call', web: 'call' }}
              size={20}
              tintColor={colors.textSecondary}
            />
            <Text style={[styles.contactButtonText, { color: colors.textSecondary }]}>
              {strings.tabs.callAction}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <FullscreenMediaModal
        height={height}
        media={selectedMedia}
        onClose={() => setSelectedMedia(null)}
        width={width}
      />
      {showDisabledContactActions && loginPrompt ? (
        <LoginRequiredModal
          actionLabel={
            loginPrompt === 'bookmark'
              ? strings.tabs.adBookmarkLoginAction
              : strings.tabs.adReportLoginAction
          }
          colors={colors}
          cancelLabel={
            loginPrompt === 'bookmark'
              ? strings.tabs.adBookmarkLoginCancel
              : strings.tabs.adReportLoginCancel
          }
          message={
            loginPrompt === 'bookmark'
              ? strings.tabs.adBookmarkLoginRequired
              : strings.tabs.adReportLoginRequired
          }
          onClose={() => setLoginPrompt(null)}
          onLogin={openLoginForPrompt}
          title={
            loginPrompt === 'bookmark'
              ? strings.tabs.adBookmarkLoginTitle
              : strings.tabs.adReportLoginTitle
          }
          visible
        />
      ) : null}
    </SafeAreaView>
  );
}

function AdVideoSlide({ height, uri }: { height: number; uri: string }) {
  const player = useVideoPlayer(uri);

  return (
    <VideoView
      contentFit="contain"
      player={player}
      style={{ height, width: '100%' }}
    />
  );
}

function FullscreenMediaModal({
  height,
  media,
  onClose,
  width,
}: {
  height: number;
  media: MediaSlide | null;
  onClose: () => void;
  width: number;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={media !== null}>
      <View style={styles.viewer}>
        <Pressable
          accessibilityLabel={strings.tabs.adMediaViewerClose}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.viewerDismissArea}
        />
        <View style={[styles.viewerMedia, { height: height * 0.84, width }]}>
          {media?.type === 'image' ? (
            <Image contentFit="contain" source={{ uri: media.uri }} style={styles.viewerImage} />
          ) : media?.type === 'video' ? (
            <FullscreenAdVideo height={height * 0.84} uri={media.uri} width={width} />
          ) : null}
        </View>
        <Pressable
          accessibilityLabel={strings.tabs.adMediaViewerClose}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.viewerDismissArea}
        />
      </View>
    </Modal>
  );
}

function FullscreenAdVideo({
  height,
  uri,
  width,
}: {
  height: number;
  uri: string;
  width: number;
}) {
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.play();
  });

  return (
    <VideoView
      contentFit="contain"
      nativeControls
      player={player}
      style={{ height, width }}
    />
  );
}

function AdDetailRow({
  colors,
  divider = false,
  label,
  value,
}: {
  colors: (typeof Colors)[keyof typeof Colors];
  divider?: boolean;
  label: string;
  value: string;
}) {
  return (
    <View
      style={[
        styles.adDetailRow,
        divider ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth } : null,
      ]}>
      <Text style={[styles.adDetailLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.adDetailValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function ScreenMessage({
  colors,
  message,
  onBack,
  onRetry,
  title,
}: {
  colors: (typeof Colors)[keyof typeof Colors];
  message: string;
  onBack: () => void;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
      <View style={styles.messageHeader}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
        <Pressable
          accessibilityLabel={strings.common.back}
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'arrow_forward', web: 'arrow_forward' }}
            size={22}
            tintColor={colors.text}
          />
        </Pressable>
      </View>
      <Text accessibilityRole="alert" style={[styles.messageText, { color: colors.textSecondary }]}>
        {message}
      </Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => (pressed ? styles.pressed : null)}>
          <Text style={[styles.retryText, { color: colors.text }]}>{strings.common.retry}</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

function hasMissingMediaUrl(ad: AdDetails): boolean {
  return [ad.mainImage, ad.video, ...(ad.files ?? [])].some(
    (file) => file !== null && file !== undefined && !file.url,
  );
}

function getMediaSlides(ad: AdDetails, listAd?: MyAd): MediaSlide[] {
  const mediaById = new Map<number, AdMedia>();
  const fallbackFiles = [
    ...(listAd?.mainImage ? [listAd.mainImage] : []),
    ...(listAd?.files ?? []),
    ...(listAd?.video ? [listAd.video] : []),
  ];
  const detailFiles = [
    ...(ad.mainImage ? [ad.mainImage] : []),
    ...(ad.files ?? []),
    ...(ad.video ? [ad.video] : []),
  ];

  for (const file of [...fallbackFiles, ...detailFiles]) {
    const previous = mediaById.get(file.id);
    mediaById.set(file.id, {
      ...previous,
      ...file,
      url: file.url ?? previous?.url,
    });
  }

  const videoFile =
    ad.video ??
    listAd?.video ??
    [...mediaById.values()].find((file) => isVideoFile(file));
  const video = videoFile ? mediaById.get(videoFile.id) : undefined;
  const slides: MediaSlide[] =
    video?.url
      ? [{ type: 'video', key: `video-${video.id}`, uri: video.url }]
      : [];
  const orderedImages = [
    ...(ad.mainImage ? [ad.mainImage] : []),
    ...(listAd?.mainImage ? [listAd.mainImage] : []),
    ...(ad.files ?? []),
    ...(listAd?.files ?? []),
  ];
  const addedImages = new Set<number>();

  for (const file of orderedImages) {
    if (file.id === videoFile?.id || isVideoFile(file) || addedImages.has(file.id)) continue;
    const image = mediaById.get(file.id);
    if (!image?.url) continue;
    addedImages.add(file.id);
    slides.push({ type: 'image', key: `image-${image.id}`, uri: image.url });
  }

  return slides;
}

function isVideoFile(file: AdMedia): boolean {
  return /\.(mp4|mov|m4v|webm)(?:[?#]|$)/i.test(file.storedName ?? file.url ?? '');
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: Spacing.three },
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: Spacing.three,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    minHeight: 52,
  },
  headerTitle: { fontSize: 16, fontWeight: '500', textAlign: 'right' },
  backButton: { alignItems: 'center', height: 44, justifyContent: 'center' },
  bookmarkButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  bookmarkFill: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    width: 24,
  },
  bookmarkFillBody: {
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    height: 22,
    position: 'relative',
    width: 18,
  },
  bookmarkCutout: {
    alignSelf: 'center',
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderLeftWidth: 9,
    borderRightColor: 'transparent',
    borderRightWidth: 9,
    bottom: 0,
    height: 0,
    position: 'absolute',
    width: 0,
  },
  bookmarkError: { fontSize: 12, paddingHorizontal: Spacing.three, textAlign: 'right' },
  gallery: { backgroundColor: Colors.light.surfaceMuted, width: '100%' },
  slide: {
    alignItems: 'center',
    backgroundColor: Colors.light.surfaceMuted,
    justifyContent: 'center',
  },
  viewer: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
    flex: 1,
    justifyContent: 'center',
  },
  viewerDismissArea: { flex: 1, width: '100%' },
  viewerMedia: { alignItems: 'center', justifyContent: 'center' },
  viewerImage: { height: '100%', width: '100%' },
  mediaPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { fontSize: 14, textAlign: 'center' },
  details: { gap: Spacing.two, padding: Spacing.three },
  mapSection: { gap: Spacing.two, marginTop: Spacing.two },
  mapCoordinates: { fontSize: 12, textAlign: 'right' },
  reportButton: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row-reverse',
    gap: Spacing.two,
    justifyContent: 'center',
    minHeight: 48,
    marginTop: Spacing.two,
  },
  reportButtonText: { fontSize: 14, fontWeight: '500' },
  adDetailRow: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: Spacing.one,
  },
  adDetailLabel: { fontSize: 13, textAlign: 'right' },
  adDetailValue: { fontSize: 14, fontWeight: '400', textAlign: 'left' },
  safetyLink: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row-reverse',
    gap: Spacing.two,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
  },
  safetyLinkText: { flex: 1, fontSize: 14, fontWeight: '400', textAlign: 'right' },
  contactActions: {
    borderTopColor: Colors.light.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row-reverse',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  contactIdentityError: { fontSize: 12, textAlign: 'right', width: '100%' },
  contactButton: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    flexDirection: 'row-reverse',
    gap: Spacing.two,
    justifyContent: 'center',
    minHeight: 50,
  },
  contactButtonText: { fontSize: 16, fontWeight: '500' },
  title: { fontSize: 16, fontWeight: '500', lineHeight: 27, textAlign: 'right' },
  publishedAt: { fontSize: 12, textAlign: 'right' },
  descriptionTitle: { fontSize: 15, fontWeight: '500', lineHeight: 27, textAlign: 'right', marginBottom: Spacing.three, marginTop: Spacing.three },
  description: { fontSize: 14, lineHeight: 27, textAlign: 'right' },
  viewTrackingError: { fontSize: 12, textAlign: 'right' },
  messageHeader: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    width: '100%',
  },
  messageText: { fontSize: 15, lineHeight: 24, textAlign: 'center' },
  retryText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
