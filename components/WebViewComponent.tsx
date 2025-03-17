import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';
import { Dimensions, StyleSheet } from 'react-native';

const height = Dimensions.get('screen').height;
const width = Dimensions.get('screen').width;

interface WebViewComponentProps {
  uri: string;
}

export default function WebViewComponent({ uri }: WebViewComponentProps) {
  console.log('++++++++ URI', uri);
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
