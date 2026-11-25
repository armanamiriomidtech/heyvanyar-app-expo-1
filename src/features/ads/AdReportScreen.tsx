import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText as Text } from '@/components/app-text';
import { strings } from '@/constants/strings';
import { Colors, Spacing } from '@/constants/theme';
import { reportAd, reportReasonValues, type ReportReason } from '@/features/ads/api';
import { AdReportLoginModal } from '@/features/ads/AdReportLoginModal';
import { getAuthErrorMessage } from '@/features/auth/api';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '@/store/authStore';

const reasonLabels: Record<ReportReason, string> = {
  wild_animals: strings.tabs.adReportReasonWildAnimals,
  animal_abuse: strings.tabs.adReportReasonAnimalAbuse,
  fraud: strings.tabs.adReportReasonFraud,
  illegal_or_unethical: strings.tabs.adReportReasonIllegal,
  wrong_category: strings.tabs.adReportReasonWrongCategory,
  wrong_price: strings.tabs.adReportReasonWrongPrice,
  wrong_info: strings.tabs.adReportReasonWrongInfo,
  duplicate_or_spam: strings.tabs.adReportReasonDuplicate,
  unavailable_or_unresponsive: strings.tabs.adReportReasonUnavailable,
  other: strings.tabs.adReportReasonOther,
};

export default function AdReportScreen() {
  const { shortLink: rawShortLink } = useLocalSearchParams<{ shortLink: string | string[] }>();
  const shortLink = Array.isArray(rawShortLink) ? rawShortLink[0] : rawShortLink;
  const authStatus = useAuthStore((state) => state.status);
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const openLogin = () => {
    if (!shortLink) return;
    setShowLoginPrompt(false);
    router.push({
      pathname: '/(auth)/login',
      params: { returnTo: 'ad-report', adShortLink: shortLink },
    });
  };

  const handleSubmit = async () => {
    if (isSubmitting || isSubmitted) return;
    if (authStatus !== 'authenticated') {
      setShowLoginPrompt(true);
      return;
    }
    if (!shortLink) {
      setErrorMessage(strings.tabs.adReportValidationError);
      return;
    }
    if (!selectedReason) {
      setErrorMessage(strings.tabs.adReportReasonRequired);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const trimmedDescription = description.trim();
      await reportAd({
        shortLink,
        reason: selectedReason,
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
      });
      setIsSubmitted(true);
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error, strings.tabs.adReportSubmitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const backToAd = () => {
    if (shortLink) {
      router.replace({ pathname: '/ad/[shortLink]', params: { shortLink } });
      return;
    }
    router.back();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{strings.tabs.adReportTitle}</Text>
        <Pressable
          accessibilityLabel={strings.common.back}
          accessibilityRole="button"
          onPress={backToAd}
          style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'arrow_forward', web: 'arrow_forward' }}
            size={22}
            tintColor={colors.text}
          />
        </Pressable>
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          {isSubmitted ? (
            <Text accessibilityRole="alert" style={[styles.successMessage, { color: colors.success }]}>
              {strings.tabs.adReportSuccess}
            </Text>
          ) : (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {strings.tabs.adReportReasonTitle}
              </Text>
              <View style={[styles.reasonList, { borderColor: colors.border }]}>
                {reportReasonValues.map((reason, index) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selectedReason === reason }}
                    key={reason}
                    onPress={() => {
                      setSelectedReason(reason);
                      setErrorMessage('');
                    }}
                    style={[
                      styles.reasonOption,
                      index < reportReasonValues.length - 1
                        ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }
                        : null,
                    ]}>
                    <Text style={[styles.reasonLabel, { color: colors.text }]}>
                      {reasonLabels[reason]}
                    </Text>
                    <View
                      style={[
                        styles.radioOuter,
                        { borderColor: selectedReason === reason ? colors.primary : colors.textSubtle },
                      ]}>
                      {selectedReason === reason ? (
                        <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                {strings.tabs.adReportDescriptionLabel}
              </Text>
              <TextInput
                accessibilityLabel={strings.tabs.adReportDescriptionLabel}
                maxLength={2000}
                multiline
                onChangeText={setDescription}
                placeholder={strings.tabs.adReportDescriptionPlaceholder}
                placeholderTextColor={colors.textSubtle}
                style={[
                  styles.descriptionInput,
                  { backgroundColor: colors.backgroundElement, color: colors.text },
                ]}
                textAlign="right"
                textAlignVertical="top"
                value={description}
              />
              <Text style={[styles.characterCount, { color: colors.textSubtle }]}>
                {description.length}/۲۰۰۰
              </Text>
            </>
          )}
          {errorMessage ? (
            <Text accessibilityRole="alert" style={[styles.errorMessage, { color: colors.error }]}>
              {errorMessage}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        {isSubmitted ? (
          <Pressable
            accessibilityRole="button"
            onPress={backToAd}
            style={({ pressed }) => [
              styles.submitButton,
              { backgroundColor: colors.primary },
              pressed ? styles.pressed : null,
            ]}>
            <Text style={[styles.submitButtonText, { color: colors.onPrimary }]}>
              {strings.tabs.adReportReturnToAd}
            </Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={backToAd}
              style={({ pressed }) => [
                styles.backAction,
                { borderColor: colors.border },
                pressed && !isSubmitting ? styles.pressed : null,
              ]}>
              <Text style={[styles.backActionText, { color: colors.text }]}>
                {strings.common.back}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isSubmitting }}
              disabled={isSubmitting}
              onPress={() => void handleSubmit()}
              style={({ pressed }) => [
                styles.submitButton,
                { backgroundColor: colors.primary },
                pressed && !isSubmitting ? styles.pressed : null,
                isSubmitting ? styles.disabled : null,
              ]}>
              {isSubmitting ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={[styles.submitButtonText, { color: colors.onPrimary }]}>
                  {strings.tabs.adReportButton}
                </Text>
              )}
            </Pressable>
          </>
        )}
      </View>
      <AdReportLoginModal
        colors={colors}
        onClose={() => setShowLoginPrompt(false)}
        onLogin={openLogin}
        visible={showLoginPrompt}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: Spacing.three,
  },
  headerTitle: { fontSize: 18, fontWeight: '600', textAlign: 'right' },
  backButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  content: { flexGrow: 1, gap: Spacing.three, padding: Spacing.four, paddingBottom: Spacing.three },
  sectionTitle: { fontSize: 15, fontWeight: '600', textAlign: 'right' },
  reasonList: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.three },
  reasonOption: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    gap: Spacing.three,
    minHeight: 52,
    paddingVertical: Spacing.two,
  },
  reasonLabel: { flex: 1, fontSize: 14, lineHeight: 22, textAlign: 'right' },
  radioOuter: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  radioInner: { borderRadius: 5, height: 10, width: 10 },
  inputLabel: { fontSize: 14, fontWeight: '500', textAlign: 'right' },
  descriptionInput: {
    borderRadius: 10,
    fontFamily: 'IRANSans',
    fontSize: 14,
    minHeight: 112,
    padding: Spacing.three,
  },
  characterCount: { fontSize: 11, textAlign: 'left' },
  errorMessage: { fontSize: 13, lineHeight: 22, textAlign: 'right' },
  successMessage: { fontSize: 16, fontWeight: '600', lineHeight: 28, textAlign: 'center' },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row-reverse',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  backAction: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  backActionText: { fontSize: 15, fontWeight: '500' },
  submitButton: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  submitButtonText: { fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.75 },
});
