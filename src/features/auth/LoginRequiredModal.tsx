import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/app-text';
import { Colors, Spacing } from '@/constants/theme';

export function LoginRequiredModal({
  actionLabel,
  colors,
  cancelLabel,
  message,
  onClose,
  onLogin,
  title,
  visible,
}: {
  actionLabel: string;
  colors: (typeof Colors)[keyof typeof Colors];
  cancelLabel: string;
  message: string;
  onClose: () => void;
  onLogin: () => void;
  title: string;
  visible: boolean;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel={cancelLabel}
          accessibilityRole="button"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: 0.45 }]}
        />
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.text }]}>
            {title}
          </Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {message}
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                styles.button,
                styles.cancelButton,
                { borderColor: colors.border },
                pressed ? styles.pressed : null,
              ]}>
              <Text style={[styles.buttonText, { color: colors.text }]}>
                {cancelLabel}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onLogin}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.primary },
                pressed ? styles.pressed : null,
              ]}>
              <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
                {actionLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: Spacing.three,
    padding: Spacing.three,
    paddingBottom: Spacing.four,
  },
  title: { fontSize: 16, fontWeight: '600', textAlign: 'right' },
  message: { fontSize: 14, lineHeight: 24, textAlign: 'right' },
  actions: { flexDirection: 'row-reverse', gap: Spacing.two },
  button: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  cancelButton: { backgroundColor: 'transparent', borderWidth: 1 },
  buttonText: { fontSize: 15, fontWeight: '500' },
  pressed: { opacity: 0.75 },
});
