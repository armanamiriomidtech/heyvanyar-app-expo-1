import { createElement, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/app-text';
import { strings } from '@/constants/strings';

import {
  createNeshanMapHtml,
  parseNeshanMapMessage,
  type NeshanMapProps,
} from './neshanMapUtils';

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
  const frameRef = useRef<HTMLIFrameElement>(null);
  const apiKey = process.env.EXPO_PUBLIC_NESHAN_API_KEY;
  const [html] = useState(
    () => (apiKey ? createNeshanMapHtml(apiKey, coordinate, editable) : ''),
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (typeof event.data !== 'string') {
        onError?.();
        return;
      }

      const message = parseNeshanMapMessage(event.data);
      if (!message) {
        onError?.();
      } else if (message.type === 'error') {
        onError?.();
      } else {
        onCoordinateSelect?.({ latitude: message.latitude, longitude: message.longitude });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onCoordinateSelect, onError]);

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
      {createElement('iframe', {
        ref: frameRef,
        srcDoc: html,
        title: strings.tabs.adLocationMapLabel,
        style: { border: 'none', height: '100%', width: '100%' },
      })}
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
