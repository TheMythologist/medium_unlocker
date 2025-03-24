import AsyncStorage from '@react-native-async-storage/async-storage';
import CookieManager, { type Cookies } from '@react-native-cookies/cookies';
// eslint-disable-next-line import/no-named-as-default
import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

const { height, width } = Dimensions.get('screen');

interface WebViewComponentProps {
  uri: string;
}

const COOKIE_STORAGE_KEY = 'persistedCookies';
const SITE_URL = 'https://freedium.cfd';

export default function WebViewComponent({ uri }: WebViewComponentProps) {
  const webViewRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restoreCookies = async () => {
      const savedCookies = await AsyncStorage.getItem(COOKIE_STORAGE_KEY);
      if (savedCookies) {
        const parsedCookies: Cookies = JSON.parse(savedCookies);
        await Promise.all(
          Object.entries(parsedCookies).map(([cookieName, cookie]) =>
            CookieManager.set(SITE_URL, {
              name: cookieName,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path || '/',
              version: '1',
              expires: cookie.expires || undefined,
            }),
          ),
        );
        console.log('Cookies restored!');
      }
      setLoading(false);
    };
    restoreCookies();
  }, []);

  useEffect(() => {
    const onAndroidBackPress = () => {
      if (canGoBackRef.current) {
        webViewRef.current?.goBack();
        return true;
      }
      return false;
    };

    if (Platform.OS === 'android') {
      BackHandler.addEventListener('hardwareBackPress', onAndroidBackPress);
      return () => BackHandler.removeEventListener('hardwareBackPress', onAndroidBackPress);
    }
  }, []);

  const saveCookies = async () => {
    const cookies = await CookieManager.get(SITE_URL);
    await AsyncStorage.setItem(COOKIE_STORAGE_KEY, JSON.stringify(cookies));
    console.log('Cookies saved:', cookies);
  };

  return (
    <View style={{ flex: 1 }}>
      {loading ? (
        <ActivityIndicator size="large" style={{ flex: 1 }} />
      ) : (
        <WebView
          ref={webViewRef}
          style={styles.container}
          source={{ uri: `${SITE_URL}/${uri}` }}
          originWhitelist={[SITE_URL]}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          onNavigationStateChange={saveCookies}
          allowsBackForwardNavigationGestures
          onLoadProgress={(event) => (canGoBackRef.current = event.nativeEvent.canGoBack)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: Constants.statusBarHeight,
    height,
    width,
    overflow: 'hidden',
  },
});
