import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { strings } from '@/constants/strings';

import {
  createNeshanMapHtml,
  parseNeshanMapMessage,
  type NeshanMapProps,
} from './neshanMapUtils';
import { AppText as Text } from '@/components/app-text';

export function NeshanMap({
  coordinate,
  editable = false,
  onCoordinateSelect,
  onError,
  backgroundColor,
  textColor,
  errorColor,
  height = 300,
}: NeshanMapProps) {
  const apiKey = process.env.EXPO_PUBLIC_NESHAN_API_KEY;
  const [html] = useState(() =>
    apiKey ? createNeshanMapHtml(apiKey, coordinate, editable) : '',
  );

  if (!apiKey) {
    return (
      <View style={[styles.unavailable, { backgroundColor }]}>
        <Text accessibilityRole="alert" style={{ color: errorColor, textAlign: 'center' }}>
          {strings.tabs.neshanMapKeyMissing}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        javaScriptEnabled
        originWhitelist={['*']}
        onError={() => onError?.()}
        onMessage={(event) => {
          const message = parseNeshanMapMessage(event.nativeEvent.data);
          if (!message) {
            onError?.();
          } else if (message.type === 'error') {
            onError?.();
          } else {
            onCoordinateSelect?.({
              latitude: message.latitude,
              longitude: message.longitude,
            });
          }
        }}
        source={{ html, baseUrl: 'https://www.heyvanyar.ir' }}
        style={styles.map}
      />
      {editable ? (
        <View
          pointerEvents="none"
          style={[styles.hint, { backgroundColor: `${backgroundColor}E8` }]}>
          <Text style={{ color: textColor, fontSize: 12, textAlign: 'center' }}>
            {strings.tabs.adCoordinateHint}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  map: { flex: 1 },
  unavailable: {
    alignItems: 'center',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 140,
    padding: 16,
  },
  hint: {
    alignSelf: 'center',
    borderRadius: 8,
    bottom: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: 'absolute',
    right: 12,
  },
});
