// eslint-disable-next-line import/no-named-as-default
import Constants from 'expo-constants';
import { Dimensions, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

const { height, width } = Dimensions.get('screen');

interface WebViewComponentProps {
  uri: string;
}

export default function WebViewComponent({ uri }: WebViewComponentProps) {
  return <WebView style={styles.container} source={{ uri: ' https://freedium.cfd/' + uri }} />;
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
