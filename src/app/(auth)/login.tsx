import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText as Text } from '@/components/app-text';
import { strings } from '@/constants/strings';
import { Colors, Spacing } from '@/constants/theme';
import { getAuthErrorMessage, normalizePhone } from '@/features/auth/api';
import { PhoneInput } from '@/features/auth/components/PhoneInput';
import { getLoginReturnParams } from '@/features/auth/returnRoute';
import { useSendOtp } from '@/features/auth/useSendOtp';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { HttpError } from '@/services/http';

export default function LoginScreen() {
  const {
    returnTo: rawReturnTo,
    adShortLink: rawAdShortLink,
    pvId: rawPvId,
  } = useLocalSearchParams<{
    returnTo?: string;
    adShortLink?: string;
    pvId?: string;
  }>();
  const returnParams = getLoginReturnParams({
    returnTo: rawReturnTo,
    adShortLink: rawAdShortLink,
    pvId: rawPvId,
  });
  const [phone, setPhone] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const submitLock = useRef(false);
  const sendOtpMutation = useSendOtp();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const handleSendCode = async () => {
    if (submitLock.current || sendOtpMutation.isPending) return;
    const normalizedPhone = normalizePhone(phone);
    if (!/^09\d{9}$/.test(normalizedPhone)) {
      setPhoneError(phone ? strings.auth.phoneInvalid : strings.auth.phoneRequired);
      return;
    }

    submitLock.current = true;
    setPhoneError('');
    setErrorMessage('');
    try {
      await sendOtpMutation.mutateAsync(normalizedPhone);
      router.push({
        pathname: '/(auth)/verify',
        params: {
          phone: normalizedPhone,
          ...returnParams,
        },
      });
    } catch (error) {
      const retryAfter = error instanceof HttpError ? error.retryAfter : undefined;
      setErrorMessage(
        getAuthErrorMessage(
          error,
          retryAfter ? strings.auth.requestLimit(retryAfter) : strings.auth.serverError,
        ),
      );
    } finally {
      submitLock.current = false;
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={strings.common.backToHome}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.replace('/(tabs)')}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <SymbolView
            name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }}
            size={22}
            tintColor={colors.text}
          />
        </Pressable>
        <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.text }]}>
          {strings.auth.loginTitle}
        </Text>
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.form}>
            <Text style={[styles.title, { color: colors.text }]}>{strings.auth.loginTitle}</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {strings.auth.loginDescription}
            </Text>

            <PhoneInput
              accessibilityLabel={strings.auth.phoneLabel}
              error={phoneError}
              label={strings.auth.phoneLabel}
              onChange={(value) => {
                setPhone(value);
                setPhoneError('');
                setErrorMessage('');
              }}
              placeholder={strings.auth.phonePlaceholder}
              value={phone}
            />

            {errorMessage ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {errorMessage}
              </Text>
            ) : null}

            <Pressable
              accessibilityLabel={strings.auth.sendCode}
              accessibilityRole="button"
              accessibilityState={{ disabled: sendOtpMutation.isPending }}
              disabled={sendOtpMutation.isPending}
              onPress={() => void handleSendCode()}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.primary },
                pressed && !sendOtpMutation.isPending ? styles.pressed : null,
                sendOtpMutation.isPending ? styles.disabled : null,
              ]}>
              {sendOtpMutation.isPending ? (
                <ActivityIndicator
                  accessibilityLabel={strings.common.loading}
                  color={colors.onPrimary}
                />
              ) : (
                <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
                  {strings.auth.sendCode}
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    minHeight: 56,
    paddingHorizontal: Spacing.three,
  },

  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    width: 40,
    flexShrink: 0,
  },

  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'right',
    flexShrink: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  form: { gap: Spacing.three, width: '100%', alignSelf: 'center', maxWidth: 480 },
  title: { fontSize: 16, fontWeight: '500', textAlign: 'right' },
  description: { fontSize: 12, lineHeight: 26, textAlign: 'right', marginBottom: '20px' },
  button: {
    alignItems: 'center',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: Spacing.three,
  },
  buttonText: { fontSize: 14, fontWeight: '500' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.6 },
  error: { fontSize: 12, color: Colors.light.error, textAlign: 'right', lineHeight: 22 },
});
