import AsyncStorage from '@react-native-async-storage/async-storage';
import CookieManager, { type Cookies } from '@react-native-cookies/cookies';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { CurrentUrlContext } from '@/hooks/useCurrentUrlContext';

const { height, width } = Dimensions.get('screen');

const COOKIE_STORAGE_KEY = 'persistedCookies';
const SITE_URL = 'https://freedium.cfd';

interface WebViewComponentProps {
  uri: string;
}

export default function WebViewComponent({ uri }: WebViewComponentProps) {
  const webViewRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);
  const [loading, setLoading] = useState(true);

  const [_, setCurrentUrl] = useContext(CurrentUrlContext);

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

  const onNavigationStateChange = async (event: WebViewNavigation) => {
    setCurrentUrl(event.url);
    const cookies = await CookieManager.get(SITE_URL);
    await AsyncStorage.setItem(COOKIE_STORAGE_KEY, JSON.stringify(cookies));
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
          onNavigationStateChange={onNavigationStateChange}
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
    height,
    width,
    overflow: 'hidden',
  },
});
